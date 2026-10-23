import { prepareAppParts } from "../app-parts.js";
import { existsSync, readdirSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { FactoryConfig } from "../../config.js";
import type { ApprovalGate } from "../approval-gate.js";
import { snapshot } from "../../lib/versions.js";
import { monthlyBlock, resolvePolicy } from "../budget.js";
import { type BuildRecord, readDraftConfig } from "../../lib/client.js";
import { readJsonIfExists } from "../../lib/files.js";
import { clientPaths, safeJoin } from "../../lib/paths.js";
import * as tools from "../../tools.js";
import { HttpError } from "../http.js";
import { type JobRunner } from "../jobs.js";
import { TOOLS_NOTE, finalPrompt, translatePrompt } from "../prompts.js";
import { readSettings } from "../settings.js";
import { addonsNote } from "../addons.js";
import { readBusiness } from "../business.js";
import { ensureBaseKit } from "../../lib/custom-site.js";
import { FACTORY_ROOT } from "../../config.js";
import type { PreviewServer } from "../preview.js";

/** Shared pieces of the panel API: dependencies, route type, limits, and how jobs are started. */
export const JSON_LIMIT = 256 * 1024;

export const UPLOAD_LIMIT = 15 * 1024 * 1024;

export const MAX_TEXT = 20_000;

/** Shown when another job is changing the files. */
export const BUSY = "Başka bir işlem sürüyor; tamamlanınca tekrar deneyiniz.";

export interface ApiDeps {
  readonly factory: FactoryConfig;
  readonly jobs: JobRunner;
  readonly preview: PreviewServer;
  readonly gate: ApprovalGate;
  /** Checks a Cloudflare account with Cloudflare (wrangler whoami); tests pass their own. */
  readonly verifyCloudflare?: (account: { token: string; accountId: string }) => Promise<{ ok: boolean; message: string }>;
}

export type Handler = (deps: ApiDeps, req: IncomingMessage, res: ServerResponse, params: string[]) => Promise<void> | void;

export interface Route {
  readonly method: string;
  readonly pattern: RegExp;
  readonly handler: Handler;
}

export const SLUG = "([a-z0-9-]{3,40})";

/** Library and similar helpers throw plain errors with Turkish messages: shown to Eren as a 400. */
export function asHttp<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, (error as Error).message);
  }
}

/**
 * The panel changes site files itself (no agent, no tokens): a version is saved first, so "Önce: …" really is
 * the state before; then `apply` writes, then the site is rebuilt.
 */
export async function rebuildAfterDirectEdit(deps: ApiDeps, slug: string, title: string, summary: string, note: string, apply: () => void) {
  await snapshot(clientPaths(deps.factory.clientsRoot, slug).root, `Önce: ${title}`).catch(() => null);
  try {
    apply();
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  return runOrConflict(() =>
    deps.jobs.startTask(
      slug,
      "build",
      title,
      async (log) => {
        log("Değişiklik doğrudan uygulandı (asistan kullanılmadı); site yeniden oluşturuluyor…");
        const r = await tools.buildSite(deps.factory, { slug });
        if (!r.passed)
          throw new Error(
            `Kontroller geçmedi: ${r.checks
              .filter((c) => c.status === "fail")
              .map((c) => c.name)
              .join(", ")}`,
          );
        return `${note} Kaynak kullanılmadı.`;
      },
      `${title}: ${summary}`,
    ),
  );
}

/** Site files of one page, in every language: home is index.html, others <page>/index.html (and <locale>/…). */
export function pageFiles(page: string): (rel: string) => boolean {
  if (page === "home") return (rel) => /^(?:[a-z]{2}\/)?index\.html$/.test(rel);
  return (rel) => new RegExp(`^(?:[a-z]{2}\\/)?${page}\\/index\\.html$`).test(rel);
}

/**
 * Every agent job starts here: the monthly budget is checked, the client's budget mode decides model, steps,
 * cap, skills and research, and the prompt gets the mode-dependent parts.
 */
/** One line for app sites; the details are in rules/parts.md, read only when the job places a part. */
const PARTS_NOTE =
  "This is an app site with the factory's ready-made parts (catalogue, enquiry inbox, admin screen): before placing a catalogue or a form, read rules/parts.md; never write app/ or js/sf-parts.js.";

export function launchAgent(deps: ApiDeps, slug: string, kind: string, title: string, prompt: string, request: string) {
  const blocked = monthlyBlock(deps.factory);
  if (blocked) throw new HttpError(409, blocked);
  const policy = resolvePolicy(deps.factory, slug, kind);
  // Custom sites get the factory's base stylesheet once, so no job pays for writing resets and layout helpers.
  if ((readDraftConfig(clientPaths(deps.factory.clientsRoot, slug)) as { template?: string }).template === "custom") {
    ensureBaseKit(clientPaths(deps.factory.clientsRoot, slug), path.join(FACTORY_ROOT, "rules", "site-kit", "base.css"));
  }
  // App sites get the factory's ready-made parts (catalogue, admin screen, inbox) before the agent places them.
  const parts = prepareAppParts(clientPaths(deps.factory.clientsRoot, slug), slug);
  const withParts = parts.installed ? `${prompt}\n${PARTS_NOTE}` : prompt;
  const text = finalPrompt(withParts.startsWith(TOOLS_NOTE) ? withParts : `${TOOLS_NOTE}\n${withParts}`, {
    ...policy,
    panelLanguage: readSettings(deps.factory).panelLanguage,
    addons: addonsNote(readBusiness(deps.factory, slug)?.addons),
  });
  return runOrConflict(() => deps.jobs.startAgent(slug, kind, title, text, request, policy));
}

/** The client's last build, or null. Written by build_site in .factory/ (the panel reads it, the agent cannot write it). */
export function lastBuildOf(deps: ApiDeps, slug: string): BuildRecord | null {
  return (readJsonIfExists(clientPaths(deps.factory.clientsRoot, slug).buildRecord) as BuildRecord | undefined) ?? null;
}

/**
 * After a design job: when the site has more than one language, the other languages are added by a separate
 * translation job on the cheaper model, instead of the design job writing every page twice.
 * Only when that design job ended with a passing build (`since` = its start): a job that stopped to ask Eren
 * questions has no finished pages yet, and translating them would spend tokens on text that is about to change.
 */
export function startTranslation(deps: ApiDeps, slug: string, since: string | null = null) {
  const build = lastBuildOf(deps, slug);
  if (!build?.passed || (since !== null && build.at < since)) return null;
  const paths = clientPaths(deps.factory.clientsRoot, slug);
  const draft = readDraftConfig(paths) as { template?: string; i18n?: { defaultLocale?: string; locales?: string[] } };
  const locales = draft.i18n?.locales ?? [];
  const def = draft.i18n?.defaultLocale ?? locales[0] ?? "en";
  if (draft.template !== "custom" || locales.length < 2 || deps.jobs.running()) return null;
  if (!existsSync(path.join(paths.root, "site", "index.html"))) return null;
  return launchAgent(
    deps,
    slug,
    "translate",
    "Diğer diller",
    translatePrompt(slug, def, locales),
    `Siteyi ${locales.filter((l) => l !== def).join(", ")} diline çevir.`,
  );
}

export function runOrConflict<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new HttpError(409, (error as Error).message);
  }
}

export function safeFileName(name: string): string {
  const base = path
    .basename(name)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 80);
  if (!base || base === "." || base === "..") throw new HttpError(400, "Geçersiz dosya adı.");
  return base;
}

export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

export function assetFiles(dir: string): Array<{ name: string; bytes: number }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && IMAGE_TYPES[path.extname(e.name).toLowerCase()])
    .map((e) => ({ name: e.name, bytes: statSync(path.join(dir, e.name)).size }));
}

export function inboxFiles(factory: FactoryConfig, slug: string): Array<{ name: string; bytes: number }> {
  const dir = safeJoin(factory.inboxDir, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => ({ name: e.name, bytes: statSync(path.join(dir, e.name)).size }));
}

export function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(k)) out[k] = v.slice(0, MAX_TEXT);
  }
  return out;
}

export function isQa(x: unknown): x is { question: string; answer: string } {
  return (
    typeof x === "object" && x !== null && typeof (x as { question?: unknown }).question === "string" && typeof (x as { answer?: unknown }).answer === "string"
  );
}
