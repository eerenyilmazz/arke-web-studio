import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { RESEARCH_FILE } from "../lib/client.js";
import { run as realRun } from "../lib/exec.js";
import type { Runner } from "./updater.js";

/**
 * Team sharing: several people work on the same clients through one private Git repository (the same kind of
 * repository an ArkeLab team uses). Every client already has its own git history (lib/versions.ts); sharing
 * pushes that history to the team repository as the branch `clients/<slug>` and pulls teammates' work back.
 *
 * Shared: the site's inputs (config, texts, images, site code), the design plan, research notes, the client's kind
 *         and sales tracking. The app code (app/) is not: each panel installs the factory's own parts.
 * Never shared: approvals and build records (each person approves on their own panel), Cloudflare resources and
 *         deploy records (each person publishes with their own account), secrets (they are not in the client folder).
 *
 * Nothing is merged by guesswork: when two people changed the same client, the sync stops for that client and
 * says so; the other clients still sync. A client with a running agent job is skipped.
 */
export const TEAM_REMOTE = "team";
const BRANCH_PREFIX = "clients/";
export const SHARED_PATHS = [
  "site.config.json",
  "content",
  "assets",
  "site",
  "design-plan.json",
  "design-plans",
  RESEARCH_FILE,
  ".factory/product.json",
  ".factory/business.json",
] as const;
const GIT_MS = 30_000;
const NET_MS = 120_000;
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** https://host/path or git@host:path; never something git would read as an option. */
const REMOTE = /^(?:https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9._~\/-]+|git@[A-Za-z0-9.-]+:[A-Za-z0-9._~\/-]+|file:\/\/\/[A-Za-z0-9._~\/-]+)$/;

export interface Teammate {
  readonly name: string;
  readonly email: string;
}

export interface SyncResult {
  readonly pushed: string[];
  readonly pulled: string[];
  readonly added: string[];
  readonly upToDate: string[];
  readonly conflicts: string[];
  readonly skipped: Array<{ slug: string; reason: string }>;
}

export interface TeamStatus {
  readonly remote: string | null;
  readonly clients: Array<{ slug: string; shared: boolean; ahead: number; behind: number; lastBy: string | null; lastAt: string | null }>;
}

export function validRemote(url: string): string {
  const u = url.trim();
  if (!REMOTE.test(u) || u.includes(".."))
    throw new Error("Ekip deposu adresi https://… ya da git@…:… biçiminde olmalı (ör. https://github.com/ekip/musteriler.git).");
  return u;
}

/** Shows a remote without any password or token someone may have put in it. */
export const safeRemote = (url: string | null): string | null => (url ? url.replace(/\/\/[^@/]+@/, "//") : null);

function clientSlugs(clientsRoot: string): string[] {
  if (!existsSync(clientsRoot)) return [];
  return readdirSync(clientsRoot)
    .filter((n) => SLUG.test(n) && statSync(path.join(clientsRoot, n)).isDirectory() && existsSync(path.join(clientsRoot, n, "site.config.json")))
    .sort();
}

const author = (me: Teammate) => [
  "-c",
  `user.name=${me.name || "Arke Web Studio"}`,
  "-c",
  `user.email=${me.email || "team@localhost"}`,
  "-c",
  "commit.gpgsign=false",
];

function gitIn(run: Runner, root: string, me: Teammate) {
  return (args: string[], timeoutMs = GIT_MS) => run("git", [...author(me), ...args], { cwd: root, timeoutMs, env: { GIT_TERMINAL_PROMPT: "0" } });
}

/** Records the shared files of one client as a commit by this person (nothing to record: no commit). */
async function commitShared(git: ReturnType<typeof gitIn>, root: string, me: Teammate): Promise<void> {
  if (!existsSync(path.join(root, ".git"))) {
    const init = await git(["init", "--quiet", "-b", "main"]);
    if (init.code !== 0) throw new Error("git init başarısız.");
  }
  const present = SHARED_PATHS.filter((p) => existsSync(path.join(root, p)));
  // -f: .factory/ files may be ignored in an older client repository; only these two are ever added from it.
  if (present.length) await git(["add", "-A", "-f", "--", ...present]);
  const staged = await git(["diff", "--cached", "--quiet"]);
  if (staged.code !== 0) await git(["commit", "--quiet", "--no-verify", "-m", `Ekip: ${me.name || "değişiklikler"}`]);
}

async function ensureRemote(git: ReturnType<typeof gitIn>, remote: string): Promise<void> {
  const now = await git(["remote", "get-url", TEAM_REMOTE]);
  if (now.code !== 0) await git(["remote", "add", TEAM_REMOTE, "--", remote]);
  else if (now.stdout.trim() !== remote) await git(["remote", "set-url", TEAM_REMOTE, "--", remote]);
}

async function count(git: ReturnType<typeof gitIn>, range: string): Promise<number> {
  const r = await git(["rev-list", "--count", range]);
  return r.code === 0 ? Number(r.stdout.trim()) || 0 : 0;
}

/** Remote client branches: the clients the team shares. */
export async function remoteClients(remote: string, opts: { run?: Runner; cwd: string }): Promise<string[]> {
  const run = opts.run ?? realRun;
  const r = await run("git", ["ls-remote", "--heads", "--", validRemote(remote), `${BRANCH_PREFIX}*`], {
    cwd: opts.cwd,
    timeoutMs: NET_MS,
    env: { GIT_TERMINAL_PROMPT: "0" },
  });
  if (r.code !== 0) throw new Error("Ekip deposuna ulaşılamadı. Adresi ve git girişinizi (gh auth login) kontrol edin.");
  return r.stdout
    .split("\n")
    .map((l) => l.split("refs/heads/")[1]?.trim() ?? "")
    .filter((b) => b.startsWith(BRANCH_PREFIX))
    .map((b) => b.slice(BRANCH_PREFIX.length))
    .filter((s) => SLUG.test(s))
    .sort();
}

/**
 * One sync: for every local client, record its shared files, take teammates' commits (fast-forward or a clean
 * rebase), push; then fetch clients that exist only in the team repository. `busy` names clients to leave alone.
 */
export async function syncTeam(clientsRoot: string, remote: string, me: Teammate, opts: { run?: Runner; busy?: readonly string[] } = {}): Promise<SyncResult> {
  const run = opts.run ?? realRun;
  const url = validRemote(remote);
  const out: SyncResult = { pushed: [], pulled: [], added: [], upToDate: [], conflicts: [], skipped: [] };
  const shared = new Set(await remoteClients(url, { run, cwd: clientsRoot }));
  for (const slug of clientSlugs(clientsRoot)) {
    if (opts.busy?.includes(slug)) {
      out.skipped.push({ slug, reason: "agent işi sürüyor" });
      continue;
    }
    const root = path.join(clientsRoot, slug);
    const git = gitIn(run, root, me);
    try {
      await commitShared(git, root, me);
      await ensureRemote(git, url);
      const branch = `${BRANCH_PREFIX}${slug}`;
      if (shared.has(slug)) {
        const f = await git(["fetch", "--quiet", TEAM_REMOTE, `+refs/heads/${branch}:refs/remotes/${TEAM_REMOTE}/${branch}`], NET_MS);
        if (f.code !== 0) throw new Error("fetch");
        const theirs = `${TEAM_REMOTE}/${branch}`;
        const behind = await count(git, `HEAD..${theirs}`);
        const ahead = await count(git, `${theirs}..HEAD`);
        if (behind > 0 && ahead === 0) {
          if ((await git(["merge", "--ff-only", "--quiet", theirs])).code !== 0) throw new Error("merge");
          out.pulled.push(slug);
          continue;
        }
        if (behind > 0 && ahead > 0) {
          const rb = await git(["rebase", "--quiet", theirs]);
          if (rb.code !== 0) {
            await git(["rebase", "--abort"]);
            out.conflicts.push(slug);
            continue;
          }
          out.pulled.push(slug);
        }
        if (ahead === 0 && behind === 0) {
          out.upToDate.push(slug);
          continue;
        }
      }
      const p = await git(["push", "--quiet", TEAM_REMOTE, `HEAD:refs/heads/${branch}`], NET_MS);
      if (p.code !== 0) {
        out.conflicts.push(slug); // someone pushed in between: the next sync takes their work first
        continue;
      }
      out.pushed.push(slug);
    } catch {
      out.skipped.push({ slug, reason: "git hatası" });
    }
  }
  const local = new Set(clientSlugs(clientsRoot));
  for (const slug of shared) {
    if (local.has(slug) || existsSync(path.join(clientsRoot, slug))) continue;
    const r = await run("git", ["clone", "--quiet", "--origin", TEAM_REMOTE, "--branch", `${BRANCH_PREFIX}${slug}`, "--", url, path.join(clientsRoot, slug)], {
      cwd: clientsRoot,
      timeoutMs: NET_MS,
      env: { GIT_TERMINAL_PROMPT: "0" },
    });
    if (r.code === 0) {
      // Work happens on main locally (as in every client repository); the team branch is where it is pushed.
      await gitIn(run, path.join(clientsRoot, slug), me)(["checkout", "--quiet", "-B", "main"]);
      out.added.push(slug);
    } else out.skipped.push({ slug, reason: "indirilemedi" });
  }
  return out;
}

/** Per client: shared or not, commits to send and to take (from the last fetch), who changed it last. */
export async function teamStatus(clientsRoot: string, remote: string | null, opts: { run?: Runner } = {}): Promise<TeamStatus> {
  const run = opts.run ?? realRun;
  const clients = [];
  for (const slug of clientSlugs(clientsRoot)) {
    const root = path.join(clientsRoot, slug);
    const git = gitIn(run, root, { name: "", email: "" });
    const theirs = `${TEAM_REMOTE}/${BRANCH_PREFIX}${slug}`;
    const has = remote && existsSync(path.join(root, ".git")) && (await git(["rev-parse", "--verify", "--quiet", theirs])).code === 0;
    const last = existsSync(path.join(root, ".git")) ? (await git(["log", "-1", "--format=%an%x09%cI", ...(has ? [theirs] : [])])).stdout.trim() : "";
    const [lastBy = null, lastAt = null] = last ? last.split("\t") : [];
    clients.push({
      slug,
      shared: Boolean(has),
      ahead: has ? await count(git, `${theirs}..HEAD`) : 0,
      behind: has ? await count(git, `HEAD..${theirs}`) : 0,
      lastBy,
      lastAt,
    });
  }
  return { remote: safeRemote(remote), clients };
}
