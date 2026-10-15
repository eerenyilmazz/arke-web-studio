import { existsSync, mkdirSync, renameSync } from "node:fs";
import type { FactoryConfig } from "../config.js";
import { FactoryError } from "./errors.js";
import { assertSlug, clientPaths, safeJoin } from "./paths.js";

/** Archived clients live here; list_clients ignores it because it has no site.config.json. */
export const ARCHIVE_DIR = "_archive";

export interface ArchiveResult {
  readonly slug: string;
  readonly archivedTo: string;
  readonly inboxArchivedTo: string | null;
}

function stamp(now: Date): string {
  return now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
}

/**
 * Removes a client from the factory without destroying anything: its folder (own git repo, approvals,
 * audit log) and its inbox folder move under _archive/<slug>-<timestamp>. Restoring = moving the folder back.
 * Not exposed as an MCP tool, so the agent can never archive a client; only the operator via the panel.
 * The live website is not touched (Cloudflare keeps serving it).
 */
export function archiveClient(factory: FactoryConfig, slug: string, now = new Date()): ArchiveResult {
  const paths = clientPaths(factory.clientsRoot, assertSlug(slug));
  if (!existsSync(paths.config)) throw new FactoryError(`Client "${slug}" does not exist.`);
  const name = `${slug}-${stamp(now)}`;

  const archiveRoot = safeJoin(factory.clientsRoot, ARCHIVE_DIR);
  mkdirSync(archiveRoot, { recursive: true });
  const target = safeJoin(archiveRoot, name);
  if (existsSync(target)) throw new FactoryError("An archive with this name already exists. Try again in a second.");
  renameSync(paths.root, target);

  let inboxTarget: string | null = null;
  const inbox = safeJoin(factory.inboxDir, slug);
  if (existsSync(inbox)) {
    const inboxArchive = safeJoin(factory.inboxDir, ARCHIVE_DIR);
    mkdirSync(inboxArchive, { recursive: true });
    inboxTarget = safeJoin(inboxArchive, name);
    renameSync(inbox, inboxTarget);
  }
  return { slug, archivedTo: target, inboxArchivedTo: inboxTarget };
}
