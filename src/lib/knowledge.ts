import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Search over the factory's design knowledge (rules/*.md and the design skills' markdown in .claude/skills),
 * so a job can pull the few passages it needs instead of loading whole skills (hundreds of KB) into its context.
 *
 * Plain BM25 over heading-based chunks, built once per process; no network, no embeddings, no new dependency.
 * Vendor skills (UI UX Pro Max) are included when they were copied into .claude/skills by link-skills.sh.
 */
const SOURCES = ["rules", ".claude/skills"];
const MAX_FILE_BYTES = 200_000;
const MAX_CHUNK = 1400;
const K1 = 1.4;
const B = 0.75;

export interface Chunk {
  readonly source: string;
  readonly heading: string;
  readonly text: string;
}

interface Index {
  readonly chunks: Chunk[];
  readonly terms: Array<Map<string, number>>;
  readonly lengths: number[];
  readonly df: Map<string, number>;
  readonly avgLen: number;
}

const cache = new Map<string, Index>();

/** Lowercase words, Turkish letters folded, very short and very common words dropped. */
const STOP = new Set(["the", "and", "for", "with", "that", "this", "are", "you", "your", "not", "but", "use", "from", "into", "when", "what", "ile", "bir", "için", "ve", "bu", "da", "de"]);
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .split(/[^a-z0-9#-]+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => path.join(e.parentPath, e.name))
    .filter((f) => statSync(f).size <= MAX_FILE_BYTES);
}

/** Splits a markdown file at headings, then long sections at paragraph breaks. */
export function chunkMarkdown(source: string, text: string): Chunk[] {
  const out: Chunk[] = [];
  const stack: string[] = [];
  let body: string[] = [];
  const flush = () => {
    const t = body.join("\n").trim();
    body = [];
    if (t.length < 40) return;
    const heading = stack.filter(Boolean).join(" › ");
    // Tables of contents only repeat headings: no knowledge in them.
    if (/(^|› )(table of )?contents$/i.test(heading)) return;
    let rest = t;
    while (rest.length > MAX_CHUNK) {
      const cut = rest.lastIndexOf("\n\n", MAX_CHUNK) > MAX_CHUNK / 3 ? rest.lastIndexOf("\n\n", MAX_CHUNK) : MAX_CHUNK;
      out.push({ source, heading, text: rest.slice(0, cut).trim() });
      rest = rest.slice(cut);
    }
    if (rest.trim().length >= 40) out.push({ source, heading, text: rest.trim() });
  };
  for (const line of text.replace(/^---[\s\S]*?\n---\n/, "").split("\n")) {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const level = m[1]!.length;
      stack.length = level - 1;
      stack[level - 1] = m[2]!.trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return out;
}

function build(root: string): Index {
  const chunks: Chunk[] = [];
  for (const s of SOURCES) {
    for (const f of markdownFiles(path.join(root, s))) chunks.push(...chunkMarkdown(path.relative(root, f).split(path.sep).join("/"), readFileSync(f, "utf8")));
  }
  const terms = chunks.map((c) => {
    const m = new Map<string, number>();
    for (const t of tokenize(`${c.heading} ${c.heading} ${c.text}`)) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  const lengths = terms.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const df = new Map<string, number>();
  for (const m of terms) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  return { chunks, terms, lengths, df, avgLen: lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length) };
}

export function searchKnowledge(root: string, query: string, k = 4): Array<Chunk & { score: number }> {
  let index = cache.get(root);
  if (!index) {
    index = build(root);
    cache.set(root, index);
  }
  const q = [...new Set(tokenize(query))];
  if (q.length === 0) return [];
  const n = index.chunks.length;
  const scored = index.chunks.map((c, i) => {
    let score = 0;
    for (const t of q) {
      const tf = index.terms[i]!.get(t) ?? 0;
      if (!tf) continue;
      const idf = Math.log(1 + (n - (index.df.get(t) ?? 0) + 0.5) / ((index.df.get(t) ?? 0) + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * index.lengths[i]!) / index.avgLen)));
    }
    // Factory rules win over skills when they disagree, so they rank a little higher.
    if (c.source.startsWith("rules/")) score *= 1.15;
    return { ...c, score };
  });
  return scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(8, Math.max(1, k)));
}

export function knowledgeSize(root: string): number {
  if (!cache.has(root)) cache.set(root, build(root));
  return cache.get(root)!.chunks.length;
}
