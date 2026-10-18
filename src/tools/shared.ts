import path from "node:path";
import { FactoryError } from "../lib/errors.js";
import { effectiveFormAction } from "../lib/form.js";
import { type FieldIssue } from "../lib/validation.js";

/** Constants and small helpers shared by the tool modules (not tools themselves). */

export const CLIENT_GITIGNORE = ["dist/", "node_modules/", ".wrangler/", ".env", ".env.*", ".factory/audit.log", "*.tmp", ""].join("\n");
/** `meta` is only changed through the `unmapped` / `laterInterests` arguments, so recorded answers can never be wiped by a patch. */
export const LOCKED_CONFIG_KEYS = new Set(["slug", "schemaVersion", "meta"]);
/** Optional form endpoint passed through to the template build (see template contract). */
export const FORM_ACTION_ENV = "SF_FORM_ACTION";
export const WRANGLER_COMPAT_DATE = "2026-10-01";
export const PREVIEW_SUFFIX = "-preview";
/** .factory/deploys.json: { preview?: {url, at}, production?: {url, at} }. */
export const DEPLOYS_FILE = "deploys.json";

export function clientEnvPrefix(slug: string): string {
  return `SF_CF_CLIENT_${slug.toUpperCase().replaceAll("-", "_")}_`;
}

export function cloudflareCredentials(model: "managed" | "client", slug: string): { token: string; accountId: string } | null {
  const prefix = model === "managed" ? "SF_CF_MANAGED_" : clientEnvPrefix(slug);
  const token = process.env[`${prefix}API_TOKEN`];
  const accountId = process.env[`${prefix}ACCOUNT_ID`];
  return token && accountId ? { token, accountId } : null;
}

/** The contact form endpoint, when configured and https. */
export function formActionUrl(): string | null {
  const value = process.env[FORM_ACTION_ENV];
  return value && /^https:\/\//.test(value) ? value : null;
}

export function buildEnv(clientDir: string, outDir: string): Record<string, string> {
  const env: Record<string, string> = { SF_CLIENT_DIR: clientDir, SF_OUT_DIR: outDir, NODE_ENV: "production" };
  // The client's own form service (panel setting) wins over the factory-wide one.
  const formAction = effectiveFormAction(path.join(clientDir, ".factory"));
  if (formAction) env[FORM_ACTION_ENV] = formAction;
  return env;
}

export function assertNoUnknownKeys(unknown: readonly string[]): void {
  if (unknown.length === 0) return;
  throw new FactoryError(
    `Nothing saved. Unknown field(s): ${unknown.slice(0, 10).join(", ")}`,
    "Check the spelling against schema/*.schema.json. Answers that fit no field go in `unmapped`.",
  );
}

export function formatIssues(issues: readonly FieldIssue[]): string {
  return issues.map((i) => `${i.path} (${i.message})`).join("; ");
}
