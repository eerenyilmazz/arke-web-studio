import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
// The ready-made parts are plain JavaScript for Cloudflare Workers; they run in Node too (fetch, crypto.subtle).
// @ts-expect-error plain JS module without types
import catalog from "../parts/app/catalog.js";
// @ts-expect-error plain JS module without types
import { createApp, verifyPassword } from "../parts/app/core.js";
// @ts-expect-error plain JS module without types
import inbox from "../parts/app/inbox.js";
import { readProductRecord, writeProductRecord, WORKER_FIRST, appWranglerConfig } from "../src/deploy/app.js";
import { fileProblems } from "../src/lib/custom-site.js";
import { hashAdminPassword, installParts, isFactorySiteScript, PARTS_DIR, SITE_PARTS_JS, workerSource } from "../src/parts/install.js";
import { PRODUCTS } from "../src/products/registry.js";

/** A small D1 stand-in over node:sqlite (prepare/bind/first/all/run/batch, as the parts use them). */
function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(path.join(PARTS_DIR, "migrations")).sort()) db.exec(readFileSync(path.join(PARTS_DIR, "migrations", f), "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (list: Array<ReturnType<typeof stmt>>) => Promise.all(list.map((s) => s.all())), raw: db };
}

function bucket() {
  const store = new Map<string, { body: ArrayBuffer; type: string }>();
  return {
    store,
    put: async (key: string, body: ArrayBuffer, o: { httpMetadata: { contentType: string } }) =>
      void store.set(key, { body, type: o.httpMetadata.contentType }),
    get: async (key: string) => {
      const v = store.get(key);
      return v ? { body: v.body, httpMetadata: { contentType: v.type } } : null;
    },
  };
}

const PASSWORD = "dogru-parola-2026";
const ORIGIN = "https://site.example";

function setup(extra: Record<string, unknown> = {}) {
  const env = {
    DB: d1(),
    MEDIA: bucket(),
    ASSETS: { fetch: async () => new Response("page") },
    ADMIN_PASSWORD_HASH: hashAdminPassword(PASSWORD),
    SESSION_SECRET: "test-session-secret-0123456789abcdef",
    ...extra,
  };
  const app = createApp({ adminHtml: "<script nonce='{{NONCE}}'></script>", parts: [catalog, inbox] });
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
  const call = (p: string, init: RequestInit & { ip?: string } = {}) =>
    app.fetch(
      new Request(`${ORIGIN}${p}`, { ...init, headers: { "CF-Connecting-IP": init.ip ?? "1.1.1.1", ...(init.headers as object) } }),
      env,
      ctx,
    ) as Promise<Response>;
  const signIn = async () => {
    const r = await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: PASSWORD }), headers: { "Content-Type": "application/json" } });
    expect(r.status).toBe(200);
    return r.headers.get("Set-Cookie")!.split(";")[0]!;
  };
  return { env, call, signIn, waits };
}

const send = (cookie: string, body: unknown, method = "POST") => ({
  method,
  body: JSON.stringify(body),
  headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": "application/json" },
});

describe("ready-made parts: the app Worker", () => {
  it("serves the site, and the admin screen with a fresh nonce and strict headers", async () => {
    const { call } = setup();
    expect(await (await call("/hakkimizda/")).text()).toBe("page");
    const admin = await call("/admin");
    const html = await admin.text();
    expect(html).not.toContain("{{NONCE}}");
    const nonce = /nonce='([^']+)'/.exec(html)![1];
    expect(admin.headers.get("Content-Security-Policy")).toContain(`'nonce-${nonce}'`);
    expect(admin.headers.get("X-Frame-Options")).toBe("DENY");
    expect(admin.headers.get("X-Robots-Tag")).toContain("noindex");
    expect((await call("/admin", { method: "POST" })).status).toBe(405);
  });

  it("checks the password the panel hashed, and locks sign-in after five wrong tries", async () => {
    expect(await verifyPassword(PASSWORD, hashAdminPassword(PASSWORD))).toBe(true);
    expect(await verifyPassword("yanlis-parola", hashAdminPassword(PASSWORD))).toBe(false);
    expect(await verifyPassword(PASSWORD, "plain-text")).toBe(false);
    const { call } = setup();
    const wrong = { method: "POST", body: JSON.stringify({ password: "yanlis-parola" }), headers: { "Content-Type": "application/json" } };
    for (let i = 0; i < 5; i++) expect((await call("/api/admin/login", wrong)).status).toBe(401);
    expect((await call("/api/admin/login", wrong)).status).toBe(429);
    // The right password is refused too while locked; another address is not affected.
    expect((await call("/api/admin/login", { ...wrong, body: JSON.stringify({ password: PASSWORD }) })).status).toBe(429);
    expect((await call("/api/admin/login", { ...wrong, body: JSON.stringify({ password: PASSWORD }), ip: "2.2.2.2" })).status).toBe(200);
  });

  it("refuses admin routes without a valid session, and changes that do not come from the site", async () => {
    const { call, signIn } = setup();
    expect((await call("/api/admin/catalog")).status).toBe(401);
    expect((await call("/api/admin/catalog", { headers: { Cookie: "__Host-arke_admin=9999999999.forged" } })).status).toBe(401);
    const cookie = await signIn();
    expect((await call("/api/admin/catalog", { headers: { Cookie: cookie } })).status).toBe(200);
    const noOrigin = await call("/api/admin/catalog/items", { method: "POST", body: JSON.stringify({ name: "X" }), headers: { Cookie: cookie } });
    expect(noOrigin.status).toBe(403);
    const otherSite = await call("/api/admin/catalog/items", { ...send(cookie, { name: "X" }), headers: { Cookie: cookie, Origin: "https://evil.example" } });
    expect(otherSite.status).toBe(403);
    const session = (await (await call("/api/admin/session", { headers: { Cookie: cookie } })).json()) as { signedIn: boolean; parts: string[] };
    expect(session).toMatchObject({ signedIn: true, parts: ["catalog", "notifications"] });
    const out = await call("/api/admin/logout", { method: "POST" });
    expect(out.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("keeps a catalogue: categories, items, hidden items stay off the site", async () => {
    const { call, signIn } = setup();
    const cookie = await signIn();
    const cat = (await (await call("/api/admin/catalog/categories", send(cookie, { name: "Sıcak İçecekler" }))).json()) as { id: number };
    expect((await call("/api/admin/catalog/categories", send(cookie, { name: "Sıcak İçecekler" }))).status).toBe(409);
    await call("/api/admin/catalog/items", send(cookie, { name: "Türk kahvesi", price: 9000, categoryId: cat.id, description: "Közde" }));
    const hidden = (await (await call("/api/admin/catalog/items", send(cookie, { name: "Gizli", active: false }))).json()) as { id: number };
    expect((await call("/api/admin/catalog/items", send(cookie, { name: "" }))).status).toBe(400);
    expect((await call("/api/admin/catalog/items", send(cookie, { name: "X", price: -1 }))).status).toBe(400);
    expect((await call("/api/admin/catalog/items", send(cookie, { name: "X", currency: "BTC" }))).status).toBe(400);
    const pub = await call("/api/catalog");
    expect(pub.headers.get("Cache-Control")).toContain("max-age=60");
    const data = (await pub.json()) as { categories: Array<{ slug: string }>; items: Array<Record<string, unknown>> };
    expect(data.categories.map((c) => c.slug)).toEqual(["sicak-icecekler"]);
    expect(data.items).toEqual([
      { id: 1, name: "Türk kahvesi", description: "Közde", price: 9000, currency: "TRY", image: null, category: "sicak-icecekler", duration: null },
    ]);
    expect((await call(`/api/admin/catalog/items/${hidden.id}`, send(cookie, { name: "Görünür" }, "PUT"))).status).toBe(200);
    expect(((await (await call("/api/catalog")).json()) as { items: unknown[] }).items).toHaveLength(2);
    await call(`/api/admin/catalog/categories/${cat.id}`, send(cookie, {}, "DELETE"));
    const after = (await (await call("/api/catalog")).json()) as { items: Array<{ category: string | null }> };
    expect(after.items.map((i) => i.category)).toEqual([null, null]); // items stay, without the category
    expect((await call("/api/admin/catalog/items/999", send(cookie, {}, "DELETE"))).status).toBe(404);
  });

  it("stores images in the bucket: only real image types, served with long caching", async () => {
    const { call, signIn, env } = setup();
    const cookie = await signIn();
    const up = (type: string, body: BodyInit) =>
      call("/api/admin/media", { method: "POST", body, headers: { Cookie: cookie, Origin: ORIGIN, "Content-Type": type } });
    expect((await up("image/svg+xml", "<svg/>")).status).toBe(415);
    expect((await up("image/png", new Uint8Array(0))).status).toBe(413);
    const ok = (await (await up("image/png", new Uint8Array([137, 80, 78, 71]))).json()) as { key: string; url: string };
    expect(ok.key).toMatch(/^[A-Za-z0-9_-]{20}\.png$/);
    expect(env.MEDIA.store.size).toBe(1);
    const img = await call(ok.url);
    expect(img.headers.get("Content-Type")).toBe("image/png");
    expect(img.headers.get("Cache-Control")).toContain("immutable");
    expect((await call("/api/admin/catalog/items", send(cookie, { name: "X", imageKey: "../../etc/passwd" }))).status).toBe(400);
    expect((await call("/media/missing-key-0001.png")).status).toBe(404);
  });

  it("takes form messages into the inbox: honeypot, rate limit, webhook, statuses", async () => {
    const posted: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      posted.push(`${url} ${init.body}`);
      return new Response("ok");
    }) as typeof fetch;
    try {
      const { call, signIn, waits, env } = setup({ NOTIFY_WEBHOOK_URL: "https://hooks.example/abc" });
      const form = (body: object, ip = "3.3.3.3") =>
        call("/api/inbox", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, ip });
      expect((await form({ name: "Ayşe", contact: "0555 000 00 00", message: "Cumartesi açık mısınız?" })).status).toBe(201);
      await Promise.all(waits);
      expect(posted).toHaveLength(1);
      expect(posted[0]).toContain("hooks.example");
      expect(posted[0]).toContain("Ayşe");
      expect((await form({ name: "bot", contact: "x", website: "http://spam" })).status).toBe(200);
      expect((await form({ name: "", contact: "x" })).status).toBe(400);
      const form2 = (i: number) => form({ name: `K${i}`, contact: "k@example.com" }, "4.4.4.4");
      for (let i = 0; i < 8; i++) expect((await form2(i)).status).toBe(201);
      expect((await form2(9)).status).toBe(429);
      const urlencoded = await call("/api/inbox", {
        method: "POST",
        body: "name=Mehmet&contact=m%40example.com",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        ip: "5.5.5.5",
      });
      expect(urlencoded.status).toBe(201);
      const rows = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM inbox").get() as { n: number };
      expect(rows.n).toBe(10); // the honeypot entry was never stored
      const cookie = await signIn();
      const list = (await (await call("/api/admin/inbox", { headers: { Cookie: cookie } })).json()) as {
        unread: number;
        entries: Array<{ id: number; name: string }>;
      };
      expect(list.unread).toBe(10);
      expect(list.entries[0]!.name).toBe("Mehmet");
      expect((await call(`/api/admin/inbox/${list.entries[0]!.id}`, send(cookie, { status: "bogus" }, "PUT"))).status).toBe(400);
      await call(`/api/admin/inbox/${list.entries[0]!.id}`, send(cookie, { status: "archived" }, "PUT"));
      const left = (await (await call("/api/admin/inbox", { headers: { Cookie: cookie } })).json()) as { unread: number; entries: unknown[] };
      expect(left).toMatchObject({ unread: 9 });
      expect(left.entries).toHaveLength(9);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("says plainly when the admin screen is not set up yet, and hides internal errors", async () => {
    const { call } = setup({ ADMIN_PASSWORD_HASH: undefined });
    const s = (await (await call("/api/admin/session")).json()) as { configured: boolean };
    expect(s.configured).toBe(false);
    expect((await call("/api/admin/login", { method: "POST", body: "{}" })).status).toBe(503);
    const broken = setup({ DB: { prepare: () => ({ bind: () => ({ first: () => Promise.reject(new Error("D1_ERROR secret detail")) }) }) } });
    const r = await broken.call("/api/inbox", {
      method: "POST",
      body: JSON.stringify({ name: "A", contact: "B" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("secret detail");
  });
});

describe("ready-made parts: installing into a client", () => {
  const client = () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "arke-parts-"));
    mkdirSync(path.join(root, ".factory"), { recursive: true });
    return { root, factoryDir: path.join(root, ".factory") } as never as Parameters<typeof installParts>[0];
  };

  it("gives static kinds nothing and app kinds only their own parts, recording the secrets they need", () => {
    const showcase = client();
    expect(installParts(showcase, PRODUCTS.showcase).installed).toBe(false);
    const shop = client();
    writeProductRecord(shop, { product: "booking" });
    const r = installParts(shop, PRODUCTS.booking);
    expect(r.parts).toEqual(["admin", "catalog", "notifications"]);
    expect(r.written).toContain("app/worker.js");
    expect(r.written).toContain("site/js/arke-parts.js");
    const worker = readFileSync(path.join(shop.root, "app", "worker.js"), "utf8");
    expect(worker).toContain('import catalog from "./parts/catalog.js"');
    expect(worker).toContain("parts: [catalog, notifications]");
    expect(readdirSync(path.join(shop.root, "app", "migrations"))).toEqual(["0001_core.sql", "0002_catalog.sql", "0003_inbox.sql"]);
    expect(readProductRecord(shop)).toEqual({
      product: "booking",
      secrets: ["ADMIN_PASSWORD_HASH", "SESSION_SECRET"],
      optionalSecrets: ["NOTIFY_WEBHOOK_URL"],
    });
    // Idempotent: nothing is rewritten the second time.
    expect(installParts(shop, PRODUCTS.booking).written).toEqual([]);
    expect(workerSource([])).toContain("parts: []");
  });

  it("replaces factory code that was changed, but never touches a factory migration already in the client", () => {
    const shop = client();
    installParts(shop, PRODUCTS.ecommerce);
    writeFileSync(path.join(shop.root, "app", "parts", "core.js"), "// changed");
    writeFileSync(path.join(shop.root, "app", "migrations", "0002_catalog.sql"), "-- changed");
    const r = installParts(shop, PRODUCTS.ecommerce);
    expect(r.written).toEqual(["app/parts/core.js"]);
    expect(r.migrationConflicts).toEqual(["0002_catalog.sql"]);
    expect(readFileSync(path.join(shop.root, "app", "migrations", "0002_catalog.sql"), "utf8")).toBe("-- changed");
  });

  it("lets only the exact factory site script make requests, and inbox forms only on app sites", () => {
    const script = readFileSync(path.join(PARTS_DIR, "site", "arke-parts.js"), "utf8");
    expect(isFactorySiteScript(SITE_PARTS_JS, script)).toBe(true);
    expect(fileProblems(SITE_PARTS_JS, script, null, true)).toEqual([]);
    expect(fileProblems(SITE_PARTS_JS, script, null, false).join()).toContain("network request");
    expect(fileProblems(SITE_PARTS_JS, `${script}\nfetch("https://evil.example")`, null, true).join()).toContain("network request");
    expect(fileProblems("js/other.js", script, null, true).join()).toContain("network request");
    const page = (form: string) => `<!doctype html><meta name="viewport" content="width=device-width">${form}`;
    expect(fileProblems("index.html", page('<form data-arke-inquiry><input name="name"></form>'), null, true)).toEqual([]);
    expect(fileProblems("index.html", page('<form data-arke-inquiry action="https://evil.example"></form>'), null, true)).not.toEqual([]);
    expect(fileProblems("index.html", page("<form data-arke-inquiry></form>"), null, false)).not.toEqual([]);
  });

  it("lets the Worker answer its own paths before any page file", () => {
    const cfg = appWranglerConfig({
      workerName: "w",
      compatibilityDate: "2025-01-01",
      plan: { database: true, media: true, secrets: [], optionalSecrets: [] },
      resources: {},
    });
    expect(cfg.assets.run_worker_first).toEqual([...WORKER_FIRST]);
  });

  it("refuses a short admin password and never keeps it", () => {
    expect(() => hashAdminPassword("kisa")).toThrow(/en az/);
    const h = hashAdminPassword(PASSWORD);
    expect(h).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(h).not.toContain(PASSWORD);
    expect(hashAdminPassword(PASSWORD)).not.toBe(h); // salted
  });
});
