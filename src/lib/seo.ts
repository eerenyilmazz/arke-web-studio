import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./quality.js";

/**
 * Search engines and AI assistants (Google, Bing, ChatGPT search…) read the same few things: structured data
 * saying what the business is, a sitemap, robots rules, one clear title and description per page, and link
 * previews. A warning only: a site is not blocked for it, but the panel shows what is missing.
 */
export interface SeoFacts {
  readonly name: string;
  readonly phone: string | null;
  readonly domain: string | null;
}

const BUSINESS_TYPES =
  /"@type"\s*:\s*\[?\s*"(LocalBusiness|Organization|ProfessionalService|Store|Restaurant|HairSalon|BarberShop|BeautySalon|Dentist|LegalService|[A-Z][A-Za-z]+Business|[A-Z][A-Za-z]+Store)"/;

function htmlFiles(distDir: string): string[] {
  return readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html") && e.name !== "404.html")
    .map((e) => path.join(e.parentPath, e.name));
}

export function checkSeo(distDir: string, facts: SeoFacts): CheckResult {
  const name = "Search and AI visibility (structured data, sitemap, previews)";
  if (!existsSync(path.join(distDir, "index.html"))) return { name, status: "skip", detail: "No build output." };
  const missing = [
    ...structuredDataProblems(readFileSync(path.join(distDir, "index.html"), "utf8"), facts),
    ...crawlerFileProblems(distDir, facts.domain),
    ...pageProblems(distDir, facts.domain),
  ];
  return missing.length
    ? { name, status: "warn", detail: missing.slice(0, 12).join("; ") + (missing.length > 12 ? ` (+${missing.length - 12} more)` : "") }
    : { name, status: "pass", detail: "JSON-LD, sitemap, robots, titles and previews in place." };
}

/** Structured data on the home page: the business, with its real name and phone. */
function structuredDataProblems(home: string, facts: SeoFacts): string[] {
  const blocks = [...home.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  const business = blocks.find((b) => BUSINESS_TYPES.test(b));
  if (!business) return ["index.html: no JSON-LD LocalBusiness (or Organization) block"];
  const out: string[] = [];
  try {
    JSON.parse(business);
  } catch {
    out.push("index.html: the JSON-LD block is not valid JSON");
  }
  const plain = business.replace(/\\u0026/g, "&");
  if (!plain.includes(facts.name) && !plain.includes(facts.name.replace(/&/g, "&amp;"))) out.push("JSON-LD: business name differs from the config");
  if (facts.phone && !plain.replace(/[\s()-]/g, "").includes(facts.phone.replace(/[\s()-]/g, "")))
    out.push("JSON-LD: telephone missing or different from the config");
  return out;
}

/** robots.txt always; a sitemap (named in robots.txt) once the domain is known, as it needs absolute URLs. */
function crawlerFileProblems(distDir: string, domain: string | null): string[] {
  const robots = path.join(distDir, "robots.txt");
  if (!existsSync(robots)) return domain && !existsSync(path.join(distDir, "sitemap.xml")) ? ["no robots.txt", "no sitemap.xml"] : ["no robots.txt"];
  if (!domain) return [];
  if (!existsSync(path.join(distDir, "sitemap.xml"))) return ["no sitemap.xml"];
  return /sitemap:/i.test(readFileSync(robots, "utf8")) ? [] : ["robots.txt does not point to the sitemap"];
}

/** Per page: a title of sensible length (not shared with another page), link previews, canonical with a domain. */
function pageProblems(distDir: string, domain: string | null): string[] {
  const out: string[] = [];
  const titles = new Map<string, string[]>();
  for (const file of htmlFiles(distDir)) {
    const rel = path.relative(distDir, file).split(path.sep).join("/");
    const html = readFileSync(file, "utf8");
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    if (title) titles.set(title, [...(titles.get(title) ?? []), rel]);
    if (title.length > 65) out.push(`${rel}: title longer than 65 characters`);
    if (!/<meta[^>]+property=["']og:title["']/i.test(html)) out.push(`${rel}: no og:title (link previews)`);
    if (!/<meta[^>]+property=["']og:description["']/i.test(html)) out.push(`${rel}: no og:description`);
    if (domain && !/<link[^>]+rel=["']canonical["']/i.test(html)) out.push(`${rel}: no canonical link`);
  }
  for (const [title, files] of titles) if (files.length > 1) out.push(`same <title> "${title.slice(0, 40)}" on ${files.length} pages`);
  return out;
}

const IMAGE_FILE = /\.(png|jpe?g|webp|avif|gif)$/i;
const MAX_IMAGE_KB = 500;
const MAX_IMAGES_LISTED = 5;

/** Photos are most of a page's weight (rules/local-seo.md, Images). A warning names the heaviest ones. */
export function checkImages(distDir: string): CheckResult {
  const name = "Image weight and size attributes";
  if (!existsSync(path.join(distDir, "index.html"))) return { name, status: "skip", detail: "No build output." };
  const heavy = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && IMAGE_FILE.test(e.name))
    .map((e) => ({
      rel: path.relative(distDir, path.join(e.parentPath, e.name)).split(path.sep).join("/"),
      kb: Math.round(statSync(path.join(e.parentPath, e.name)).size / 1024),
    }))
    .filter((f) => f.kb > MAX_IMAGE_KB)
    .sort((a, b) => b.kb - a.kb);
  const unsized = htmlFiles(distDir).flatMap((file) => {
    const html = readFileSync(file, "utf8");
    const count = [...html.matchAll(/<img\b[^>]*>/gi)].filter((m) => !/\bwidth\s*=/i.test(m[0]) || !/\bheight\s*=/i.test(m[0])).length;
    return count ? [`${path.relative(distDir, file).split(path.sep).join("/")}: ${count} <img> without width/height`] : [];
  });
  const notes = [
    ...heavy.slice(0, MAX_IMAGES_LISTED).map((f) => `${f.rel} is ${f.kb} KB (aim under 300 KB; ask the operator for a smaller file)`),
    ...unsized.slice(0, MAX_IMAGES_LISTED),
  ];
  return notes.length
    ? { name, status: "warn", detail: notes.join("; ") }
    : { name, status: "pass", detail: `All images under ${MAX_IMAGE_KB} KB, sizes set.` };
}

const PRIVACY_LINK = /href=["'][^"']*(privacy|gizlilik|kvkk|aydinlatma|datenschutz)[^"']*["']/i;
const IMPRESSUM_LINK = /href=["'][^"']*impressum[^"']*["']/i;

/** The legal minimum per market (rules/markets.md): a privacy notice with a form, an Impressum in Germany. */
export function checkLegal(distDir: string, country: string): CheckResult {
  const name = "Legal pages for the market";
  if (!existsSync(path.join(distDir, "index.html"))) return { name, status: "skip", detail: "No build output." };
  const pages = htmlFiles(distDir).map((f) => ({ rel: path.relative(distDir, f).split(path.sep).join("/"), html: readFileSync(f, "utf8") }));
  const missing: string[] = [];
  const withForm = pages.filter((p) => /<form\b/i.test(p.html));
  if (withForm.length && !withForm.every((p) => PRIVACY_LINK.test(p.html))) {
    missing.push(country === "TR" ? "a page with a form has no link to the KVKK Aydınlatma Metni" : "a page with a form has no link to the privacy notice");
  }
  if (country === "DE" && !IMPRESSUM_LINK.test(pages.find((p) => p.rel === "index.html")?.html ?? "")) missing.push("no Impressum link (required in Germany)");
  return missing.length
    ? { name, status: "warn", detail: `${missing.join("; ")} (rules/markets.md)` }
    : { name, status: "pass", detail: "Privacy and legal links in place for this market." };
}
