import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClientPaths } from "./paths.js";
import { listSiteFiles, siteDir, writeSiteFile } from "./custom-site.js";

/**
 * Exact, mechanical replacements in a custom site's files, done by the panel itself (no agent, no tokens):
 * a colour code, a sentence Eren copied from the site, an e-mail address. When a value is not found, the
 * caller falls back to an agent job, so nothing is changed by guessing.
 */
const TEXT_FILES = /\.(html|css|js|svg|json|txt|xml|webmanifest)$/i;

export interface ReplaceResult {
  /** Occurrences replaced per pair, in the order given. */
  readonly counts: number[];
  readonly files: string[];
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Counts occurrences without changing anything (to decide between doing it here or asking the agent). */
export function findInSite(paths: ClientPaths, needle: string, opts: { html?: boolean; files?: (rel: string) => boolean; caseInsensitive?: boolean } = {}): number {
  return run(paths, [[needle, needle]], { ...opts, dryRun: true }).counts[0] ?? 0;
}

export function replaceInSite(
  paths: ClientPaths,
  pairs: ReadonlyArray<readonly [string, string]>,
  opts: { html?: boolean; files?: (rel: string) => boolean; caseInsensitive?: boolean } = {},
): ReplaceResult {
  return run(paths, pairs, { ...opts, dryRun: false });
}

function run(
  paths: ClientPaths,
  pairs: ReadonlyArray<readonly [string, string]>,
  opts: { html?: boolean; files?: (rel: string) => boolean; caseInsensitive?: boolean; dryRun: boolean },
): ReplaceResult {
  const counts = pairs.map(() => 0);
  const changed: string[] = [];
  const root = siteDir(paths);
  for (const f of listSiteFiles(paths).files) {
    if (!TEXT_FILES.test(f.path) || (opts.files && !opts.files(f.path))) continue;
    // brand/options are proposals, not the site.
    if (f.path.startsWith("brand/options/")) continue;
    const isHtml = /\.(html|svg|xml)$/i.test(f.path);
    let text = readFileSync(path.join(root, f.path), "utf8");
    let touched = false;
    pairs.forEach(([from, to], i) => {
      // In markup the text may be stored escapes (&amp;); look for both forms, write the escaped one.
      const variants = opts.html && isHtml ? [...new Set([from, escapeHtml(from)])] : [from];
      for (const v of variants) {
        const re = new RegExp(escapeRe(v), opts.caseInsensitive ? "gi" : "g");
        const n = (text.match(re) ?? []).length;
        if (!n) continue;
        counts[i]! += n;
        if (!opts.dryRun) {
          const replacement = opts.html && isHtml && v !== from ? escapeHtml(to) : opts.html && isHtml ? escapeHtml(to) : to;
          text = text.replace(re, () => replacement);
          touched = true;
        }
      }
    });
    if (touched) {
      writeSiteFile(paths, f.path, text);
      changed.push(f.path);
    }
  }
  return { counts, files: changed };
}
