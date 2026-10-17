import { execFile } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { FactoryConfig } from "../config.js";
import { readSettings } from "./settings.js";

/**
 * Backups of everything Eren cannot rebuild: client folders (with their version history), the design library
 * and the panel settings, as one .tar.gz in a folder he chose (e.g. a OneDrive folder). The inbox is included
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
  if (!path.isAbsolute(dir)) throw new Error("Yedek klasörü tam yol olmalı (ör. /mnt/c/Users/eeren/OneDrive/Yedek).");
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
export function autoBackup(factory: FactoryConfig, log: (msg: string) => void = () => { /* silent unless the caller passes a logger */ }): void {
  if (!readSettings(factory).backupDir || Date.now() - lastAuto < AUTO_MIN_INTERVAL_MS) return;
  backupNow(factory).then(
    (r) => log(`Yedek alındı: ${r.file}`),
    (e: Error) => log(`Yedek alınamadı: ${e.message}`),
  );
}
