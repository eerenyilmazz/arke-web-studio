import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Browser, type FakePanel, findBrowser, idle, jobDone, KEY, launchBrowser, type Page, startPanel } from "./e2e/harness.js";
import { tempFactory } from "./helpers.js";

/**
 * Every panel screen, in both themes, on a desktop and a phone: text contrast (WCAG AA), no animation left running,
 * no sideways scroll, no button or heading text spilling out of its box, no script error.
 * ARKE_SHOT_OUT=<folder> also keeps a screenshot of each screen, for checking by eye.
 */
const OUT = process.env.ARKE_SHOT_OUT;
const executable = findBrowser();
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

/** Text with too little contrast against its effective background, running animations, overflow. */
async function findings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const parse = (c: string) => {
      // color-mix() results come back as color(srgb r g b / a) with 0–1 channels.
      const srgb = c.match(/color\(srgb ([^)]+)\)/);
      if (srgb) {
        const [r, g, b, a = "1"] = srgb[1]!.split(/[ /]+/).filter(Boolean);
        return [Number(r) * 255, Number(g) * 255, Number(b) * 255, Number(a)] as const;
      }
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = "1"] = m[1]!.split(/[ ,/]+/).filter(Boolean);
      return [Number(r), Number(g), Number(b), Number(a)] as const;
    };
    const lum = ([r, g, b]: readonly number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const bgOf = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0.5) return [c[0], c[1], c[2]];
      }
      return [255, 255, 255];
    };
    const seen = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = n.nodeValue?.trim();
      if (!el || !text || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      if (el.closest("iframe, .pv-screen, .board, .proposal, .device, [data-brand-preview]")) continue;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const l1 = lum(fg);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const min = el.closest("button:disabled, [disabled], [aria-disabled=true]") ? 0 : large ? 3 : 4.5;
      if (ratio < min) {
        const key = `${text.slice(0, 40)}|${ratio.toFixed(2)}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(
            `contrast ${ratio.toFixed(2)} < ${min}: "${text.slice(0, 50)}" (${el.tagName.toLowerCase()}.${[...el.classList].join(".")}) fg=${cs.color} bg=rgb(${bg.join(",")})`,
          );
        }
      }
    }
    for (const a of document.getAnimations()) {
      const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
      out.push(
        `animation running: ${(a as CSSAnimation).animationName || (a as CSSTransition).transitionProperty} on ${t?.tagName.toLowerCase()}.${t ? [...t.classList].join(".") : ""}`,
      );
    }
    const over = document.documentElement.scrollWidth - window.innerWidth;
    if (over > 1) out.push(`page scrolls sideways by ${over}px`);
    // Elements wider than their box (clipped text that is not meant to be ellipsed).
    for (const el of document.querySelectorAll("button, .btn, .pill, .chip, label, th, h1, h2, h3")) {
      const cs = getComputedStyle(el);
      if (
        !el.classList.contains("sr-only") &&
        el.scrollWidth > el.clientWidth + 2 &&
        cs.textOverflow !== "ellipsis" &&
        cs.overflowX !== "auto" &&
        el.checkVisibility()
      )
        out.push(`overflows its box: ${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${el.textContent?.trim().slice(0, 40)}"`);
    }
    return out;
  });
}

(executable ? it : it.skip)("every screen passes the UI audit", { timeout: 900_000 }, async () => {
  const { base } = fp!;
  const seed = [
    ["Hollin and Rye Bakehouse", "hollin", "bakery", "GB", 900, "premium"],
    ["Mavi Kapı Fırın", "mavi-kapi", "fırın", "TR", 25000, "balanced"],
    ["Atlas Diş Kliniği", "atlas-dis", "diş kliniği", "TR", 40000, "premium"],
    ["Northgate Joinery", "northgate", "joinery", "GB", 650, "economy"],
  ] as const;
  for (const [name, slug, industry, country, price, mode] of seed) {
    await call(base, "POST", "/api/clients", { businessName: name, slug, industry, hostingModel: "managed", country });
    await call(base, "PUT", `/api/clients/${slug}/business`, {
      price,
      currency: country === "GB" ? "GBP" : "TRY",
      payment: "quoted",
      budgetMode: mode,
      addons: [{ id: "theme", price: 100 }],
      deadline: "2026-10-01",
      tags: ["acil"],
    });
  }
  // Hollin: plan, approval, built site. Northgate: a plan waiting for the operator (the plan card is audited too).
  await call(base, "POST", "/api/clients/hollin/agent/create-site", { freeText: "Family bakery in Leeds." });
  await jobDone(base, "hollin", "create-site", 1);
  await call(base, "POST", "/api/clients/hollin/design-plan/approve", {});
  await call(base, "POST", "/api/clients/hollin/agent/create-site", {});
  await jobDone(base, "hollin", "create-site", 2);
  await idle(base);
  await call(base, "POST", "/api/clients/northgate/agent/create-site", { freeText: "Joinery in York." });
  await jobDone(base, "northgate", "create-site", 1);
  await idle(base);

  const report: string[] = [];
  const screens: Array<[string, string, ((p: Page) => Promise<void>)?]> = [
    ["home", "#/"],
    ["analiz", "#/analiz"],
    ["kutuphane", "#/kutuphane"],
    ["arsiv", "#/arsiv"],
    ["ayarlar", "#/ayarlar"],
    ["yeni-1", "#/yeni"],
    [
      "yeni-2",
      "#/yeni",
      async (p) => {
        await p.fill("#nc-name", "Test Co");
        await p.fill("#nc-industry", "bakery");
        await p.click("#nc-next");
      },
    ],
    [
      "yeni-3",
      "#/yeni",
      async (p) => {
        await p.fill("#nc-name", "Test Co");
        await p.fill("#nc-industry", "bakery");
        await p.click("#nc-next");
        await p.click("#nc-next");
      },
    ],
    [
      "yeni-5",
      "#/yeni",
      async (p) => {
        await p.fill("#nc-name", "Test Co");
        await p.fill("#nc-industry", "bakery");
        for (let i = 0; i < 4; i++) await p.click("#nc-next");
      },
    ],
    ["c-duzenle", "#/musteri/hollin/duzenle"],
    ["c-plan", "#/musteri/northgate/duzenle"],
    ["c-marka", "#/musteri/hollin/marka"],
    ["c-teklif", "#/musteri/hollin/teklif"],
    ["c-bilgiler", "#/musteri/hollin/bilgiler"],
    ["c-new-client", "#/musteri/mavi-kapi"],
    [
      "c-menu",
      "#/musteri/hollin/duzenle",
      async (p) => {
        await p.click(".client-head .menu summary");
      },
    ],
    [
      "c-approve",
      "#/musteri/hollin/duzenle",
      async (p) => {
        await p.locator(".strip-next .btn", { hasText: "Onayla" }).click();
        await p.waitForTimeout(300);
      },
    ],
  ];
  for (const theme of ["light", "dark"]) {
    for (const [vw, vh, tag] of [
      [1360, 860, "d"],
      [390, 844, "m"],
    ] as const) {
      for (const [name, hash, act] of screens) {
        const page = await browser!.newPage({ viewport: { width: vw, height: vh } });
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.addInitScript((t) => {
          try {
            localStorage.setItem("arke-theme", t);
          } catch {
            /* sandboxed frames (the signature preview) have no storage */
          }
        }, theme);
        await page.goto(`${base}/login?key=${KEY}`);
        await page.goto(`${base}/${hash}`);
        await page.waitForSelector("#view h1");
        await page.waitForTimeout(500);
        try {
          if (act) await act(page);
        } catch (e) {
          report.push(`[${name} ${theme} ${tag}] action failed: ${(e as Error).message.split("\n")[0]}`);
        }
        await page.waitForTimeout(400);
        if (OUT) await page.screenshot({ path: `${OUT}/${theme}-${tag}-${name}.png`, fullPage: tag === "d" });
        for (const f of await findings(page)) report.push(`[${name} ${theme} ${tag}] ${f}`);
        for (const e of errors) report.push(`[${name} ${theme} ${tag}] script error: ${e}`);
        await page.close();
      }
    }
  }
  if (OUT) writeFileSync(`${OUT}/report.txt`, report.join("\n"));
  expect(report).toEqual([]);
});
