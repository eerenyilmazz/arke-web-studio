import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FactoryConfig } from "../src/config.js";
import { writeSiteFileTool } from "../src/tools.js";

/** A throwaway factory with its own clients/inbox/templates folders. */
export function tempFactory(): FactoryConfig & { base: string } {
  const base = mkdtempSync(path.join(os.tmpdir(), "sf-test-"));
  const cfg = {
    base,
    clientsRoot: path.join(base, "clients"),
    inboxDir: path.join(base, "inbox"),
    templatesDir: path.join(base, "templates"),
    defaultTemplate: "stub-v1",
    uupmScript: path.join(base, "missing", "search.py"),
    limits: { maxImageBytes: 200_000, maxLogoBytes: 50_000, buildTimeoutMs: 60_000, deployTimeoutMs: 60_000 },
  };
  mkdirSync(cfg.clientsRoot, { recursive: true });
  mkdirSync(cfg.inboxDir, { recursive: true });
  return cfg;
}

/**
 * Minimal template honouring the contract: reads SF_CLIENT_DIR, writes SF_OUT_DIR.
 * Lets build_site be tested without Astro.
 */
export function installStubTemplate(templatesDir: string, name = "stub-v1"): void {
  const dir = path.join(templatesDir, name);
  mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, private: true, scripts: { build: "node build.mjs" } }));
  writeFileSync(
    path.join(dir, "build.mjs"),
    `import fs from "node:fs"; import path from "node:path";
const client = process.env.SF_CLIENT_DIR, out = process.env.SF_OUT_DIR;
const cfg = JSON.parse(fs.readFileSync(path.join(client, "site.config.json"), "utf8"));
const c = JSON.parse(fs.readFileSync(path.join(client, "content", cfg.i18n.defaultLocale + ".json"), "utf8"));
fs.mkdirSync(out, { recursive: true });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
fs.writeFileSync(path.join(out, "index.html"), \`<!doctype html><html lang="\${cfg.i18n.defaultLocale}"><head><title>\${esc(c.seo.home.title)}</title><meta name="description" content="\${esc(c.seo.home.description)}"></head><body><h1>\${esc(cfg.business.name)}</h1><p>\${esc(c.tagline)}</p></body></html>\`);
`,
  );
}

export const PNG_1PX = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

export const COMPLETE_PATCH = {
  brief: { audience: "Brides in south-west London", tone: "premium" },
  brand: { logo: null, colors: null },
  design: {
    style: "Editorial minimal",
    palette: { primary: "#5B2333", secondary: "#E8DCCB", accent: "#B08D57", background: "#FBF8F3", text: "#2B1B1F" },
    fonts: { heading: "Cormorant Garamond", body: "Source Sans 3" },
    variants: { hero: "b", services: "a", testimonials: "a", cta: "a" },
  },
  pages: ["home", "contact"],
  sections: { home: ["hero", "services", "contact-cta"], contact: ["contact-form"] },
  contact: { email: "hello@willow.co.uk", phone: "+447700900123" },
  whatsapp: { number: null, floatingButton: false },
  site: { domain: null, domainStatus: "undecided" },
};

export const COMPLETE_CONTENT = {
  tagline: "Bridal alterations in Kingston",
  hero: { title: "Your dress, made perfect", subtitle: "Fittings by appointment in Kingston upon Thames.", ctaLabel: "Book a fitting" },
  about: { title: "About us", body: "Fifteen years of bridal tailoring." },
  services: [{ title: "Hemming", description: "Even hems for every fabric." }],
  contact: { title: "Contact", intro: "Write to us." },
  seo: { home: { title: "Willow & Thread | Bridal alterations", description: "Bridal alterations in Kingston upon Thames." } },
};

/** A small custom site that passes the build (brand, motion, reduced motion, logo, contact page). */
export function writePassingCustomSite(f: FactoryConfig, slug: string, name: string): void {
  for (const [p, content] of Object.entries(passingSiteFiles(name))) writeSiteFileTool(f, { slug, path: p, content });
}

/** The files of that site, by path inside site/ (the e2e test's fake agent writes them through the MCP server). */
export function passingSiteFiles(name: string): Record<string, string> {
  const brand = {
    concept: "Bread from a wood oven: crust, flour dust and warm mornings.",
    personality: ["warm", "honest"],
    palette: { crust: "#8A4B16", ink: "#1B1B1B", flour: "#F6F1E4" },
    fonts: { heading: "Fraunces", body: "Nunito" },
    visualLanguage: "Loaf silhouettes, flour dust and oven light.",
    voice: "Short and friendly.",
    animations: [
      { id: "dough-rise", idea: "The hero loaf rises on load", trigger: "load" },
      { id: "flour-dust", idea: "Flour dust drifts from the cursor", trigger: "pointer" },
    ],
  };
  const css = `:root{--crust:#8A4B16;--ink:#1B1B1B;--flour:#F6F1E4}
.dough-rise{animation:dough-rise 4s ease infinite}@keyframes dough-rise{to{transform:scaleY(1)}}
[data-anim="flour-dust"]{opacity:.8}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;");
  const page = (
    title: string,
    body: string,
  ) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="Bread baked every morning in a wood oven.">
<link rel="stylesheet" href="/css/site.css"><link rel="icon" href="/brand/logo.svg"></head>
<body><header><a href="/"><img src="/brand/logo.svg" alt="${esc(name)}"></a></header><main>${body}</main></body></html>`;
  return {
    "brand/brand.json": JSON.stringify(brand),
    "brand/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#8A4B16"/></svg>',
    "css/site.css": css,
    "index.html": page(name, `<h1 class="dough-rise">${esc(name)}</h1><div data-anim="flour-dust"></div><a href="/contact/">Contact</a>`),
    "contact/index.html": page(`Contact | ${name}`, "<h1>Contact</h1>"),
    "404.html": page(`Not found | ${name}`, "<h1>Not found</h1>"),
  };
}

/** A valid design plan (rules/custom/plan.md), as the agent saves it with save_design_plan. */
export const SAMPLE_PLAN = {
  concept: "Ekmeğin fırında kabarması: katmanlar, kabuk ve sıcak ışık.",
  source: "Logodaki somun biçimi",
  tone: ["sıcak", "ölçülü"],
  palette: [
    { name: "Kabuk", hex: "#8A4B16", role: "ana renk" },
    { name: "Un", hex: "#F6F1E4", role: "zemin" },
    { name: "Mürekkep", hex: "#1B1B1B", role: "metin" },
  ],
  fonts: { heading: "Fraunces", body: "Nunito" },
  hero: "Somun çizimi giriş alanının yarısını kaplar.",
  pages: [{ name: "Ana sayfa", sections: [{ name: "Giriş", purpose: "Markayı gösterir" }] }],
  signature: {
    name: "Katmanlı Kabarma",
    idea: "Katmanlar sırayla yükselir.",
    trigger: "load",
    beats: [
      { atMs: 0, durationMs: 500, what: "Alt katman yükselir", easing: "ease-out" },
      { atMs: 250, durationMs: 700, what: "Kabuk çizilir", easing: "ease-in-out" },
      { atMs: 700, durationMs: 450, what: "Başlık oturur", easing: "spring" },
    ],
    totalMs: 1200,
    reducedMotion: "Son kare",
  },
};
