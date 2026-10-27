import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { FactoryError } from "../core/errors.js";
import { run } from "../core/exec.js";

/**
 * Version history of a client's site, kept in the client's own git repository.
 * The panel records a version before and after every job; "restore" puts the inputs (config, texts,
 * images, site code) back as they were. Approvals, build records and history in .factory/ are never restored,
 * so an old version must be approved again unless it is byte-for-byte what was approved before.
 */
const INPUTS = ["site.config.json", "content", "assets", "site"] as const;
const GIT_TIMEOUT_MS = 20_000;
const MAX_LIST = 30;
const COMMIT_ID = /^[0-9a-f]{40}$/;
const AUTHOR = ["-c", "user.name=Arke Web Studio", "-c", "user.email=factory@localhost", "-c", "commit.gpgsign=false"];

export interface Version {
  readonly id: string;
  readonly at: string;
  readonly message: string;
}

async function git(root: string, args: string[]) {
  return run("git", [...AUTHOR, ...args], { cwd: root, timeoutMs: GIT_TIMEOUT_MS });
}

/** Waits between two tries when git is busy (another snapshot or an editor holding the index lock). */
const RETRY_DELAY_MS = 1_500;
/** One snapshot at a time per client, so two finishing jobs never fight over git's index lock. */
const queues = new Map<string, Promise<unknown>>();

/**
 * Records the current state if anything changed. Returns the new version id, or null when nothing changed.
 * A git failure is retried once and then thrown, so callers can log it instead of losing a version silently.
 */
export function snapshot(root: string, message: string): Promise<string | null> {
  const key = path.resolve(root);
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => null).then(() => snapshotWithRetry(root, message));
  queues.set(key, next);
  void next
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    })
    .catch(() => null);
  return next;
}

async function snapshotWithRetry(root: string, message: string): Promise<string | null> {
  try {
    return await snapshotOnce(root, message);
  } catch {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return snapshotOnce(root, message);
  }
}

async function snapshotOnce(root: string, message: string): Promise<string | null> {
  if (!existsSync(path.join(root, ".git"))) await must(root, ["init", "--quiet"], "git init");
  await must(root, ["add", "-A", "--", ...INPUTS.filter((p) => existsSync(path.join(root, p)))], "git add");
  const staged = await git(root, ["diff", "--cached", "--quiet"]);
  if (staged.code === 0) return null; // nothing to record
  await must(root, ["commit", "--quiet", "--no-verify", "-m", message.slice(0, 200)], "git commit");
  const head = await must(root, ["rev-parse", "HEAD"], "git rev-parse");
  return head.stdout.trim();
}

async function must(root: string, args: string[], what: string) {
  const res = await git(root, args);
  if (res.code !== 0) throw new FactoryError(`Sürüm kaydedilemedi (${what}): ${(res.stderr || res.stdout).trim().slice(0, 300)}`);
  return res;
}

export async function listVersions(root: string): Promise<Version[]> {
  if (!existsSync(path.join(root, ".git"))) return [];
  const res = await git(root, ["log", `-n${MAX_LIST}`, "--format=%H%x09%cI%x09%s"]);
  if (res.code !== 0) return [];
  return res.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id = "", at = "", ...rest] = line.split("\t");
      return { id, at, message: rest.join("\t") };
    })
    .filter((v) => COMMIT_ID.test(v.id));
}

/** Puts config, texts, images and site code back as they were in version `id`, then records that as a new version. */
export async function restoreVersion(root: string, id: string): Promise<{ restored: string; version: string | null }> {
  if (!COMMIT_ID.test(id)) throw new FactoryError("Geçersiz sürüm.");
  const known = (await listVersions(root)).find((v) => v.id === id);
  if (!known) throw new FactoryError("Bu sürüm bulunamadı.");
  const tree = await git(root, ["ls-tree", "--name-only", id]);
  if (tree.code !== 0) throw new FactoryError("Sürüm okunamadı.");
  const inVersion = new Set(tree.stdout.split("\n").filter(Boolean));
  for (const p of INPUTS) {
    if (p !== "site.config.json") rmSync(path.join(root, p), { recursive: true, force: true });
    if (inVersion.has(p)) {
      const co = await git(root, ["checkout", id, "--", p]);
      if (co.code !== 0) throw new FactoryError(`"${p}" geri yüklenemedi.`);
    }
  }
  const version = await snapshot(root, `Geri alındı: ${known.message}`.slice(0, 200));
  return { restored: id, version };
}

/** For callers that must not fail when git does: the error is logged, never swallowed silently. */
export function versionNotSaved(error: unknown): null {
  console.error("[panel] version not saved:", (error as Error).message);
  return null;
}

/** Message of the version saved at start-up for changes left by a job that never finished (panel closed, crash). */
export const UNSAVED_MESSAGE = "Kaydedilmemiş değişiklikler (panel açılırken)";

/**
 * At start-up: records a version for every client whose files changed after its last version, so work left by a job
 * that stopped with the panel (Ctrl+C, a closed terminal, a restart) can still be gone back to. Returns the slugs saved.
 */
export async function saveUnsavedVersions(clientsRoot: string): Promise<string[]> {
  if (!existsSync(clientsRoot)) return [];
  const saved: string[] = [];
  for (const entry of readdirSync(clientsRoot, { withFileTypes: true })) {
    const root = path.join(clientsRoot, entry.name);
    if (!entry.isDirectory() || !existsSync(path.join(root, "site.config.json"))) continue;
    if (await snapshot(root, UNSAVED_MESSAGE).catch(versionNotSaved)) saved.push(entry.name);
  }
  return saved;
}
