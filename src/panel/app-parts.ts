import { readProductRecord } from "../deploy/app.js";
import { clientSecretNames, saveClientSecret } from "../lib/accounts.js";
import type { ClientPaths } from "../lib/paths.js";
import {
  ADMIN_PASSWORD_SECRET,
  hashAdminPassword,
  type InstallResult,
  installParts,
  NOTIFY_WEBHOOK_SECRET,
  newSessionSecret,
  READY_PARTS,
  SESSION_SECRET,
} from "../parts/install.js";
import { PRODUCTS } from "../products/registry.js";

/**
 * The panel's side of the ready-made parts: installs them for app sites and keeps the secrets they need. The
 * session key is made here once (nobody types it); the admin password is set by Eren and only its hash is kept.
 */
export function prepareAppParts(paths: ClientPaths, slug: string): InstallResult {
  const module = PRODUCTS[readProductRecord(paths).product];
  const result = installParts(paths, module);
  if (result.installed && !clientSecretNames(slug).some((s) => s.name === SESSION_SECRET)) saveClientSecret(slug, SESSION_SECRET, newSessionSecret());
  return result;
}

export function setAdminPassword(slug: string, password: string): void {
  saveClientSecret(slug, ADMIN_PASSWORD_SECRET, hashAdminPassword(password));
}

const WEBHOOK = /^https:\/\/[a-z0-9.-]+(?::\d{2,5})?\/[\x21-\x7e]{0,1800}$/i;

export function setNotifyWebhook(slug: string, url: string): void {
  if (!WEBHOOK.test(url.trim())) throw new Error("Bildirim adresi https:// ile başlayan geçerli bir web adresi olmalı.");
  saveClientSecret(slug, NOTIFY_WEBHOOK_SECRET, url.trim());
}

/** What the client page shows: the parts, and which keys are set (never their values). */
export function appPartsView(paths: ClientPaths, slug: string) {
  const record = readProductRecord(paths);
  const module = PRODUCTS[record.product];
  if (module.deploy !== "app") return { app: false as const };
  const set = new Set(clientSecretNames(slug).map((s) => s.name));
  const missing = (record.secrets ?? []).filter((n) => !set.has(n));
  return {
    app: true as const,
    product: module.id,
    parts: module.parts.filter((p) => READY_PARTS[p]),
    pendingParts: module.parts.filter((p) => !READY_PARTS[p] && p !== "site-kit" && p !== "motion"),
    adminPassword: set.has(ADMIN_PASSWORD_SECRET),
    notifyWebhook: set.has(NOTIFY_WEBHOOK_SECRET),
    missingSecrets: missing,
  };
}
