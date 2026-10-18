import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../src/schema/questions.js";
import { QUESTIONS_TR, localizedQuestion } from "../src/schema/questions-tr.js";
import { buildQuestionnaire } from "../src/lib/questionnaire.js";
import { clientPaths } from "../src/lib/paths.js";
import { backupNow, restoreBackup, verifyBackup } from "../src/panel/backup.js";
import { ENGLISH_NOTES, finalPrompt } from "../src/panel/prompts.js";
import { readSettings, writeSettings } from "../src/panel/settings.js";
import { JobRunner, toRecord } from "../src/panel/jobs.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate, tempFactory } from "./helpers.js";

type Runner = Parameters<typeof tools.rollback>[2];

describe("live site rollback (panel only)", () => {
  async function client() {
    const f = tempFactory();
    installStubTemplate(f.templatesDir);
    await tools.createClient(f, { slug: "back-co", businessName: "Back Co", industry: "bakery", hostingModel: "managed" });
    tools.updateClientConfig(f, { slug: "back-co", patch: COMPLETE_PATCH });
    tools.saveContent(f, { slug: "back-co", locale: "en", content: COMPLETE_CONTENT });
    return f;
  }

  it("asks wrangler for the previous version of exactly that Worker and records who did it", async () => {
    const f = await client();
    const calls: Array<{ args: readonly string[]; env?: Record<string, string> }> = [];
    const fake = (async (_cmd: string, args: readonly string[], opts: { env?: Record<string, string> }) => {
      calls.push({ args, env: opts.env });
      return { code: 0, stdout: "Worker Version ... has been deployed to 100% of traffic.", stderr: "" };
    }) as unknown as Runner;
    process.env.SF_CF_MANAGED_API_TOKEN = "test-token";
    process.env.SF_CF_MANAGED_ACCOUNT_ID = "test-account";
    try {
      const r = await tools.rollback(f, { slug: "back-co", target: "production", by: "eren" }, fake);
      expect(r).toMatchObject({ target: "production", worker: "sf-back-co" });
      expect(calls[0]!.args.slice(1)).toEqual(["rollback", "--name", "sf-back-co", "--message", "Site Factory: rolled back by eren", "--yes"]);
      expect(calls[0]!.env?.CLOUDFLARE_API_TOKEN).toBe("test-token");
      const deploys = JSON.parse(readFileSync(path.join(clientPaths(f.clientsRoot, "back-co").factoryDir, tools.DEPLOYS_FILE), "utf8"));
      expect(deploys.production).toMatchObject({ rolledBackBy: "eren" });
      expect(typeof deploys.production.rolledBackAt).toBe("string");

      // Only one version on Cloudflare: a clear message, and nothing is recorded as rolled back.
      const only = (async () => ({ code: 1, stdout: "", stderr: "Cannot rollback: there is no previous version" })) as unknown as Runner;
      await expect(tools.rollback(f, { slug: "back-co", target: "preview", by: "eren" }, only)).rejects.toMatchObject({
        hint: expect.stringMatching(/no earlier version/),
      });
      const after = JSON.parse(readFileSync(path.join(clientPaths(f.clientsRoot, "back-co").factoryDir, tools.DEPLOYS_FILE), "utf8"));
      expect(after.preview).toBeUndefined();
    } finally {
      delete process.env.SF_CF_MANAGED_API_TOKEN;
      delete process.env.SF_CF_MANAGED_ACCOUNT_ID;
    }
    await expect(
      tools.rollback(f, { slug: "back-co", target: "preview", by: "eren" }, (async () => ({ code: 0, stdout: "", stderr: "" })) as never),
    ).rejects.toThrow(/No Cloudflare credentials/);
  });

  it("is not an agent tool: the MCP server never mentions it", () => {
    const server = readFileSync(path.join(import.meta.dirname, "..", "src", "server.ts"), "utf8");
    expect(server).not.toMatch(/rollback|undeploy/i);
  });
});

describe("backup check and restore", () => {
  it("proves a backup opens, and restores only into a new folder", async () => {
    const f = tempFactory();
    await tools.createClient(f, { slug: "keep-me", businessName: "Keep", industry: "bakery", hostingModel: "managed" });
    const dir = mkdtempSync(path.join(os.tmpdir(), "sf-backup-"));
    writeSettings(f, { backupDir: dir });
    const { file } = await backupNow(f);

    const check = await verifyBackup(f, file);
    expect(check).toMatchObject({ ok: true, clients: ["keep-me"], problems: [] });
    expect(check.files).toBeGreaterThan(0);
    await expect(verifyBackup(f, "../../etc/passwd")).rejects.toThrow(/Geçersiz yedek adı/);

    const target = path.join(mkdtempSync(path.join(os.tmpdir(), "sf-restore-")), "restored");
    const restored = await restoreBackup(f, path.join(dir, file), target);
    expect(restored.ok).toBe(true);
    expect(existsSync(path.join(target, path.basename(f.clientsRoot), "keep-me", "site.config.json"))).toBe(true);
    // Never over something that exists, the live clients folder included.
    await expect(restoreBackup(f, path.join(dir, file), target)).rejects.toThrow(/zaten var/);
    await expect(restoreBackup(f, path.join(dir, file), f.clientsRoot)).rejects.toThrow(/zaten var/);
  });

  it("reports a broken backup instead of claiming it is fine", async () => {
    const f = tempFactory();
    const dir = mkdtempSync(path.join(os.tmpdir(), "sf-backup-"));
    writeSettings(f, { backupDir: dir });
    const src = mkdtempSync(path.join(os.tmpdir(), "sf-bad-"));
    const client = path.join(src, path.basename(f.clientsRoot), "bad-co");
    mkdirSync(client, { recursive: true });
    writeFileSync(path.join(client, "site.config.json"), "{ not json");
    const name = "site-factory-yedek-2026-10-18-0000.tar.gz";
    execFileSync("tar", ["-czf", path.join(dir, name), "-C", src, path.basename(f.clientsRoot)]);
    const check = await verifyBackup(f, name);
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toMatch(/bad-co: site\.config\.json okunamıyor/);
  });
});

describe("second language", () => {
  it("has a Turkish wording for every client question", () => {
    const client = QUESTIONS.filter((q) => q.audience === "client").map((q) => q.id);
    expect(client.filter((id) => !QUESTIONS_TR[id])).toEqual([]);
    const q = QUESTIONS.find((x) => x.id === "business-name")!;
    expect(localizedQuestion(q, "tr").text).toMatch(/İşletmenizin adı/);
    expect(localizedQuestion(q, "en").text).toBe(q.text);
  });

  it("writes the questionnaire in the client's language", () => {
    const tr = buildQuestionnaire({ businessName: "Bella", round: 1, industry: "kuaför", lang: "tr" });
    expect(tr.markdown).toMatch(/İşletmenizin adı/);
    expect(tr.markdown).toMatch(/Gerekli/);
    expect(tr.markdown).not.toMatch(/What is your business name/);
    const en = buildQuestionnaire({ businessName: "Bella", round: 1, industry: "barber", lang: "en" });
    expect(en.markdown).toMatch(/business name/i);
    expect(en.questionIds).toEqual(tr.questionIds);
  });

  it("keeps the panel language as a setting, Turkish by default", () => {
    const f = tempFactory();
    expect(readSettings(f).panelLanguage).toBe("tr");
    expect(writeSettings(f, { panelLanguage: "en" }).panelLanguage).toBe("en");
    expect(readSettings(f).webResearch).toBe(true); // other settings untouched
    expect(() => writeSettings(f, { panelLanguage: "de" })).toThrow();
  });

  it("asks the agent for English notes only when the panel is English", () => {
    const base = { skills: "none" as const, screenshots: true };
    expect(finalPrompt("Do the job.", base)).not.toContain(ENGLISH_NOTES);
    expect(finalPrompt("Do the job.", { ...base, panelLanguage: "tr" })).not.toContain(ENGLISH_NOTES);
    const en = finalPrompt("Do the job.", { ...base, panelLanguage: "en" });
    expect(en).toContain(ENGLISH_NOTES);
    expect(ENGLISH_NOTES).toMatch(/site texts stay in the site's own languages/);
  });
});

describe("who did it", () => {
  it("records the computer user on every job", async () => {
    const f = tempFactory();
    await tools.createClient(f, { slug: "who-co", businessName: "Who", industry: "bakery", hostingModel: "managed" });
    const runner = new JobRunner(f.clientsRoot);
    const job = runner.startTask("who-co", "build", "Build", async () => "ok");
    expect(toRecord(job).by).toBe(os.userInfo().username);
  });
});
