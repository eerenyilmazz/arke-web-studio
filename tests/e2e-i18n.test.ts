import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Browser, type FakePanel, findBrowser, jobDone, launchBrowser, openPanel, startPanel } from "./e2e/harness.js";
import { tempFactory } from "./helpers.js";

/**
 * The panel in English: a client is built in Turkish mode (the fake agent writes the site), then the language
 * setting is switched and every main screen is opened. Visible text must hold no Turkish letters, except inside
 * client data (marked data-no-i18n) and the client's own name; the translator's list of texts it could not
 * translate must be empty. Skipped without a Linux Chromium, like the other browser tests.
 */
const SLUG = "hollin-bakery";
const executable = findBrowser();
const factory = { ...tempFactory(), defaultTemplate: "custom" };
let browser: Browser | null = null;
let fp: FakePanel | null = null;

const SCREENS = [
  "#/",
  "#/yeni",
  "#/kutuphane",
  "#/arsiv",
  "#/analiz",
  "#/ayarlar",
  `#/musteri/${SLUG}/duzenle`,
  `#/musteri/${SLUG}/marka`,
  `#/musteri/${SLUG}/teklif`,
  `#/musteri/${SLUG}/bilgiler`,
];
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
// Common panel words without Turkish letters, so a gap like "Onay" or "Not" is caught too.
const TURKISH_WORDS =
  /\b(onay\w*|notlar|gider\w*|kur|dene|durum|kontrol|marka|konsept|belge|kapsam|toplam|teslim|dosyalar|buton|sayfa\w*|telefon|genel|yedek|bildirim\w*|eksik\w*|tamam|yok|gerekli|renk|etiket\w*|tipografi|metin\w*|bekle\w*|ve|ile|bir|ekle|siteyi|sitedeki|yazar|sonra|indir|belirtilecek|belirlenir|tavan|birim|gruplama|kaydet|izin|mevcut|bilgi\w*|yap\w*|olarak|kullan\w*|bilgiler|henuz|tasarla)\b/i;

beforeAll(async () => {
  browser = await launchBrowser(executable);
  if (browser) fp = await startPanel(factory);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  fp?.panel.close();
});

const e2e = () => (executable ? it : it.skip);

describe("panel in English", { timeout: 300_000 }, () => {
  e2e()("shows every main screen in English and keeps client data as written", async (ctx) => {
    if (!browser || !fp) return ctx.skip();
    const { base } = fp;
    const { page, errors } = await openPanel(browser, base, "#/yeni");
    await page.fill("#nc-name", "Hollin Bakery");
    await page.fill("#nc-industry", "bakery");
    await page.selectOption("#nc-country", "GB");
    for (let i = 0; i < 3; i++) await page.click("#nc-next");
    await page.fill("#nc-info", "Family bakery in Leeds. Sourdough £4.50. Phone 0113 496 0000.");
    await page.click("#nc-next");
    // No logo: the summary says a wordmark will be drawn, before anything starts.
    await expect.poll(() => page.locator(".nc-review").textContent()).toContain("yazı logosu");
    await page.click("#nc-start");
    await page.waitForURL(new RegExp(`#/musteri/${SLUG}`));
    expect((await jobDone(base, SLUG, "create-site", 1)).status).toBe("succeeded");

    // Switch from the settings screen, as Eren would; the page reloads in English.
    await page.goto(`${base}/#/ayarlar`);
    await page.waitForSelector("#panel-lang:not([disabled])");
    await Promise.all([page.waitForEvent("load"), page.selectOption("#panel-lang", "en")]);
    await page.waitForSelector("#view h1");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
    expect(await page.locator("#view h1").textContent()).toBe("Settings");

    const leftovers: string[] = [];
    for (const hash of SCREENS) {
      await page.goto(`${base}/${hash}`);
      await page.waitForSelector("#view h1");
      await page.waitForTimeout(400); // lists and cards that load after the first draw
      // SF_E2E_SHOTS=<folder> keeps a screenshot of each screen, for reading the English by eye.
      if (process.env.SF_E2E_SHOTS) await page.screenshot({ path: `${process.env.SF_E2E_SHOTS}/${hash.replace(/\W+/g, "_")}.png`, fullPage: true });
      const texts = await page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || el.closest("[data-no-i18n], script, style, textarea") || !el.checkVisibility()) continue;
          const text = n.nodeValue?.trim();
          if (text) out.push(text);
        }
        for (const el of document.querySelectorAll("[placeholder], [title], [aria-label]")) {
          if (el.closest("[data-no-i18n]")) continue;
          for (const a of ["placeholder", "title", "aria-label"]) {
            const v = el.getAttribute(a);
            if (v) out.push(v);
          }
        }
        return out;
      });
      for (const t of texts) {
        if (TURKISH.test(t) && t !== "Türkçe" && !t.includes("Türkiye")) leftovers.push(`${hash}: ${t}`);
        if (/^(null|false|undefined)$/.test(t)) leftovers.push(`${hash}: a stray "${t}"`); // a falsy value given to append()
      }
    }
    // A string, so the test runner does not rewrite the browser-side import.
    const missing = (await page.evaluate('import("/js/i18n.js").then((m) => [...m.missing])')) as string[];
    const gaps = missing.filter((t) => TURKISH.test(t) || TURKISH_WORDS.test(t));
    expect({ leftovers, gaps }).toEqual({ leftovers: [], gaps: [] });

    // Back to Turkish: the setting is kept on the server and the panel draws in Turkish again.
    await page.goto(`${base}/#/ayarlar`);
    await page.waitForSelector("#panel-lang:not([disabled])");
    await Promise.all([page.waitForEvent("load"), page.selectOption("#panel-lang", "tr")]);
    await page.waitForSelector("#view h1");
    expect(await page.locator("#view h1").textContent()).toBe("Ayarlar");
    expect(errors).toEqual([]);
    await page.close();
  });
});
