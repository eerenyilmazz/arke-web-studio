import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FactoryError } from "./errors.js";

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new FactoryError(`Could not read ${path.basename(file)}: ${(error as Error).message}`);
  }
}

export function readJsonIfExists(file: string): unknown {
  return existsSync(file) ? readJson(file) : undefined;
}

/** Atomic write (temp file + rename) so a crash never leaves half a config on disk. */
export function writeJson(file: string, data: unknown): void {
  writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function writeText(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/**
 * Fingerprint of everything that ends up on the site (config, content, assets).
 * Approvals and build records store it; if anything changes afterwards, they no longer count.
 */
export function contentHash(clientRoot: string): string {
  const hash = createHash("sha256");
  // site/ holds the code of "custom" sites written by the agent; it is an input like config and content.
  // app/ holds an app site's Worker and database migrations: approvals cover them too (absent on showcase sites,
  // so their hash is unchanged).
  const files = [
    "site.config.json",
    ...listFiles(clientRoot, "content"),
    ...listFiles(clientRoot, "assets"),
    ...listFiles(clientRoot, "site"),
    ...listFiles(clientRoot, "app"),
  ];
  for (const rel of files.sort()) {
    const abs = path.join(clientRoot, rel);
    if (!existsSync(abs)) continue;
    hash.update(rel.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(abs));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * Fingerprint of the built site (every file under `dir`). Visual and production approvals pin it,
 * so what is deployed is byte-for-byte what a person reviewed. null if the folder does not exist.
 */
export function dirHash(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const hash = createHash("sha256");
  for (const rel of listFiles(dir, ".").sort()) {
    hash.update(rel.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path.join(dir, rel)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function listFiles(root: string, dir: string): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)));
}
