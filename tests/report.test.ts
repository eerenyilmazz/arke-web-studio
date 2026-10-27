import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/core/paths.js";
import { buildReport, mask } from "../src/panel/report.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, tempFactory, writePassingCustomSite } from "./helpers.js";

const TOKEN = "cf_tok_ABCDEFGH12345678";
const env = { ARKE_CF_MANAGED_API_TOKEN: TOKEN, ARKE_CF_MANAGED_ACCOUNT_ID: "acc-1" };

async function factoryWithClient() {
  process.env.ARKE_PORTAL_CONFIG_DIR = mkdtempSync(path.join(os.tmpdir(), "arke-report-portal-")); // no portal
  const f = { ...tempFactory(), defaultTemplate: "custom" };
  await tools.createClient(f, { slug: "bake-co", businessName: "Bake Co", industry: "bakery", hostingModel: "managed", template: "custom" });
  tools.updateClientConfig(f, { slug: "bake-co", patch: COMPLETE_PATCH });
  tools.saveContent(f, { slug: "bake-co", locale: "en", content: COMPLETE_CONTENT });
  writePassingCustomSite(f, "bake-co", "Bake Co");
  return f;
}

describe("factory report", () => {
  it("never writes a secret, and masks bearer tokens and exported credentials", () => {
    expect(mask(`token ${TOKEN} and Bearer abcdefghijklmnopqrst and API_TOKEN="zzzzzzzzzz"`, [TOKEN])).toBe('token *** and Bearer *** and API_TOKEN="***"');
  });

  it("reports a healthy client: own approvals, no agent deploy, no secret in client files", async () => {
    const f = await factoryWithClient();
    const p = clientPaths(f.clientsRoot, "bake-co");
    mkdirSync(p.factoryDir, { recursive: true });
    appendFileSync(p.auditLog, `${JSON.stringify({ ts: "2026-10-18T10:00:00Z", runId: "r", tool: "write_site_file", ok: true, ms: 3, args: {} })}\n`);
    const { markdown, checks } = await buildReport(f, { network: false, env, username: "eren" });
    expect(markdown).toContain("# Arke Web Studio raporu");
    expect(markdown).toContain("Bake Co (bake-co)");
    expect(markdown).not.toContain(TOKEN);
    expect(checks.filter((c) => c.verdict === "fail")).toEqual([]);
    expect(checks.map((c) => c.text)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Agent hiç yayın yapmadı/), expect.stringMatching(/hiçbir gizli anahtar yok/)]),
    );
  });

  it("fails when a secret sits in a client file, the agent called deploy or used a forbidden tool", async () => {
    const f = await factoryWithClient();
    const p = clientPaths(f.clientsRoot, "bake-co");
    mkdirSync(p.factoryDir, { recursive: true });
    writeFileSync(path.join(p.root, "notes.md"), `pasted by mistake: ${TOKEN}`);
    appendFileSync(p.auditLog, `${JSON.stringify({ ts: "2026-10-18T10:00:00Z", runId: "r", tool: "deploy", ok: false, ms: 3, args: {}, error: "denied" })}\n`);
    appendFileSync(
      path.join(p.factoryDir, "jobs.jsonl"),
      `${JSON.stringify({ id: "1", kind: "revise", title: "Değişiklik", startedAt: "2026-10-18T10:00:00Z", endedAt: "2026-10-18T10:01:00Z", status: "succeeded", tools: ["Bash(ls)"], errors: [] })}\n`,
    );
    const { markdown, checks } = await buildReport(f, { network: false, env, username: "eren" });
    const fails = checks
      .filter((c) => c.verdict === "fail")
      .map((c) => c.text)
      .join("\n");
    expect(fails).toMatch(/notes\.md/);
    expect(fails).toMatch(/deploy aracını çağırmış/);
    expect(fails).toMatch(/yasak araç kullandı: Bash/);
    expect(markdown).not.toContain(TOKEN);
  });

  it("checks the published addresses only when the network is allowed", async () => {
    const f = await factoryWithClient();
    const p = clientPaths(f.clientsRoot, "bake-co");
    mkdirSync(p.factoryDir, { recursive: true });
    writeFileSync(
      path.join(p.factoryDir, tools.DEPLOYS_FILE),
      JSON.stringify({ preview: { url: "https://bake-co-preview.example.workers.dev", at: "2026-10-18T10:00:00Z" } }),
    );
    const seen: string[] = [];
    const down = async (url: string) => {
      seen.push(url);
      return { status: 503 };
    };
    expect((await buildReport(f, { network: false, env, username: "eren", fetcher: down })).markdown).not.toContain("Canlı kontrol");
    const { markdown, checks } = await buildReport(f, { network: true, env, username: "eren", fetcher: down });
    expect(seen).toEqual(["https://bake-co-preview.example.workers.dev"]);
    expect(markdown).toContain("AÇILMIYOR");
    expect(checks.some((c) => c.verdict === "warn" && /açılmıyor/.test(c.text))).toBe(true);
  });
});
