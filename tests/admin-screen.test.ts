import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JS module without types
import catalog from "../parts/app/catalog.js";
// @ts-expect-error plain JS module without types
import { createApp } from "../parts/app/core.js";
// @ts-expect-error plain JS module without types
import inbox from "../parts/app/inbox.js";
import { hashAdminPassword, PARTS_DIR } from "../src/parts/install.js";
import { type Browser, findBrowser, launchBrowser, type Page } from "./e2e/harness.js";

/**
 * The client's admin screen (parts/app/admin.html) in a real browser, served by the factory's Worker code in Node:
 * it starts in the market's language and formats, switches between Turkish and English, remembers the choice, and the
 * Worker's own messages follow it.
 */
const PASSWORD = "dogru-parola-2026";
const executable = findBrowser();
let browser: Browser | null = null;

function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(path.join(PARTS_DIR, "migrations")).sort()) db.exec(readFileSync(path.join(PARTS_DIR, "migrations", f), "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (l: Array<ReturnType<typeof stmt>>) => Promise.all(l.map((s) => s.all())) };
}

/** The Worker behind a plain HTTP server (the __Host- cookie prefix needs HTTPS, so it is renamed on the way). */
async function serve(vars: Record<string, string>): Promise<{ base: string; server: Server }> {
  const env = {
    DB: d1(),
    ASSETS: { fetch: async () => new Response("page") },
    ADMIN_PASSWORD_HASH: hashAdminPassword(PASSWORD),
    SESSION_SECRET: "s".repeat(40),
    ...vars,
  };
  const app = createApp({ adminHtml: readFileSync(path.join(PARTS_DIR, "app", "admin.html"), "utf8"), parts: [catalog, inbox] });
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (typeof v === "string") headers.set(k, k === "cookie" ? v.replace(/(^|; )arke_admin=/, "$1__Host-arke_admin=") : v);
    const url = `http://${req.headers.host}${req.url}`;
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
    const r = (await app.fetch(new Request(url, { method: req.method, headers, body }), env, {})) as Response;
    const out: Record<string, string> = {};
    r.headers.forEach((v, k) => {
      out[k] = k === "set-cookie" ? v.replace("__Host-", "").replace("; Secure", "") : v;
    });
    res.writeHead(r.status, out).end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  await app.fetch(
    new Request("http://x/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ayşe", contact: "ayse@example.com", message: "Merhaba" }),
    }),
    env,
    {},
  );
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

beforeAll(async () => {
  browser = await launchBrowser(executable);
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const ui = () => (executable ? it : it.skip);
const turkishLeft = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest("script, style, td") || !el.checkVisibility()) continue;
      const t = n.nodeValue?.trim();
      if (t && /[çğıöşüÇĞİÖŞÜ]/.test(t) && t !== "Türkçe") out.push(t);
    }
    for (const el of document.querySelectorAll("[placeholder], [aria-label]"))
      for (const a of ["placeholder", "aria-label"]) {
        const v = el.getAttribute(a);
        if (v && /[çğıöşüÇĞİÖŞÜ]/.test(v)) out.push(v);
      }
    return out;
  });

describe("the client's admin screen in two languages", { timeout: 60_000 }, () => {
  ui()("starts in English for a UK client, switches to Turkish, remembers it, and the Worker answers in the chosen language", async (ctx) => {
    if (!browser) return ctx.skip();
    const { base, server } = await serve({ ARKE_ADMIN_LANG: "en", ARKE_LOCALE: "en-GB", ARKE_PRIVACY_LAW: "UK_GDPR" });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/admin`);
    await page.waitForSelector("#login:not([hidden])");
    expect(await page.textContent("#login h1")).toBe("Admin screen");
    // A wrong password: the Worker's own message comes back in English.
    await page.fill("#password", "yanlis-parola-1");
    await page.click("#login-form button[type=submit]");
    await expect.poll(() => page.textContent("#login-msg")).toBe("Wrong password.");
    await page.fill("#password", PASSWORD);
    await page.click("#login-form button[type=submit]");
    await page.waitForSelector("#app:not([hidden])");
    // A new catalogue record starts in the client's currency.
    expect(await page.inputValue('#item-form select[name="currency"]')).toBe("GBP");
    await page.click('#tabs button[data-part="notifications"]');
    await page.waitForSelector("#inbox tr td");
    expect(await turkishLeft(page)).toEqual([]);
    expect(await page.textContent("#inbox tr td")).toMatch(/^\d{2}\/\d{2}\/\d{4}/); // UK date order: 24/10/2026
    await page.click('#tabs button[data-part="privacy"]');
    await expect.poll(() => page.textContent("#privacy-info")).toContain("UK GDPR: when a person asks");
    if (process.env.ARKE_SHOT_OUT) await page.screenshot({ path: `${process.env.ARKE_SHOT_OUT}/admin-en.png` });

    // Switch to Turkish: everything changes at once, and the choice outlives a reload.
    await page.click("#app [data-lang-switch]");
    expect(await page.textContent('#tabs button[data-part="privacy"]')).toBe("Kişisel veri");
    await expect.poll(() => page.textContent("#privacy-info")).toContain("UK GDPR: bir kişi");
    await page.reload();
    await page.waitForSelector("#app:not([hidden])");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("tr");
    expect(await page.textContent("#logout")).toBe("Çıkış");
    const r = await page.evaluate(async () => (await fetch("/api/admin/privacy/find?q=a", { headers: { "X-Arke-Lang": "tr" } })).json());
    expect(r.error).toMatch(/^En az 3 karakter/);
    expect(errors).toEqual([]);
    await page.close();
    server.close();
  });

  ui()("starts in Turkish for a client in Türkiye, and fits a phone", async (ctx) => {
    if (!browser) return ctx.skip();
    const { base, server } = await serve({ ARKE_ADMIN_LANG: "tr", ARKE_LOCALE: "tr-TR", ARKE_PRIVACY_LAW: "KVKK" });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${base}/admin`);
    await page.waitForSelector("#login:not([hidden])");
    expect(await page.textContent("#login h1")).toBe("Yönetim ekranı");
    expect(await page.textContent("#login [data-lang-switch]")).toBe("English");
    await page.fill("#password", PASSWORD);
    await page.click("#login-form button[type=submit]");
    await page.waitForSelector("#app:not([hidden])");
    expect(await page.inputValue('#item-form select[name="currency"]')).toBe("TRY");
    // The header wraps on a phone: no sideways scroll, every header button fully inside the screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const outside = await page.evaluate(
      () => [...document.querySelectorAll("header .row button")].filter((b) => b.getBoundingClientRect().right > window.innerWidth).length,
    );
    expect(outside).toBe(0);
    await page.close();
    server.close();
  });
});
