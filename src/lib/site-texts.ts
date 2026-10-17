/**
 * Every visible text of a page, each with a stable id, so Eren can edit texts in the panel without copying them
 * from the site and without an agent job (no tokens).
 *
 * Custom sites: the texts are read from the page's HTML (headings, paragraphs, list items, links, buttons, the
 * <title>, the meta description and image alt texts). An id is the element and its position on the page
 * ("h1-1", "p-3", "title", "meta-description", "alt-2"), which stays the same when a text changes.
 * Template sites: the texts are the string fields of content/<locale>.json, with their JSON path as the id
 * ("hero.title", "services.2.description", "seo.home.description").
 */

export interface TextItem {
  readonly id: string;
  /** What kind of text it is, for the label ("h1", "p", "a", "title", "meta", "alt", "field"). */
  readonly kind: string;
  /** The text as a visitor reads it (entities decoded). */
  readonly text: string;
}

interface Located extends TextItem {
  /** Where the raw text sits in the file, so it can be replaced exactly there. */
  readonly start: number;
  readonly end: number;
  /** Inside an attribute value (quotes must be escaped too). */
  readonly attribute: boolean;
}

const SKIP_PARENTS = new Set(["script", "style", "noscript", "template", "svg", "code", "pre"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const NAMED: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®", trade: "™", middot: "·", euro: "€", pound: "£" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function encodeText(s: string, attribute = false): string {
  const t = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return attribute ? t.replace(/"/g, "&quot;") : t;
}

const TOKEN = /<!--[\s\S]*?-->|<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g;

function locate(html: string): Located[] {
  const out: Located[] = [];
  const counts = new Map<string, number>();
  const next = (kind: string) => {
    const n = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, n);
    return n;
  };
  const stack: string[] = [];
  for (const m of html.matchAll(TOKEN)) {
    const tok = m[0];
    const at = m.index;
    if (tok.startsWith("<!--") || m[1]) continue;
    if (tok.startsWith("</")) {
      const name = tok.slice(2).replace(/[\s>].*$/s, "").toLowerCase();
      const i = stack.lastIndexOf(name);
      if (i >= 0) stack.length = i;
      continue;
    }
    if (tok.startsWith("<") && tok.length > 1) {
      const name = /^<([a-zA-Z][\w-]*)/.exec(tok)?.[1]?.toLowerCase() ?? "";
      if (name === "meta" && /\bname\s*=\s*["']description["']/i.test(tok)) {
        const c = /\bcontent\s*=\s*"([^"]*)"/i.exec(tok);
        if (c) {
          const start = at + c.index + c[0].indexOf('"') + 1;
          out.push({ id: "meta-description", kind: "meta", text: decodeEntities(c[1]!), start, end: start + c[1]!.length, attribute: true });
        }
      }
      if (name === "img") {
        const a = /\balt\s*=\s*"([^"]*)"/i.exec(tok);
        if (a && a[1]!.trim()) {
          const start = at + a.index + a[0].indexOf('"') + 1;
          out.push({ id: `alt-${next("alt")}`, kind: "alt", text: decodeEntities(a[1]!), start, end: start + a[1]!.length, attribute: true });
        }
      }
      if (!VOID.has(name) && !tok.endsWith("/>")) stack.push(name);
      continue;
    }
    // A text node: skip whitespace and texts inside code, svg and similar.
    if (stack.some((t) => SKIP_PARENTS.has(t))) continue;
    const lead = tok.length - tok.trimStart().length;
    const trimmed = tok.trim();
    if (decodeEntities(trimmed).replace(/\s+/g, "").length < 2) continue;
    const parent = stack[stack.length - 1] ?? "text";
    const kind = parent === "title" ? "title" : parent;
    const id = kind === "title" ? "title" : `${kind}-${next(kind)}`;
    out.push({ id, kind, text: decodeEntities(trimmed).replace(/\s+/g, " "), start: at + lead, end: at + lead + trimmed.length, attribute: false });
  }
  return out;
}

/** The texts of one HTML page, in page order (title and description first). */
export function htmlTexts(html: string): TextItem[] {
  const all = locate(html);
  const head = all.filter((t) => t.kind === "title" || t.kind === "meta");
  return [...head, ...all.filter((t) => t.kind !== "title" && t.kind !== "meta")].map(({ id, kind, text }) => ({ id, kind, text }));
}

export interface TextChange {
  readonly id: string;
  /** The text Eren saw; if the page changed meanwhile, nothing is written. */
  readonly oldText: string;
  readonly newText: string;
}

/**
 * Applies changes by id. Returns the new HTML, or throws with the ids that no longer match (the page changed
 * since Eren opened it). Whitespace inside the old text is compared loosely, as it is shown collapsed.
 */
export function applyHtmlChanges(html: string, changes: readonly TextChange[]): string {
  const located = new Map(locate(html).map((t) => [t.id, t]));
  const stale: string[] = [];
  const edits: Array<{ start: number; end: number; value: string }> = [];
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  for (const c of changes) {
    const t = located.get(c.id);
    if (!t || norm(t.text) !== norm(c.oldText)) {
      stale.push(c.id);
      continue;
    }
    edits.push({ start: t.start, end: t.end, value: encodeText(c.newText.trim(), t.attribute) });
  }
  if (stale.length) throw new Error(`Sayfa siz açtıktan sonra değişmiş (${stale.join(", ")}). Sayfayı yenileyip tekrar deneyiniz.`);
  // From the end, so earlier offsets stay valid.
  let out = html;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.value + out.slice(e.end);
  return out;
}

// ---------------------------------------------------------------- template sites: content JSON

/** String fields of a content object, with their JSON path as the id. */
export function contentTexts(content: unknown, prefix = ""): TextItem[] {
  const out: TextItem[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === "string") {
      if (v.trim() && !/^(https?:|mailto:|tel:|#|\/)/.test(v) && !/^[a-z0-9-]+$/.test(v)) out.push({ id: p, kind: "field", text: v });
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, p ? `${p}.${i}` : String(i)));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
  };
  walk(content, prefix);
  return out;
}

/** Sets one string field by its path; refuses paths that do not exist or are not text. */
export function setContentText(content: unknown, id: string, oldText: string, newText: string): unknown {
  const copy = structuredClone(content) as Record<string, unknown>;
  const parts = id.split(".");
  let node: unknown = copy;
  for (const p of parts.slice(0, -1)) {
    if (p === "__proto__" || p === "constructor" || p === "prototype") throw new Error("Geçersiz alan.");
    node = (node as Record<string, unknown> | undefined)?.[p];
    if (!node || typeof node !== "object") throw new Error(`"${id}" alanı bulunamadı.`);
  }
  const last = parts[parts.length - 1]!;
  const holder = node as Record<string, unknown>;
  if (typeof holder[last] !== "string") throw new Error(`"${id}" bir metin alanı değil.`);
  if ((holder[last] as string).trim() !== oldText.trim()) throw new Error(`"${id}" siz açtıktan sonra değişmiş. Sayfayı yenileyiniz.`);
  holder[last] = newText.trim();
  return copy;
}
