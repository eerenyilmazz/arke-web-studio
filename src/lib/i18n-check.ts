import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./quality.js";

/**
 * Languages on a custom site, checked on the built pages: every page of the default language has its translation,
 * the language link on a page leads to the same page in the other language, and the links inside a translation stay
 * in that language. A translation that has not been written at all yet is a warning (the translation job runs after
 * the design job); a half-written one is an error.
 */

/** Pages that are not translated: the error page and the standalone motion demo. */
const SKIP = /^(404\.html$|brand\/)/;

const toPosix = (p: string) => p.split(path.sep).join("/");

/** "about/index.html" → "/about/", "index.html" → "/", "menu.html" → "/menu.html" (with an optional locale prefix). */
export function pageUrl(rel: string, locale = ""): string {
  const prefix = locale ? `/${locale}` : "";
  if (rel === "index.html") return `${prefix}/`;
  if (rel.endsWith("/index.html")) return `${prefix}/${rel.slice(0, -"index.html".length)}`;
  return `${prefix}/${rel}`;
}

/** The page a site-internal href points to, as a path under dist ("about/index.html"), or null for files/outside. */
function targetPage(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const clean = href.split(/[?#]/)[0]!;
  if (clean.endsWith("/")) return `${clean.slice(1)}index.html`;
  if (clean.endsWith(".html")) return clean.slice(1);
  return path.extname(clean) ? null : `${clean.slice(1)}/index.html`;
}

function htmlPages(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => toPosix(path.relative(dir, path.join(e.parentPath, e.name))));
}

const anchors = (html: string) => [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => m[0]);
const attr = (tag: string, name: string) => new RegExp(`\\s${name}=["']([^"']*)["']`, "i").exec(tag)?.[1] ?? null;

export function checkLanguages(distDir: string, defaultLocale: string, locales: readonly string[]): CheckResult | null {
  const others = locales.filter((l) => l !== defaultLocale);
  if (others.length === 0 || !existsSync(distDir)) return null;
  const all = htmlPages(distDir);
  const isLocalePage = (rel: string) => others.some((l) => rel.startsWith(`${l}/`));
  const basePages = all.filter((rel) => !isLocalePage(rel) && !SKIP.test(rel));
  const exists = new Set(all);
  const problems: string[] = [];
  const pending: string[] = [];

  for (const l of others) {
    const missing = basePages.filter((rel) => !exists.has(`${l}/${rel}`));
    if (missing.length === basePages.length) pending.push(l);
    else if (missing.length)
      problems.push(`${l}: ${missing.length} of ${basePages.length} pages not translated (${missing.map((m) => pageUrl(m, l)).join(", ")})`);
  }

  // The language link: from a page to the same page in the other language (only where that page exists).
  const counterpart = (rel: string, from: string, to: string): string => {
    const bare = from === defaultLocale ? rel : rel.slice(from.length + 1);
    return to === defaultLocale ? bare : `${to}/${bare}`;
  };
  for (const rel of all) {
    if (SKIP.test(rel)) continue;
    const from = others.find((l) => rel.startsWith(`${l}/`)) ?? defaultLocale;
    if (from !== defaultLocale && SKIP.test(rel.slice(from.length + 1))) continue;
    const html = readFileSync(path.join(distDir, rel), "utf8");
    for (const a of anchors(html)) {
      const href = attr(a, "href");
      if (!href) continue;
      const lang = attr(a, "hreflang");
      if (lang && lang !== from && locales.includes(lang)) {
        const want = counterpart(rel, from, lang);
        if (exists.has(want) && targetPage(href) !== want)
          problems.push(`${pageUrl(rel)}: the ${lang.toUpperCase()} link goes to ${href}, not ${pageUrl(want)}`);
        continue;
      }
      // Inside a translation, menu and text links stay in that language when the translated page exists.
      if (from !== defaultLocale) {
        const target = targetPage(href);
        if (target && !target.startsWith(`${from}/`) && !SKIP.test(target) && exists.has(`${from}/${target}`))
          problems.push(`${pageUrl(rel)}: links to ${href} (default language) instead of ${pageUrl(target, from)}`);
      }
    }
  }

  const name = "Languages (every page translated, language links to the same page)";
  if (problems.length)
    return {
      name,
      status: "fail",
      detail: `${[...new Set(problems)].slice(0, 12).join("; ")}. Design jobs write the default language only; the translation job ("Diğer dilleri güncelle") writes every <locale>/ page.`,
    };
  if (pending.length)
    return { name, status: "warn", detail: `${pending.join(", ")} not written yet: the translation job adds ${pending.length > 1 ? "them" : "it"}.` };
  return { name, status: "pass", detail: `${others.join(", ")}: ${basePages.length} page(s) each, links in place` };
}
