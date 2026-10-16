import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { FACTORY_ROOT, type FactoryConfig } from "./config.js";
import { ContentSchema } from "./schema/content.js";
import { SCHEMA_VERSION, SiteConfigSchema, type Locale } from "./schema/site-config.js";
import { approvalState } from "./lib/approvals.js";
import { saveAsset, type AssetKind } from "./lib/assets.js";
import { clientStatus, loadValidClient, openClient, readDraftConfig, type BuildRecord, type DeployRecord } from "./lib/client.js";
import { FactoryError } from "./lib/errors.js";
import { run } from "./lib/exec.js";
import { contentHash, dirHash, readJsonIfExists, writeJson, writeText } from "./lib/files.js";
import { deepMerge } from "./lib/merge.js";
import { assertSlug, clientPaths, safeJoin } from "./lib/paths.js";
import { checkInputs, checkOutput, renderReport, type CheckResult } from "./lib/quality.js";
import { buildCustomSite, checkBrand, checkCustomCode, deleteSiteFile, isCustom, listSiteFiles, readSiteFile, writeSiteFile } from "./lib/custom-site.js";
import { buildQuestionnaire } from "./lib/questionnaire.js";
import { findUnknownKeys } from "./lib/unknown-keys.js";
import { validateDraft, type FieldIssue } from "./lib/validation.js";

/*
 * Tool implementations. Each takes the factory config plus validated arguments and returns
 * a plain object that the server serialises for the agent. No MCP types here, so every
 * tool can be unit-tested directly.
 */

const CLIENT_GITIGNORE = ["dist/", "node_modules/", ".wrangler/", ".env", ".env.*", ".factory/audit.log", "*.tmp", ""].join("\n");
/** `meta` is only changed through the `unmapped` / `laterInterests` arguments, so recorded answers can never be wiped by a patch. */
const LOCKED_CONFIG_KEYS = new Set(["slug", "schemaVersion", "meta"]);
/** Optional form endpoint passed through to the template build (see template contract). */
const FORM_ACTION_ENV = "SF_FORM_ACTION";
const WRANGLER_COMPAT_DATE = "2026-10-01";
const PREVIEW_SUFFIX = "-preview";

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
export const COUNTRIES = ["GB", "TR"] as const;
export type Country = (typeof COUNTRIES)[number];
const MARKETS: Readonly<Record<Country, { locale: Locale; timezone: string; currency: string }>> = {
  GB: { locale: "en", timezone: "Europe/London", currency: "GBP" },
  TR: { locale: "tr", timezone: "Europe/Istanbul", currency: "TRY" },
};

export async function createClient(
  factory: FactoryConfig,
  args: { slug: string; businessName: string; industry: string; hostingModel: "managed" | "client"; extraLocale?: Locale; template?: string; country?: Country },
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
    throw new FactoryError(
      `"${key}" cannot be changed.`,
      key === "meta" ? "Use the `unmapped` and `laterInterests` arguments instead." : undefined,
    );
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
    throw new FactoryError(
      `Nothing saved. Invalid values: ${formatIssues(result.invalid)}`,
      "Fix these values (or ask the client) and send the patch again.",
    );
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
  const res = await run(
    "python3",
    ["-E", "-s", factory.uupmScript, query, "--design-system", "-p", business.name ?? args.slug, "-f", "markdown"],
    { cwd: path.dirname(factory.uupmScript), timeoutMs: 60_000 },
  );
  if (res.code !== 0) throw new FactoryError(`Design system generator failed (exit ${res.code}): ${res.stderr.slice(-800)}`);
  return {
    source: "ui-ux-pro-max",
    query,
    output: res.stdout,
    instructions:
      "Pick palette (primary, secondary, accent, background, text), heading/body fonts, a style name and section variants. Respect brand.colors if the client gave them and rules/design-rules.md. Save with update_client_config under `design`. build_site checks contrast.",
  };
}

// ---------------------------------------------------------------- build

export async function buildSite(factory: FactoryConfig, args: { slug: string }) {
  const { paths, config, content } = loadValidClient(factory, assertSlug(args.slug));
  const results: CheckResult[] = [{ name: "Config and content schema", status: "pass", detail: `locales: ${config.i18n.locales.join(", ")}` }];
  results.push(...checkInputs(paths.root, config, content));

  // Pin the inputs before building: if they change while the build runs, the output no longer matches them.
  const hashBefore = contentHash(paths.root);
  let buildOutput = "";
  if (isCustom(config.template)) {
    // The agent wrote the site itself: copy it, then check the code and the brand identity.
    if (results.some((r) => r.status === "fail")) {
      results.push({ name: "Custom site build", status: "skip", detail: "Skipped because input checks failed." });
    } else {
      const built = buildCustomSite(paths);
      results.push(built);
      if (built.status === "pass") {
        results.push(...checkOutput(paths.distDir, config));
        results.push(...checkCustomCode(paths.distDir, formActionUrl()));
        results.push(...checkBrand(paths.distDir, config.brand.logo));
      }
    }
  } else if (!existsSync(path.join(safeJoin(factory.templatesDir, config.template), "package.json"))) {
    results.push({ name: "Template build", status: "fail", detail: `Template "${config.template}" not found in templates/. See README: template contract.` });
  } else if (!existsSync(path.join(safeJoin(factory.templatesDir, config.template), "node_modules"))) {
    results.push({ name: "Template build", status: "fail", detail: `Run "npm install" once in templates/${config.template}.` });
  } else if (results.some((r) => r.status === "fail")) {
    results.push({ name: "Template build", status: "skip", detail: "Skipped because input checks failed." });
  } else {
    const res = await run("npm", ["run", "build", "--silent"], {
      cwd: safeJoin(factory.templatesDir, config.template),
      timeoutMs: factory.limits.buildTimeoutMs,
      env: buildEnv(paths.root, paths.distDir),
    });
    buildOutput = `${res.stdout}\n${res.stderr}`.trim();
    results.push({
      name: "Template build",
      status: res.code === 0 ? "pass" : "fail",
      detail: res.code === 0 ? `templates/${config.template}` : `exit ${res.code}: ${buildOutput.slice(-600)}`,
    });
    if (res.code === 0) results.push(...checkOutput(paths.distDir, config));
  }

  results.push(await runImpeccable(paths.distDir, results));

  const hash = hashBefore;
  if (contentHash(paths.root) !== hashBefore) {
    results.push({ name: "Inputs unchanged during build", status: "fail", detail: "Config, content or assets changed while building. Run build_site again." });
  }
  const failures = results.filter((r) => r.status === "fail").map((r) => `${r.name}: ${r.detail}`);
  const distHash = dirHash(paths.distDir);
  const record: BuildRecord = { hash, at: new Date().toISOString(), passed: failures.length === 0, failures, ...(distHash ? { distHash } : {}) };
  writeJson(paths.buildRecord, record);
  writeText(paths.qualityReport, renderReport(config.slug, hash, results));

  return {
    passed: record.passed,
    report: "quality-report.md",
    dist: record.passed ? paths.distDir : null,
    checks: results,
    // Log only when something failed: it is long and costs tokens on every successful build.
    buildLogTail: !record.passed && buildOutput ? buildOutput.slice(-1500) : undefined,
    next: record.passed
      ? "Ask Eren to open dist/ locally and review it against the design checklist (visual approval)."
      : isCustom(config.template)
        ? "Fix the failed checks in config, content or the site files (write_site_file), then build again."
        : "Fix the failed checks (config/content only, never the template), then build again.",
  };
}

async function runImpeccable(distDir: string, prior: CheckResult[]): Promise<CheckResult> {
  const bin = path.join(FACTORY_ROOT, "node_modules", ".bin", process.platform === "win32" ? "impeccable.cmd" : "impeccable");
  if (prior.some((r) => r.name === "Build output" && r.status === "pass") === false) {
    return { name: "Impeccable design lint", status: "skip", detail: "No build output." };
  }
  if (!existsSync(bin)) return { name: "Impeccable design lint", status: "skip", detail: "Not installed (optional: npm i -D impeccable)." };
  const res = await run(bin, ["detect", "--json", distDir], {
    cwd: FACTORY_ROOT,
    timeoutMs: 120_000,
    env: { IMPECCABLE_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" },
    maxOutputChars: IMPECCABLE_MAX_OUTPUT,
  });
  // Exit 0 = clean, 2 = findings (warnings included), 1 = could not scan.
  if (res.code === 0) return { name: "Impeccable design lint", status: "pass", detail: "No findings." };
  if (res.code !== 2) return { name: "Impeccable design lint", status: "warn", detail: `Could not scan: ${res.stderr.slice(-300)}` };
  return summariseImpeccable(res.stdout);
}

const IMPECCABLE_MAX_OUTPUT = 2_000_000;

interface ImpeccableFinding {
  readonly antipattern?: string;
  readonly severity?: string;
}

/**
 * Design findings are advice, not proof the site is broken: warnings are reported (and the agent can act
 * on them), only findings marked "error" fail the build.
 */
export function summariseImpeccable(stdout: string): CheckResult {
  let findings: ImpeccableFinding[];
  try {
    const parsed: unknown = JSON.parse(stdout);
    findings = Array.isArray(parsed) ? (parsed as ImpeccableFinding[]) : [];
  } catch {
    return { name: "Impeccable design lint", status: "warn", detail: "Findings could not be read." };
  }
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.antipattern ?? "unknown", (counts.get(f.antipattern ?? "unknown") ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ×${n}`).join(", ");
  const errors = findings.filter((f) => f.severity === "error").length;
  return {
    name: "Impeccable design lint",
    status: errors > 0 ? "fail" : findings.length > 0 ? "warn" : "pass",
    detail: findings.length ? `${findings.length} finding(s)${errors ? `, ${errors} error(s)` : ""}: ${top}` : "No findings.",
  };
}

// ---------------------------------------------------------------- deploy

export async function deploy(factory: FactoryConfig, args: { slug: string; target: "preview" | "production"; dryRun?: boolean }) {
  const { paths, config } = loadValidClient(factory, assertSlug(args.slug));
  const build = readJsonIfExists(paths.buildRecord) as BuildRecord | undefined;
  const { hash, valid } = approvalState(paths.root, paths.approvals, build?.distHash ?? null);

  const blockers: string[] = [];
  if (!build || build.hash !== hash) blockers.push("No build for the current content. Run build_site.");
  else if (!build.passed) blockers.push("Last build failed its checks. See quality-report.md.");
  else if (!build.distHash || dirHash(paths.distDir) !== build.distHash) {
    blockers.push("dist/ is not the output of the last build (changed or rebuilt elsewhere). Run build_site; visual approval is needed again.");
  }
  if (!valid.content) blockers.push("Missing content approval (npm run approve -- <slug> content).");
  if (!valid.visual) blockers.push("Missing visual approval for this build output (npm run approve -- <slug> visual).");
  if (args.target === "production" && !valid.production) blockers.push("Missing production approval (npm run approve -- <slug> production).");
  if (blockers.length > 0) {
    throw new FactoryError(`Deploy blocked:\n- ${blockers.join("\n- ")}`, "Approvals are given by Eren in a terminal. Never try to create them yourself.");
  }

  // Preview is its own Worker on workers.dev (never the custom domain), so the client can review it
  // while production stays untouched, and a first-ever preview works without an existing Worker.
  const baseWorker = config.hosting.workerName ?? `sf-${config.slug}`;
  const workerName = args.target === "preview" ? `${baseWorker}${PREVIEW_SUFFIX}` : baseWorker;
  const routes = args.target === "production" && config.site.domain ? [{ pattern: config.site.domain, custom_domain: true }] : undefined;
  writeText(
    paths.wranglerConfig,
    `// Generated by site-factory from site.config.json. Do not edit.\n${JSON.stringify(
      {
        name: workerName,
        compatibility_date: WRANGLER_COMPAT_DATE,
        assets: { directory: "./dist", not_found_handling: "404-page" },
        ...(routes ? { routes } : {}),
      },
      null,
      2,
    )}\n`,
  );

  const creds = cloudflareCredentials(config.hosting.model, config.slug);
  if (!args.dryRun && !creds) {
    throw new FactoryError(
      `No Cloudflare credentials for hosting model "${config.hosting.model}".`,
      config.hosting.model === "managed"
        ? "Set SF_CF_MANAGED_API_TOKEN and SF_CF_MANAGED_ACCOUNT_ID in the MCP server environment."
        : `Set ${clientEnvPrefix(config.slug)}API_TOKEN and ${clientEnvPrefix(config.slug)}ACCOUNT_ID in the MCP server environment.`,
    );
  }

  // Local wrangler (pinned in package.json), run through node: no download at deploy time, no Windows .cmd shim.
  const wranglerJs = path.join(FACTORY_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wranglerJs)) throw new FactoryError("wrangler is not installed.", "Run npm install in the factory folder.");
  const wranglerArgs = [wranglerJs, "deploy", ...(args.dryRun ? ["--dry-run"] : [])];
  const res = await run(process.execPath, wranglerArgs, {
    cwd: paths.root,
    timeoutMs: factory.limits.deployTimeoutMs,
    env: creds ? { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.accountId, WRANGLER_SEND_METRICS: "false" } : { WRANGLER_SEND_METRICS: "false" },
    secrets: creds ? [creds.token] : [],
  });
  const output = `${res.stdout}\n${res.stderr}`;
  if (res.code !== 0) throw new FactoryError(`wrangler exited with ${res.code}:\n${output.slice(-1500)}`, "See docs/runbook in README: deploy failed.");

  const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev[^\s]*/i)?.[0] ?? null;
  if (!args.dryRun) {
    const record: DeployRecord = { hash, at: new Date().toISOString(), target: args.target, url };
    writeJson(paths.lastDeploy, record);
  }
  return {
    target: args.target,
    dryRun: Boolean(args.dryRun),
    worker: workerName,
    url,
    customDomain: routes ? config.site.domain : null,
    // Full output only when it is needed: a dry run, or no URL could be read from it.
    outputTail: args.dryRun || url === null ? output.slice(-1200) : undefined,
    next:
      args.target === "preview"
        ? "Send the preview URL to Eren for the client. After the client's OK, Eren gives the production approval."
        : routes
          ? "Check the custom domain loads over HTTPS. DNS for the domain must be on Cloudflare."
          : "Live on workers.dev. Connect the domain once DNS is on Cloudflare (set site.domain, rebuild, deploy).",
  };
}

/** Which Cloudflare settings are present (never their values), for the panel's setup page. */
export function cloudflareStatus() {
  const wranglerJs = path.join(FACTORY_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  return {
    managed: { token: Boolean(process.env.SF_CF_MANAGED_API_TOKEN), accountId: Boolean(process.env.SF_CF_MANAGED_ACCOUNT_ID) },
    wrangler: existsSync(wranglerJs),
    formAction: formActionUrl() !== null,
  };
}

/** Checks the managed token works (wrangler whoami). Returns only ok and a short, token-free message. */
export async function cloudflareTest(factory: FactoryConfig) {
  const creds = cloudflareCredentials("managed", "x");
  if (!creds) return { ok: false, message: "Token ya da hesap kimliği tanımlı değil." };
  const wranglerJs = path.join(FACTORY_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wranglerJs)) return { ok: false, message: "wrangler kurulu değil (npm install)." };
  const res = await run(process.execPath, [wranglerJs, "whoami"], {
    cwd: FACTORY_ROOT,
    timeoutMs: Math.min(factory.limits.deployTimeoutMs, 60_000),
    env: { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.accountId, WRANGLER_SEND_METRICS: "false" },
    secrets: [creds.token],
  });
  const out = `${res.stdout}\n${res.stderr}`;
  if (res.code !== 0) return { ok: false, message: /Authentication|10000|Invalid/i.test(out) ? "Token geçersiz ya da yetkisi eksik." : "Cloudflare'e bağlanılamadı." };
  return { ok: true, message: "Bağlantı çalışıyor." };
}

function clientEnvPrefix(slug: string): string {
  return `SF_CF_CLIENT_${slug.toUpperCase().replaceAll("-", "_")}_`;
}

function cloudflareCredentials(model: "managed" | "client", slug: string): { token: string; accountId: string } | null {
  const prefix = model === "managed" ? "SF_CF_MANAGED_" : clientEnvPrefix(slug);
  const token = process.env[`${prefix}API_TOKEN`];
  const accountId = process.env[`${prefix}ACCOUNT_ID`];
  return token && accountId ? { token, accountId } : null;
}

/** The contact form endpoint, when configured and https. */
function formActionUrl(): string | null {
  const value = process.env[FORM_ACTION_ENV];
  return value && /^https:\/\//.test(value) ? value : null;
}

// ---------------------------------------------------------------- custom site files

export function listSiteFilesTool(factory: FactoryConfig, args: { slug: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  return listSiteFiles(paths);
}

export function readSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string }) {
  return readSiteFile(openClient(factory, assertSlug(args.slug)), args.path);
}

export function writeSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string; content: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const template = (readDraftConfig(paths) as { template?: string }).template ?? "";
  if (!isCustom(template)) {
    throw new FactoryError(`Client "${args.slug}" uses the ${template} template, which you do not write code for.`, 'Only sites with template "custom" are written by hand. Change config and content instead.');
  }
  return writeSiteFile(paths, args.path, args.content);
}

export function deleteSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string }) {
  return deleteSiteFile(openClient(factory, assertSlug(args.slug)), args.path);
}

function buildEnv(clientDir: string, outDir: string): Record<string, string> {
  const env: Record<string, string> = { SF_CLIENT_DIR: clientDir, SF_OUT_DIR: outDir, NODE_ENV: "production" };
  const formAction = process.env[FORM_ACTION_ENV];
  if (formAction) env[FORM_ACTION_ENV] = formAction;
  return env;
}

function assertNoUnknownKeys(unknown: readonly string[]): void {
  if (unknown.length === 0) return;
  throw new FactoryError(
    `Nothing saved. Unknown field(s): ${unknown.slice(0, 10).join(", ")}`,
    "Check the spelling against schema/*.schema.json. Answers that fit no field go in `unmapped`.",
  );
}

function formatIssues(issues: readonly FieldIssue[]): string {
  return issues.map((i) => `${i.path} (${i.message})`).join("; ");
}
