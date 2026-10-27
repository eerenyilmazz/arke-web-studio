// Panel API tests: the Cloudflare account, unpublishing and approvals.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../../src/lib/core/paths.js";
import { writeProductRecord } from "../../src/deploy/app.js";
import { readClientSecrets } from "../../src/lib/core/accounts.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate } from "../helpers.js";
import { start, usePanelCleanup } from "./harness.js";
import path from "node:path";
import os from "node:os";
import * as tools from "../../src/tools.js";

usePanelCleanup();

describe("the person's Cloudflare account in the panel", () => {
  it("saves only what Cloudflare accepts, never sends the token back, and is asked for at publish time", async () => {
    const dir = process.env.ARKE_ACCOUNTS_DIR;
    process.env.ARKE_ACCOUNTS_DIR = mkdtempSync(path.join(os.tmpdir(), "arke-acc-panel-"));
    const keepEnv = { t: process.env.ARKE_CF_MANAGED_API_TOKEN, a: process.env.ARKE_CF_MANAGED_ACCOUNT_ID };
    delete process.env.ARKE_CF_MANAGED_API_TOKEN;
    delete process.env.ARKE_CF_MANAGED_ACCOUNT_ID;
    try {
      const good = "GoodToken_abcdefghijklmnopqrstuvwxyz0123";
      const { base, auth } = await start(undefined, undefined, async (a) =>
        a.token === good ? { ok: true, message: "Bağlantı çalışıyor." } : { ok: false, message: "Token geçersiz ya da yetkisi eksik." },
      );
      const json = { ...auth, "Content-Type": "application/json" };
      await fetch(`${base}/api/clients`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ slug: "pub-co", businessName: "Pub Co", industry: "bakery", hostingModel: "managed" }),
      });
      // No account: a publish is refused before anything starts, with the code the panel uses to ask for it.
      const refused = await fetch(`${base}/api/clients/pub-co/deploy`, { method: "POST", headers: json, body: JSON.stringify({ target: "preview" }) });
      expect(refused.status).toBe(409);
      expect(((await refused.json()) as { code: string }).code).toBe("no-cloudflare-account");

      const put = (token: string, accountId = "0123456789abcdef0123456789abcdef") =>
        fetch(`${base}/api/account/cloudflare`, { method: "PUT", headers: json, body: JSON.stringify({ accountId, token }) });
      expect((await put(good, "nope")).status).toBe(400);
      const bad = await put("BadToken_abcdefghijklmnopqrstuvwxyz01234");
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as { error: string }).error).toMatch(/Kaydedilmedi/);
      expect(((await (await fetch(`${base}/api/account`, { headers: auth })).json()) as { cloudflare: { configured: boolean } }).cloudflare.configured).toBe(
        false,
      );

      const ok = await put(good);
      const text = await ok.text();
      expect(ok.status).toBe(200);
      expect(text).not.toContain(good);
      expect(JSON.parse(text).cloudflare).toMatchObject({ configured: true, source: "panel", tokenHint: "…0123" });
      const status = await (await fetch(`${base}/api/cloudflare`, { headers: auth })).text();
      expect(status).not.toContain(good);

      const del = await fetch(`${base}/api/account/cloudflare`, { method: "DELETE", headers: auth });
      expect(((await del.json()) as { cloudflare: { configured: boolean } }).cloudflare.configured).toBe(false);
    } finally {
      process.env.ARKE_ACCOUNTS_DIR = dir;
      if (keepEnv.t !== undefined) process.env.ARKE_CF_MANAGED_API_TOKEN = keepEnv.t;
      if (keepEnv.a !== undefined) process.env.ARKE_CF_MANAGED_ACCOUNT_ID = keepEnv.a;
    }
  });

  it("keeps a client's secrets by name only and records the site kind where the deploy tool reads it", async () => {
    const dir = process.env.ARKE_ACCOUNTS_DIR;
    process.env.ARKE_ACCOUNTS_DIR = mkdtempSync(path.join(os.tmpdir(), "arke-sec-panel-"));
    try {
      const { base, auth, factory } = await start();
      const json = { ...auth, "Content-Type": "application/json" };
      await fetch(`${base}/api/clients`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ slug: "sec-co", businessName: "Sec Co", industry: "shop", hostingModel: "managed" }),
      });
      const value = "pk_live_never_shown_again_123456";
      expect(
        (await fetch(`${base}/api/clients/sec-co/secrets`, { method: "PUT", headers: json, body: JSON.stringify({ name: "lower_case", value }) })).status,
      ).toBe(400);
      const put = await fetch(`${base}/api/clients/sec-co/secrets`, { method: "PUT", headers: json, body: JSON.stringify({ name: "IYZICO_API_KEY", value }) });
      const text = await put.text();
      expect(put.status).toBe(200);
      expect(text).not.toContain(value);
      expect((JSON.parse(text) as { secrets: Array<{ name: string }> }).secrets.map((x) => x.name)).toEqual(["IYZICO_API_KEY"]);
      const del = await fetch(`${base}/api/clients/sec-co/secrets/IYZICO_API_KEY`, { method: "DELETE", headers: auth });
      expect(((await del.json()) as { secrets: unknown[] }).secrets).toEqual([]);
      await fetch(`${base}/api/clients/sec-co/business`, { method: "PUT", headers: json, body: JSON.stringify({ product: "showcase" }) });
      const record = JSON.parse(readFileSync(path.join(clientPaths(factory.clientsRoot, "sec-co").factoryDir, "product.json"), "utf8"));
      expect(record.product).toBe("showcase");
    } finally {
      process.env.ARKE_ACCOUNTS_DIR = dir;
    }
  });

  it("installs the ready-made parts for an app site and keeps its admin password as a hash only", async () => {
    const dir = process.env.ARKE_ACCOUNTS_DIR;
    process.env.ARKE_ACCOUNTS_DIR = mkdtempSync(path.join(os.tmpdir(), "arke-parts-panel-"));
    try {
      const { base, auth, factory } = await start();
      const json = { ...auth, "Content-Type": "application/json" };
      await fetch(`${base}/api/clients`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ slug: "cafe-co", businessName: "Cafe Co", industry: "cafe", hostingModel: "managed" }),
      });
      expect(((await (await fetch(`${base}/api/clients/cafe-co/app`, { headers: auth })).json()) as { app: boolean }).app).toBe(false);
      const cp = clientPaths(factory.clientsRoot, "cafe-co");
      writeProductRecord(cp, { product: "restaurant" }); // kinds are not selectable yet; set as a later step will
      const view = (await (await fetch(`${base}/api/clients/cafe-co/app`, { headers: auth })).json()) as Record<string, unknown>;
      expect(view).toMatchObject({ app: true, parts: ["catalog", "admin", "notifications"], adminPassword: false, missingSecrets: ["ADMIN_PASSWORD_HASH"] });
      expect(existsSync(path.join(cp.root, "app", "worker.js"))).toBe(true);
      const put = (body: object, what = "admin-password") =>
        fetch(`${base}/api/clients/cafe-co/app/${what}`, { method: "PUT", headers: json, body: JSON.stringify(body) });
      expect((await put({ password: "kisa" })).status).toBe(400);
      const ok = await put({ password: "uzun-ve-guclu-parola" });
      const text = await ok.text();
      expect(ok.status).toBe(200);
      expect(text).not.toContain("uzun-ve-guclu-parola");
      expect(JSON.parse(text)).toMatchObject({ adminPassword: true, missingSecrets: [] });
      expect((await put({ url: "http://insecure.example/hook" }, "notify-webhook")).status).toBe(400);
      expect(((await (await put({ url: "https://hooks.example/abc" }, "notify-webhook")).json()) as { notifyWebhook: boolean }).notifyWebhook).toBe(true);
      const stored = readClientSecrets("cafe-co");
      expect(stored.ADMIN_PASSWORD_HASH).toMatch(/^pbkdf2-sha256\$/);
      expect(stored.SESSION_SECRET!.length).toBeGreaterThan(40);
    } finally {
      process.env.ARKE_ACCOUNTS_DIR = dir;
    }
  });

  it("connects a team repository only with a profile name, syncs, and shows the update state", async () => {
    const { base, auth } = await start();
    const json = { ...auth, "Content-Type": "application/json" };
    const bare = mkdtempSync(path.join(os.tmpdir(), "arke-team-panel-"));
    execFileSync("git", ["init", "--quiet", "--bare", "-b", "main"], { cwd: bare });
    const put = (remote: string) => fetch(`${base}/api/team`, { method: "PUT", headers: json, body: JSON.stringify({ remote }) });
    expect((await put("--upload-pack=x")).status).toBe(400);
    const noName = await put(`file://${bare}`);
    expect(noName.status).toBe(400);
    expect(((await noName.json()) as { error: string }).error).toMatch(/profilde adınızı/);
    await fetch(`${base}/api/settings`, { method: "PUT", headers: json, body: JSON.stringify({ profile: { name: "Deniz", studio: "" } }) });
    expect((await put(`file://${bare}`)).status).toBe(200);
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "team-co", businessName: "Team Co", industry: "cafe", hostingModel: "managed" }),
    });
    const sync = (await (await fetch(`${base}/api/team/sync`, { method: "POST", headers: auth })).json()) as { pushed: string[] };
    expect(sync.pushed).toEqual(["team-co"]);
    const team = (await (await fetch(`${base}/api/team`, { headers: auth })).json()) as { remote: string; clients: Array<{ slug: string; shared: boolean }> };
    expect(team.clients).toEqual([expect.objectContaining({ slug: "team-co", shared: true })]);
    expect((await fetch(`${base}/api/team`, { method: "DELETE", headers: auth })).status).toBe(200);
    const upd = (await (await fetch(`${base}/api/update`, { headers: auth })).json()) as { status: { mode: string; current: string } };
    expect(["git", "zip"]).toContain(upd.status.mode);
    expect(upd.status.current).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("lists the site types and refuses one that is not ready", async () => {
    const { base, auth } = await start();
    const json = { ...auth, "Content-Type": "application/json" };
    const { products } = (await (await fetch(`${base}/api/products`, { headers: auth })).json()) as { products: Array<{ id: string; status: string }> };
    expect(products.map((p) => `${p.id}:${p.status}`)).toEqual(["showcase:active", "ecommerce:soon", "booking:soon", "restaurant:soon"]);
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "kind-co", businessName: "Kind Co", industry: "bakery", hostingModel: "managed" }),
    });
    expect((await fetch(`${base}/api/clients/kind-co/business`, { method: "PUT", headers: json, body: JSON.stringify({ product: "ecommerce" }) })).status).toBe(
      400,
    );
    const saved = await fetch(`${base}/api/clients/kind-co/business`, { method: "PUT", headers: json, body: JSON.stringify({ product: "showcase" }) });
    expect(((await saved.json()) as { product: string }).product).toBe("showcase");
  });
});

describe("unpublish from the panel", () => {
  it("needs the short name typed again for the live site", async () => {
    const { base, auth } = await start();
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "live-co", businessName: "Live Co", industry: "bakery", hostingModel: "managed" }),
    });
    const post = (body: object) => fetch(`${base}/api/clients/live-co/unpublish`, { method: "POST", headers: json, body: JSON.stringify(body) });
    expect((await post({ target: "production" })).status).toBe(400);
    expect((await post({ target: "production", confirm: "other" })).status).toBe(400);
    expect((await post({ target: "nowhere" })).status).toBe(400);
    // The name typed correctly passes the check; without a Cloudflare account it then stops and asks for one.
    const typed = await post({ target: "production", confirm: "live-co" });
    expect(typed.status).toBe(409);
    expect(((await typed.json()) as { code: string }).code).toBe("no-cloudflare-account");
  });
});

describe("approval from the panel", () => {
  it("approves with the terminal code only, pins what was on screen, and locks after wrong codes", async () => {
    const { factory, base, auth } = await start(undefined, "424242");
    const json = { ...auth, "Content-Type": "application/json" };
    installStubTemplate(factory.templatesDir);
    await tools.createClient(factory, { slug: "willow-thread", businessName: "Willow & Thread", industry: "bridal salon", hostingModel: "managed" });
    tools.updateClientConfig(factory, { slug: "willow-thread", patch: COMPLETE_PATCH });
    tools.saveContent(factory, { slug: "willow-thread", locale: "en", content: COMPLETE_CONTENT });
    await tools.buildSite(factory, { slug: "willow-thread" });
    const d = (await (await fetch(`${base}/api/clients/willow-thread`, { headers: auth })).json()) as {
      status: { contentHash: string; lastBuild: { distHash: string } };
    };
    const pins = { hash: d.status.contentHash, distHash: d.status.lastBuild.distHash };
    const post = (body: object) => fetch(`${base}/api/clients/willow-thread/approve`, { method: "POST", headers: json, body: JSON.stringify(body) });

    expect((await post({ kind: "site", code: "000000", pins })).status).toBe(403);
    expect((await post({ kind: "site", code: "424242", pins: { hash: "stale", distHash: pins.distHash } })).status).toBe(409);
    expect((await post({ kind: "visual", code: "424242", pins })).status).toBe(400);
    const ok = await post({ kind: "site", code: "424242", pins });
    expect(ok.status).toBe(200);
    const after = (await (await fetch(`${base}/api/clients/willow-thread`, { headers: auth })).json()) as { approvals: { kind: string; valid: boolean }[] };
    expect(
      after.approvals
        .filter((a) => a.valid)
        .map((a) => a.kind)
        .sort(),
    ).toEqual(["content", "visual"]);

    for (let i = 0; i < 5; i++) await post({ kind: "production", code: "111111", pins });
    expect((await post({ kind: "production", code: "424242", pins })).status).toBe(423);
  });

  it("never sends the code to the browser", async () => {
    const { base, auth } = await start(undefined, "987654");
    const meta = await (await fetch(`${base}/api/meta`, { headers: auth })).text();
    const page = await (await fetch(`${base}/`, { headers: auth })).text();
    expect(meta).not.toContain("987654");
    expect(page).not.toContain("987654");
  });
});
