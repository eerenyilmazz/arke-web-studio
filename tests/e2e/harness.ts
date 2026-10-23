import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { FactoryConfig } from "../../src/config.js";
import { FACTORY_ROOT } from "../../src/config.js";
import { createPanel, type Panel } from "../../src/panel/server.js";

/** Shared pieces of the end-to-end tests: the browser, a panel whose agent is the scripted fake, and polling. */
export type Browser = import("playwright-core").Browser;
export type Page = import("playwright-core").Page;

export const KEY = "e".repeat(64);
export const CODE = "482913";
const TSX = path.join(FACTORY_ROOT, "node_modules", ".bin", "tsx");
const FAKE_AGENT = path.join(FACTORY_ROOT, "tests", "e2e", "fake-agent.ts");
const JOB_MS = 120_000;
const POLL_MS = 300;

/** The newest Chromium that `npx playwright-core install chromium` downloaded (the README's step for WSL), or null. */
export function playwrightCacheBrowser(): string | null {
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return null;
  for (const dir of readdirSync(cache)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .reverse()) {
    for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const exe = path.join(cache, dir, sub);
      if (existsSync(exe)) return exe;
    }
  }
  return null;
}

/** A Linux Chromium for Playwright, or null (then the e2e tests are skipped). ARKE_E2E=off skips them on purpose. */
export function findBrowser(): string | null {
  if (process.env.ARKE_E2E === "off" || process.env.ARKE_UI_TESTS === "off") return null;
  if (existsSync("/opt/pw-browsers/chromium")) return "/opt/pw-browsers/chromium";
  const cached = playwrightCacheBrowser();
  if (cached) return cached;
  for (const c of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    try {
      const p = execFileSync("sh", ["-c", `command -v ${c}`], { encoding: "utf8" }).trim();
      if (p) return p;
    } catch {
      // not on PATH: try the next name
    }
  }
  return null;
}

export async function launchBrowser(executable: string | null): Promise<Browser | null> {
  if (!executable) return null;
  try {
    const { chromium } = await import("playwright-core");
    return await chromium.launch({ executablePath: executable, args: ["--no-sandbox"] });
  } catch {
    return null; // a browser that does not start is treated like no browser
  }
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export interface FakePanel {
  readonly panel: Panel;
  readonly base: string;
  /** The command line the panel built for each agent run (the arguments real Claude Code would get). */
  readonly agentRuns: Array<{ command: string; args: readonly string[] }>;
}

/** The real panel, with tests/e2e/fake-agent.ts started in place of `claude` (same arguments and environment). */
export async function startPanel(factory: FactoryConfig): Promise<FakePanel> {
  const agentRuns: FakePanel["agentRuns"] = [];
  const port = await freePort();
  const panel = createPanel({
    factory,
    port,
    previewPort: await freePort(),
    sessionKey: KEY,
    approvalCode: CODE,
    spawn: (command, args, options) => {
      agentRuns.push({ command, args });
      // The MCP server finds this test's folders through these; everything else is the panel's own environment.
      const env = { ...options.env, ARKE_CLIENTS_ROOT: factory.clientsRoot, ARKE_INBOX_DIR: factory.inboxDir, ARKE_TEMPLATES_DIR: factory.templatesDir };
      return nodeSpawn(TSX, [FAKE_AGENT, ...args], { ...options, env });
    },
  });
  await panel.listen();
  return { panel, base: `http://127.0.0.1:${port}`, agentRuns };
}

/** A logged-in panel page that records script errors; requests to other sites are blocked unless allowed. */
export async function openPanel(browser: Browser, base: string, hash: string, allow: RegExp | null = null): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\//, (r) => (r.request().url().startsWith(base) || allow?.test(r.request().url()) ? r.continue() : r.abort()));
  await page.goto(`${base}/login?key=${KEY}`);
  await page.goto(`${base}/${hash}`);
  await page.waitForSelector("#view h1", { timeout: 10_000 });
  return { page, errors };
}

export async function apiGet<T>(base: string, p: string): Promise<T> {
  const r = await fetch(`${base}${p}`, { headers: { Cookie: `arke_panel=${KEY}` } });
  return (await r.json()) as T;
}

export interface JobRecordView {
  readonly kind: string;
  readonly status: string;
  readonly summary?: string;
  readonly title: string;
}

/** Waits until the client has `count` finished jobs of this kind and returns the latest. */
export async function jobDone(base: string, slug: string, kind: string, count: number): Promise<JobRecordView> {
  const end = Date.now() + JOB_MS;
  while (Date.now() < end) {
    const d = await apiGet<{ history: JobRecordView[] }>(base, `/api/clients/${slug}`);
    const runs = d.history.filter((j) => j.kind === kind);
    if (runs.length >= count) return runs.at(-1)!;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const meta = await apiGet<{ running: { kind: string; status: string } | null }>(base, "/api/meta");
  const d = await apiGet<{ history: JobRecordView[] }>(base, `/api/clients/${slug}`);
  throw new Error(
    `${kind} job did not finish (running: ${JSON.stringify(meta.running)}; finished: ${d.history.map((j) => `${j.kind}/${j.status}`).join(", ")})`,
  );
}

/** Waits until no job runs, so the next job the test starts is not refused as "another job is running". */
export async function idle(base: string): Promise<void> {
  const end = Date.now() + JOB_MS;
  while (Date.now() < end) {
    const m = await apiGet<{ running: { status: string } | null }>(base, "/api/meta");
    if (!m.running || m.running.status !== "running") return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("a job kept running");
}
