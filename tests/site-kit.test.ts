import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../src/config.js";
import { ensureBaseKit } from "../src/lib/custom-site.js";
import { checkLanguages } from "../src/lib/i18n-check.js";
import { checkKitParts } from "../src/lib/kit-check.js";
import { clientPaths } from "../src/lib/paths.js";
import { findBrowser, launchBrowser } from "./e2e/harness.js";

const KIT = path.join(FACTORY_ROOT, "rules", "site-kit");

/** Writes pages into a temporary dist: { "about/index.html": "<html>…" }. */
function dist(pages: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sf-kit-"));
  for (const [rel, html] of Object.entries(pages)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), html);
  }
  return dir;
}
const page = (body: string, head = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const header = (links: string, home = "/") => `<header><a href="${home}">Logo</a><nav>${links}</nav></header>`;

describe("language check on built pages", () => {
  const complete = {
    "index.html": page(header('<a href="/about/">Hakkımızda</a><a href="/en/" hreflang="en">EN</a>')),
    "about/index.html": page(header('<a href="/">Ana sayfa</a><a href="/en/about/" hreflang="en">EN</a>')),
    "en/index.html": page(header('<a href="/en/about/">About</a><a href="/" hreflang="tr">TR</a>', "/en/")),
    "en/about/index.html": page(header('<a href="/en/">Home</a><a href="/about/" hreflang="tr">TR</a>', "/en/")),
    "404.html": page("yok"),
  };

  it("passes a complete site and warns while the translation is not written yet", () => {
    expect(checkLanguages(dist(complete), "tr", ["tr", "en"])?.status).toBe("pass");
    const pending = checkLanguages(dist({ "index.html": complete["index.html"], "about/index.html": complete["about/index.html"] }), "tr", ["tr", "en"]);
    expect(pending?.status).toBe("warn");
    expect(checkLanguages(dist(complete), "tr", ["tr"])).toBeNull();
  });

  it("fails a half translation, a language link to the home page and a link out of the language", () => {
    const { "en/about/index.html": _drop, ...withoutAbout } = complete;
    const missing = checkLanguages(dist({ ...withoutAbout, "contact/index.html": page("x") }), "tr", ["tr", "en"])!;
    expect(missing.status).toBe("fail");
    expect(missing.detail).toMatch(/en: 2 of 3 pages not translated \(\/en\/about\/, \/en\/contact\/\)/);

    const wrongSwitch = checkLanguages(
      dist({ ...complete, "about/index.html": page(header('<a href="/">Ana sayfa</a><a href="/en/" hreflang="en">EN</a>')) }),
      "tr",
      ["tr", "en"],
    )!;
    expect(wrongSwitch.status).toBe("fail");
    expect(wrongSwitch.detail).toMatch(/\/about\/: the EN link goes to \/en\/, not \/en\/about\//);

    const leaks = checkLanguages(
      dist({ ...complete, "en/index.html": page(header('<a href="/about/">About</a><a href="/" hreflang="tr">TR</a>', "/en/")) }),
      "tr",
      ["tr", "en"],
    )!;
    expect(leaks.status).toBe("fail");
    expect(leaks.detail).toMatch(/\/en\/: links to \/about\/ \(default language\) instead of \/en\/about\//);
  });
});

describe("language links with the full address", () => {
  it("accepts https://<site domain>/en/about/ as the same page as /en/about/", () => {
    const pages = {
      "index.html": page(header('<a href="https://www.arkelabs.dev/en/" hreflang="en">EN</a>')),
      "en/index.html": page(header('<a href="https://arkelabs.dev/" hreflang="tr">TR</a>', "/en/")),
    };
    expect(checkLanguages(dist(pages), "tr", ["tr", "en"], "arkelabs.dev")?.status).toBe("pass");
    expect(checkLanguages(dist(pages), "tr", ["tr", "en"], null)?.status).toBe("fail"); // without a domain it cannot tell
  });
});

describe("factory parts", () => {
  it("requires kit.js where a toggle is used and the phone menu for long menus", () => {
    const toggle = '<button data-theme-toggle class="theme-toggle"></button>';
    const kit = '<script src="/js/kit.js" defer></script>';
    expect(checkKitParts(dist({ "index.html": page(header(toggle)) })).status).toBe("fail");
    expect(checkKitParts(dist({ "index.html": page(header(toggle) + kit) })).status).toBe("pass");
    const long = '<a href="/a/">a</a><a href="/b/">b</a><a href="/c/">c</a><a href="/d/">d</a><a href="/e/">e</a>';
    expect(checkKitParts(dist({ "index.html": page(header(long)) })).status).toBe("warn");
    expect(checkKitParts(dist({ "index.html": page(header(`${long}<button data-nav-toggle></button>`) + kit) })).status).toBe("pass");
  });

  it("copies kit.js and updates the factory's base.css, but never a hand-written one", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "sf-kitcopy-"));
    const paths = clientPaths(root, "kit-co");
    const base = path.join(paths.root, "site", "css", "base.css");
    expect(ensureBaseKit(paths, path.join(KIT, "base.css"))).toBe(true);
    expect(readFileSync(path.join(paths.root, "site", "js", "kit.js"), "utf8")).toContain("data-theme-toggle");
    writeFileSync(base, "/* Site Factory base layer (old) */");
    expect(ensureBaseKit(paths, path.join(KIT, "base.css"))).toBe(true); // an older factory copy is replaced
    expect(readFileSync(base, "utf8")).toContain(".theme-toggle");
    writeFileSync(base, "/* written by hand */");
    expect(ensureBaseKit(paths, path.join(KIT, "base.css"))).toBe(false);
    expect(readFileSync(base, "utf8")).toBe("/* written by hand */");
  });
});

const executable = findBrowser();
describe("kit.js in a real browser", () => {
  (executable ? it : it.skip)("switches and remembers the theme, and folds the menu on a phone", async () => {
    const files: Record<string, [string, string]> = {
      "/": [
        "text/html",
        `<!doctype html><html><head><link rel="stylesheet" href="/base.css"><style>:root{--c-bg:#fff}:root[data-theme=dark]{--c-bg:#000}</style></head><body>
<header style="position:relative"><a href="/">Logo</a><button class="nav-toggle" data-nav-toggle aria-controls="site-nav" aria-expanded="false" aria-label="Menü">≡</button>
<nav id="site-nav" data-nav><a href="#a">A</a><a href="#b">B</a></nav>
<button class="theme-toggle" data-theme-toggle data-label-dark="Koyu temaya geç" data-label-light="Açık temaya geç"><svg class="icon-moon"></svg><svg class="icon-sun"></svg></button></header>
<script src="/kit.js" defer></script></body></html>`,
      ],
      "/kit.js": ["text/javascript", readFileSync(path.join(KIT, "kit.js"), "utf8")],
      "/base.css": ["text/css", readFileSync(path.join(KIT, "base.css"), "utf8")],
    };
    const server = createServer((req, res) => {
      const f = files[req.url ?? "/"] ?? files["/"]!;
      res.writeHead(200, { "Content-Type": `${f[0]}; charset=utf-8` });
      res.end(f[1]);
    }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const browser = (await launchBrowser(executable))!;
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, colorScheme: "light" });
      const p = await ctx.newPage();
      await p.goto(url);
      const toggle = p.locator("[data-theme-toggle]");
      await expect.poll(() => toggle.getAttribute("aria-label")).toBe("Koyu temaya geç");
      await toggle.click();
      expect(await p.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
      expect(await toggle.getAttribute("aria-pressed")).toBe("true");
      expect(await toggle.getAttribute("aria-label")).toBe("Açık temaya geç");
      expect(await p.locator(".icon-sun").isVisible()).toBe(true);
      await p.reload();
      expect(await p.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
      await expect.poll(() => toggle.getAttribute("aria-pressed")).toBe("true");

      // Phone: the nav is folded into the button, opens on a press and closes on a link or Escape.
      expect(await p.locator("#site-nav").isVisible()).toBe(false);
      await p.click("[data-nav-toggle]");
      expect(await p.locator("#site-nav").isVisible()).toBe(true);
      await p.keyboard.press("Escape");
      expect(await p.locator("#site-nav").isVisible()).toBe(false);
      await p.setViewportSize({ width: 1200, height: 800 });
      expect(await p.locator("#site-nav").isVisible()).toBe(true);
      expect(await p.locator("[data-nav-toggle]").isVisible()).toBe(false);
    } finally {
      await browser.close();
      server.close();
    }
  });
});
