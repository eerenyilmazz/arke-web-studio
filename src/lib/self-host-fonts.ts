import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./quality.js";

/**
 * Google Fonts served from the site itself. A visitor's browser then never contacts Google, so the site sets no
 * third-party request a privacy notice would have to name (UK GDPR, GDPR and KVKK alike). The agent keeps writing
 * the usual Google Fonts <link>; the build downloads the stylesheet and its font files once (kept in a cache, so
 * rebuilds work offline) and points the pages at the copies. If the download fails the link stays as written and
 * the check warns, so a build never fails because Google was unreachable.
 */

const CSS_HOST = "fonts.googleapis.com";
const FILE_HOST = "fonts.gstatic.com";
/** Where the copies live in the published site. */
export const FONTS_URL_DIR = "fonts/google";
const CACHE_DIR = "font-cache";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FONT_BYTES = 2_000_000;
/** Google answers with woff2 only to a browser it recognises. */
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const NAME = "Fonts served from the site (no request to Google)";

export type Fetcher = (url: string, binary: boolean) => Promise<string | Buffer>;

const STYLESHEET_URL = /https?:\/\/fonts\.googleapis\.com\/css2?\?[^"')\s]+/g;
const FONT_FILE_URL = /https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g;
const PRECONNECT = /<link\b[^>]*\bhref\s*=\s*["']https?:\/\/fonts\.(?:googleapis|gstatic)\.com\/?["'][^>]*>\s*/gi;

export const defaultFetcher: Fetcher = async (url, binary) => {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  if (!binary) return res.text();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FONT_BYTES) throw new Error("font file too large");
  return buf;
};

const short = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const decode = (url: string) => url.replaceAll("&amp;", "&");

function textFiles(distDir: string): string[] {
  return readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(html|css)$/i.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));
}

async function cached(cacheDir: string, url: string, binary: boolean, fetcher: Fetcher): Promise<Buffer> {
  const file = path.join(cacheDir, short(url));
  if (existsSync(file)) return readFileSync(file);
  const body = await fetcher(url, binary);
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, buf);
  return buf;
}

/** Downloads one Google Fonts stylesheet and its files into dist; returns the stylesheet's local URL. */
async function localCopy(distDir: string, cacheDir: string, url: string, fetcher: Fetcher): Promise<string> {
  const outDir = path.join(distDir, FONTS_URL_DIR);
  mkdirSync(outDir, { recursive: true });
  let css = (await cached(cacheDir, url, false, fetcher)).toString("utf8");
  if (!/@font-face/.test(css)) throw new Error("the stylesheet holds no fonts");
  for (const fileUrl of new Set(css.match(FONT_FILE_URL) ?? [])) {
    const ext = path.extname(new URL(fileUrl).pathname) || ".woff2";
    const name = `${short(fileUrl)}${ext}`;
    writeFileSync(path.join(outDir, name), await cached(cacheDir, fileUrl, true, fetcher));
    css = css.replaceAll(fileUrl, `/${FONTS_URL_DIR}/${name}`);
  }
  const cssName = `${short(url)}.css`;
  writeFileSync(path.join(outDir, cssName), css);
  return `/${FONTS_URL_DIR}/${cssName}`;
}

/** ARKE_SELF_HOST_FONTS=off keeps the Google links as written (the old behaviour; tests use it to stay offline). */
export async function selfHostFonts(distDir: string, factoryDir: string, fetcher?: Fetcher): Promise<CheckResult | null> {
  if (!fetcher && process.env.ARKE_SELF_HOST_FONTS === "off") return null;
  const get = fetcher ?? defaultFetcher;
  const files = textFiles(distDir);
  const found = new Map<string, string>(); // as written in the file -> URL to fetch
  for (const file of files) for (const raw of readFileSync(file, "utf8").match(STYLESHEET_URL) ?? []) found.set(raw, decode(raw));
  if (found.size === 0) return null;
  const cacheDir = path.join(factoryDir, CACHE_DIR);
  const local = new Map<string, string>();
  const failed: string[] = [];
  for (const [raw, url] of found) {
    try {
      local.set(raw, await localCopy(distDir, cacheDir, url, get));
    } catch (error) {
      failed.push(`${new URL(url).searchParams.getAll("family").join(", ") || url}: ${(error as Error).message}`);
    }
  }
  for (const file of files) {
    let text = readFileSync(file, "utf8");
    const before = text;
    for (const [raw, to] of local) text = text.replaceAll(raw, to);
    // Preconnect hints only help when the browser still talks to Google.
    if (failed.length === 0) text = text.replace(PRECONNECT, "");
    if (text !== before) writeFileSync(file, text);
  }
  if (failed.length > 0)
    return {
      name: NAME,
      status: "warn",
      detail: `Could not download (the site still loads these from ${CSS_HOST}/${FILE_HOST}; build again when online): ${failed.join("; ")}`,
    };
  return { name: NAME, status: "pass", detail: `${local.size} Google Fonts stylesheet(s) copied into /${FONTS_URL_DIR}/.` };
}
