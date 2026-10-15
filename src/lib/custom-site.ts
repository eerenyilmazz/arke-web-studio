import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FactoryError } from "./errors.js";
import type { ClientPaths } from "./paths.js";
import { safeJoin } from "./paths.js";
import type { CheckResult } from "./quality.js";

/**
 * "custom" sites: the agent designs and writes the whole site (HTML, CSS, JS) for one client into <client>/site/.
 * The factory only lets it write there, through these functions, and checks the result on every build.
 * Images still come in through save_asset (type and SVG checks) and are served from /assets/.
 */
export const CUSTOM_TEMPLATE = "custom";
const SITE_DIR = "site";
const ASSETS_URL_DIR = "assets";

const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([".html", ".css", ".js", ".svg", ".json", ".txt", ".xml", ".webmanifest"]);
const SITE_PATH = /^(?!\/)(?!.*\.\.)[a-z0-9][a-z0-9._/-]{0,120}$/;
const MAX_FILE_BYTES = 400_000;
const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 4_000_000;

export function isCustom(template: string): boolean {
  return template === CUSTOM_TEMPLATE;
}

export function siteDir(paths: ClientPaths): string {
  return path.join(paths.root, SITE_DIR);
}

function sitePath(paths: ClientPaths, rel: string): string {
  if (!SITE_PATH.test(rel)) {
    throw new FactoryError(`File path "${rel.slice(0, 80)}" is not allowed.`, "Use lowercase letters, digits, - _ . and / only, e.g. index.html, css/site.css, tr/index.html.");
  }
  if (rel === ASSETS_URL_DIR || rel.startsWith(`${ASSETS_URL_DIR}/`)) {
    throw new FactoryError("site/assets/ is reserved.", "Images go in with save_asset and are served from /assets/<name>; reference them from your HTML and CSS.");
  }
  const ext = path.extname(rel).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new FactoryError(`File type "${ext || "(none)"}" is not allowed.`, `Allowed: ${[...ALLOWED_EXTENSIONS].join(" ")}. Images go in with save_asset.`);
  }
  return safeJoin(siteDir(paths), rel);
}

export function listSiteFiles(paths: ClientPaths): { files: { path: string; bytes: number }[]; totalBytes: number } {
  const dir = siteDir(paths);
  if (!existsSync(dir)) return { files: [], totalBytes: 0 };
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const abs = path.join(e.parentPath, e.name);
      return { path: path.relative(dir, abs).replaceAll("\\", "/"), bytes: statSync(abs).size };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  return { files, totalBytes: files.reduce((n, f) => n + f.bytes, 0) };
}

export function readSiteFile(paths: ClientPaths, rel: string): { path: string; content: string } {
  const abs = sitePath(paths, rel);
  if (!existsSync(abs)) throw new FactoryError(`site/${rel} does not exist.`, "Call list_site_files to see what is there.");
  return { path: rel, content: readFileSync(abs, "utf8") };
}

export function writeSiteFile(paths: ClientPaths, rel: string, content: string): { path: string; bytes: number; totalFiles: number } {
  const abs = sitePath(paths, rel);
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_FILE_BYTES) throw new FactoryError(`site/${rel} is too large (${bytes} bytes).`, `Keep each file under ${MAX_FILE_BYTES} bytes; split CSS or JS into several files.`);
  const { files, totalBytes } = listSiteFiles(paths);
  const existing = files.find((f) => f.path === rel);
  if (!existing && files.length >= MAX_FILES) throw new FactoryError(`The site already has ${MAX_FILES} files.`, "Delete unused files first.");
  if (totalBytes - (existing?.bytes ?? 0) + bytes > MAX_TOTAL_BYTES) throw new FactoryError("The site is too large.", `Keep the whole site under ${MAX_TOTAL_BYTES} bytes (images excluded).`);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return { path: rel, bytes, totalFiles: files.length + (existing ? 0 : 1) };
}

export function deleteSiteFile(paths: ClientPaths, rel: string): { deleted: string } {
  const abs = sitePath(paths, rel);
  if (!existsSync(abs)) throw new FactoryError(`site/${rel} does not exist.`);
  unlinkSync(abs);
  return { deleted: rel };
}

/** Copies site/ and the client's assets/ into a fresh dist/. */
export function buildCustomSite(paths: ClientPaths): CheckResult {
  const src = siteDir(paths);
  if (!existsSync(path.join(src, "index.html"))) {
    return { name: "Custom site build", status: "fail", detail: "site/index.html does not exist yet. Write the site with write_site_file first (rules/custom-site.md)." };
  }
  rmSync(paths.distDir, { recursive: true, force: true });
  mkdirSync(paths.distDir, { recursive: true });
  cpSync(src, paths.distDir, { recursive: true, dereference: false });
  if (existsSync(paths.assetsDir)) cpSync(paths.assetsDir, path.join(paths.distDir, ASSETS_URL_DIR), { recursive: true });
  return { name: "Custom site build", status: "pass", detail: `${listSiteFiles(paths).files.length} file(s) from site/ plus assets/` };
}

// ---------------------------------------------------------------- checks on the written code

/** Hosts a custom site may load from: Google Fonts stylesheets and font files only. */
const ALLOWED_STYLE_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

interface Rule {
  readonly pattern: RegExp;
  readonly label: string;
}

const HTML_RULES: readonly Rule[] = [
  { pattern: /<script\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i, label: "external <script src> (write the script into the site instead)" },
  { pattern: /<iframe\b/i, label: "<iframe> (embeds set cookies; link to the map or video instead)" },
  { pattern: /<base\b/i, label: "<base> tag" },
  { pattern: /<meta[^>]+http-equiv\s*=\s*["']?refresh/i, label: "meta refresh redirect" },
  { pattern: /<(?:object|embed)\b/i, label: "<object>/<embed>" },
];

const SCRIPT_RULES: readonly Rule[] = [
  { pattern: /\beval\s*\(|\bnew\s+Function\s*\(/, label: "eval / new Function" },
  { pattern: /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|EventSource/, label: "network request from JavaScript (the site is static; it must not call other servers)" },
  { pattern: /document\.cookie/, label: "document.cookie (the site promises no cookies)" },
  { pattern: /(?:window\.|document\.|\b)location(?:\.href)?\s*=(?!=)|location\.(?:assign|replace)\s*\(/, label: "JavaScript redirect" },
  { pattern: /\bimport\s*\(\s*["'`]https?:|from\s+["']https?:/, label: "script imported from another site" },
];

function externalStyleProblems(text: string): string[] {
  const out: string[] = [];
  const urls = [
    ...text.matchAll(/<link\b[^>]*\bhref\s*=\s*["']((?:https?:)?\/\/[^"']+)["'][^>]*>/gi),
    ...text.matchAll(/@import\s+(?:url\()?\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi),
    ...text.matchAll(/url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi),
  ].map((m) => m[1]!);
  for (const url of urls) {
    let host = "";
    try {
      host = new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
    } catch {
      host = url;
    }
    if (!ALLOWED_STYLE_HOSTS.includes(host)) out.push(`loads ${host} (only Google Fonts may be loaded from outside; put images in with save_asset)`);
  }
  return out;
}

function stripScripts(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

function inlineScripts(html: string): string {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? "").join("\n");
}

/** Internal links (href/src starting with "/") must point at a file that exists in dist/. */
function brokenLinks(distDir: string, rel: string, html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["'](\/[^"'#?]*)["']/gi)) {
    const target = decodeURIComponent(m[1]!);
    const candidates = target.endsWith("/") ? [path.join(target, "index.html")] : [target, `${target}.html`, path.join(target, "index.html")];
    if (!candidates.some((c) => existsSync(path.join(distDir, c)))) out.push(`${rel}: broken link ${target}`);
  }
  return out;
}

/** Form posts may only go to the factory's form service (SF_FORM_ACTION). */
function formProblems(rel: string, html: string, formAction: string | null): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) {
    const action = /\baction\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? "";
    if (!formAction || action !== formAction) out.push(`${rel}: <form action="${action.slice(0, 60)}"> (forms may only post to the configured form service; without one, show phone/email/WhatsApp buttons)`);
  }
  return out;
}

export function checkCustomCode(distDir: string, formAction: string | null): CheckResult[] {
  const problems: string[] = [];
  const files = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));
  for (const abs of files) {
    const rel = path.relative(distDir, abs).replaceAll("\\", "/");
    if (rel.startsWith(`${ASSETS_URL_DIR}/`)) continue;
    const ext = path.extname(rel).toLowerCase();
    const text = readFileSync(abs, "utf8");
    if (ext === ".html") {
      const markup = stripScripts(text);
      for (const r of HTML_RULES) if (r.pattern.test(text)) problems.push(`${rel}: ${r.label}`);
      for (const r of SCRIPT_RULES) if (r.pattern.test(inlineScripts(text))) problems.push(`${rel}: ${r.label}`);
      if (/\son[a-z]+\s*=\s*["'][^"']*(?:fetch|location|cookie|eval)/i.test(markup)) problems.push(`${rel}: unsafe inline event handler`);
      problems.push(...externalStyleProblems(markup).map((p) => `${rel}: ${p}`));
      problems.push(...brokenLinks(distDir, rel, markup));
      problems.push(...formProblems(rel, markup, formAction));
      if (!/<meta[^>]+name=["']viewport["']/i.test(text)) problems.push(`${rel}: missing viewport meta (needed for phones)`);
    } else if (ext === ".js") {
      for (const r of SCRIPT_RULES) if (r.pattern.test(text)) problems.push(`${rel}: ${r.label}`);
    } else if (ext === ".css") {
      problems.push(...externalStyleProblems(text).map((p) => `${rel}: ${p}`));
    } else if (ext === ".svg") {
      if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(text)) problems.push(`${rel}: script inside SVG`);
    }
  }
  if (!existsSync(path.join(distDir, "404.html"))) problems.push("404.html is missing");
  return [
    {
      name: "Custom code safety (no external scripts, redirects, trackers, embeds; links work)",
      status: problems.length === 0 ? "pass" : "fail",
      detail: problems.length === 0 ? `${files.length} file(s) checked` : problems.slice(0, 25).join("; "),
    },
  ];
}

// ---------------------------------------------------------------- brand identity (required for custom sites)

/**
 * Every custom site starts from a brand identity the agent designs first: site/brand/brand.json and
 * site/brand/logo.svg. The build checks that it exists, is complete, and that the site really uses it
 * (logo shown, brand colours in the CSS, each signature animation present in the code).
 */
export const BRAND_FILE = "brand/brand.json";
export const LOGO_FILE = "brand/logo.svg";
const MIN_ANIMATIONS = 2;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ANIMATION_ID = /^[a-z][a-z0-9-]{2,40}$/;

interface BrandAnimation {
  readonly id: string;
  readonly idea: string;
  readonly trigger: string;
}

interface Brand {
  readonly concept: string;
  readonly personality: readonly string[];
  readonly palette: Readonly<Record<string, string>>;
  readonly fonts: { readonly heading: string; readonly body: string };
  readonly visualLanguage: string;
  readonly animations: readonly BrandAnimation[];
  readonly voice: string;
}

function brandProblems(raw: unknown): string[] {
  const out: string[] = [];
  const b = raw as Partial<Brand> | null;
  if (!b || typeof b !== "object") return ["brand.json is not a JSON object"];
  const text = (v: unknown, min: number) => typeof v === "string" && v.trim().length >= min;
  if (!text(b.concept, 20)) out.push("concept: one or two sentences on the brand idea, rooted in what the business makes or does");
  if (!Array.isArray(b.personality) || b.personality.length < 2) out.push("personality: 2–4 words");
  const colours = b.palette && typeof b.palette === "object" ? Object.values(b.palette) : [];
  if (colours.length < 3 || !colours.every((c) => typeof c === "string" && HEX.test(c))) out.push("palette: at least 3 named #RRGGBB colours");
  if (!b.fonts || !text(b.fonts.heading, 2) || !text(b.fonts.body, 2)) out.push("fonts: heading and body");
  if (!text(b.visualLanguage, 20)) out.push("visualLanguage: shapes, textures and illustration style taken from the sector");
  if (!text(b.voice, 10)) out.push("voice: how the copy sounds");
  const anims = Array.isArray(b.animations) ? b.animations : [];
  if (anims.length < MIN_ANIMATIONS) out.push(`animations: at least ${MIN_ANIMATIONS} signature animations tied to the business (id, idea, trigger)`);
  for (const a of anims) {
    if (!a || !ANIMATION_ID.test(a.id ?? "") || !text(a.idea, 15) || !text(a.trigger, 3)) out.push(`animations: "${String(a?.id ?? "?").slice(0, 30)}" needs id (kebab-case), idea and trigger`);
  }
  return out;
}

/** Brand identity present, complete, and used by the site. */
export function checkBrand(distDir: string): CheckResult[] {
  const brandPath = path.join(distDir, BRAND_FILE);
  if (!existsSync(brandPath) || !existsSync(path.join(distDir, LOGO_FILE))) {
    return [{ name: "Brand identity", status: "fail", detail: `Design the brand first: write site/${BRAND_FILE} and site/${LOGO_FILE} (rules/custom-site.md, step 1).` }];
  }
  let brand: Brand;
  try {
    brand = JSON.parse(readFileSync(brandPath, "utf8")) as Brand;
  } catch {
    return [{ name: "Brand identity", status: "fail", detail: `site/${BRAND_FILE} is not valid JSON.` }];
  }
  const problems = brandProblems(brand);
  if (problems.length > 0) return [{ name: "Brand identity", status: "fail", detail: `site/${BRAND_FILE} incomplete: ${problems.join("; ")}` }];

  const code = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(html|css|js)$/.test(e.name) && !path.relative(distDir, path.join(e.parentPath, e.name)).startsWith(`${ASSETS_URL_DIR}`))
    .map((e) => readFileSync(path.join(e.parentPath, e.name), "utf8"))
    .join("\n");
  const lower = code.toLowerCase();
  const usage: string[] = [];
  if (!/brand\/logo\.svg/.test(code) && !/<svg[^>]*class=["'][^"']*logo/i.test(code)) usage.push("the logo (brand/logo.svg) is not used on the pages");
  const missingColours = Object.entries(brand.palette).filter(([, hex]) => !lower.includes(hex.toLowerCase()));
  if (missingColours.length > 0) usage.push(`brand colours not used in the code: ${missingColours.map(([n]) => n).join(", ")}`);
  const missingAnims = brand.animations.filter((a) => !code.includes(a.id));
  if (missingAnims.length > 0) usage.push(`signature animations not found in the code (use the id as class, keyframes or data attribute): ${missingAnims.map((a) => a.id).join(", ")}`);
  if (!/prefers-reduced-motion/.test(code)) usage.push("no prefers-reduced-motion handling (animations must calm down for visitors who ask)");
  return [
    {
      name: "Brand identity (designed first, used everywhere)",
      status: usage.length === 0 ? "pass" : "fail",
      detail: usage.length === 0 ? `${brand.animations.length} signature animations: ${brand.animations.map((a) => a.id).join(", ")}` : usage.join("; "),
    },
  ];
}
