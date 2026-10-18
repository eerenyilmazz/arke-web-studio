import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPanel, type Panel } from "../src/panel/server.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate, tempFactory, writePassingCustomSite } from "./helpers.js";

/**
 * Smoke tests of the panel UI in a real headless browser: every main screen renders without a script error and
 * the key forms work. They guard refactors of panel/app.js. Skipped (not failed) when no Linux Chromium/Chrome
 * is available, e.g. on WSL with only Windows browsers; SF_UI_TESTS=off skips them on purpose.
 */
type Browser = import("playwright-core").Browser;
type Page = import("playwright-core").Page;

const KEY = "u".repeat(64);
const LINUX_BROWSERS = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

function findLinuxBrowser(): string | null {
  if (process.env.SF_UI_TESTS === "off") return null;
  const env = process.env.SF_BROWSER;
  if (env && !env.endsWith(".exe") && existsSync(env)) return env;
  if (existsSync("/opt/pw-browsers/chromium")) return "/opt/pw-browsers/chromium";
  for (const c of LINUX_BROWSERS) {
    try {
      const p = execFileSync("sh", ["-c", `command -v ${c}`], { encoding: "utf8" }).trim();
      if (p) return p;
    } catch {
      // not on PATH: try the next name
    }
  }
  return null;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

const executable = findLinuxBrowser();
let browser: Browser | null = null;
let panel: Panel | null = null;
let base = "";
let factory: ReturnType<typeof tempFactory>;

beforeAll(async () => {
  if (!executable) return;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({ executablePath: executable, args: ["--no-sandbox"] });
  } catch {
    browser = null; // a browser that does not start is treated like no browser
    return;
  }
  factory = tempFactory();
  process.env.SF_PORTAL_CONFIG_DIR = mkdtempSync(path.join(os.tmpdir(), "sf-ui-portal-")); // no portal set up
  const port = await freePort();
  panel = createPanel({ factory, port, previewPort: await freePort(), sessionKey: KEY, spawn: () => { throw new Error("no agent in UI tests"); } });
  await panel.listen();
  base = `http://127.0.0.1:${port}`;

  // One finished custom client with a site, saved to the library.
  await tools.createClient(factory, { slug: "ui-bakery", businessName: "UI Bakery", industry: "bakery", hostingModel: "managed", template: "custom" });
  tools.updateClientConfig(factory, { slug: "ui-bakery", patch: COMPLETE_PATCH });
  tools.saveContent(factory, { slug: "ui-bakery", locale: "en", content: COMPLETE_CONTENT });
  writePassingCustomSite(factory, "ui-bakery", "UI Bakery");
  // A signature demo with a script placed before <head>: the panel's policy must still come first.
  tools.writeSiteFileTool(factory, { slug: "ui-bakery", path: "brand/signature.html", content: '<!doctype html><script>document.title="early"</script><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Sig</title></head><body><div class="dough-rise">Loaf</div></body></html>' });
  installStubTemplate(factory.templatesDir);
  const built = await tools.buildSite(factory, { slug: "ui-bakery" });
  if (!built.passed) throw new Error(`UI fixture build failed: ${JSON.stringify(built.checks.filter((c) => c.status === "fail"))}`);
  const { saveToLibrary } = await import("../src/panel/library.js");
  saveToLibrary(factory, "ui-bakery", { name: "UI Fırın" });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  panel?.close();
});

/** A logged-in page that collects script errors; outside requests (fonts) are blocked so tests run offline. */
async function open(hash: string, viewport = { width: 1280, height: 900 }): Promise<{ page: Page; errors: string[] }> {
  const page = await browser!.newPage({ viewport });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${base}/login?key=${KEY}`);
  await page.goto(`${base}/${hash}`);
  // The client page polls for job status, so "network idle" never comes: wait for the view to render instead.
  await page.waitForSelector("#view h1", { timeout: 10_000 });
  return { page, errors };
}

/** Decided when tests are collected (before the browser starts); a browser that fails to start skips at run time. */
const ui = () => (executable ? it : it.skip);
const needBrowser = (ctx: { skip: () => void }) => { if (!browser) ctx.skip(); };

describe("panel UI smoke (headless browser)", { timeout: 30_000 }, () => {
  ui()("renders the dashboard, settings and library without script errors", async (ctx) => {
    needBrowser(ctx);
    for (const hash of ["#/", "#/ayarlar", "#/kutuphane", "#/arsiv", "#/new", "#/c/ui-bakery/teklif"]) {
      const { page, errors } = await open(hash);
      await expect(page.locator("h1").first().textContent()).resolves.toBeTruthy();
      expect(errors, hash).toEqual([]);
      await page.close();
    }
  });

  ui()("creates a client from the form, with the library design offered for its sector", async (ctx) => {
    needBrowser(ctx);
    const { page, errors } = await open("#/yeni");
    await page.fill("#nc-name", "Ekmek Evi");
    await page.fill("#nc-industry", "bakery");
    await page.dispatchEvent("#nc-industry", "change");
    await expect.poll(() => page.locator("#nc-design option").allInnerTexts()).toContain("★ UI Fırın · bakery");
    await page.getByRole("button", { name: "Müşteriyi oluştur" }).click();
    await page.waitForURL(/#\/musteri\/ekmek-evi/);
    await expect.poll(() => page.locator("h1").first().textContent()).toContain("Ekmek Evi");
    expect(errors).toEqual([]);
    await page.close();
  });

  ui()("opens every client tab and the colour form", async (ctx) => {
    needBrowser(ctx);
    for (const tab of ["duzenle", "marka", "teklif", "bilgiler"]) {
      const { page, errors } = await open(`#/musteri/ui-bakery/${tab}`);
      await expect.poll(() => page.locator("h1").first().textContent()).toContain("UI Bakery");
      if (tab === "duzenle") {
        // The quick forms appear once the site is built.
        await page.locator(".qchip").first().click({ timeout: 5000 });
        await expect.poll(() => page.locator("form").count()).toBeGreaterThan(0);
      }
      expect(errors, tab).toEqual([]);
      await page.close();
    }
  });

  ui()("puts the content policy before anything in the signature demo", async (ctx) => {
    needBrowser(ctx);
    const { page, errors } = await open("#/musteri/ui-bakery/marka");
    const srcdoc = await page.locator("iframe.sig-frame").getAttribute("srcdoc", { timeout: 10_000 });
    expect(srcdoc).toMatch(/^<!doctype html><meta http-equiv="Content-Security-Policy"/);
    expect(srcdoc!.indexOf("Content-Security-Policy")).toBeLessThan(srcdoc!.indexOf("<script>"));
    expect(errors).toEqual([]);
    await page.close();
  });

  ui()("edits the fixed places of a library design", async (ctx) => {
    needBrowser(ctx);
    const { page, errors } = await open("#/kutuphane");
    await page.getByRole("button", { name: "Sabit alanları yönet" }).first().click();
    await expect.poll(() => page.locator(".slot-row").count()).toBeGreaterThan(0);
    await page.getByRole("button", { name: "+ Satır ekle" }).click();
    await page.locator(".slot-row input").last().fill("UI Bakery");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect.poll(() => page.locator(".toast, [role=status]").allInnerTexts()).toEqual(expect.arrayContaining([expect.stringMatching(/kaydedildi/i)]));
    expect(errors).toEqual([]);
    await page.close();
  });

  ui()("shows the work report and the agent settings", async (ctx) => {
    needBrowser(ctx);
    const { page, errors } = await open("#/musteri/ui-bakery/teklif");
    await page.getByRole("button", { name: "İş Raporu" }).click({ timeout: 5000 });
    await expect.poll(() => page.locator(".report").count()).toBe(1);
    await page.goto(`${base}/#/ayarlar`);
    await page.waitForSelector("#view h1");
    await expect.poll(() => page.locator(".agent-row").count()).toBe(4);
    expect(errors).toEqual([]);
    await page.close();
  });

  ui()("prints one clean A4 document: proposal alone, landscape brand board on one page", async (ctx) => {
    needBrowser(ctx);
    const { page, errors } = await open("#/musteri/ui-bakery/teklif");
    await page.evaluate("window.print = () => { window.__printed = true; }");
    await page.getByRole("button", { name: "Yazdır / PDF" }).click();
    await expect.poll(() => page.evaluate("window.__printed === true")).toBe(true);
    await page.emulateMedia({ media: "print" });
    // Only the document is in the layout; the panel is out of it (not just invisible).
    expect(await page.evaluate("[...document.body.children].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id)")).toEqual(["print-root"]);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
    await page.emulateMedia({ media: "screen" });
    await page.evaluate("window.dispatchEvent(new Event('afterprint'))");
    expect(await page.evaluate("document.getElementById('print-root')")).toBeNull();
    expect(errors).toEqual([]);
    await page.close();
  });

  ui()("shows the monthly report, the client links card and the portal setup", async (ctx) => {
    needBrowser(ctx);
    const { page, errors } = await open("#/musteri/ui-bakery/teklif");
    await page.getByRole("button", { name: "Aylık Rapor" }).click({ timeout: 5000 });
    await expect.poll(() => page.locator(".monthly").count()).toBe(1);
    await page.goto(`${base}/#/musteri/ui-bakery/bilgiler`);
    await page.waitForSelector("#view h1");
    await expect.poll(() => page.locator(".portal-card").textContent()).toContain("portalı kurulmadı");
    await page.goto(`${base}/#/ayarlar`);
    await page.waitForSelector("#view h1");
    await expect.poll(() => page.locator(".portal-settings").textContent()).toContain("Workers KV Storage");
    expect(errors).toEqual([]);
    await page.close();
  });

  ui()("works at phone width", async (ctx) => {
    needBrowser(ctx);
    const { page, errors } = await open("#/musteri/ui-bakery/duzenle", { width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.close();
  });
});
