import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { FactoryError } from "./errors.js";
import { run } from "./exec.js";

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
const AUTHOR = ["-c", "user.name=Site Factory", "-c", "user.email=factory@localhost", "-c", "commit.gpgsign=false"];

export interface Version {
  readonly id: string;
  readonly at: string;
  readonly message: string;
}

async function git(root: string, args: string[]) {
  return run("git", [...AUTHOR, ...args], { cwd: root, timeoutMs: GIT_TIMEOUT_MS });
}

/** Records the current state if anything changed. Returns the new version id, or null when nothing changed. */
export async function snapshot(root: string, message: string): Promise<string | null> {
  if (!existsSync(path.join(root, ".git"))) {
    const init = await git(root, ["init", "--quiet"]);
    if (init.code !== 0) return null;
  }
  const add = await git(root, ["add", "-A", "--", ...INPUTS.filter((p) => existsSync(path.join(root, p)))]);
  if (add.code !== 0) return null;
  const staged = await git(root, ["diff", "--cached", "--quiet"]);
  if (staged.code === 0) return null; // nothing to record
  const commit = await git(root, ["commit", "--quiet", "--no-verify", "-m", message.slice(0, 200)]);
  if (commit.code !== 0) return null;
  const head = await git(root, ["rev-parse", "HEAD"]);
  return head.code === 0 ? head.stdout.trim() : null;
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
