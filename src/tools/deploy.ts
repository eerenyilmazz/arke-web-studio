import { cloudflareAccountStatus, readClientSecrets } from "../lib/accounts.js";
import {
  APP_ENTRY,
  type AppDeployContext,
  type AppPlan,
  appPlanFor,
  assertSecrets,
  appWranglerConfig,
  ensureResources,
  isAppSite,
  migrate,
  pushSecrets,
  readProductRecord,
  readResources,
  type Runner,
  type Target,
} from "../deploy/app.js";
import { PRODUCTS } from "../products/registry.js";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FACTORY_ROOT, type FactoryConfig } from "../config.js";
import { approvalState, type ApprovalKind } from "../lib/approvals.js";
import { loadValidClient, type BuildRecord, type DeployRecord } from "../lib/client.js";
import { FactoryError } from "../lib/errors.js";
import { run } from "../lib/exec.js";
import { dirHash, readJsonIfExists, writeJson, writeText } from "../lib/files.js";
import { assertSlug } from "../lib/paths.js";
import { WRANGLER_COMPAT_DATE, PREVIEW_SUFFIX, DEPLOYS_FILE, clientEnvPrefix, cloudflareCredentials, formActionUrl } from "./shared.js";

/** Deploy and unpublish on Cloudflare, and the Cloudflare status shown in the panel. */

// ---------------------------------------------------------------- deploy

export async function deploy(
  factory: FactoryConfig,
  args: {
    slug: string;
    target: "preview" | "production";
    dryRun?: boolean;
    /** App sites: The operator confirmed migrations that delete or overwrite data, for this publish only (panel only). */
    allowDestructive?: boolean;
    /** Progress lines for the panel's job log. */
    log?: (line: string) => void;
    /** Tests replace the command runner. */
    runner?: Runner;
  },
) {
  const { paths, config } = loadValidClient(factory, assertSlug(args.slug));
  const build = readJsonIfExists(paths.buildRecord) as BuildRecord | undefined;
  const { hash, valid } = approvalState(paths.root, paths.approvals, build?.distHash ?? null);

  const blockers = deployBlockers(args.target, build, hash, valid, () => dirHash(paths.distDir));
  if (blockers.length > 0) {
    throw new FactoryError(
      `Deploy blocked:\n- ${blockers.join("\n- ")}`,
      "Approvals are given by the operator in a terminal. Never try to create them yourself.",
    );
  }

  // Preview is its own Worker on workers.dev (never the custom domain), so the client can review it
  // while production stays untouched, and a first-ever preview works without an existing Worker.
  const baseWorker = baseWorkerName(config);
  const workerName = args.target === "preview" ? `${baseWorker}${PREVIEW_SUFFIX}` : baseWorker;
  const routes = args.target === "production" && config.site.domain ? [{ pattern: config.site.domain, custom_domain: true }] : undefined;
  const product = readProductRecord(paths);
  const app = isAppSite(product);
  if (app && !existsSync(path.join(paths.root, APP_ENTRY)))
    throw new FactoryError(
      `${APP_ENTRY} is missing: this ${PRODUCTS[product.product].name} site has no app code yet.`,
      "The factory installs its parts first (panel).",
    );
  if (!app) writeWranglerConfig(paths.wranglerConfig, workerName, routes);

  const creds = cloudflareCredentials(config.hosting.model, config.slug);
  if (!args.dryRun && !creds) {
    throw new FactoryError(
      `No Cloudflare credentials for hosting model "${config.hosting.model}".`,
      config.hosting.model === "managed"
        ? "Add your Cloudflare account in the panel (Ayarlar → Hesabım), or set ARKE_CF_MANAGED_API_TOKEN and ARKE_CF_MANAGED_ACCOUNT_ID."
        : `Set ${clientEnvPrefix(config.slug)}API_TOKEN and ${clientEnvPrefix(config.slug)}ACCOUNT_ID in the MCP server environment.`,
    );
  }

  // Local wrangler (pinned in package.json), run through node: no download at deploy time, no Windows .cmd shim.
  const wranglerJs = path.join(FACTORY_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wranglerJs)) throw new FactoryError("wrangler is not installed.", "Run npm install in the factory folder.");
  const runner = args.runner ?? run;
  if (app) {
    // App sites: resources, backup, migrations and secrets before the Worker itself (src/deploy/app.ts).
    const plan = appPlanFor(PRODUCTS[product.product], product);
    let resources = readResources(paths)[args.target] ?? {};
    if (!args.dryRun && creds) {
      const ctx: AppDeployContext = {
        paths,
        slug: config.slug,
        target: args.target,
        plan,
        run: runner,
        wranglerJs,
        env: { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.accountId, WRANGLER_SEND_METRICS: "false" },
        token: creds.token,
        timeoutMs: factory.limits.deployTimeoutMs,
        log: args.log ?? (() => undefined),
      };
      const secrets = readClientSecrets(config.slug);
      assertSecrets(plan, secrets);
      resources = await ensureResources(ctx);
      await migrate(ctx, resources, args.allowDestructive === true);
      // Written before the secrets: wrangler needs the Worker's config, and a first deploy creates the Worker.
      writeAppWranglerConfig(paths.wranglerConfig, workerName, routes, plan, resources);
      await pushSecrets(ctx, workerName, secrets);
    } else {
      writeAppWranglerConfig(paths.wranglerConfig, workerName, routes, plan, resources);
    }
  }
  const wranglerArgs = [wranglerJs, "deploy", ...(args.dryRun ? ["--dry-run"] : [])];
  const res = await runner(process.execPath, wranglerArgs, {
    cwd: paths.root,
    timeoutMs: factory.limits.deployTimeoutMs,
    env: creds
      ? { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.accountId, WRANGLER_SEND_METRICS: "false" }
      : { WRANGLER_SEND_METRICS: "false" },
    secrets: creds ? [creds.token] : [],
  });
  const output = `${res.stdout}\n${res.stderr}`;
  if (res.code !== 0) throw new FactoryError(`wrangler exited with ${res.code}:\n${output.slice(-1500)}`, "See docs/runbook in README: deploy failed.");

  const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev[^\s]*/i)?.[0] ?? null;
  if (!args.dryRun)
    recordDeploy(paths, { hash, at: new Date().toISOString(), target: args.target, url }, url ?? (routes ? `https://${config.site.domain}` : null));
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
        ? "Send the preview URL to the operator for the client. After the client's OK, the operator gives the production approval."
        : routes
          ? "Check the custom domain loads over HTTPS. DNS for the domain must be on Cloudflare."
          : "Live on workers.dev. Connect the domain once DNS is on Cloudflare (set site.domain, rebuild, deploy).",
  };
}

/**
 * Why a deploy may not run: the current content must have a passing build whose output is untouched, with the
 * human approvals for exactly that content and output. Empty = allowed. The approvals gate lives here.
 */
export function deployBlockers(
  target: "preview" | "production",
  build: BuildRecord | undefined,
  hash: string,
  valid: Readonly<Record<ApprovalKind, unknown>>,
  currentDistHash: () => string | null,
): string[] {
  const blockers: string[] = [];
  if (!build || build.hash !== hash) blockers.push("No build for the current content. Run build_site.");
  else if (!build.passed) blockers.push("Last build failed its checks. See quality-report.md.");
  else if (!build.distHash || currentDistHash() !== build.distHash) {
    blockers.push("dist/ is not the output of the last build (changed or rebuilt elsewhere). Run build_site; visual approval is needed again.");
  }
  if (!valid.content) blockers.push("Missing content approval (npm run approve -- <slug> content).");
  if (!valid.visual) blockers.push("Missing visual approval for this build output (npm run approve -- <slug> visual).");
  if (target === "production" && !valid.production) blockers.push("Missing production approval (npm run approve -- <slug> production).");
  return blockers;
}

function writeWranglerConfig(file: string, workerName: string, routes: Array<{ pattern: string; custom_domain: boolean }> | undefined): void {
  const config = {
    name: workerName,
    compatibility_date: WRANGLER_COMPAT_DATE,
    assets: { directory: "./dist", not_found_handling: "404-page" },
    ...(routes ? { routes } : {}),
  };
  writeText(file, `// Generated by Arke Web Studio from site.config.json. Do not edit.\n${JSON.stringify(config, null, 2)}\n`);
}

function writeAppWranglerConfig(
  file: string,
  workerName: string,
  routes: Array<{ pattern: string; custom_domain: boolean }> | undefined,
  plan: AppPlan,
  resources: ReturnType<typeof readResources>[Target],
): void {
  const config = appWranglerConfig({ workerName, compatibilityDate: WRANGLER_COMPAT_DATE, ...(routes ? { routes } : {}), plan, resources: resources ?? {} });
  writeText(file, `// Generated by Arke Web Studio (app site). Do not edit.\n${JSON.stringify(config, null, 2)}\n`);
}

/** last-deploy.json holds the most recent deploy; deploys.json the latest address of each target. */
function recordDeploy(paths: { lastDeploy: string; factoryDir: string }, record: DeployRecord, address: string | null): void {
  writeJson(paths.lastDeploy, record);
  const deploysFile = path.join(paths.factoryDir, DEPLOYS_FILE);
  const deploys = (readJsonIfExists(deploysFile) as Record<string, unknown> | undefined) ?? {};
  writeJson(deploysFile, { ...deploys, [record.target]: { url: address, at: record.at } });
}

/** The client's Worker name: the one set in its config, else "arke-<slug>". */
export function baseWorkerName(config: { slug: string; hosting: { workerName?: string | null } }): string {
  return config.hosting.workerName ?? `${WORKER_PREFIX}${config.slug}`;
}
const WORKER_PREFIX = "arke-";

/** The Worker a target publishes to: the production name, or the same name with "-preview". */
function workerFor(config: { slug: string; hosting: { workerName?: string | null } }, target: "preview" | "production"): string {
  const base = baseWorkerName(config);
  return target === "preview" ? `${base}${PREVIEW_SUFFIX}` : base;
}

/**
 * Runs one wrangler command on a client's Worker by name, in an empty folder (so no wrangler config can change
 * which Worker is meant), with the client's Cloudflare credentials and the token hidden from any output.
 */
async function wranglerOnWorker(
  factory: FactoryConfig,
  config: { slug: string; hosting: { model: "managed" | "client" } },
  args: readonly string[],
  runner: typeof run,
): Promise<{ code: number | null; output: string }> {
  const creds = cloudflareCredentials(config.hosting.model, config.slug);
  if (!creds) {
    throw new FactoryError(
      `No Cloudflare credentials for hosting model "${config.hosting.model}".`,
      config.hosting.model === "managed"
        ? "Add your Cloudflare account in the panel (Ayarlar → Hesabım), or set ARKE_CF_MANAGED_API_TOKEN and ARKE_CF_MANAGED_ACCOUNT_ID."
        : `Set ${clientEnvPrefix(config.slug)}API_TOKEN and ${clientEnvPrefix(config.slug)}ACCOUNT_ID before starting the panel.`,
    );
  }
  const wranglerJs = path.join(FACTORY_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wranglerJs)) throw new FactoryError("wrangler is not installed.", "Run npm install in the factory folder.");
  const cwd = mkdtempSync(path.join(os.tmpdir(), "arke-wrangler-"));
  try {
    const res = await runner(process.execPath, [wranglerJs, ...args], {
      cwd,
      timeoutMs: factory.limits.deployTimeoutMs,
      env: { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.accountId, WRANGLER_SEND_METRICS: "false" },
      secrets: [creds.token],
    });
    return { code: res.code, output: `${res.stdout}\n${res.stderr}` };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/**
 * Removes a client's preview or live Worker from Cloudflare. The client's files, versions and approvals stay;
 * it can be published again. Panel only, never an MCP tool.
 */
export async function undeploy(factory: FactoryConfig, args: { slug: string; target: "preview" | "production" }, runner: typeof run = run) {
  const { paths, config } = loadValidClient(factory, assertSlug(args.slug));
  const workerName = workerFor(config, args.target);
  // --force: no interactive question (the panel already asked the operator).
  const { code, output } = await wranglerOnWorker(factory, config, ["delete", workerName, "--force"], runner);
  // Already gone (deleted in the Cloudflare dashboard, or never published) is the wanted end state.
  const missing = /10007|does not exist|not found/i.test(output);
  if (code !== 0 && !missing) throw new FactoryError(`wrangler exited with ${code}:\n${output.slice(-1500)}`, "Check the token has Workers Scripts: Edit.");
  const last = readJsonIfExists(paths.lastDeploy) as DeployRecord | undefined;
  if (last?.target === args.target) rmSync(paths.lastDeploy, { force: true });
  const deploysFile = path.join(paths.factoryDir, DEPLOYS_FILE);
  const deploys = readJsonIfExists(deploysFile) as Record<string, unknown> | undefined;
  if (deploys && args.target in deploys) {
    delete deploys[args.target];
    writeJson(deploysFile, deploys);
  }
  return { target: args.target, worker: workerName, alreadyRemoved: code !== 0 && missing };
}

/**
 * Puts the version that was live before the last publish back on the client's Worker (Cloudflare keeps the
 * earlier versions). For a publish that went wrong: the site returns to its previous state within seconds.
 * The files on this machine do not change; deploys.json notes the rollback so the report can say the live site
 * is older than the files. Panel only, never an MCP tool.
 */
export async function rollback(factory: FactoryConfig, args: { slug: string; target: "preview" | "production"; by: string }, runner: typeof run = run) {
  const { paths, config } = loadValidClient(factory, assertSlug(args.slug));
  const workerName = workerFor(config, args.target);
  const message = `Arke Web Studio: rolled back by ${args.by}`.slice(0, 100);
  // No version id: wrangler takes the version before the current one. --yes: the panel already asked the operator.
  const { code, output } = await wranglerOnWorker(factory, config, ["rollback", "--name", workerName, "--message", message, "--yes"], runner);
  if (code !== 0) {
    const hint = /no previous|only one|at least two|cannot rollback/i.test(output)
      ? "There is no earlier version of this site on Cloudflare to go back to."
      : "Check the token has Workers Scripts: Edit.";
    throw new FactoryError(`wrangler exited with ${code}:\n${output.slice(-1500)}`, hint);
  }
  const deploysFile = path.join(paths.factoryDir, DEPLOYS_FILE);
  const deploys = (readJsonIfExists(deploysFile) as Record<string, Record<string, unknown>> | undefined) ?? {};
  const at = new Date().toISOString();
  writeJson(deploysFile, { ...deploys, [args.target]: { ...(deploys[args.target] ?? {}), rolledBackAt: at, rolledBackBy: args.by } });
  return { target: args.target, worker: workerName, at };
}

/** Which Cloudflare settings are present (never their values), for the panel's setup page. */
export function cloudflareStatus() {
  const wranglerJs = path.join(FACTORY_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  const account = cloudflareAccountStatus();
  return {
    managed: { token: account.configured, accountId: account.configured },
    account,
    wrangler: existsSync(wranglerJs),
    formAction: formActionUrl() !== null,
  };
}

/** Checks the managed token works (wrangler whoami). Returns only ok and a short, token-free message. */
export async function cloudflareTest(factory: FactoryConfig, given: { token: string; accountId: string } | null = null) {
  const creds = given ?? cloudflareCredentials("managed", "x");
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
  if (res.code !== 0)
    return { ok: false, message: /Authentication|10000|Invalid/i.test(out) ? "Token geçersiz ya da yetkisi eksik." : "Cloudflare'e bağlanılamadı." };
  return { ok: true, message: "Bağlantı çalışıyor." };
}
