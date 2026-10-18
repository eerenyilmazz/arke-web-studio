import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { readJsonIfExists } from "./files.js";
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

/** "<slug>-YYYYMMDD-HHMMSS", as archiveClient names the folders. */
const ARCHIVE_ID = /^([a-z0-9][a-z0-9-]{1,38}[a-z0-9])-(\d{8})-(\d{6})$/;

export interface ArchivedClient {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly industry: string;
  readonly archivedAt: string;
  /** A client with the same short name exists again: restoring would clash. */
  readonly slugTaken: boolean;
}

function parseId(id: string): { slug: string; archivedAt: string } {
  const m = ARCHIVE_ID.exec(id);
  if (!m) throw new FactoryError("Geçersiz arşiv kaydı.");
  const [d, t] = [m[2]!, m[3]!];
  return { slug: m[1]!, archivedAt: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z` };
}

export function listArchived(factory: FactoryConfig): ArchivedClient[] {
  const root = path.join(factory.clientsRoot, ARCHIVE_DIR);
  if (!existsSync(root)) return [];
  const out: ArchivedClient[] = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || !ARCHIVE_ID.test(e.name)) continue;
    const { slug, archivedAt } = parseId(e.name);
    const cfg = (readJsonIfExists(path.join(root, e.name, "site.config.json")) ?? {}) as { business?: { name?: string; industry?: string } };
    out.push({
      id: e.name,
      slug,
      name: cfg.business?.name ?? slug,
      industry: cfg.business?.industry ?? "",
      archivedAt,
      slugTaken: existsSync(path.join(factory.clientsRoot, slug)),
    });
  }
  return out.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

/** Moves an archived client (and its inbox) back. Refused while a client with the same short name exists. */
export function restoreArchived(factory: FactoryConfig, id: string): { slug: string } {
  const { slug } = parseId(id);
  const from = safeJoin(factory.clientsRoot, ARCHIVE_DIR, id);
  if (!existsSync(from) || !statSync(from).isDirectory()) throw new FactoryError("Arşivde böyle bir kayıt yok.");
  const to = safeJoin(factory.clientsRoot, slug);
  if (existsSync(to)) throw new FactoryError(`"${slug}" adında bir müşteri zaten var. Önce onu arşivleyin ya da kısa adını değiştirin.`);
  renameSync(from, to);
  const inboxFrom = safeJoin(factory.inboxDir, ARCHIVE_DIR, id);
  const inboxTo = safeJoin(factory.inboxDir, slug);
  if (existsSync(inboxFrom) && !existsSync(inboxTo)) renameSync(inboxFrom, inboxTo);
  return { slug };
}

/**
 * Deletes an archived client for good (folder, its version history and its inbox). Only archived clients can be
 * deleted, so a live client always goes through the archive first; the panel asks for the short name again.
 * The website on Cloudflare is not touched: take it down first with "Yayından kaldır".
 */
export function deleteArchived(factory: FactoryConfig, id: string): void {
  parseId(id);
  const dir = safeJoin(factory.clientsRoot, ARCHIVE_DIR, id);
  if (!existsSync(dir)) throw new FactoryError("Arşivde böyle bir kayıt yok.");
  rmSync(dir, { recursive: true, force: true });
  rmSync(safeJoin(factory.inboxDir, ARCHIVE_DIR, id), { recursive: true, force: true });
}
