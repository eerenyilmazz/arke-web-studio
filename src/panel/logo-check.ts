import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { FactoryConfig } from "../config.js";
import { readDraftConfig } from "../lib/client.js";
import { readJsonIfExists, writeJson } from "../lib/files.js";
import { clientPaths, safeJoin } from "../lib/paths.js";
import * as tools from "../tools.js";

/**
 * Cheap checks around the client's logo, so no design job is paid for with the wrong logo:
 * - the same logo file is already another client's logo (e.g. a pickle shop's logo picked for a barber);
 * - the logo changed after the brand was built, so colours, tagline and signature still follow the old one.
 * No image is analysed by a model; only file contents are compared.
 */
const STALE_FILE = "brand-stale.json";

function hashFile(file: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  } catch {
    return null; // unreadable: no comparison
  }
}

/** The absolute file of a client's logo (brand.logo, relative to the client folder), or null. */
export function logoFile(factory: FactoryConfig, slug: string): string | null {
  const paths = clientPaths(factory.clientsRoot, slug);
  const logo = (readDraftConfig(paths) as { brand?: { logo?: string | null } }).brand?.logo;
  if (!logo) return null;
  try {
    const f = safeJoin(paths.root, logo);
    return existsSync(f) ? f : null;
  } catch {
    return null;
  }
}

export interface LogoOwner {
  readonly slug: string;
  readonly name: string;
}

/** Another client whose logo is byte-for-byte this file, or null. */
export function logoUsedElsewhere(factory: FactoryConfig, slug: string, file: string): LogoOwner | null {
  const hash = hashFile(file);
  if (!hash) return null;
  for (const c of tools.listClients(factory).clients) {
    if (c.slug === slug || c.stage === "unreadable") continue;
    const other = logoFile(factory, c.slug);
    if (other && hashFile(other) === hash) return { slug: c.slug, name: "name" in c && c.name ? c.name : c.slug };
  }
  return null;
}

/** The client's current logo is also another client's logo. */
export function sharedLogo(factory: FactoryConfig, slug: string): LogoOwner | null {
  const own = logoFile(factory, slug);
  return own ? logoUsedElsewhere(factory, slug, own) : null;
}

const staleFile = (factory: FactoryConfig, slug: string) => path.join(clientPaths(factory.clientsRoot, slug).factoryDir, STALE_FILE);

/** Called when the logo changes on a site whose brand already exists. */
export function markBrandStale(factory: FactoryConfig, slug: string, logo: string): void {
  const paths = clientPaths(factory.clientsRoot, slug);
  if (!existsSync(path.join(paths.root, "site", "brand", "brand.json"))) return;
  writeJson(staleFile(factory, slug), { logo, at: new Date().toISOString() });
}

export function readBrandStale(factory: FactoryConfig, slug: string): { logo: string; at: string } | null {
  return (readJsonIfExists(staleFile(factory, slug)) as { logo: string; at: string } | null) ?? null;
}

/** After a design job finished: the brand follows the current logo again. */
export function clearBrandStale(factory: FactoryConfig, slug: string): void {
  rmSync(staleFile(factory, slug), { force: true });
}
