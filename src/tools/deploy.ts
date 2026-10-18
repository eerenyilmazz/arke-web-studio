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

export async function deploy(factory: FactoryConfig, args: { slug: string; target: "preview" | "production"; dryRun?: boolean }) {
  const { paths, config } = loadValidClient(factory, assertSlug(args.slug));
  const build = readJsonIfExists(paths.buildRecord) as BuildRecord | undefined;
  const { hash, valid } = approvalState(paths.root, paths.approvals, build?.distHash ?? null);

  const blockers = deployBlockers(args.target, build, hash, valid, () => dirHash(paths.distDir));
  if (blockers.length > 0) {
    throw new FactoryError(`Deploy blocked:\n- ${blockers.join("\n- ")}`, "Approvals are given by Eren in a terminal. Never try to create them yourself.");
  }

  // Preview is its own Worker on workers.dev (never the custom domain), so the client can review it
  // while production stays untouched, and a first-ever preview works without an existing Worker.
  const baseWorker = config.hosting.workerName ?? `sf-${config.slug}`;
  const workerName = args.target === "preview" ? `${baseWorker}${PREVIEW_SUFFIX}` : baseWorker;
  const routes = args.target === "production" && config.site.domain ? [{ pattern: config.site.domain, custom_domain: true }] : undefined;
  writeWranglerConfig(paths.wranglerConfig, workerName, routes);

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
        ? "Send the preview URL to Eren for the client. After the client's OK, Eren gives the production approval."
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
  writeText(file, `// Generated by site-factory from site.config.json. Do not edit.\n${JSON.stringify(config, null, 2)}\n`);
}

/** last-deploy.json holds the most recent deploy; deploys.json the latest address of each target. */
function recordDeploy(paths: { lastDeploy: string; factoryDir: string }, record: DeployRecord, address: string | null): void {
  writeJson(paths.lastDeploy, record);
  const deploysFile = path.join(paths.factoryDir, DEPLOYS_FILE);
  const deploys = (readJsonIfExists(deploysFile) as Record<string, unknown> | undefined) ?? {};
  writeJson(deploysFile, { ...deploys, [record.target]: { url: address, at: record.at } });
}

/**
 * Takes a site off Cloudflare (deletes its Worker: the preview one or the live one). Panel only: this is not an
 * MCP tool, so the agent cannot call it. The client's files, versions and approvals stay; publishing again works.
 * `runner` is replaceable for tests.
 */
export async function undeploy(factory: FactoryConfig, args: { slug: string; target: "preview" | "production" }, runner: typeof run = run) {
  const { paths, config } = loadValidClient(factory, assertSlug(args.slug));
  const baseWorker = config.hosting.workerName ?? `sf-${config.slug}`;
  const workerName = args.target === "preview" ? `${baseWorker}${PREVIEW_SUFFIX}` : baseWorker;
  const creds = cloudflareCredentials(config.hosting.model, config.slug);
  if (!creds) {
    throw new FactoryError(
      `No Cloudflare credentials for hosting model "${config.hosting.model}".`,
      config.hosting.model === "managed"
        ? "Set SF_CF_MANAGED_API_TOKEN and SF_CF_MANAGED_ACCOUNT_ID before starting the panel."
        : `Set ${clientEnvPrefix(config.slug)}API_TOKEN and ${clientEnvPrefix(config.slug)}ACCOUNT_ID before starting the panel.`,
    );
  }
  const wranglerJs = path.join(FACTORY_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wranglerJs)) throw new FactoryError("wrangler is not installed.", "Run npm install in the factory folder.");
  // An empty folder, so no wrangler config can change which Worker is meant: only the name given here counts.
  const cwd = mkdtempSync(path.join(os.tmpdir(), "sf-undeploy-"));
  try {
    // --force: no interactive question (the panel already asked Eren).
    const res = await runner(process.execPath, [wranglerJs, "delete", workerName, "--force"], {
      cwd,
      timeoutMs: factory.limits.deployTimeoutMs,
      env: { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.accountId, WRANGLER_SEND_METRICS: "false" },
      secrets: [creds.token],
    });
    const output = `${res.stdout}\n${res.stderr}`;
    // Already gone (deleted in the Cloudflare dashboard, or never published) is the wanted end state.
    const missing = /10007|does not exist|not found/i.test(output);
    if (res.code !== 0 && !missing)
      throw new FactoryError(`wrangler exited with ${res.code}:\n${output.slice(-1500)}`, "Check the token has Workers Scripts: Edit.");
    const last = readJsonIfExists(paths.lastDeploy) as DeployRecord | undefined;
    if (last?.target === args.target) rmSync(paths.lastDeploy, { force: true });
    const deploysFile = path.join(paths.factoryDir, DEPLOYS_FILE);
    const deploys = readJsonIfExists(deploysFile) as Record<string, unknown> | undefined;
    if (deploys && args.target in deploys) {
      delete deploys[args.target];
      writeJson(deploysFile, deploys);
    }
    return { target: args.target, worker: workerName, alreadyRemoved: res.code !== 0 && missing };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
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
  if (res.code !== 0)
    return { ok: false, message: /Authentication|10000|Invalid/i.test(out) ? "Token geçersiz ya da yetkisi eksik." : "Cloudflare'e bağlanılamadı." };
  return { ok: true, message: "Bağlantı çalışıyor." };
}
