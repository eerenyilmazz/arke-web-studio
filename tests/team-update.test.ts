import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { remoteClients, safeRemote, syncTeam, teamStatus, validRemote } from "../src/panel/team.js";
import { applyUpdate, checkForUpdate, resetUpdateProgress, updateProgress } from "../src/panel/updater.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
const tmp = (p: string) => mkdtempSync(path.join(os.tmpdir(), p));

function bareRepo(): { dir: string; url: string } {
  const dir = tmp("arke-team-remote-");
  git(dir, "init", "--quiet", "--bare", "-b", "main");
  return { dir, url: `file://${dir}` };
}

/** A client folder as the panel makes it, with a site and the files that must never leave this computer. */
function client(root: string, slug: string, title: string) {
  const dir = path.join(root, slug);
  mkdirSync(path.join(dir, "site"), { recursive: true });
  mkdirSync(path.join(dir, ".factory"), { recursive: true });
  writeFileSync(path.join(dir, "site.config.json"), JSON.stringify({ slug, title }));
  writeFileSync(path.join(dir, "site", "index.html"), `<h1>${title}</h1>`);
  writeFileSync(path.join(dir, ".factory", "approvals.json"), '{"approvals":["mine"]}');
  writeFileSync(path.join(dir, ".factory", "business.json"), '{"price":900}');
  return dir;
}

const ME = { name: "Deniz", email: "deniz@example.com" };
const YOU = { name: "Ece", email: "ece@example.com" };

describe("team sharing through one Git repository", () => {
  it("accepts only plain repository addresses and hides credentials in them", () => {
    expect(validRemote(" https://github.com/ekip/musteriler.git ")).toBe("https://github.com/ekip/musteriler.git");
    expect(validRemote("git@github.com:ekip/musteriler.git")).toBe("git@github.com:ekip/musteriler.git");
    for (const bad of ["--upload-pack=touch /tmp/x", "http://github.com/a/b", "https://github.com/../etc", "ext::sh -c id", ""])
      expect(() => validRemote(bad)).toThrow(/Ekip deposu/);
    expect(safeRemote("https://user:ghp_secret@github.com/a/b.git")).toBe("https://github.com/a/b.git");
  });

  it("shares a client's inputs, never its approvals, and brings teammates' work and new clients", async () => {
    const remote = bareRepo();
    const mine = tmp("arke-team-a-");
    const yours = tmp("arke-team-b-");
    client(mine, "atlas-dis", "Atlas");

    const first = await syncTeam(mine, remote.url, ME);
    expect(first.pushed).toEqual(["atlas-dis"]);
    expect(await remoteClients(remote.url, { cwd: mine })).toEqual(["atlas-dis"]);
    const files = git(remote.dir, "ls-tree", "-r", "--name-only", "clients/atlas-dis").split("\n").filter(Boolean);
    expect(files).toEqual([".factory/business.json", "site.config.json", "site/index.html"]);
    expect(git(remote.dir, "log", "-1", "--format=%an", "clients/atlas-dis").trim()).toBe("Deniz");

    // A teammate's panel gets the client, changes the site, and sends it back.
    const got = await syncTeam(yours, remote.url, YOU);
    expect(got.added).toEqual(["atlas-dis"]);
    expect(existsSync(path.join(yours, "atlas-dis", ".factory", "approvals.json"))).toBe(false);
    writeFileSync(path.join(yours, "atlas-dis", "site", "index.html"), "<h1>Atlas Diş Kliniği</h1>");
    expect((await syncTeam(yours, remote.url, YOU)).pushed).toEqual(["atlas-dis"]);

    const back = await syncTeam(mine, remote.url, ME);
    expect(back.pulled).toEqual(["atlas-dis"]);
    expect(readFileSync(path.join(mine, "atlas-dis", "site", "index.html"), "utf8")).toBe("<h1>Atlas Diş Kliniği</h1>");
    expect(readFileSync(path.join(mine, "atlas-dis", ".factory", "approvals.json"), "utf8")).toContain("mine"); // untouched
    expect((await syncTeam(mine, remote.url, ME)).upToDate).toEqual(["atlas-dis"]);

    const status = await teamStatus(mine, remote.url);
    expect(status.clients[0]).toMatchObject({ slug: "atlas-dis", shared: true, ahead: 0, behind: 0, lastBy: "Ece" });
  });

  it("stops on a client two people changed, without losing either change, and skips a busy client", async () => {
    const remote = bareRepo();
    const mine = tmp("arke-team-c-");
    const yours = tmp("arke-team-d-");
    client(mine, "mavi-kapi", "Mavi");
    client(mine, "busy-co", "Busy");
    await syncTeam(mine, remote.url, ME);
    await syncTeam(yours, remote.url, YOU);
    writeFileSync(path.join(yours, "mavi-kapi", "site", "index.html"), "<h1>Ece</h1>");
    await syncTeam(yours, remote.url, YOU);
    writeFileSync(path.join(mine, "mavi-kapi", "site", "index.html"), "<h1>Deniz</h1>");
    const r = await syncTeam(mine, remote.url, ME, { busy: ["busy-co"] });
    expect(r.conflicts).toEqual(["mavi-kapi"]);
    expect(r.skipped).toEqual([{ slug: "busy-co", reason: "agent işi sürüyor" }]);
    expect(readFileSync(path.join(mine, "mavi-kapi", "site", "index.html"), "utf8")).toBe("<h1>Deniz</h1>");
    expect(git(remote.dir, "show", "clients/mavi-kapi:site/index.html")).toBe("<h1>Ece</h1>");
    expect(existsSync(path.join(mine, "mavi-kapi", ".git", "rebase-merge"))).toBe(false); // left clean
  });
});

describe("updating Arke Web Studio from the panel", () => {
  /** An "upstream" repository with a newer version, and an install cloned from it one version behind. */
  function installBehind() {
    const upstream = tmp("arke-up-");
    git(upstream, "init", "--quiet", "-b", "main");
    writeFileSync(path.join(upstream, "package.json"), JSON.stringify({ name: "arke-web-studio", version: "1.0.0" }));
    git(upstream, "add", "-A");
    git(upstream, "commit", "--quiet", "-m", "1.0.0");
    const install = path.join(tmp("arke-inst-"), "arke-web-studio");
    git(path.dirname(install), "clone", "--quiet", upstream, install);
    writeFileSync(path.join(upstream, "package.json"), JSON.stringify({ name: "arke-web-studio", version: "1.1.0" }));
    git(upstream, "commit", "--quiet", "-am", "1.1.0");
    return { upstream, install };
  }

  it("tells a zip install to use the command, and a git install what is new", async () => {
    const zipInstall = tmp("arke-zip-");
    writeFileSync(path.join(zipInstall, "package.json"), JSON.stringify({ version: "1.0.0" }));
    expect((await checkForUpdate(zipInstall)).mode).toBe("zip");
    const { install } = installBehind();
    const s = await checkForUpdate(install);
    expect(s).toMatchObject({ mode: "git", current: "1.0.0", latest: "1.1.0", behind: 1, dirty: false });
  });

  it("refuses to update over local changes, and updates step by step otherwise", async () => {
    resetUpdateProgress();
    const { install } = installBehind();
    writeFileSync(path.join(install, "package.json"), JSON.stringify({ name: "arke-web-studio", version: "1.0.0-local" }));
    await expect(applyUpdate(install)).rejects.toThrow(/kaydedilmemiş değişiklikler/);
    git(install, "checkout", "--", "package.json");
    const calls: string[] = [];
    // git runs for real; npm is stood in for (no packages to install in a test).
    const { run } = await import("../src/lib/exec.js");
    const runner = async (cmd: string, args: readonly string[], o: Parameters<typeof run>[2]) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      return cmd === "npm" ? { code: 0, stdout: "", stderr: "" } : run(cmd, args, o);
    };
    await applyUpdate(install, { run: runner });
    for (let i = 0; i < 100 && updateProgress().running; i++) await new Promise((r) => setTimeout(r, 20));
    expect(updateProgress()).toMatchObject({ done: true, error: null, from: "1.0.0", to: "1.1.0" });
    expect(calls.filter((c) => !c.startsWith("git rev") && !c.startsWith("git status") && !c.startsWith("git show") && !c.startsWith("git fetch"))).toEqual([
      "git pull --ff-only --quiet",
      "npm ci --no-fund --no-audit",
      "npm run build",
    ]);
    await expect(applyUpdate(install, { run: runner })).rejects.toThrow(/zaten güncel/);
  });
});
