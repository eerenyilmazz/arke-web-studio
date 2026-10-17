import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const BUSINESS_TYPES = /"@type"\s*:\s*\[?\s*"(LocalBusiness|Organization|ProfessionalService|Store|Restaurant|HairSalon|BarberShop|BeautySalon|Dentist|LegalService|[A-Z][A-Za-z]+Business|[A-Z][A-Za-z]+Store)"/;

function htmlFiles(distDir: string): string[] {
  return readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html") && e.name !== "404.html")
    .map((e) => path.join(e.parentPath, e.name));
}

export function checkSeo(distDir: string, facts: SeoFacts): CheckResult {
  const name = "Search and AI visibility (structured data, sitemap, previews)";
  if (!existsSync(path.join(distDir, "index.html"))) return { name, status: "skip", detail: "No build output." };
  const missing: string[] = [];
  const home = readFileSync(path.join(distDir, "index.html"), "utf8");

  // Structured data on the home page: the business, with its real name and phone.
  const blocks = [...home.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  const business = blocks.find((b) => BUSINESS_TYPES.test(b));
  if (!business) missing.push("index.html: no JSON-LD LocalBusiness (or Organization) block");
  else {
    try {
      JSON.parse(business);
    } catch {
      missing.push("index.html: the JSON-LD block is not valid JSON");
    }
    const plain = business.replace(/\\u0026/g, "&");
    if (!plain.includes(facts.name) && !plain.includes(facts.name.replace(/&/g, "&amp;"))) missing.push("JSON-LD: business name differs from the config");
    if (facts.phone && !plain.replace(/[\s()-]/g, "").includes(facts.phone.replace(/[\s()-]/g, ""))) missing.push("JSON-LD: telephone missing or different from the config");
  }

  // A sitemap needs absolute URLs, so it is expected once the domain is known (rules/custom-site.md).
  if (!existsSync(path.join(distDir, "robots.txt"))) missing.push("no robots.txt");
  if (facts.domain) {
    if (!existsSync(path.join(distDir, "sitemap.xml"))) missing.push("no sitemap.xml");
    else if (existsSync(path.join(distDir, "robots.txt")) && !/sitemap:/i.test(readFileSync(path.join(distDir, "robots.txt"), "utf8"))) missing.push("robots.txt does not point to the sitemap");
  }

  const titles = new Map<string, string[]>();
  for (const file of htmlFiles(distDir)) {
    const rel = path.relative(distDir, file).split(path.sep).join("/");
    const html = readFileSync(file, "utf8");
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    if (title) titles.set(title, [...(titles.get(title) ?? []), rel]);
    if (title.length > 65) missing.push(`${rel}: title longer than 65 characters`);
    if (!/<meta[^>]+property=["']og:title["']/i.test(html)) missing.push(`${rel}: no og:title (link previews)`);
    if (!/<meta[^>]+property=["']og:description["']/i.test(html)) missing.push(`${rel}: no og:description`);
    if (facts.domain && !/<link[^>]+rel=["']canonical["']/i.test(html)) missing.push(`${rel}: no canonical link`);
  }
  for (const [title, files] of titles) if (files.length > 1) missing.push(`same <title> "${title.slice(0, 40)}" on ${files.length} pages`);

  return missing.length
    ? { name, status: "warn", detail: missing.slice(0, 12).join("; ") + (missing.length > 12 ? ` (+${missing.length - 12} more)` : "") }
    : { name, status: "pass", detail: "JSON-LD, sitemap, robots, titles and previews in place." };
}
