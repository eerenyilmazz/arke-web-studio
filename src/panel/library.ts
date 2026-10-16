import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { FactoryConfig } from "../config.js";
import { readDraftConfig } from "../lib/client.js";
import { BRAND_FILE, LIBRARY_SOURCE_FILE, OPTIONS_DIR, isCustom, siteDir } from "../lib/custom-site.js";
import { readJsonIfExists, writeJson } from "../lib/files.js";
import { clientPaths, safeJoin } from "../lib/paths.js";

/**
 * Design library: a good custom site saved as a starting point for other clients.
 *
 * What is kept: the site's code (layout, sections, CSS, JS, motion) and its brand.json as a reference.
 * What is not: the logo, proposals and the client's uploads. The client's own facts (name, phone, e-mail,
 * address, domain) are recorded as "forbidden" strings: a site started from this design fails the build while
 * any of them is still on its pages (checked from .factory/, which the agent cannot write).
 *
 * Stored next to the client folders (<clientsRoot>/_library), so factory updates keep it.
 */
const LIBRARY_DIR = "_library";
const META = "meta.json";
const PREVIEW = "preview.png";
const MIN_FORBIDDEN = 4;

export const LibraryMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: z.string().min(2).max(60),
  sector: z.string().max(60).default(""),
  tags: z.array(z.string().min(1).max(30)).max(8).default([]),
  sourceSlug: z.string(),
  createdAt: z.string(),
  forbidden: z.array(z.string()).default([]),
});
export type LibraryMeta = z.infer<typeof LibraryMetaSchema>;

export interface LibraryEntry extends LibraryMeta {
  readonly palette: Record<string, string>;
  readonly fonts: { heading?: string; body?: string } | null;
  readonly concept: string;
  readonly hasPreview: boolean;
}

const root = (factory: FactoryConfig) => path.join(factory.clientsRoot, LIBRARY_DIR);

function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "tasarim";
}

/** The client's own facts that must not survive into another client's site. */
function forbiddenStrings(draft: Record<string, unknown>): string[] {
  const d = draft as { business?: { name?: string }; contact?: Record<string, unknown>; whatsapp?: { number?: string | null }; site?: { domain?: string | null } };
  const values = [d.business?.name, d.site?.domain, d.whatsapp?.number, ...Object.values(d.contact ?? {})];
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t.length >= MIN_FORBIDDEN && !/^https?:\/\/(www\.)?(google|maps|yandex|goo\.gl)/i.test(t)) out.add(t);
    // Phone numbers also appear without the +country prefix or spaces.
    if (/^\+\d{8,15}$/.test(t)) out.add(t.slice(-7));
  }
  return [...out];
}

export function listLibrary(factory: FactoryConfig): LibraryEntry[] {
  const dir = root(factory);
  if (!existsSync(dir)) return [];
  const out: LibraryEntry[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const parsed = LibraryMetaSchema.safeParse(readJsonIfExists(path.join(dir, e.name, META)));
    if (!parsed.success) continue;
    const brand = (readJsonIfExists(path.join(dir, e.name, "site", BRAND_FILE)) ?? {}) as { palette?: Record<string, string>; fonts?: { heading?: string; body?: string }; concept?: string };
    out.push({ ...parsed.data, palette: brand.palette ?? {}, fonts: brand.fonts ?? null, concept: brand.concept ?? "", hasPreview: existsSync(path.join(dir, e.name, PREVIEW)) });
  }
  return out.sort((a, b) => a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name));
}

export function saveToLibrary(factory: FactoryConfig, slug: string, input: { name: string; tags?: string[] }): LibraryMeta {
  const paths = clientPaths(factory.clientsRoot, slug);
  const draft = readDraftConfig(paths) as Record<string, unknown> & { template?: string; business?: { industry?: string } };
  if (!isCustom(String(draft.template ?? ""))) throw new Error("Sadece serbest tasarımlı siteler kütüphaneye kaydedilebilir.");
  const src = siteDir(paths);
  if (!existsSync(path.join(src, "index.html"))) throw new Error("Bu müşterinin henüz yazılmış bir sitesi yok.");
  let id = slugify(input.name);
  for (let i = 2; existsSync(path.join(root(factory), id)); i++) id = `${slugify(input.name)}-${i}`;
  const meta = LibraryMetaSchema.parse({
    id,
    name: input.name.trim(),
    sector: draft.business?.industry ?? "",
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    sourceSlug: slug,
    createdAt: new Date().toISOString(),
    forbidden: forbiddenStrings(draft),
  });
  const dest = safeJoin(root(factory), id);
  mkdirSync(dest, { recursive: true });
  // The logo and the proposals belong to the client; everything else is the design.
  cpSync(src, path.join(dest, "site"), {
    recursive: true,
    filter: (p) => {
      const rel = path.relative(src, p).split(path.sep).join("/");
      return rel !== "brand/logo.svg" && rel !== OPTIONS_DIR && !rel.startsWith(`${OPTIONS_DIR}/`);
    },
  });
  // The latest desktop screenshot of the source site, if the build made one, as the card's preview.
  const shot = path.join(paths.factoryDir, "shots", "masaustu.png");
  if (existsSync(shot)) cpSync(shot, path.join(dest, PREVIEW));
  writeJson(path.join(dest, META), meta);
  return meta;
}

/** The preview image of a design, or null. */
export function libraryPreview(factory: FactoryConfig, id: string): string | null {
  const entry = listLibrary(factory).find((e) => e.id === id);
  if (!entry) return null;
  const f = path.join(safeJoin(root(factory), entry.id), PREVIEW);
  return existsSync(f) ? f : null;
}

export function deleteFromLibrary(factory: FactoryConfig, id: string): void {
  const entry = listLibrary(factory).find((e) => e.id === id);
  if (!entry) throw new Error("Kütüphanede böyle bir tasarım yok.");
  rmSync(safeJoin(root(factory), entry.id), { recursive: true, force: true });
}

/**
 * Copies a library design into a client's site/ (the caller snapshots first) and records the source's
 * forbidden strings in .factory/, where the build reads them.
 */
export function applyLibraryDesign(factory: FactoryConfig, slug: string, id: string): LibraryEntry {
  const entry = listLibrary(factory).find((e) => e.id === id);
  if (!entry) throw new Error("Kütüphanede böyle bir tasarım yok.");
  if (entry.sourceSlug === slug) throw new Error("Bu tasarım zaten bu müşteriden kaydedildi.");
  const paths = clientPaths(factory.clientsRoot, slug);
  const dest = siteDir(paths);
  rmSync(dest, { recursive: true, force: true });
  cpSync(path.join(safeJoin(root(factory), entry.id), "site"), dest, { recursive: true });
  // Keep the client's own logo decision: a library logo is never copied (it was not saved).
  writeJson(path.join(paths.factoryDir, LIBRARY_SOURCE_FILE), { id: entry.id, name: entry.name, sourceSlug: entry.sourceSlug, forbidden: entry.forbidden, at: new Date().toISOString() });
  return entry;
}
