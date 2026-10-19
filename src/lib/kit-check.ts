import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./quality.js";

/** How many menu links fit on a phone in one row; more need the folding menu (data-nav-toggle). */
const MAX_PHONE_LINKS = 4;

/**
 * The factory's parts (rules/site-kit/kit.js) are used instead of hand-written ones: a page with a theme toggle or
 * a menu button loads /js/kit.js, and a menu with more links than fit on a phone has the folding menu.
 */
export function checkKitParts(distDir: string): CheckResult {
  const name = "Theme toggle and phone menu (factory parts)";
  const pages = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html") && !e.parentPath.includes(`${path.sep}brand`))
    .map((e) => path.join(e.parentPath, e.name));
  const fails: string[] = [];
  const warns: string[] = [];
  for (const file of pages) {
    const rel = path.relative(distDir, file).split(path.sep).join("/");
    if (rel === "404.html") continue;
    const html = readFileSync(file, "utf8");
    const usesKit = /<script\b[^>]*\ssrc=["']\/js\/kit\.js["']/i.test(html);
    if (/data-(theme|nav)-toggle/.test(html) && !usesKit)
      fails.push(`${rel}: has a theme toggle or menu button but does not load /js/kit.js (use the factory parts: rules/custom-site.md, "Factory parts")`);
    const nav = /<header\b[\s\S]*?<\/header>/i.exec(html)?.[0] ?? "";
    const links = (nav.match(/<a\b/gi) ?? []).length - 1; // minus the logo link
    if (links > MAX_PHONE_LINKS && !/data-nav-toggle/.test(nav)) warns.push(rel);
  }
  if (fails.length) return { name, status: "fail", detail: fails.slice(0, 8).join("; ") };
  if (warns.length)
    return {
      name,
      status: "warn",
      detail: `More than ${MAX_PHONE_LINKS} header links without the phone menu (data-nav-toggle): ${warns.slice(0, 6).join(", ")}`,
    };
  return { name, status: "pass", detail: "ok" };
}
