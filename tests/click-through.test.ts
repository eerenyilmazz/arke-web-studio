import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Browser, type FakePanel, findBrowser, idle, jobDone, KEY, launchBrowser, type Page, startPanel } from "./e2e/harness.js";
import { tempFactory } from "./helpers.js";

/**
 * Clicks every button, link, tab, option, toggle and select on every panel screen, one at a time on a freshly loaded
 * page, and records what went wrong: script errors, console errors, failed requests (5xx), error toasts, and controls
 * that did nothing at all. Confirmation dialogs are answered both ways (except removals, answered "no").
 * Runs against the real panel with the fake agent in a temporary folder; nothing real is touched.
 *   ARKE_CLICK_OUT=<folder>   keeps click-report.json and a screenshot of each problem
 *   ARKE_CLICK_ONLY=a,b       explores only the screens whose names start with these
 * Slow (every control gets its own page load), so it runs only with ARKE_CLICK=1.
 */
const OUT = process.env.ARKE_CLICK_OUT;
const executable = process.env.ARKE_CLICK === "1" ? findBrowser() : null;
const factory = { ...tempFactory(), defaultTemplate: "custom" };
let browser: Browser | null = null;
let fp: FakePanel | null = null;
beforeAll(async () => {
  browser = await launchBrowser(executable);
  if (browser) fp = await startPanel(factory);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  fp?.panel.close();
});

const call = async (base: string, method: string, p: string, body: unknown) => {
  const r = await fetch(`${base}${p}`, {
    method,
    headers: { Cookie: `arke_panel=${KEY}`, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json() as Promise<{ slug: string }>;
};

/** Controls that reach this computer's repository or the internet (updating the panel, Cloudflare, publishing). */
const NEVER =
  /^(Güncelle|Update|Güncellemeleri Denetle|Check for updates|Yayınla|Canlıya al|Yayından kaldır|Önceki sürüme dön|Şimdi Eşitle|Sync now|Hesabı Kaldır|Bağlantıyı Test Et|Kaydet ve Test Et|Portalı kur|Önizlemeyi Yayınla)$/i;
/** Dialogs whose "yes" would remove the client under test; they are answered "no" only. */
const ONLY_CANCEL = /arşiv|sil|kaldır|delete|remove|archive/i;
const IN_VIEW =
  "#view button:not([disabled]), #view a[href], #view summary, #view label.opt-card, #view label.kind-opt:not(.is-soon), #view .switch-input:not([disabled]), #view select:not([disabled])";
/** The top bar and the main menu are the same on every screen: explored once, on the home screen. */
const WITH_SHELL = `${IN_VIEW}, .topbar button, .sidebar a[href]`;

interface Finding {
  screen: string;
  control: string;
  problem: string;
}
type Prep = (p: Page) => Promise<void>;
interface Tab {
  page: Page;
  log: { errors: string[]; requests: number; bad: string[] };
}

async function newTab(base: string): Promise<Tab> {
  const page = await browser!.newPage({ viewport: { width: 1360, height: 900 } });
  const log = { errors: [] as string[], requests: 0, bad: [] as string[] };
  page.on("pageerror", (e) => log.errors.push(`script error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) log.errors.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on("request", () => void log.requests++);
  page.on("response", (r) => {
    if (r.status() >= 500) log.bad.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  page.on("dialog", (d) => {
    log.errors.push(`native ${d.type()} dialog: ${d.message().slice(0, 80)}`);
    void d.dismiss();
  });
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  await page.goto(`${base}/login?key=${KEY}`);
  return { page, log };
}

let loads = 0;
/** A fresh load of the screen in Turkish (a new query string forces a real reload). */
async function load(tab: Tab, base: string, hash: string, prep?: Prep) {
  await call(base, "PUT", "/api/settings", { panelLanguage: "tr" });
  await tab.page.evaluate(() => localStorage.clear()).catch(() => undefined);
  await tab.page.goto(`${base}/?r=${++loads}${hash}`);
  await tab.page.waitForSelector("#view h1", { timeout: 10_000 });
  await tab.page.waitForTimeout(250);
  if (prep) await prep(tab.page);
  tab.log.errors.length = 0;
  tab.log.bad.length = 0;
}

async function describe(page: Page, sel: string, i: number): Promise<string> {
  const loc = visible(page, sel).nth(i);
  if (!(await loc.count())) return "(gone)";
  return loc.evaluate((el: HTMLElement) => {
    const text = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("href") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const cls = typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "";
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls} "${text}"`;
  });
}

/** Only what the person can see and reach (hidden tabs and closed sections are left out). */
const visible = (page: Page, sel: string) => page.locator(sel).locator("visible=true");

/** A fingerprint of what the person sees, to tell whether a click did anything. */
const snapshot = (page: Page) =>
  page.evaluate(() =>
    [
      location.href,
      document.documentElement.dataset.theme,
      document.documentElement.lang,
      document.querySelector("#view")?.innerHTML.length,
      document.querySelector("#view")?.textContent,
      [...document.querySelectorAll("#view [aria-sort]")].map((e) => e.getAttribute("aria-sort")).join(),
      document.querySelectorAll("dialog[open], details[open]").length,
      document.querySelector("#toast:not([hidden])")?.textContent ?? "",
      (document.activeElement as HTMLElement | null)?.outerHTML.slice(0, 80),
      document.querySelectorAll("#view input:checked, #view [aria-pressed=true], #view [aria-current], #view [aria-selected=true]").length,
      [...document.querySelectorAll("#view [hidden]")].length,
    ].join("|"),
  );

async function clickOne(tab: Tab, base: string, screen: string, hash: string, prep: Prep | undefined, sel: string, i: number, found: Finding[]) {
  for (const answer of ["cancel", "confirm"] as const) {
    await load(tab, base, hash, prep);
    const { page, log } = tab;
    const control = await describe(page, sel, i);
    const label = control.replace(/^[^"]*"|"$/g, "");
    if (control === "(gone)" || NEVER.test(label)) return;
    const before = await snapshot(page);
    const requestsBefore = log.requests;
    const el = visible(page, sel).nth(i);
    try {
      if ((await el.evaluate((e) => e.tagName)) === "SELECT") {
        const values = await el.evaluate((s) => [...(s as HTMLSelectElement).options].map((o) => o.value));
        const current = await el.inputValue();
        const next = values.find((v) => v !== current);
        if (next === undefined) return;
        await el.selectOption(next);
      } else {
        await el.scrollIntoViewIfNeeded({ timeout: 2000 });
        await el.click({ timeout: 2500 });
      }
    } catch (e) {
      // Say what was in the way, then click anyway: the control itself may still work.
      const cover = await el
        .evaluate((node) => {
          const r = node.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null;
          return top && top !== node && !node.contains(top) ? `${top.tagName.toLowerCase()}.${top.className}` : "nothing";
        })
        .catch(() => "?");
      found.push({ screen, control, problem: `cannot click (covered by ${cover}): ${(e as Error).message.split("\n")[0]}` });
      await el.click({ timeout: 2500, force: true }).catch(() => undefined);
    }
    await page.waitForTimeout(400);
    const dialog = page.locator("dialog[open]");
    let dialogTitle = "";
    if (await dialog.count()) {
      dialogTitle = ((await dialog.first().textContent()) ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (answer === "confirm" && !ONLY_CANCEL.test(dialogTitle)) {
        const ok = dialog.first().locator("button.btn-primary, button.btn-danger-solid, button[type=submit]").first();
        const typed = dialog.first().locator("#ask-typed");
        if (await typed.count()) await typed.fill((await typed.getAttribute("placeholder")) ?? "");
        if ((await ok.count()) && (await ok.isEnabled())) await ok.click();
        await page.waitForTimeout(600);
      } else await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(150);
    const after = await snapshot(page).catch(() => "navigated");
    const toast = page.locator("#toast.error:not([hidden])");
    const tag = answer === "confirm" ? `${control} → yes` : control;
    for (const e of log.errors) found.push({ screen, control: tag, problem: e });
    for (const b of log.bad) found.push({ screen, control: tag, problem: `request failed: ${b}` });
    if (await toast.count()) found.push({ screen, control: tag, problem: `error toast: ${(await toast.textContent())?.trim().slice(0, 140)}` });
    if (!dialogTitle && after === before && log.requests === requestsBefore) found.push({ screen, control, problem: "no visible effect" });
    if ((log.errors.length || log.bad.length || (await toast.count())) && OUT)
      await page.screenshot({ path: `${OUT}/${screen}-${i}-${answer}.png` }).catch(() => undefined);
    await idle(base).catch(() => undefined);
    if (!dialogTitle) return; // no dialog: one pass is enough
  }
}

(executable ? it : it.skip)("every control on every screen works", { timeout: 3_600_000 }, async () => {
  const { base } = fp!;
  const seed = [
    ["Hollin and Rye Bakehouse", "hollin", "bakery", "GB", 900, "premium"],
    ["Mavi Kapı Fırın", "mavi-kapi", "fırın", "TR", 25000, "balanced"],
    ["Northgate Joinery", "northgate", "joinery", "GB", 650, "economy"],
  ] as const;
  for (const [name, slug, industry, country, price, mode] of seed) {
    await call(base, "POST", "/api/clients", { businessName: name, slug, industry, hostingModel: "managed", country });
    await call(base, "PUT", `/api/clients/${slug}/business`, { price, currency: country === "GB" ? "GBP" : "TRY", payment: "quoted", budgetMode: mode });
  }
  await call(base, "PUT", "/api/settings", { profile: { name: "Deniz" } });
  await call(base, "POST", "/api/clients/hollin/agent/create-site", { freeText: "Family bakery in Leeds." });
  await jobDone(base, "hollin", "create-site", 1);
  await call(base, "POST", "/api/clients/hollin/design-plan/approve", {});
  await call(base, "POST", "/api/clients/hollin/agent/create-site", {});
  await jobDone(base, "hollin", "create-site", 2);
  await idle(base);
  await call(base, "POST", "/api/clients/northgate/agent/create-site", { freeText: "Joinery in York." });
  await jobDone(base, "northgate", "create-site", 1);
  await idle(base);

  const qe =
    (id: string): Prep =>
    async (p) => {
      await p.click(`.qe-row[data-edit="${id}"]`);
      await p.waitForSelector(".qe-editor");
      await p.waitForTimeout(250);
    };
  const tab =
    (id: string): Prep =>
    async (p) => {
      await p.click(`.settings-nav a[data-tab="${id}"]`);
      await p.waitForTimeout(200);
    };
  const step =
    (n: number): Prep =>
    async (p) => {
      await p.fill("#nc-name", "Test Co");
      await p.fill("#nc-industry", "bakery");
      for (let i = 0; i < n; i++) await p.click("#nc-next");
    };
  const screens: Array<[string, string, Prep?]> = [
    ["home", "#/"],
    ["analiz", "#/analiz"],
    ["kutuphane", "#/kutuphane"],
    ["arsiv", "#/arsiv"],
    ...["hesap", "genel", "ekip", "kullanim", "yayin", "yedek", "guncelleme"].map((t) => [`ayarlar-${t}`, "#/ayarlar", tab(t)] as [string, string, Prep]),
    ...[0, 1, 2, 3, 4].map((n) => [`yeni-${n + 1}`, "#/yeni", step(n)] as [string, string, Prep]),
    ["plan", "#/musteri/northgate/duzenle"],
    ["yeni-musteri", "#/musteri/mavi-kapi"],
    ...["colors", "pages", "services", "text", "contact", "form", "files"].map(
      (id) => [`qe-${id}`, "#/musteri/hollin/duzenle", qe(id)] as [string, string, Prep],
    ),
    ["duzenle", "#/musteri/hollin/duzenle"],
    ["marka", "#/musteri/hollin/marka"],
    ["teklif", "#/musteri/hollin/teklif"],
    ["bilgiler", "#/musteri/hollin/bilgiler"],
  ];
  const only = (process.env.ARKE_CLICK_ONLY || "").split(",").filter(Boolean);

  // Count each screen's controls once, then click them one per page load, with a few tabs side by side.
  const tasks: Array<{ screen: string; hash: string; prep?: Prep; sel: string; i: number }> = [];
  const counter = await newTab(base);
  for (const [screen, hash, prep] of screens) {
    if (only.length && !only.some((o) => screen.startsWith(o))) continue;
    const sel = screen === "home" ? WITH_SHELL : IN_VIEW;
    await load(counter, base, hash, prep);
    const n = await visible(counter.page, sel).count();
    for (let i = 0; i < n; i++) tasks.push({ screen, hash, ...(prep ? { prep } : {}), sel, i });
  }
  await counter.page.close();
  const found: Finding[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Number(process.env.ARKE_CLICK_WORKERS || 3) }, async () => {
      const t = await newTab(base);
      while (next < tasks.length) {
        const job = tasks[next++]!;
        await clickOne(t, base, job.screen, job.hash, job.prep, job.sel, job.i, found).catch((e) =>
          found.push({ screen: job.screen, control: `#${job.i}`, problem: `explorer: ${(e as Error).message.split("\n")[0]}` }),
        );
      }
      await t.page.close();
    }),
  );
  if (OUT) writeFileSync(`${OUT}/click-report.json`, JSON.stringify(found, null, 2));
  // Script and console errors, failed requests and native dialogs fail the run. The rest (no visible effect, a click
  // that had to be forced while the page redrew, error toasts from a job another tab started) is for reading by eye.
  expect(found.filter((f) => /^(script error|console|request failed|native)/.test(f.problem))).toEqual([]);
});
