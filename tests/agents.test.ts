import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { PassThrough } from "node:stream";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { describe, expect, it } from "vitest";
import { jobGroup, recordUsage, resolvePolicy } from "../src/panel/budget.js";
import { CODEX_DISABLED_FEATURES, codexArgs, JobRunner } from "../src/panel/jobs.js";
import { clientProfit, entryUsd } from "../src/panel/profit.js";
import { writeBusiness } from "../src/panel/business.js";
import { writeSettings } from "../src/panel/settings.js";
import { finalPrompt } from "../src/panel/prompts.js";
import { tempFactory } from "./helpers.js";

describe("agent per kind of job (Claude Code or Codex)", () => {
  it("follows Eren's per-kind settings, else the package", () => {
    const f = tempFactory();
    expect(jobGroup("create-site")).toBe("design");
    expect(jobGroup("edit-text")).toBe("edit");
    expect(jobGroup("add-page")).toBe("page");
    expect(resolvePolicy(f, "x-co", "revise")).toMatchObject({ provider: "claude", model: "sonnet" });
    writeSettings(f, { agents: { edit: { provider: "codex", model: "", maxTurns: 0, tokenCap: 0 }, design: { provider: "claude", model: "haiku", maxTurns: 90, tokenCap: 2_000_000 } } });
    expect(resolvePolicy(f, "x-co", "revise")).toMatchObject({ provider: "codex", model: "" });
    expect(resolvePolicy(f, "x-co", "redesign")).toMatchObject({ provider: "claude", model: "haiku", maxTurns: 90, tokenCap: 2_000_000 });
    // A Claude model name is not passed to Codex.
    writeSettings(f, { agents: { edit: { provider: "codex", model: "sonnet", maxTurns: 0, tokenCap: 0 } } });
    expect(resolvePolicy(f, "x-co", "revise").model).toBe("");
    expect(() => writeSettings(f, { agents: { edit: { provider: "codex", model: "gpt; rm -rf /", maxTurns: 0, tokenCap: 0 } } })).toThrow();
  });

  it("runs Codex read-only, without shell, browser or plugins, with only the site-factory server", () => {
    const args = codexArgs({ factoryRoot: "/f", workDir: "/tmp/w", model: "gpt-x", web: false });
    const joined = args.join(" ");
    expect(args.slice(0, 2)).toEqual(["exec", "--json"]);
    expect(joined).toContain("-s read-only");
    expect(joined).toContain('approval_policy="never"');
    expect(joined).toContain("--ignore-user-config");
    for (const f of ["shell_tool", "unified_exec", "browser_use", "computer_use", "apps", "plugins", "hooks", "multi_agent"]) {
      expect(CODEX_DISABLED_FEATURES).toContain(f);
      expect(joined).toContain(`--disable ${f}`);
    }
    expect(joined).toContain('mcp_servers.site-factory.args=["/f/dist/server.js"]');
    expect(joined).not.toMatch(/dangerously|danger-full-access|workspace-write/);
    expect(args).not.toContain("--search");
    expect(codexArgs({ factoryRoot: "/f", workDir: "/tmp/w", web: true })).toContain("--search");
    expect(args.at(-1)).toBe("-");
    expect(finalPrompt("Do it.", { skills: "search", screenshots: true, provider: "codex" })).toMatch(/^You are running in Codex/);
  });

  it("reads Codex events: tool calls, the final message and usage; cleans up its empty workspace", async () => {
    const calls: Array<{ command: string; args: readonly string[]; options: SpawnOptions }> = [];
    const spawn = (command: string, args: readonly string[], options: SpawnOptions): ChildProcess => {
      calls.push({ command, args, options });
      const child = new EventEmitter() as ChildProcess;
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      Object.assign(child, { stdin, stdout, stderr: new PassThrough(), kill: () => true });
      stdin.on("finish", () => {
        for (const e of [
          { type: "thread.started", thread_id: "t" },
          { type: "item.started", item: { id: "1", type: "mcp_tool_call", server: "site-factory", tool: "write_site_file", arguments: { path: "index.html" }, status: "in_progress" } },
          { type: "item.completed", item: { id: "1", type: "mcp_tool_call", server: "site-factory", tool: "write_site_file", status: "completed" } },
          { type: "item.completed", item: { id: "2", type: "agent_message", text: "Başlık değişti." } },
          { type: "turn.completed", usage: { input_tokens: 12000, cached_input_tokens: 10000, output_tokens: 800 } },
        ]) stdout.write(`${JSON.stringify(e)}\n`);
        stdout.end();
        setTimeout(() => child.emit("close", 0), 10);
      });
      return child;
    };
    const runner = new JobRunner("/f", spawn, "claude", () => undefined, () => false, [], "codex");
    const job = runner.startAgent("x-co", "revise", "Değişiklik", "prompt", "req", { mode: "balanced", provider: "codex", model: "", maxTurns: 40, tokenCap: 400_000, skills: "search", research: false, screenshots: false });
    await new Promise((r) => setTimeout(r, 80));
    expect(calls[0]!.command).toBe("codex");
    expect(job.status).toBe("succeeded");
    expect(job.summary).toBe("Başlık değişti.");
    expect(job.usage).toMatchObject({ input: 2000, cacheRead: 10000, output: 800 });
    expect(job.log.some((l) => l.kind === "tool" && l.text.startsWith("write_site_file"))).toBe(true);
    expect(job.provider).toBe("codex");
    expect(existsSync(String(calls[0]!.options.cwd))).toBe(false);
  });
});

describe("profit per client", () => {
  it("price − own costs − agent cost, with Claude's cost and Codex priced per million units", () => {
    const f = tempFactory();
    writeBusiness(f, "p-co", { price: 10000, currency: "TRY", costs: [{ label: "Alan adı", amount: 500 }] });
    const at = new Date().toISOString();
    recordUsage(f, { at, slug: "p-co", kind: "autopilot", mode: "balanced", model: "opus", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costUsd: 3 }, tokens: 2 });
    recordUsage(f, { at, slug: "p-co", kind: "revise", mode: "balanced", model: "", usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, tokens: 1_000_000, provider: "codex" });
    let p = clientProfit(f, "p-co");
    expect(p.agentUsd).toBe(3);
    expect(p.agentCost).toBeNull();
    expect(p.profit).toBeNull();
    writeSettings(f, { profit: { usdRates: { TRY: 40, GBP: 0, EUR: 0 }, usdPerMillionUnits: 2 } });
    p = clientProfit(f, "p-co");
    expect(p.agentUsd).toBe(5);
    expect(p.agentCost).toBe(200);
    expect(p.profit).toBe(9300);
    expect(entryUsd({ at, slug: "p-co", kind: "x", mode: "balanced", model: "", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, tokens: 500_000 }, 2)).toBe(1);
  });
});
