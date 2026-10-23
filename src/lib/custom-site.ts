import { isFactorySiteScript } from "../parts/install.js";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FACTORY_ROOT } from "../config.js";
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
    throw new FactoryError(
      `File path "${rel.slice(0, 80)}" is not allowed.`,
      "Use lowercase letters, digits, - _ . and / only, e.g. index.html, css/site.css, tr/index.html.",
    );
  }
  if (rel === ASSETS_URL_DIR || rel.startsWith(`${ASSETS_URL_DIR}/`)) {
    throw new FactoryError(
      "site/assets/ is reserved.",
      "Images go in with save_asset and are served from /assets/<name>; reference them from your HTML and CSS.",
    );
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
  if (bytes > MAX_FILE_BYTES)
    throw new FactoryError(`site/${rel} is too large (${bytes} bytes).`, `Keep each file under ${MAX_FILE_BYTES} bytes; split CSS or JS into several files.`);
  const { files, totalBytes } = listSiteFiles(paths);
  const existing = files.find((f) => f.path === rel);
  if (!existing && files.length >= MAX_FILES) throw new FactoryError(`The site already has ${MAX_FILES} files.`, "Delete unused files first.");
  if (totalBytes - (existing?.bytes ?? 0) + bytes > MAX_TOTAL_BYTES)
    throw new FactoryError("The site is too large.", `Keep the whole site under ${MAX_TOTAL_BYTES} bytes (images excluded).`);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return { path: rel, bytes, totalFiles: files.length + (existing ? 0 : 1) };
}

/** A part of a file around the first match of `around` (the line numbers say where it is). Saves reading whole files. */
export function readSiteFileAround(
  paths: ClientPaths,
  rel: string,
  around: string,
  lines = 30,
): { path: string; from: number; to: number; totalLines: number; content: string } {
  const all = readSiteFile(paths, rel).content.split("\n");
  const hit = all.findIndex((l) => l.includes(around));
  if (hit < 0) throw new FactoryError(`"${around.slice(0, 60)}" is not in site/${rel}.`, "Use site_map to find which file has it, or read the whole file.");
  const from = Math.max(0, hit - Math.floor(lines / 2));
  const to = Math.min(all.length, from + lines);
  return { path: rel, from: from + 1, to, totalLines: all.length, content: all.slice(from, to).join("\n") };
}

/**
 * Replaces exact text in one site file: the cheap way to change a few lines without rewriting the file.
 * `oldText` must occur exactly once (or pass all=true to replace every occurrence).
 */
export function editSiteFile(
  paths: ClientPaths,
  rel: string,
  oldText: string,
  newText: string,
  all = false,
): { path: string; replaced: number; bytes: number } {
  if (!oldText) throw new FactoryError("oldText is empty.");
  const content = readSiteFile(paths, rel).content;
  const count = content.split(oldText).length - 1;
  if (count === 0)
    throw new FactoryError(
      `The text to replace is not in site/${rel}.`,
      "Copy it exactly (spaces and line breaks included) from read_site_file, or use site_map to find the right file.",
    );
  if (count > 1 && !all)
    throw new FactoryError(
      `The text occurs ${count} times in site/${rel}.`,
      "Add surrounding text so it is unique, or pass all: true to replace every occurrence.",
    );
  const next = all ? content.split(oldText).join(newText) : content.replace(oldText, () => newText);
  const r = writeSiteFile(paths, rel, next);
  return { path: rel, replaced: all ? count : 1, bytes: r.bytes };
}

/**
 * A compact map of the site so the agent knows where things are without reading every file: per page its
 * title, h1 and sections (id/class and first heading), per stylesheet its colour and size variables and
 * keyframes, and for every file its size.
 */
export function siteMap(paths: ClientPaths): string {
  const root = siteDir(paths);
  const { files, totalBytes } = listSiteFiles(paths);
  const out: string[] = [`site/ — ${files.length} files, ${Math.round(totalBytes / 1024)} KB`];
  const clean = (s: string) =>
    s
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70);
  for (const f of files) {
    const abs = path.join(root, f.path);
    const kb = `${Math.max(1, Math.round(f.bytes / 1024))} KB`;
    if (f.path.endsWith(".html")) {
      const html = readFileSync(abs, "utf8");
      const title = clean(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
      const h1 = clean(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "");
      out.push(`\n${f.path} (${kb}) title: "${title}" h1: "${h1}"`);
      for (const m of html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)) {
        const attrs = m[1] ?? "";
        const id = /\bid=["']([^"']+)/.exec(attrs)?.[1];
        const cls = /\bclass=["']([^"']+)/.exec(attrs)?.[1];
        const heading = clean(/<h[2-3]\b[^>]*>([\s\S]*?)<\/h[2-3]>/i.exec(m[2] ?? "")?.[1] ?? "");
        const anims = [...new Set([...(m[2] ?? "").matchAll(/data-anim=["']([^"']+)/g)].map((a) => a[1]))];
        out.push(
          `  section${id ? ` #${id}` : ""}${cls ? ` .${cls.split(/\s+/).join(".")}` : ""}${heading ? ` "${heading}"` : ""}${anims.length ? ` anim: ${anims.join(", ")}` : ""}`,
        );
      }
    } else if (f.path.endsWith(".css")) {
      const css = readFileSync(abs, "utf8");
      const vars = [...new Set([...css.matchAll(/(--[\w-]+)\s*:\s*([^;}]{1,40})/g)].map((m) => `${m[1]}: ${m[2]!.trim()}`))].slice(0, 40);
      const frames = [...new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]))];
      out.push(`\n${f.path} (${kb})${frames.length ? ` keyframes: ${frames.join(", ")}` : ""}`);
      if (vars.length) out.push(`  vars: ${vars.join("; ")}`);
    } else {
      out.push(`${f.path} (${kb})`);
    }
  }
  return out.join("\n");
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
    return {
      name: "Custom site build",
      status: "fail",
      detail: "site/index.html does not exist yet. Write the site with write_site_file first (rules/custom/build.md).",
    };
  }
  rmSync(paths.distDir, { recursive: true, force: true });
  mkdirSync(paths.distDir, { recursive: true });
  // Design proposals (brand/options/) are for choosing, not for the published site.
  cpSync(src, paths.distDir, {
    recursive: true,
    dereference: false,
    filter: (from) => !path.relative(src, from).replaceAll("\\", "/").startsWith(OPTIONS_DIR),
  });
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
  {
    pattern: /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|EventSource/,
    label: "network request from JavaScript (the site is static; it must not call other servers)",
  },
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

/** Form posts may only go to the factory's form service (ARKE_FORM_ACTION). */
/** App sites' own inbox endpoint (parts/app/inbox.js), used by <form data-arke-inquiry> through js/arke-parts.js. */
export const APP_INBOX_ACTION = "/api/inbox";

function formProblems(rel: string, html: string, formAction: string | null, appSite: boolean): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) {
    const action = /\baction\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? "";
    if (appSite && /\bdata-arke-inquiry\b/i.test(m[0]) && (action === "" || action === APP_INBOX_ACTION)) continue;
    if (!formAction || action !== formAction)
      out.push(
        `${rel}: <form action="${action.slice(0, 60)}"> (forms may only post to the configured form service; without one, show phone/email/WhatsApp buttons)`,
      );
  }
  return out;
}

/**
 * Safety problems of one file on its own (everything except links between files and the 404 page). Used by the
 * build and right when a file is written, so the agent fixes a problem at once instead of after a full build.
 */
export function fileProblems(rel: string, text: string, formAction: string | null, appSite = false): string[] {
  const problems: string[] = [];
  const ext = path.extname(rel).toLowerCase();
  // The factory's own site script talks to the site's own API; only an exact copy is exempt.
  if (appSite && isFactorySiteScript(rel, text)) return problems;
  if (ext === ".html") {
    const markup = stripScripts(text);
    for (const r of HTML_RULES) if (r.pattern.test(text)) problems.push(`${rel}: ${r.label}`);
    for (const r of SCRIPT_RULES) if (r.pattern.test(inlineScripts(text))) problems.push(`${rel}: ${r.label}`);
    if (/\son[a-z]+\s*=\s*["'][^"']*(?:fetch|location|cookie|eval)/i.test(markup)) problems.push(`${rel}: unsafe inline event handler`);
    problems.push(...externalStyleProblems(markup).map((p) => `${rel}: ${p}`));
    problems.push(...formProblems(rel, markup, formAction, appSite));
    if (!/<meta[^>]+name=["']viewport["']/i.test(text)) problems.push(`${rel}: missing viewport meta (needed for phones)`);
  } else if (ext === ".js") {
    for (const r of SCRIPT_RULES) if (r.pattern.test(text)) problems.push(`${rel}: ${r.label}`);
  } else if (ext === ".css") {
    problems.push(...externalStyleProblems(text).map((p) => `${rel}: ${p}`));
  } else if (ext === ".svg") {
    if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(text)) problems.push(`${rel}: script inside SVG`);
  }
  return problems;
}

export function checkCustomCode(distDir: string, formAction: string | null, appSite = false): CheckResult[] {
  const problems: string[] = [];
  const files = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));
  for (const abs of files) {
    const rel = path.relative(distDir, abs).replaceAll("\\", "/");
    if (rel.startsWith(`${ASSETS_URL_DIR}/`)) continue;
    const text = readFileSync(abs, "utf8");
    problems.push(...fileProblems(rel, text, formAction, appSite));
    if (rel.endsWith(".html")) problems.push(...brokenLinks(distDir, rel, stripScripts(text)));
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
/** Three brand proposals the operator chooses from: brand/options/{a,b,c}.json and {a,b,c}-logo.svg. */
export const OPTIONS_DIR = "brand/options";
export const OPTION_IDS = ["a", "b", "c"] as const;

export interface BrandOption {
  readonly id: string;
  readonly brand: unknown;
  readonly problems: string[];
  readonly logoSvg: string | null;
}

/** The proposals written so far, each checked like a real brand.json. */
export function readBrandOptions(paths: ClientPaths): BrandOption[] {
  const out: BrandOption[] = [];
  for (const id of OPTION_IDS) {
    const file = path.join(siteDir(paths), OPTIONS_DIR, `${id}.json`);
    if (!existsSync(file)) continue;
    let brand: unknown = null;
    try {
      brand = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      out.push({ id, brand: null, problems: ["not valid JSON"], logoSvg: null });
      continue;
    }
    const logo = path.join(siteDir(paths), OPTIONS_DIR, `${id}-logo.svg`);
    out.push({ id, brand, problems: brandProblems(brand), logoSvg: existsSync(logo) ? readFileSync(logo, "utf8").slice(0, 60_000) : null });
  }
  return out;
}
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
  /** Brand board (Marka Atölyesi) fields: slogan, signature motion with its own demo, type specimen. */
  readonly tagline?: string;
  readonly signature?: { readonly id?: string; readonly name?: string; readonly idea?: string; readonly file?: string };
  readonly typeSample?: string;
  readonly monoFont?: string;
}

export const SIGNATURE_FILE = "brand/signature.html";

/**
 * The signature demo may load the motion kit (<script src="/js/motion.js">). Where it is shown on its own (the
 * panel's sandboxed frame allows no script files), the kit is put inline in its place.
 */
export function inlineMotionKit(html: string): string {
  const kit = path.join(FACTORY_ROOT, "rules", "site-kit", "motion.js");
  if (!existsSync(kit)) return html;
  const code = readFileSync(kit, "utf8").replace(/<\/script/gi, "<\\/script");
  return html.replace(/<script\b[^>]*\bsrc=["'](?:\.\.\/|\/)?js\/motion\.js["'][^>]*>\s*<\/script>/gi, () => `<script>${code}</script>`);
}
/** The factory's brand-neutral base stylesheet, copied into every custom site so the agent does not write it. */
export const BASE_CSS = "css/base.css";

/** The factory's small script for the theme toggle and the phone menu (rules/site-kit/kit.js). */
export const KIT_JS = "js/kit.js";
/** The first line of the factory's base stylesheet: a file starting with it is the factory's to update. */
const KIT_MARKER = "Arke Web Studio base layer";

/**
 * Copies the factory's parts into a custom site: css/base.css and js/kit.js. Both are factory-owned (the agent must
 * not rewrite them), so a newer factory version replaces them; a base.css without the factory's header (written by
 * hand) is left alone. Returns whether anything was written.
 */
/** The factory's motion kit (rules/site-kit/motion.js), copied like kit.js. */
export const MOTION_JS = "js/motion.js";

export function ensureBaseKit(paths: ClientPaths, kitFile: string): boolean {
  let wrote = false;
  const parts: Array<[string, string]> = [
    [BASE_CSS, kitFile],
    [KIT_JS, path.join(path.dirname(kitFile), "kit.js")],
    [MOTION_JS, path.join(path.dirname(kitFile), "motion.js")],
  ];
  for (const [rel, src] of parts) {
    if (!existsSync(src)) continue;
    const dest = path.join(siteDir(paths), rel);
    const next = readFileSync(src, "utf8");
    if (existsSync(dest)) {
      const now = readFileSync(dest, "utf8");
      if (now === next || (rel === BASE_CSS && !now.includes(KIT_MARKER))) continue;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, next);
    wrote = true;
  }
  return wrote;
}
/** Written by the panel when a site starts from a library design: the source client's facts (see panel/library.ts). */
export const LIBRARY_SOURCE_FILE = "library-source.json";

/** A site started from a library design must not keep the source client's name, phone, e-mail or address. */
export function checkLibraryLeftovers(distDir: string, factoryDir: string): CheckResult[] {
  const f = path.join(factoryDir, LIBRARY_SOURCE_FILE);
  if (!existsSync(f)) return [];
  let source: { name?: string; forbidden?: unknown };
  try {
    source = JSON.parse(readFileSync(f, "utf8")) as typeof source;
  } catch {
    return [];
  }
  const forbidden = Array.isArray(source.forbidden) ? source.forbidden.filter((s): s is string => typeof s === "string" && s.length >= 4) : [];
  const text = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(html|css|js|json|svg|txt|xml)$/.test(e.name))
    .map((e) => readFileSync(path.join(e.parentPath, e.name), "utf8"))
    .join("\n")
    .toLowerCase();
  const left = forbidden.filter((s) => text.includes(s.toLowerCase()));
  return [
    {
      name: "Library design adapted (no facts of the source client)",
      status: left.length === 0 ? "pass" : "fail",
      detail:
        left.length === 0
          ? `started from "${source.name ?? "library"}"; nothing of the source client left`
          : `still on the site from the design's source client: ${left.join(", ")}. Replace them with this client's facts or remove them.`,
    },
  ];
}

/** Brand board completeness. Warnings only, so sites made before the board existed keep building. */
export function brandBoardProblems(raw: unknown, siteRoot: string): string[] {
  const b = (raw ?? {}) as Brand;
  const text = (v: unknown, min: number) => typeof v === "string" && v.trim().length >= min;
  const out: string[] = [];
  if (!text(b.tagline, 3)) out.push("tagline: the brand's short line (a few words)");
  const s = b.signature;
  if (!s || !ANIMATION_ID.test(s.id ?? "") || !text(s.name, 3) || !text(s.idea, 15)) out.push("signature: { id, name, idea } of the one signature motion");
  if (!existsSync(path.join(siteRoot, SIGNATURE_FILE))) out.push(`${SIGNATURE_FILE}: a small self-contained page that plays the signature motion on its own`);
  if (!text(b.typeSample, 6)) out.push("typeSample: one line set in the heading font (a line in the brand's voice)");
  return out;
}

const MAX_BOARD_FILE = 120_000;

export interface BrandBoard {
  /** "custom": the brand the agent designed (brand.json). "template": palette and fonts from the config only. */
  readonly source: "custom" | "template";
  readonly brand: Brand | null;
  readonly logoSvg: string | null;
  readonly signatureHtml: string | null;
  /** The client's own logo (uploaded file), when there is one. */
  readonly clientLogo?: string | null;
  /** What is missing for a complete board (custom sites only). */
  readonly missing: string[];
}

/** Everything the panel's brand board (Marka Atölyesi) shows. Read-only. */
const LOGO_MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** The client's own logo file as a data URI for the panel (shown as an image, never run). */
function clientLogoDataUri(paths: ClientPaths, clientLogo: string | null): string | null {
  if (!clientLogo) return null;
  const file = safeJoin(paths.root, clientLogo);
  const mime = LOGO_MIME[path.extname(file).toLowerCase()];
  if (!mime || !existsSync(file) || statSync(file).size > MAX_BOARD_FILE * 4) return null;
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

export function readBrandBoard(paths: ClientPaths, template: string, clientLogo: string | null = null): BrandBoard {
  const root = siteDir(paths);
  const read = (rel: string) => {
    const f = path.join(root, rel);
    return existsSync(f) && statSync(f).size <= MAX_BOARD_FILE ? readFileSync(f, "utf8") : null;
  };
  const own = clientLogoDataUri(paths, clientLogo);
  if (!isCustom(template)) return { source: "template", brand: null, logoSvg: null, signatureHtml: null, clientLogo: own, missing: [] };
  const raw = read(BRAND_FILE);
  let brand: Brand | null = null;
  try {
    brand = raw ? (JSON.parse(raw) as Brand) : null;
  } catch {
    brand = null;
  }
  const missing = brand ? [...brandProblems(brand), ...brandBoardProblems(brand, root)] : [`${BRAND_FILE}: the brand identity`];
  const sig = read(SIGNATURE_FILE);
  return { source: "custom", brand, logoSvg: read(LOGO_FILE), signatureHtml: sig === null ? null : inlineMotionKit(sig), clientLogo: own, missing };
}

/** Drawn graphics on the home page besides the logo: one with a purpose is enough (no filler decoration). */
const MIN_HOME_SVGS = 1;
const MIN_LAYOUT_WIDTH_PX = 1100;
const REM_PX = 16;

/**
 * "Signature design" (rules/custom/brand.md): the brand must be visible on the pages, not only in brand.json.
 * Cheap, structural signals only; a warning, so existing sites keep building.
 */
export function designDepth(distDir: string, code: string, brand: Brand): CheckResult {
  const homeFile = path.join(distDir, "index.html");
  const home = existsSync(homeFile) ? readFileSync(homeFile, "utf8") : "";
  const main = home.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? home;
  const firstBlock = main.match(/<(section|header|div)\b[\s\S]*?<\/\1>/i)?.[0] ?? "";
  const out: string[] = [];
  const sig = brand.signature?.id;
  if (sig && !firstBlock.includes(sig)) out.push(`the signature motion "${sig}" is not in the home page's first section (the hero)`);
  // No minimum number of sections: a count only produced filler. Each section must earn its place (rules).
  const sections = (main.match(/<section\b/gi) ?? []).length;
  const svgs = (home.match(/<svg\b/gi) ?? []).length + (home.match(/<img[^>]+\.svg/gi) ?? []).length;
  if (svgs < MIN_HOME_SVGS + 1)
    out.push("home page has no drawn graphic besides the logo: draw the product, the craft or the place in the brand's visual language");
  // Container widths: max-width declarations (not media queries) and width-like custom properties (--wrap: 76rem).
  const css = code.replace(/@media[^{]*/gi, "");
  const px = (m: RegExpMatchArray) => Number(m[1]) * (m[2]!.toLowerCase() === "rem" ? REM_PX : 1);
  const widths = [
    ...[...css.matchAll(/max-width\s*:\s*(?:min\()?\s*(\d+(?:\.\d+)?)(px|rem)/gi)].map(px),
    ...[...css.matchAll(/--[\w-]*(?:wrap|container|max|width|page)[\w-]*\s*:\s*(?:min\()?\s*(\d+(?:\.\d+)?)(px|rem)/gi)].map(px),
  ];
  const widest = widths.length ? Math.max(...widths) : 0;
  if (widest > 0 && widest < MIN_LAYOUT_WIDTH_PX)
    out.push(`the layout is at most ${Math.round(widest)}px wide; use the screen (around 1200-1360px containers, full-bleed bands)`);
  return {
    name: "Design depth (the brand on every page)",
    status: out.length === 0 ? "pass" : "warn",
    detail: out.length === 0 ? `${sections} home sections, signature in the hero` : out.join("; "),
  };
}

export function brandProblems(raw: unknown): string[] {
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
    if (!a || !ANIMATION_ID.test(a.id ?? "") || !text(a.idea, 15) || !text(a.trigger, 3))
      out.push(`animations: "${String(a?.id ?? "?").slice(0, 30)}" needs id (kebab-case), idea and trigger`);
  }
  return out;
}

/** Brand identity present, complete, and used by the site. */
export function checkBrand(distDir: string, clientLogo: string | null = null): CheckResult[] {
  const brandPath = path.join(distDir, BRAND_FILE);
  // The client's own logo (config brand.logo, e.g. "assets/logo.png") is used as it is; then no drawn logo is needed.
  const ownLogo = clientLogo && existsSync(path.join(distDir, clientLogo)) ? clientLogo : null;
  if (!existsSync(brandPath) || (!ownLogo && !existsSync(path.join(distDir, LOGO_FILE)))) {
    return [
      {
        name: "Brand identity",
        status: "fail",
        detail: `Design the brand first: write site/${BRAND_FILE} and site/${LOGO_FILE} (rules/custom/brand.md, step 1).`,
      },
    ];
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
    // The site's own pages and code only: assets/ and brand/ (board files, signature demo) do not count as usage.
    .filter((e) => e.isFile() && /\.(html|css|js)$/.test(e.name) && !/^(assets|brand)[\\/]/.test(path.relative(distDir, path.join(e.parentPath, e.name))))
    .map((e) => readFileSync(path.join(e.parentPath, e.name), "utf8"))
    .join("\n");
  const lower = code.toLowerCase();
  const usage: string[] = [];
  // With a client logo, only that file counts: a drawn logo (brand/logo.svg or an inline "logo" SVG) must not replace it.
  const logoUsed = ownLogo !== null ? code.includes(`/${ownLogo}`) : /brand\/logo\.svg/.test(code) || /<svg[^>]*class=["'][^"']*logo/i.test(code);
  if (!logoUsed)
    usage.push(
      ownLogo
        ? `the client's own logo (/${ownLogo}) is not used on the pages: use that file in the header and as the favicon, never a drawn replacement`
        : "the logo (brand/logo.svg) is not used on the pages",
    );
  if (ownLogo !== null && (/brand\/logo\.svg/.test(code) || existsSync(path.join(distDir, LOGO_FILE))))
    usage.push(`the client has a logo (/${ownLogo}): delete site/${LOGO_FILE} and do not use a drawn logo`);
  const missingColours = Object.entries(brand.palette).filter(([, hex]) => !lower.includes(hex.toLowerCase()));
  if (missingColours.length > 0) usage.push(`brand colours not used in the code: ${missingColours.map(([n]) => n).join(", ")}`);
  const missingAnims = brand.animations.filter((a) => !code.includes(a.id));
  if (missingAnims.length > 0)
    usage.push(`signature animations not found in the code (use the id as class, keyframes or data attribute): ${missingAnims.map((a) => a.id).join(", ")}`);
  if (!/prefers-reduced-motion/.test(code)) usage.push("no prefers-reduced-motion handling (animations must calm down for visitors who ask)");
  const board = brandBoardProblems(brand, distDir);
  if (board.length === 0 && brand.signature?.id && !code.includes(brand.signature.id))
    board.push(`the signature motion "${brand.signature.id}" is not used on the site's pages`);
  return [
    {
      name: "Brand identity (designed first, used everywhere)",
      status: usage.length === 0 ? "pass" : "fail",
      detail: usage.length === 0 ? `${brand.animations.length} signature animations: ${brand.animations.map((a) => a.id).join(", ")}` : usage.join("; "),
    },
    designDepth(distDir, code, brand),
    {
      name: "Brand board (tagline, signature motion, type specimen)",
      status: board.length === 0 ? "pass" : "warn",
      detail: board.length === 0 ? `signature motion: ${brand.signature?.name}` : `site/${BRAND_FILE}: ${board.join("; ")}`,
    },
  ];
}
