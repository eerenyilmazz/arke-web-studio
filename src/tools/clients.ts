import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { type FactoryConfig } from "../config.js";
import { ContentSchema } from "../schema/content.js";
import { SCHEMA_VERSION, SiteConfigSchema, type Locale } from "../schema/site-config.js";
import { saveAsset, type AssetKind } from "../lib/assets.js";
import { clientStatus, openClient, readDraftConfig } from "../lib/client.js";
import { FactoryError } from "../lib/errors.js";
import { run } from "../lib/exec.js";
import { readJsonIfExists, writeJson, writeText } from "../lib/files.js";
import { deepMerge } from "../lib/merge.js";
import { assertSlug, clientPaths, safeJoin } from "../lib/paths.js";
import { isCustom } from "../lib/custom-site.js";
import { buildQuestionnaire } from "../lib/questionnaire.js";
import { findUnknownKeys } from "../lib/unknown-keys.js";
import { validateDraft } from "../lib/validation.js";
import { CLIENT_GITIGNORE, LOCKED_CONFIG_KEYS, assertNoUnknownKeys, formatIssues } from "./shared.js";

/** Tools for clients: create, status, questionnaire, config, content, assets and the design system. */

// ---------------------------------------------------------------- clients

export function listClients(factory: FactoryConfig) {
  if (!existsSync(factory.clientsRoot)) return { clients: [] };
  const clients = readdirSync(factory.clientsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(factory.clientsRoot, e.name, "site.config.json")))
    .map((e) => {
      try {
        const s = clientStatus(factory, e.name);
        // Name and sector for the panel's list (additive fields; agents ignore them).
        const draft = readDraftConfig(clientPaths(factory.clientsRoot, e.name)) as { business?: { name?: string; industry?: string } };
        return { slug: e.name, stage: s.stage, name: draft.business?.name ?? e.name, industry: draft.business?.industry ?? "" };
      } catch (error) {
        return { slug: e.name, stage: "unreadable", error: (error as Error).message };
      }
    });
  return { clients };
}

/** Where the client is: decides the site's main language, currency and time zone. */
/**
 * Markets a client can be in. The site's main language is English everywhere except Turkey (English is the shared
 * language; other languages are added as extra locales). Rules per market: rules/markets.md.
 */
export const COUNTRIES = ["GB", "TR", "IE", "US", "DE", "NL"] as const;
export type Country = (typeof COUNTRIES)[number];
export const MARKETS: Readonly<Record<Country, { locale: Locale; timezone: string; currency: string; callingCode: string }>> = {
  GB: { locale: "en", timezone: "Europe/London", currency: "GBP", callingCode: "+44" },
  TR: { locale: "tr", timezone: "Europe/Istanbul", currency: "TRY", callingCode: "+90" },
  IE: { locale: "en", timezone: "Europe/Dublin", currency: "EUR", callingCode: "+353" },
  US: { locale: "en", timezone: "America/New_York", currency: "USD", callingCode: "+1" },
  DE: { locale: "en", timezone: "Europe/Berlin", currency: "EUR", callingCode: "+49" },
  NL: { locale: "en", timezone: "Europe/Amsterdam", currency: "EUR", callingCode: "+31" },
};

export async function createClient(
  factory: FactoryConfig,
  args: {
    slug: string;
    businessName: string;
    industry: string;
    hostingModel: "managed" | "client";
    extraLocale?: Locale;
    template?: string;
    country?: Country;
  },
) {
  const slug = assertSlug(args.slug);
  const template = assertSlug(args.template ?? factory.defaultTemplate);
  const paths = clientPaths(factory.clientsRoot, slug);
  if (existsSync(paths.root)) throw new FactoryError(`Client folder "${slug}" already exists.`, "Pick another slug or continue with get_client_status.");

  const market = MARKETS[args.country ?? "GB"];
  const locales: Locale[] = args.extraLocale && args.extraLocale !== market.locale ? [market.locale, args.extraLocale] : [market.locale];
  const draft = {
    schemaVersion: SCHEMA_VERSION,
    slug,
    template,
    i18n: { defaultLocale: market.locale, locales },
    business: { name: args.businessName, industry: args.industry, country: args.country ?? "GB", timezone: market.timezone, currency: market.currency },
    hosting: { model: args.hostingModel, workerName: null },
    meta: { unmapped: [], laterInterests: [] },
  };
  const check = validateDraft(SiteConfigSchema, draft);
  if (check.invalid.length > 0) throw new FactoryError(`Invalid starting values: ${formatIssues(check.invalid)}`);

  for (const dir of [paths.root, paths.contentDir, paths.assetsDir, paths.factoryDir, paths.questionnaireDir]) mkdirSync(dir, { recursive: true });
  writeJson(paths.config, draft);
  writeText(path.join(paths.root, ".gitignore"), CLIENT_GITIGNORE);

  // Each client is its own repository (decision 14 Oct 2026). Git missing is not fatal.
  const git = await run("git", ["init", "--quiet"], { cwd: paths.root, timeoutMs: 15_000 }).catch(() => null);

  return {
    slug,
    folder: paths.root,
    gitInitialised: git?.code === 0,
    templateFound: isCustom(template) || existsSync(path.join(factory.templatesDir, template, "package.json")),
    next: "Call generate_questionnaire with round 1 and give the text to Eren to send to the client.",
  };
}

export function getClientStatus(factory: FactoryConfig, args: { slug: string }) {
  return clientStatus(factory, assertSlug(args.slug));
}

// ---------------------------------------------------------------- questionnaire

/** Builds the questionnaire for a round without writing it (the panel uses this to show the answer form). */
export function questionnaireFor(factory: FactoryConfig, args: { slug: string; round: 1 | 2; replyBy?: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const draft = readDraftConfig(paths);
  const business = (draft.business ?? {}) as { name?: string; industry?: string };

  let openIds: Set<string> | undefined;
  if (args.round === 2) {
    const status = clientStatus(factory, args.slug);
    openIds = new Set(status.openQuestions.filter((q) => q.round === 2 || q.round === 1).map((q) => q.id));
    // Always re-ask required record-only questions in round 2 (rights, approver).
    openIds.add("rights");
    openIds.add("approver");
    // Round-2 content questions are only useful while content is incomplete.
    if (status.stage === "collecting-answers" || status.stage === "design" || status.stage === "content") {
      for (const id of ["about", "photos", "testimonials-faq", "style-references"]) openIds.add(id);
    }
  }

  return {
    paths,
    industry: business.industry ?? "",
    questionnaire: buildQuestionnaire({
      businessName: business.name ?? args.slug,
      industry: business.industry ?? "",
      round: args.round,
      openIds,
      replyBy: args.replyBy,
      lang: (draft as { i18n?: { defaultLocale?: string } }).i18n?.defaultLocale ?? "en",
    }),
  };
}

export function generateQuestionnaire(factory: FactoryConfig, args: { slug: string; round: 1 | 2; replyBy?: string }) {
  const { paths, questionnaire: q } = questionnaireFor(factory, args);
  const base = path.join(paths.questionnaireDir, `round-${args.round}`);
  writeText(`${base}.md`, q.markdown);
  writeText(`${base}.txt`, q.plainText);
  return {
    files: [`questionnaires/round-${args.round}.md`, `questionnaires/round-${args.round}.txt`],
    questionIds: q.questionIds,
    plainText: q.plainText,
    note: "Give the plain text to Eren to send. Do not contact the client directly.",
  };
}

// ---------------------------------------------------------------- config & content

/**
 * Removing a page also removes its section settings (otherwise the config is invalid and nothing saves), and
 * `sections.<page>: null` means "remove these settings". Other null values keep their normal meaning.
 */
function dropOrphanSections(merged: Record<string, unknown>, patch: Record<string, unknown>): void {
  const sections = merged.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return;
  const record = sections as Record<string, unknown>;
  const patchSections = patch.sections as Record<string, unknown> | undefined;
  for (const [page, value] of Object.entries(patchSections ?? {})) if (value === null) delete record[page];
  if (Array.isArray(patch.pages) && Array.isArray(merged.pages)) {
    const pages = new Set(merged.pages as string[]);
    for (const page of Object.keys(record)) if (!pages.has(page)) delete record[page];
  }
}

export function updateClientConfig(
  factory: FactoryConfig,
  args: {
    slug: string;
    patch: Record<string, unknown>;
    unmapped?: Array<{ question: string; answer: string; note?: string }>;
    laterInterests?: string[];
  },
) {
  const paths = openClient(factory, assertSlug(args.slug));
  const before = readDraftConfig(paths);
  // Agents sometimes resend the whole config: an unchanged slug or schemaVersion is dropped, not an error.
  const patch: Record<string, unknown> = { ...args.patch };
  for (const key of Object.keys(patch)) {
    if (!LOCKED_CONFIG_KEYS.has(key)) continue;
    if (key !== "meta" && JSON.stringify(patch[key]) === JSON.stringify(before[key])) {
      delete patch[key];
      continue;
    }
    throw new FactoryError(`"${key}" cannot be changed.`, key === "meta" ? "Use the `unmapped` and `laterInterests` arguments instead." : undefined);
  }
  assertNoUnknownKeys(findUnknownKeys(SiteConfigSchema, patch));
  const merged = deepMerge(before, patch) as Record<string, unknown>;
  dropOrphanSections(merged, patch);

  const meta = (merged.meta ?? { unmapped: [], laterInterests: [] }) as { unmapped: unknown[]; laterInterests: string[] };
  if (args.unmapped?.length) meta.unmapped = [...(meta.unmapped ?? []), ...args.unmapped];
  if (args.laterInterests?.length) meta.laterInterests = [...new Set([...(meta.laterInterests ?? []), ...args.laterInterests])];
  merged.meta = meta;

  const result = validateDraft(SiteConfigSchema, merged);
  if (result.invalid.length > 0) {
    throw new FactoryError(`Nothing saved. Invalid values: ${formatIssues(result.invalid)}`, "Fix these values (or ask the client) and send the patch again.");
  }
  writeJson(paths.config, merged);
  return {
    saved: true,
    complete: result.data !== null,
    stillMissing: result.missing.map((m) => m.path),
    unmappedCount: meta.unmapped.length,
  };
}

export function saveContent(factory: FactoryConfig, args: { slug: string; locale: Locale; content: Record<string, unknown>; replace?: boolean }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const draft = readDraftConfig(paths);
  const locales = ((draft.i18n as { locales?: string[] } | undefined)?.locales ?? ["en"]) as string[];
  if (!locales.includes(args.locale)) {
    throw new FactoryError(`Locale "${args.locale}" is not in i18n.locales (${locales.join(", ")}).`, "Add it with update_client_config first.");
  }
  const file = paths.content(args.locale);
  assertNoUnknownKeys(findUnknownKeys(ContentSchema, args.content));
  const existing = args.replace ? {} : (readJsonIfExists(file) ?? {});
  const merged = deepMerge(existing, args.content);
  const result = validateDraft(ContentSchema, merged);
  if (result.invalid.length > 0) {
    throw new FactoryError(`Nothing saved. Invalid content: ${formatIssues(result.invalid)}`, "Shorten or correct these fields and try again.");
  }
  writeJson(file, merged);
  return { saved: true, file: `content/${args.locale}.json`, complete: result.data !== null, stillMissing: result.missing.map((m) => m.path) };
}

export function saveAssetTool(factory: FactoryConfig, args: { slug: string; inboxFile: string; kind: AssetKind; name?: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const source = safeJoin(factory.inboxDir, args.inboxFile);
  const saved = saveAsset({
    sourceAbs: source,
    assetsDir: paths.assetsDir,
    kind: args.kind,
    name: args.name ?? path.basename(args.inboxFile),
    maxBytes: args.kind === "logo" ? factory.limits.maxLogoBytes : factory.limits.maxImageBytes,
  });
  return {
    ...saved,
    next:
      args.kind === "logo"
        ? `Set it with update_client_config: { "brand": { "logo": "${saved.relPath}" } }`
        : `Reference "${saved.relPath}" in content (e.g. gallery[].src) with a descriptive alt text.`,
  };
}

// ---------------------------------------------------------------- design system

export async function generateDesignSystem(factory: FactoryConfig, args: { slug: string; query?: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const draft = readDraftConfig(paths);
  const business = (draft.business ?? {}) as { name?: string; industry?: string };
  const brief = (draft.brief ?? {}) as { tone?: string };
  const query = (args.query ?? [business.industry, brief.tone].filter(Boolean).join(" ")).slice(0, 120);
  if (!query) throw new FactoryError("No industry yet.", "Record business.industry first, or pass a query.");

  if (!existsSync(factory.uupmScript)) {
    return {
      source: "none",
      query,
      output: null,
      instructions:
        "UI UX Pro Max is not installed (see README: vendor/ui-ux-pro-max). Choose the design yourself from rules/design-rules.md, then save it with update_client_config under `design`.",
    };
  }
  // -E -s: ignore PYTHON* variables and the user site-packages. Not -I: that also drops the script's own
  // folder from the import path, and UI UX Pro Max imports its sibling modules (core.py) from there.
  const res = await run("python3", ["-E", "-s", factory.uupmScript, query, "--design-system", "-p", business.name ?? args.slug, "-f", "markdown"], {
    cwd: path.dirname(factory.uupmScript),
    timeoutMs: 60_000,
  });
  if (res.code !== 0) throw new FactoryError(`Design system generator failed (exit ${res.code}): ${res.stderr.slice(-800)}`);
  return {
    source: "ui-ux-pro-max",
    query,
    output: res.stdout,
    instructions:
      "Pick palette (primary, secondary, accent, background, text), heading/body fonts, a style name and section variants. Respect brand.colors if the client gave them and rules/design-rules.md. Save with update_client_config under `design`. build_site checks contrast.",
  };
}
