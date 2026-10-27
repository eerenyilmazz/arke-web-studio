// Panel API tests: backups, token budget, profit, translation jobs and business tracking.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../../src/lib/core/paths.js";
import { fakeSpawn, withSite, start, waitFor, usePanelCleanup, type SpawnCall } from "./harness.js";
import path from "node:path";
import * as tools from "../../src/tools.js";

usePanelCleanup();

describe("backups", () => {
  it("refuses a bad folder, writes a .tar.gz of the clients and lists it", async () => {
    const { base, auth, factory } = await start();
    const json = { ...auth, "Content-Type": "application/json" };
    expect((await fetch(`${base}/api/backups`, { method: "POST", headers: auth })).status).toBe(400);
    expect((await fetch(`${base}/api/settings`, { method: "PUT", headers: json, body: JSON.stringify({ backupDir: "relative/dir" }) })).status).toBe(400);
    expect((await fetch(`${base}/api/settings`, { method: "PUT", headers: json, body: JSON.stringify({ backupDir: factory.clientsRoot }) })).status).toBe(400);
    const os = await import("node:os");
    const { mkdtempSync } = await import("node:fs");
    const dir = mkdtempSync(path.join(os.tmpdir(), "arke-backup-"));
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "keep-me", businessName: "Keep", industry: "bakery", hostingModel: "managed" }),
    });
    expect((await fetch(`${base}/api/settings`, { method: "PUT", headers: json, body: JSON.stringify({ backupDir: dir }) })).status).toBe(200);
    const r = await fetch(`${base}/api/backups`, { method: "POST", headers: auth });
    expect(r.status).toBe(201);
    const { file } = (await r.json()) as { file: string };
    expect(file).toMatch(/^arke-web-studio-yedek-.*\.tar\.gz$/);
    const listed = (await (await fetch(`${base}/api/backups`, { headers: auth })).json()) as { backups: { file: string }[] };
    expect(listed.backups[0]!.file).toBe(file);
    const { execFileSync } = await import("node:child_process");
    expect(execFileSync("tar", ["-tzf", path.join(dir, file)]).toString()).toMatch(/keep-me\/site\.config\.json/);
  });
});

describe("token budget", () => {
  const usage = (input: number, output: number, cacheRead = 0) => ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: 0,
  });
  it("counts each message once, records the job in the ledger, and uses the client's mode", async () => {
    const calls: SpawnCall[] = [];
    const events = [
      { type: "assistant", message: { id: "m1", usage: usage(1000, 200, 5000), content: [{ type: "text", text: "a" }] } },
      {
        type: "assistant",
        message: { id: "m1", usage: usage(1000, 200, 5000), content: [{ type: "tool_use", name: "mcp__arke-web__get_client_status", input: {} }] },
      },
      { type: "result", subtype: "success", result: "ok", usage: usage(1000, 300, 5000), total_cost_usd: 0.0123 },
    ];
    const { base, auth, factory } = await start(fakeSpawn(calls, events));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "cheap-co", businessName: "Cheap", industry: "bakery", hostingModel: "managed" }),
    });
    await fetch(`${base}/api/clients/cheap-co/business`, { method: "PUT", headers: json, body: JSON.stringify({ budgetMode: "economy" }) });
    withSite(factory, "cheap-co"); // a change job needs a site to change
    const res = await fetch(`${base}/api/clients/cheap-co/agent/revise`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ request: "Başlığı kısalt" }),
    });
    expect(res.status).toBe(202);
    const call = calls[0]!;
    expect(call.args[call.args.indexOf("--model") + 1]).toBe("haiku");
    expect(call.args[call.args.indexOf("--max-turns") + 1]).toBe("30");
    await waitFor(async () => !((await (await fetch(`${base}/api/meta`, { headers: auth })).json()) as { running: unknown }).running);
    const u = (await (await fetch(`${base}/api/usage`, { headers: auth })).json()) as {
      monthTokens: number;
      monthJobs: number;
      byClient: Record<string, { tokens: number; costUsd: number }>;
    };
    // 1000 + 300 + 5000/10 = 1800 weighted tokens, from Claude's final totals.
    expect(u.monthTokens).toBe(1800);
    expect(u.byClient["cheap-co"]!.costUsd).toBeCloseTo(0.0123);
    const detail = (await (await fetch(`${base}/api/clients/cheap-co`, { headers: auth })).json()) as {
      history: Array<{ tokens: number; model: string }>;
      budget: { mode: string };
    };
    expect(detail.history.at(-1)!.tokens).toBe(1800);
    expect(detail.history.at(-1)!.model).toBe("haiku");
    expect(detail.budget.mode).toBe("economy");

    // Monthly budget used up: new agent jobs are refused with a plain message.
    await fetch(`${base}/api/settings`, { method: "PUT", headers: json, body: JSON.stringify({ budget: { mode: "balanced", monthlyTokens: 1000 } }) });
    const blocked = await fetch(`${base}/api/clients/cheap-co/agent/revise`, { method: "POST", headers: json, body: JSON.stringify({ request: "x" }) });
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/bütçesi doldu/);
    void factory;
  });

  it("sends a request typed before there is a site to the site preparation, with everything given before", async () => {
    const calls: SpawnCall[] = [];
    const { base, auth } = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "early-co", businessName: "Early", industry: "bakery", hostingModel: "managed" }),
    });
    const job = (await (
      await fetch(`${base}/api/clients/early-co/agent/revise`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ request: "Renkler uygun, sormadan devam." }),
      })
    ).json()) as { title: string };
    expect(job.title).toBe("Siteyi hazırla");
    expect(calls[0]!.stdin).toMatch(/Prepare this client's website/);
    expect(calls[0]!.stdin).toContain("Renkler uygun, sormadan devam.");
    expect(calls[0]!.stdin).toContain('pass slug "early-co" to every tool call');
  });

  it("stops a job that passes its token cap", async () => {
    const calls: SpawnCall[] = [];
    const big = [{ type: "assistant", message: { id: "big", usage: usage(500_000, 1000), content: [{ type: "text", text: "çok" }] } }];
    const { base, auth, factory } = await start(fakeSpawn(calls, big));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "cap-co", businessName: "Cap", industry: "bakery", hostingModel: "managed" }),
    });
    withSite(factory, "cap-co");
    const job = (await (
      await fetch(`${base}/api/clients/cap-co/agent/revise`, { method: "POST", headers: json, body: JSON.stringify({ request: "x" }) })
    ).json()) as { id: string };
    await waitFor(async () => ((await (await fetch(`${base}/api/jobs/${job.id}`, { headers: auth })).json()) as { status: string }).status !== "running");
    const done = (await (await fetch(`${base}/api/jobs/${job.id}`, { headers: auth })).json()) as { status: string; log: Array<{ text: string }> };
    expect(done.status).toBe("failed");
    expect(done.log.map((l) => l.text).join("\n")).toMatch(/token tavanı aşıldı/);
  });
});

describe("1.14: profit, translation job, agent settings", () => {
  it("saves own costs, reports profit, starts a translation job and refuses a bad model name", async () => {
    const calls: SpawnCall[] = [];
    const { base, auth, factory } = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "ok" }]));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "two-lang", businessName: "Two Lang", industry: "barber shop", hostingModel: "managed", country: "TR", extraLocale: "en" }),
    });
    tools.updateClientConfig(factory, { slug: "two-lang", patch: { template: "custom" } });
    const saved = await fetch(`${base}/api/clients/two-lang/business`, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ price: 8000, currency: "TRY", payment: "quoted", costs: [{ label: "Alan adı", amount: 450 }] }),
    });
    expect(saved.status).toBe(200);
    const profit = (await (await fetch(`${base}/api/profit`, { headers: auth })).json()) as {
      clients: Array<{ slug: string; profit: number | null; extraCosts: number }>;
      totals: Record<string, { price: number }>;
    };
    expect(profit.clients.find((c) => c.slug === "two-lang")).toMatchObject({ extraCosts: 450, profit: 7550 });
    expect(profit.totals.TRY?.price).toBe(8000);
    const detail = (await (await fetch(`${base}/api/clients/two-lang`, { headers: auth })).json()) as { profit: { price: number } };
    expect(detail.profit.price).toBe(8000);
    // Not before the site has built: there are no finished pages to translate yet.
    const early = await fetch(`${base}/api/clients/two-lang/agent/translate`, { method: "POST", headers: json, body: "{}" });
    expect(early.status).toBe(409);
    expect(((await early.json()) as { error: string }).error).toMatch(/Önce site tamamlanmalı/);
    const build = clientPaths(factory.clientsRoot, "two-lang").buildRecord;
    mkdirSync(path.dirname(build), { recursive: true });
    writeFileSync(build, JSON.stringify({ hash: "h", at: new Date().toISOString(), passed: true, failures: [] }));
    const tr = await fetch(`${base}/api/clients/two-lang/agent/translate`, { method: "POST", headers: json, body: "{}" });
    expect(tr.status).toBe(202);
    expect(calls[0]!.stdin).toMatch(/Add these languages: en/);
    expect(
      (
        await fetch(`${base}/api/settings`, {
          method: "PUT",
          headers: json,
          body: JSON.stringify({ agents: { edit: { provider: "codex", model: "a b", maxTurns: 0, tokenCap: 0 } } }),
        })
      ).status,
    ).toBe(400);
  });
});

describe("translation after a design job", () => {
  it("starts only when the design job ended with a passing build, not when it stopped to ask questions", async () => {
    const calls: SpawnCall[] = [];
    const { base, auth, factory } = await start(fakeSpawn(calls, [{ type: "result", subtype: "success", result: "Eksikler: logo?" }]));
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "ask-first", businessName: "Ask First", industry: "software", hostingModel: "managed", country: "TR", extraLocale: "en" }),
    });
    tools.updateClientConfig(factory, { slug: "ask-first", patch: { template: "custom" } });
    const paths = clientPaths(factory.clientsRoot, "ask-first");
    mkdirSync(path.join(paths.root, "site"), { recursive: true });
    writeFileSync(path.join(paths.root, "site", "index.html"), "<!doctype html><title>x</title>"); // e.g. a library design's files
    const idle = () =>
      waitFor(async () => ((await (await fetch(`${base}/api/clients/ask-first`, { headers: auth })).json()) as { running: unknown }).running === null);

    await fetch(`${base}/api/clients/ask-first/agent/create-site`, { method: "POST", headers: json, body: JSON.stringify({ freeText: "Yazılım firması." }) });
    await idle();
    await new Promise((r) => setTimeout(r, 600));
    expect(calls).toHaveLength(1); // no build in that job: no translation

    // A design job that built the site: the translation follows.
    // (The record is written ahead, dated just after the job's start, as build_site inside that job would.)
    mkdirSync(path.dirname(paths.buildRecord), { recursive: true });
    writeFileSync(paths.buildRecord, JSON.stringify({ hash: "h", at: new Date(Date.now() + 1000).toISOString(), passed: true, failures: [] }));
    await fetch(`${base}/api/clients/ask-first/agent/create-site`, { method: "POST", headers: json, body: "{}" });
    await idle();
    await waitFor(async () => calls.length === 3);
    expect(calls[2]!.stdin).toMatch(/Add these languages: en/);
  });
});

describe("business tracking", () => {
  it("saves quote, payment and deadline per client, validates them, and lists them for the dashboard", async () => {
    const { base, auth } = await start();
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "uzunoglu", businessName: "Uzunoğlu", industry: "pickle shop", hostingModel: "managed", country: "TR" }),
    });
    const ok = await fetch(`${base}/api/clients/uzunoglu/business`, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ price: 4000, currency: "TRY", payment: "deposit", deadline: "2026-10-30", note: "Kapora 1000" }),
    });
    expect(ok.status).toBe(200);
    const bad = await fetch(`${base}/api/clients/uzunoglu/business`, { method: "PUT", headers: json, body: JSON.stringify({ payment: "maybe" }) });
    expect(bad.status).toBe(400);
    const list = (await (await fetch(`${base}/api/clients`, { headers: auth })).json()) as {
      clients: { slug: string; name: string; business: { price: number; payment: string } }[];
    };
    expect(list.clients[0]).toMatchObject({ slug: "uzunoglu", name: "Uzunoğlu", business: { price: 4000, payment: "deposit" } });
  });
});

describe("extras in Business Tracking", () => {
  it("adds a sold second language to the site's languages, and never removes one", async () => {
    const { base, auth, factory } = await start();
    const json = { ...auth, "Content-Type": "application/json" };
    await fetch(`${base}/api/clients`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ slug: "two-lang", businessName: "Two Lang", industry: "bakery", hostingModel: "managed" }),
    });
    const put = (addons: unknown) =>
      fetch(`${base}/api/clients/two-lang/business`, { method: "PUT", headers: json, body: JSON.stringify({ price: 900, addons }) });
    expect((await put([{ id: "language", value: "de", price: 200 }])).status).toBe(200);
    const locales = () =>
      (JSON.parse(readFileSync(path.join(factory.clientsRoot, "two-lang", "site.config.json"), "utf8")) as { i18n: { locales: string[] } }).i18n.locales;
    expect(locales()).toEqual(["en", "de"]);
    expect((await put([])).status).toBe(200);
    expect(locales()).toEqual(["en", "de"]); // un-ticking keeps the language and its pages
    expect((await put([{ id: "nope" }])).status).toBe(400);
  });
});
