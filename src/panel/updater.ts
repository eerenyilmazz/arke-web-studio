import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { run as realRun, type RunOptions, type RunResult } from "../lib/core/exec.js";

/**
 * Updating Arke Web Studio from the panel. Two kinds of install:
 *
 *   git  installed with `git clone` (scripts/install.sh): the panel checks the remote and, on request, runs
 *        git pull --ff-only → npm ci → npm run build. Local changes stop it (nothing is overwritten); a bad update
 *        is undone with `git reset --hard <previous commit>`, which the log shows.
 *   zip  installed from a release zip: the panel shows the version and the `arke-update <zip>` command.
 *
 * The new code runs after the panel is restarted. Only one update runs at a time, never during an agent job.
 */
export type Runner = (command: string, args: readonly string[], options: RunOptions) => Promise<RunResult>;

export interface UpdateStatus {
  readonly mode: "git" | "zip";
  readonly current: string;
  readonly latest: string | null;
  readonly behind: number;
  readonly dirty: boolean;
  readonly upstream: string | null;
  readonly checkedAt: string;
  readonly message: string;
}

export interface UpdateProgress {
  readonly running: boolean;
  readonly done: boolean;
  readonly error: string | null;
  readonly log: readonly string[];
  readonly from: string | null;
  readonly to: string | null;
  readonly previousCommit: string | null;
}

const FETCH_MS = 60_000;
const PULL_MS = 120_000;
const NPM_CI_MS = 600_000;
const BUILD_MS = 240_000;
const GIT_MS = 20_000;

const version = (root: string): string => {
  try {
    return (JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version?: string }).version ?? "?";
  } catch {
    return "?";
  }
};

async function git(run: Runner, root: string, args: string[], timeoutMs = GIT_MS) {
  return run("git", args, { cwd: root, timeoutMs, env: { GIT_TERMINAL_PROMPT: "0" } });
}

/** Where the install stands; `fetch` asks the remote (a network call). */
export async function checkForUpdate(root: string, opts: { run?: Runner; fetch?: boolean } = {}): Promise<UpdateStatus> {
  const run = opts.run ?? realRun;
  const current = version(root);
  const base = { current, latest: null, behind: 0, dirty: false, upstream: null, checkedAt: new Date().toISOString() };
  const zip = (message: string): UpdateStatus => ({ ...base, mode: "zip", message });
  if (!existsSync(path.join(root, ".git"))) return zip("Zip ile kurulmuş: yeni sürümü arke-update <zip> ile kurun.");
  const up = await git(run, root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (up.code !== 0) return zip("Uzak depo bağlı değil (zip ile kurulmuş): yeni sürümü arke-update <zip> ile kurun.");
  const upstream = up.stdout.trim();
  if (opts.fetch !== false) {
    const f = await git(run, root, ["fetch", "--quiet"], FETCH_MS);
    if (f.code !== 0) return { ...base, mode: "git", upstream, message: "Uzak depoya ulaşılamadı. İnternet bağlantısını ve git girişini kontrol edin." };
  }
  const behind = Number((await git(run, root, ["rev-list", "--count", "HEAD..@{u}"])).stdout.trim()) || 0;
  const dirty = (await git(run, root, ["status", "--porcelain", "--untracked-files=no"])).stdout.trim().length > 0;
  let latest: string | null = current;
  const pkg = await git(run, root, ["show", "@{u}:package.json"]);
  if (pkg.code === 0) {
    try {
      latest = (JSON.parse(pkg.stdout) as { version?: string }).version ?? null;
    } catch {
      latest = null;
    }
  }
  const message = dirty
    ? "Kurulum klasöründe kaydedilmemiş değişiklikler var; güncelleme bunların üzerine yazmaz. Önce onları kaydedin ya da geri alın."
    : behind > 0
      ? `Yeni sürüm hazır: ${latest ?? "?"} (${behind} değişiklik).`
      : "Arke Web Studio güncel.";
  return { ...base, mode: "git", latest, behind, dirty, upstream, message };
}

let progress: UpdateProgress = { running: false, done: false, error: null, log: [], from: null, to: null, previousCommit: null };

export const updateProgress = (): UpdateProgress => progress;

/** For tests. */
export function resetUpdateProgress(): void {
  progress = { running: false, done: false, error: null, log: [], from: null, to: null, previousCommit: null };
}

/**
 * Runs the update in the background (the panel polls updateProgress). Refuses zip installs, local changes and a
 * second run. Each step must pass before the next; a failed step stops with its output's last lines.
 */
export async function applyUpdate(root: string, opts: { run?: Runner } = {}): Promise<UpdateProgress> {
  const run = opts.run ?? realRun;
  if (progress.running) throw new Error("Bir güncelleme zaten sürüyor.");
  const status = await checkForUpdate(root, { run });
  if (status.mode !== "git") throw new Error(status.message);
  if (status.dirty) throw new Error(status.message);
  if (status.behind === 0) throw new Error("Arke Web Studio zaten güncel.");
  const head = (await git(run, root, ["rev-parse", "HEAD"])).stdout.trim();
  const log: string[] = [];
  progress = { running: true, done: false, error: null, log, from: status.current, to: status.latest, previousCommit: head || null };
  const step = async (label: string, command: string, args: string[], timeoutMs: number) => {
    log.push(`${label}…`);
    const r = await run(command, args, { cwd: root, timeoutMs, env: { GIT_TERMINAL_PROMPT: "0", npm_config_fund: "false", npm_config_audit: "false" } });
    if (r.code !== 0) throw new Error(`${label} başarısız:\n${`${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-12).join("\n")}`);
  };
  void (async () => {
    try {
      await step("Yeni kod indiriliyor (git pull)", "git", ["pull", "--ff-only", "--quiet"], PULL_MS);
      await step("Paketler kuruluyor (npm ci)", "npm", ["ci", "--no-fund", "--no-audit"], NPM_CI_MS);
      await step("Derleniyor (npm run build)", "npm", ["run", "build"], BUILD_MS);
      log.push(`Tamam: ${status.current} → ${version(root)}. Paneli yeniden başlatın (terminalde Ctrl+C, sonra arke-panel).`);
      progress = { ...progress, running: false, done: true, to: version(root), log: [...log] };
    } catch (error) {
      const undo = head ? ` Geri almak için: git -C "${root}" reset --hard ${head.slice(0, 12)} && npm ci && npm run build` : "";
      progress = { ...progress, running: false, done: false, error: `${(error as Error).message}${undo}`, log: [...log] };
    }
  })();
  return progress;
}
