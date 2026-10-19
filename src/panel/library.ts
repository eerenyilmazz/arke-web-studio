import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import type { ClientPaths } from "../lib/paths.js";
import { findInSite, replaceInSite } from "../lib/site-replace.js";
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
const START_FILE = "start-design.json";

/**
 * Fixed places ("sabit alanlar") of a design: a text in the design that stands for one of the client's facts.
 * When the design is used for a new client, the panel puts the new client's value there itself (no agent);
 * texts whose field is still empty stay and are left to the agent (and the build fails while they remain).
 */
export const SLOT_FIELDS = {
  name: "İşletme adı",
  phone: "Telefon",
  whatsapp: "WhatsApp",
  email: "E-posta",
  address: "Adres",
  hours: "Çalışma saatleri",
  domain: "Alan adı",
  mapsUrl: "Harita bağlantısı",
  instagram: "Instagram",
  facebook: "Facebook",
} as const;
export type SlotField = keyof typeof SLOT_FIELDS;
const SLOT_KEYS = Object.keys(SLOT_FIELDS) as [SlotField, ...SlotField[]];

export const SlotSchema = z.object({ text: z.string().trim().min(2).max(300), field: z.enum(SLOT_KEYS) });
export type Slot = z.infer<typeof SlotSchema>;

export const LibraryMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: z.string().min(2).max(60),
  sector: z.string().max(60).default(""),
  tags: z.array(z.string().min(1).max(30)).max(8).default([]),
  sourceSlug: z.string(),
  createdAt: z.string(),
  forbidden: z.array(z.string()).default([]),
  /** The source client's own facts as saved; fixed-place texts are added to these (removing a place un-forbids only it). */
  baseForbidden: z.array(z.string()).optional(),
  slots: z.array(SlotSchema).max(40).default([]),
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
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "tasarim"
  );
}

/** The client's own facts that must not survive into another client's site. */
function forbiddenStrings(draft: Record<string, unknown>): string[] {
  const d = draft as {
    business?: { name?: string };
    contact?: Record<string, unknown>;
    whatsapp?: { number?: string | null };
    site?: { domain?: string | null };
    social?: Record<string, unknown>;
    integrations?: { bookingUrl?: string | null };
    legal?: { companyName?: string | null; companyNumber?: string | null };
  };
  const values = [
    d.business?.name,
    d.site?.domain,
    d.whatsapp?.number,
    ...Object.values(d.contact ?? {}),
    // Links and company details are that business's too (a booking page, social accounts, its registered name).
    ...Object.values(d.social ?? {}),
    d.integrations?.bookingUrl,
    d.legal?.companyName,
    d.legal?.companyNumber,
  ];
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v !== "string") continue;
    // Links are matched without https:// and www., the way they also appear in a page's text.
    const t = v
      .trim()
      .replace(/^https?:\/\/(www\.)?/i, "")
      .replace(/\/$/, "");
    if (t.length >= MIN_FORBIDDEN && !/^(google\.|maps\.|yandex\.|goo\.gl)/i.test(t)) out.add(t);
    // Phone numbers also appear without the +country prefix or spaces.
    if (/^\+\d{8,15}$/.test(t)) out.add(t.slice(-7));
  }
  return [...out];
}

type Draft = {
  business?: { name?: string };
  contact?: Record<string, unknown>;
  whatsapp?: { number?: string | null };
  site?: { domain?: string | null };
  social?: Record<string, unknown>;
};

/** A client's value for a fixed place, or null when the client does not have it yet. */
export function slotValue(draft: Record<string, unknown>, field: SlotField): string | null {
  const d = draft as Draft;
  const v = {
    name: d.business?.name,
    phone: d.contact?.phone,
    whatsapp: d.whatsapp?.number,
    email: d.contact?.email,
    address: d.contact?.address,
    hours: d.contact?.hours,
    domain: d.site?.domain,
    mapsUrl: d.contact?.mapsUrl,
    instagram: d.social?.instagram,
    facebook: d.social?.facebook,
  }[field];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** The source client's facts as fixed places (Eren can edit them later in the library). */
function autoSlots(draft: Record<string, unknown>): Slot[] {
  const out: Slot[] = [];
  for (const field of SLOT_KEYS) {
    const v = slotValue(draft, field);
    if (v && v.length >= 2 && !out.some((x) => x.text === v)) out.push({ text: v, field });
  }
  return out;
}

/** A library design's folder as ClientPaths (only root is used: site files live in <root>/site). */
const designPaths = (factory: FactoryConfig, id: string) => ({ root: safeJoin(root(factory), id) }) as ClientPaths;

/** How many times each fixed place's text occurs in the design (0 = Eren typed something that is not there). */
export function slotCounts(factory: FactoryConfig, id: string): number[] {
  const entry = listLibrary(factory).find((e) => e.id === id);
  if (!entry) throw new Error("Kütüphanede böyle bir tasarım yok.");
  return entry.slots.map((x) => findInSite(designPaths(factory, entry.id), x.text, { html: true }));
}

/** Name, tags and fixed places of a saved design. Fixed-place texts are also kept as forbidden strings. */
export function updateLibraryEntry(factory: FactoryConfig, id: string, input: { name?: string; tags?: string[]; slots?: unknown }): LibraryEntry {
  const entry = listLibrary(factory).find((e) => e.id === id);
  if (!entry) throw new Error("Kütüphanede böyle bir tasarım yok.");
  const parsedSlots = input.slots === undefined ? entry.slots : z.array(SlotSchema).max(40).safeParse(input.slots);
  if (!Array.isArray(parsedSlots) && !parsedSlots.success)
    throw new Error("Sabit alanlarda hata var: her satırda en az 2 karakterlik bir metin ve bir alan seçilmeli.");
  const slots = Array.isArray(parsedSlots) ? parsedSlots : parsedSlots.data;
  const { palette: _p, fonts: _f, concept: _c, hasPreview: _h, ...meta } = entry;
  const next = LibraryMetaSchema.parse({
    ...meta,
    name: input.name?.trim() || entry.name,
    tags: input.tags ? input.tags.map((t) => t.trim()).filter(Boolean) : entry.tags,
    slots,
    baseForbidden: entry.baseForbidden ?? entry.forbidden,
    forbidden: [...new Set([...(entry.baseForbidden ?? entry.forbidden), ...slots.map((x) => x.text).filter((t) => t.length >= MIN_FORBIDDEN)])],
  });
  writeJson(path.join(safeJoin(root(factory), entry.id), META), next);
  return listLibrary(factory).find((e) => e.id === id)!;
}

// ---------------------------------------------------------------- start design chosen at "Yeni müşteri"

export function setStartDesign(factory: FactoryConfig, slug: string, id: string): void {
  if (!listLibrary(factory).some((e) => e.id === id)) throw new Error("Kütüphanede böyle bir tasarım yok.");
  writeJson(path.join(clientPaths(factory.clientsRoot, slug).factoryDir, START_FILE), { id });
}

export function readStartDesign(factory: FactoryConfig, slug: string): string | null {
  const v = readJsonIfExists(path.join(clientPaths(factory.clientsRoot, slug).factoryDir, START_FILE)) as { id?: unknown } | null;
  return typeof v?.id === "string" && listLibrary(factory).some((e) => e.id === v.id) ? v.id : null;
}

/** Used once: after the design is applied, later runs must not replace the site again. */
export function clearStartDesign(factory: FactoryConfig, slug: string): void {
  rmSync(path.join(clientPaths(factory.clientsRoot, slug).factoryDir, START_FILE), { force: true });
}

export function listLibrary(factory: FactoryConfig): LibraryEntry[] {
  const dir = root(factory);
  if (!existsSync(dir)) return [];
  const out: LibraryEntry[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const parsed = LibraryMetaSchema.safeParse(readJsonIfExists(path.join(dir, e.name, META)));
    if (!parsed.success) continue;
    const brand = (readJsonIfExists(path.join(dir, e.name, "site", BRAND_FILE)) ?? {}) as {
      palette?: Record<string, string>;
      fonts?: { heading?: string; body?: string };
      concept?: string;
    };
    out.push({
      ...parsed.data,
      palette: brand.palette ?? {},
      fonts: brand.fonts ?? null,
      concept: brand.concept ?? "",
      hasPreview: existsSync(path.join(dir, e.name, PREVIEW)),
    });
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
    baseForbidden: forbiddenStrings(draft),
    slots: autoSlots(draft),
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

export interface FilledSlot {
  readonly field: SlotField;
  readonly label: string;
  readonly count: number;
}

export interface ApplyResult {
  readonly entry: LibraryEntry;
  /** Fixed places the panel filled with this client's values. */
  readonly filled: FilledSlot[];
  /** Fixed places left for the agent (the client has no value yet). */
  readonly missing: string[];
}

const jsonEscape = (s: string) => JSON.stringify(s).slice(1, -1);

/**
 * Copies a library design into a client's site/ (the caller snapshots first), fills the fixed places with this
 * client's values, and records the source's forbidden strings in .factory/, where the build reads them.
 */
export function applyLibraryDesign(factory: FactoryConfig, slug: string, id: string): ApplyResult {
  const entry = listLibrary(factory).find((e) => e.id === id);
  if (!entry) throw new Error("Kütüphanede böyle bir tasarım yok.");
  if (entry.sourceSlug === slug) throw new Error("Bu tasarım zaten bu müşteriden kaydedildi.");
  const paths = clientPaths(factory.clientsRoot, slug);
  const dest = siteDir(paths);
  rmSync(dest, { recursive: true, force: true });
  cpSync(path.join(safeJoin(root(factory), entry.id), "site"), dest, { recursive: true });

  const draft = readDraftConfig(paths) as Record<string, unknown>;
  const pairs: Array<{ from: string; to: string; field: SlotField }> = [];
  const missing = new Set<string>();
  for (const x of entry.slots) {
    const to = slotValue(draft, x.field);
    if (!to) {
      missing.add(SLOT_FIELDS[x.field]);
      continue;
    }
    if (to === x.text) continue;
    pairs.push({ from: x.text, to, field: x.field });
    // Phone numbers also appear without "+" in links (wa.me/905…, tel:905…).
    if (/^\+\d{8,15}$/.test(x.text) && /^\+\d{8,15}$/.test(to)) pairs.push({ from: x.text.slice(1), to: to.slice(1), field: x.field });
  }
  // Longest first, so "Mono Erkek Kuaförü" is replaced before "Mono".
  pairs.sort((a, b) => b.from.length - a.from.length);
  const counts = new Map<SlotField, number>();
  const add = (field: SlotField, n: number) => counts.set(field, (counts.get(field) ?? 0) + n);
  const isJson = (rel: string) => rel.endsWith(".json");
  const a = replaceInSite(
    paths,
    pairs.map((p) => [p.from, p.to] as const),
    { html: true, files: (rel) => !isJson(rel) },
  );
  const b = replaceInSite(
    paths,
    pairs.map((p) => [jsonEscape(p.from), jsonEscape(p.to)] as const),
    { files: isJson },
  );
  pairs.forEach((p, i) => add(p.field, (a.counts[i] ?? 0) + (b.counts[i] ?? 0)));
  const filled = [...counts].filter(([, n]) => n > 0).map(([field, count]) => ({ field, label: SLOT_FIELDS[field], count }));

  // A forbidden string that is part of this client's own values (same street, same first word) is not a leftover.
  const own = SLOT_KEYS.map((f) => slotValue(draft, f)).filter((v): v is string => Boolean(v));
  // The source client's facts as they are today (when it still exists), so designs saved before a fact was
  // listed here are covered too.
  const sourceNow = (() => {
    try {
      return forbiddenStrings(readDraftConfig(clientPaths(factory.clientsRoot, entry.sourceSlug)));
    } catch {
      return [];
    }
  })();
  const forbidden = [...new Set([...entry.forbidden, ...sourceNow])].filter((t) => !own.some((v) => v.includes(t)));
  writeJson(path.join(paths.factoryDir, LIBRARY_SOURCE_FILE), {
    id: entry.id,
    name: entry.name,
    sourceSlug: entry.sourceSlug,
    forbidden,
    at: new Date().toISOString(),
  });
  return { entry, filled, missing: [...missing] };
}
