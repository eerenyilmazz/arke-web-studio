import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/*
 * Google Fonts, self-hosted: downloaded at build time into dist/fonts so visitors' browsers never
 * contact Google (no third-party requests, faster first paint). If the download fails the site
 * still builds and falls back to system fonts; the build log says so.
 */

const CSS_API = "https://fonts.googleapis.com/css2";
const FONT_HOST = /^https:\/\/fonts\.gstatic\.com\//;
/** A modern browser user agent makes the API return woff2. */
const WOFF2_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 10_000;
const WEIGHT_SETS = ["400;600;700", "400;700", ""] as const;
/** Font family names are restricted so they are safe inside CSS and URLs. */
export const SAFE_FONT_NAME = /^[A-Za-z0-9 ]{2,60}$/;

export function fontStack(name: string): string {
  const family = SAFE_FONT_NAME.test(name) ? `"${name}", ` : "";
  return `${family}ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": WOFF2_USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return res.ok ? res.text() : null;
}

/** Keeps only the @font-face blocks for the scripts the site's languages need. */
function filterSubsets(css: string, subsets: ReadonlySet<string>): string {
  return css
    .split(/(?=\/\* [a-z-]+ \*\/)/)
    .filter((block) => {
      const m = block.match(/^\/\* ([a-z-]+) \*\//);
      return !m || subsets.has(m[1] ?? "");
    })
    .join("");
}

async function familyCss(name: string, subsets: ReadonlySet<string>): Promise<string | null> {
  const family = encodeURIComponent(name).replace(/%20/g, "+");
  for (const weights of WEIGHT_SETS) {
    const css = await fetchText(`${CSS_API}?family=${family}${weights ? `:wght@${weights}` : ""}&display=swap`);
    if (css) return filterSubsets(css, subsets);
  }
  return null;
}

/** Writes dist/fonts/fonts.css (+ woff2 files). Returns warnings for the build log. */
export async function selfHostFonts(outDir: string, families: readonly string[], subsets: ReadonlySet<string>): Promise<string[]> {
  const fontsDir = path.join(outDir, "fonts");
  mkdirSync(fontsDir, { recursive: true });
  const warnings: string[] = [];
  const parts: string[] = [];
  let fileIndex = 0;

  for (const name of new Set(families)) {
    if (!SAFE_FONT_NAME.test(name)) {
      warnings.push(`Font "${name}" skipped: unsupported characters in the name.`);
      continue;
    }
    try {
      let css = await familyCss(name, subsets);
      if (!css) {
        warnings.push(`Font "${name}" not found on Google Fonts; using system fonts.`);
        continue;
      }
      for (const url of new Set(css.match(/https:\/\/[^)\s]+/g) ?? [])) {
        if (!FONT_HOST.test(url)) continue;
        const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status} for a font file`);
        const file = `f${fileIndex++}.woff2`;
        writeFileSync(path.join(fontsDir, file), Buffer.from(await res.arrayBuffer()));
        css = css.split(url).join(`/fonts/${file}`);
      }
      parts.push(css);
    } catch (error) {
      warnings.push(`Font "${name}" could not be downloaded (${(error as Error).message}); using system fonts.`);
    }
  }
  writeFileSync(path.join(fontsDir, "fonts.css"), parts.join("\n"));
  return warnings;
}
