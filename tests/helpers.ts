import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FactoryConfig } from "../src/config.js";

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
