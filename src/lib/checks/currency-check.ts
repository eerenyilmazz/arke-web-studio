import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./quality.js";

/** Money signs that may stand before or after an amount, per currency code. */
const SIGNS: Readonly<Record<string, readonly string[]>> = { TRY: ["₺", "TL"], GBP: ["£"], EUR: ["€"], USD: ["$"] };

/** Visible text of a page: scripts, styles, code samples and tags removed. */
function visibleText(html: string): string {
  return html
    .replace(/<(script|style|code|pre)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
}

/**
 * Prices are shown in the client's currency on every page and in every language (a translation once turned
 * "₺100.000" into "£100,000"). An amount with another currency's sign fails the build.
 */
export function checkCurrency(distDir: string, currency: string): CheckResult {
  const name = "Prices in the client's currency";
  const own = SIGNS[currency];
  if (!own || !existsSync(distDir)) return { name, status: "skip", detail: "Currency not checked." };
  const foreign = Object.entries(SIGNS)
    .filter(([code]) => code !== currency)
    .flatMap(([, signs]) => signs)
    .filter((s) => !own.includes(s));
  const esc = (s: string) => s.replace(/[$]/g, "\\$");
  const pattern = new RegExp(`(?:(${foreign.map(esc).join("|")})\\s?\\d)|(?:\\d[\\d.,]*\\s?(${foreign.map(esc).join("|")})(?![\\p{L}]))`, "u");
  const problems: string[] = [];
  for (const e of readdirSync(distDir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith(".html")) continue;
    const rel = path.relative(distDir, path.join(e.parentPath, e.name)).split(path.sep).join("/");
    const m = pattern.exec(visibleText(readFileSync(path.join(e.parentPath, e.name), "utf8")));
    if (m) problems.push(`${rel}: "${m[0].trim()}"`);
  }
  if (problems.length)
    return {
      name,
      status: "fail",
      detail: `Prices must be in ${currency} (${own.join(" / ")}) on every page and language, as in the content: ${problems.slice(0, 8).join("; ")}`,
    };
  return { name, status: "pass", detail: `All amounts in ${currency}.` };
}
