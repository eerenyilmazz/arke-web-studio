import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { FactoryConfig } from "../config.js";
import { readSettings } from "./settings.js";

/**
 * Backups of everything the operator cannot rebuild: client folders (with their version history), the design library
 * and the panel settings, as one .tar.gz in a folder the operator chose (e.g. a OneDrive folder). The inbox is included
 * because uploads may not be saved yet. Old backups beyond KEEP are removed; nothing else is ever deleted.
 */
const run = promisify(execFile);
const PREFIX = "site-factory-yedek-";
const KEEP = 10;
/** After jobs: at most one automatic backup in this window. */
const AUTO_MIN_INTERVAL_MS = 30 * 60 * 1000;
let lastAuto = 0;
let running: Promise<BackupResult> | null = null;

export interface BackupResult {
  readonly file: string;
  readonly bytes: number;
  readonly at: string;
}

/** The backup folder must be an existing absolute directory outside the client folders. */
export function checkBackupDir(dir: string, factory: FactoryConfig): string {
  if (!dir) throw new Error("Önce Ayarlar'dan bir yedek klasörü seç.");
  if (!path.isAbsolute(dir)) throw new Error("Yedek klasörü tam yol olmalı (ör. /mnt/c/Users/<kullanıcı>/OneDrive/Yedek).");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error("Yedek klasörü bulunamadı. Klasörü oluşturup tekrar dene.");
  const rel = path.relative(path.resolve(factory.clientsRoot), path.resolve(dir));
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) throw new Error("Yedek klasörü müşteri klasörünün içinde olamaz.");
  return path.resolve(dir);
}

export function listBackups(dir: string): BackupResult[] {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.startsWith(PREFIX) && n.endsWith(".tar.gz"))
    .map((n) => {
      const st = statSync(path.join(dir, n));
      return { file: n, bytes: st.size, at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function backupNow(factory: FactoryConfig): Promise<BackupResult> {
  if (running) return running;
  running = (async () => {
    const dir = checkBackupDir(readSettings(factory).backupDir, factory);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);
    const name = `${PREFIX}${stamp}.tar.gz`;
    const target = path.join(dir, name);
    const clients = path.resolve(factory.clientsRoot);
    const inbox = path.resolve(factory.inboxDir);
    const parts: Array<[string, string]> = [[path.dirname(clients), path.basename(clients)]];
    if (existsSync(inbox)) parts.push([path.dirname(inbox), path.basename(inbox)]);
    const args = ["-czf", target, "--exclude=node_modules", "--exclude=dist", ...parts.flatMap(([cwd, base]) => ["-C", cwd, base])];
    await run("tar", args, { timeout: 10 * 60 * 1000 });
    for (const old of listBackups(dir).slice(KEEP)) rmSync(path.join(dir, old.file), { force: true });
    lastAuto = Date.now();
    return { file: name, bytes: statSync(target).size, at: new Date().toISOString() };
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

/** Called when a job ends: backs up quietly when a folder is set and the last backup is old enough. */
export function autoBackup(
  factory: FactoryConfig,
  log: (msg: string) => void = () => {
    /* silent unless the caller passes a logger */
  },
): void {
  if (!readSettings(factory).backupDir || Date.now() - lastAuto < AUTO_MIN_INTERVAL_MS) return;
  backupNow(factory).then(
    (r) => log(`Yedek alındı: ${r.file}`),
    (e: Error) => log(`Yedek alınamadı: ${e.message}`),
  );
}

export interface BackupCheck {
  readonly ok: boolean;
  /** Clients found in the backup (folders with a readable site.config.json). */
  readonly clients: string[];
  readonly files: number;
  readonly problems: string[];
}

const BACKUP_NAME = /^site-factory-yedek-[0-9-]+\.tar\.gz$/;

/** A backup file in the chosen folder, by name only (no paths from the request). */
function backupPath(factory: FactoryConfig, file: string): string {
  if (!BACKUP_NAME.test(file)) throw new Error("Geçersiz yedek adı.");
  const full = path.join(checkBackupDir(readSettings(factory).backupDir, factory), file);
  if (!existsSync(full)) throw new Error("Yedek bulunamadı.");
  return full;
}

function countFiles(dir: string): number {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
}

/** Looks at an extracted backup: the clients folder, each client's config, the settings file. */
function inspect(root: string, clientsName: string): BackupCheck {
  const problems: string[] = [];
  const clientsDir = path.join(root, clientsName);
  if (!existsSync(clientsDir)) return { ok: false, clients: [], files: 0, problems: [`Yedekte "${clientsName}" klasörü yok.`] };
  const clients: string[] = [];
  for (const e of readdirSync(clientsDir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const cfg = path.join(clientsDir, e.name, "site.config.json");
    if (!existsSync(cfg)) continue;
    try {
      JSON.parse(readFileSync(cfg, "utf8"));
      clients.push(e.name);
    } catch {
      problems.push(`${e.name}: site.config.json okunamıyor.`);
    }
    if (!existsSync(path.join(clientsDir, e.name, ".git"))) problems.push(`${e.name}: sürüm geçmişi (.git) yok.`);
  }
  return { ok: problems.length === 0, clients: clients.sort(), files: countFiles(root), problems };
}

/**
 * Proves a backup can be restored: unpacks it into a temporary folder, checks every client in it, and removes the
 * folder again. Nothing in the real client folders is touched.
 */
export async function verifyBackup(factory: FactoryConfig, file: string): Promise<BackupCheck> {
  const archive = backupPath(factory, file);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "sf-backup-check-"));
  try {
    await run("tar", ["-xzf", archive, "-C", tmp], { timeout: 10 * 60 * 1000 });
    return inspect(tmp, path.basename(path.resolve(factory.clientsRoot)));
  } catch (error) {
    return { ok: false, clients: [], files: 0, problems: [`Yedek açılamadı: ${(error as Error).message.slice(0, 200)}`] };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Unpacks a backup into a NEW folder (it must not exist), never over the current clients. To switch to the
 * restored copy, the operator renames the folders themselves (the README explains it); until then nothing changes.
 */
export async function restoreBackup(factory: FactoryConfig, archive: string, target: string): Promise<BackupCheck & { folder: string }> {
  const dest = path.resolve(target);
  if (existsSync(dest)) throw new Error("Hedef klasör zaten var. Var olan hiçbir şeyin üzerine yazılmaz; yeni bir klasör adı ver.");
  if (!BACKUP_NAME.test(path.basename(archive)) || !existsSync(archive)) throw new Error("Yedek dosyası bulunamadı.");
  mkdirSync(dest, { recursive: true });
  await run("tar", ["-xzf", path.resolve(archive), "-C", dest], { timeout: 10 * 60 * 1000 });
  return { ...inspect(dest, path.basename(path.resolve(factory.clientsRoot))), folder: dest };
}
