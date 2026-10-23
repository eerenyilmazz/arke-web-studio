import { clientAnalytics } from "../analytics.js";
import { profitSummary } from "../profit.js";
import { productList } from "../../products/registry.js";
import { cloudflareAccountStatus, markCloudflareVerified, removeCloudflare, saveCloudflare, validateCloudflare } from "../../lib/accounts.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readSettings, writeSettings } from "../settings.js";
import { backupNow, checkBackupDir, listBackups, verifyBackup } from "../backup.js";
import { BUDGET_MODES, PACKAGE_LABELS, PROFILES, summarise } from "../budget.js";
import { ZodError } from "zod";
import { LOCALES } from "../../schema/site-config.js";
import * as tools from "../../tools.js";
import { HttpError, readJsonBody, sendJson } from "../http.js";
import { readHistory } from "../history.js";
import { serialiseJob } from "../jobs.js";
import { type ApiDeps, type Route, JSON_LIMIT } from "./common.js";

/** Panel-wide endpoints: jobs, settings, usage, profit, backups, Cloudflare status and meta. */
export const systemRoutes: Route[] = [
  { method: "GET", pattern: /^\/api\/profit$/, handler: (d, _r, res) => sendJson(res, 200, profitSummary(d.factory)) },
  {
    method: "GET",
    pattern: /^\/api\/analytics$/,
    handler: (d, _r, res) => sendJson(res, 200, { generatedAt: new Date().toISOString(), rows: clientAnalytics(d.factory) }),
  },
  {
    method: "GET",
    pattern: /^\/api\/usage$/,
    handler: (d, _r, res) =>
      sendJson(res, 200, {
        ...summarise(d.factory),
        mode: readSettings(d.factory).budget.mode,
        modes: BUDGET_MODES.map((m) => ({ id: m, label: PACKAGE_LABELS[m], ...PROFILES[m] })),
      }),
  },
  {
    method: "GET",
    pattern: /^\/api\/backups$/,
    handler: (d, _r, res) => {
      const dir = readSettings(d.factory).backupDir;
      sendJson(res, 200, { dir, backups: listBackups(dir) });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/backups$/,
    handler: async (d, _r, res) => {
      try {
        sendJson(res, 201, await backupNow(d.factory));
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/backups\/(arke-web-studio-yedek-[0-9-]+\.tar\.gz)\/verify$/,
    handler: async (d, _r, res, [file]) => {
      try {
        sendJson(res, 200, await verifyBackup(d.factory, file!));
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    },
  },
  { method: "GET", pattern: /^\/api\/jobs\/([0-9a-f-]{36})$/, handler: getJob },
  { method: "POST", pattern: /^\/api\/jobs\/([0-9a-f-]{36})\/cancel$/, handler: cancelJob },
  { method: "GET", pattern: /^\/api\/meta$/, handler: meta },
  { method: "GET", pattern: /^\/api\/settings$/, handler: (d, _r, res) => sendJson(res, 200, readSettings(d.factory)) },
  { method: "PUT", pattern: /^\/api\/settings$/, handler: putSettings },
  { method: "GET", pattern: /^\/api\/cloudflare$/, handler: (_d, _r, res) => sendJson(res, 200, tools.cloudflareStatus()) },
  {
    method: "POST",
    pattern: /^\/api\/cloudflare\/test$/,
    handler: async (d, _r, res) => {
      const r = await checkCloudflare(d, null);
      if (r.ok && cloudflareAccountStatus().source === "panel") markCloudflareVerified();
      sendJson(res, 200, r);
    },
  },
  { method: "GET", pattern: /^\/api\/products$/, handler: (_d, _r, res) => sendJson(res, 200, { products: productList() }) },
  // The person's own Cloudflare account (Ayarlar → Hesabım): only a masked summary ever leaves this process.
  { method: "GET", pattern: /^\/api\/account$/, handler: (_d, _r, res) => sendJson(res, 200, { cloudflare: cloudflareAccountStatus() }) },
  { method: "PUT", pattern: /^\/api\/account\/cloudflare$/, handler: saveAccount },
  {
    method: "DELETE",
    pattern: /^\/api\/account\/cloudflare$/,
    handler: (_d, _r, res) => {
      removeCloudflare();
      sendJson(res, 200, { cloudflare: cloudflareAccountStatus() });
    },
  },
];

async function putSettings(deps: ApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  if (typeof body.backupDir === "string" && body.backupDir.trim()) {
    try {
      body.backupDir = checkBackupDir(body.backupDir.trim(), deps.factory);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  try {
    sendJson(res, 200, writeSettings(deps.factory, body));
  } catch (error) {
    if (error instanceof ZodError) throw new HttpError(400, "Geçersiz ayar.");
    throw error;
  }
}

function meta(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { locales: LOCALES, running: deps.jobs.running() ? serialiseJob(deps.jobs.running()!, 0) : null, typicalSeconds: typicalSeconds(deps) });
}

/** Rough time a job of each kind takes here: median of recent successful runs across clients, else a default. */
const DEFAULT_SECONDS: Readonly<Record<string, number>> = {
  "create-site": 900,
  "upgrade-template": 900,
  revise: 240,
  "fix-build": 300,
  answers: 180,
  "design-content": 300,
  build: 60,
  deploy: 90,
  unpublish: 60,
  rollback: 30,
  concepts: 360,
  "quick-edit": 180,
  "brand-board": 300,
  redesign: 900,
  "from-library": 600,
  translate: 600,
  "new-plan": 300,
};
const RECENT_RUNS = 20;
function typicalSeconds(deps: ApiDeps): Record<string, number> {
  const byKind = new Map<string, number[]>();
  for (const c of tools.listClients(deps.factory).clients) {
    for (const r of readHistory(deps.factory, c.slug)) {
      if (r.status !== "succeeded") continue;
      const secs = (Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000;
      if (secs > 0) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), secs]);
    }
  }
  const out: Record<string, number> = { ...DEFAULT_SECONDS };
  for (const [kind, list] of byKind) {
    const recent = list.slice(-RECENT_RUNS).sort((a, b) => a - b);
    out[kind] = Math.round(recent[Math.floor(recent.length / 2)]!);
  }
  return out;
}

function getJob(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [id]: string[]): void {
  const job = deps.jobs.get(id!);
  if (!job) throw new HttpError(404, "İş bulunamadı.");
  const since = Number(new URL(req.url ?? "/", "http://x").searchParams.get("since") ?? 0);
  sendJson(res, 200, serialiseJob(job, Number.isFinite(since) && since >= 0 ? since : 0));
}

function cancelJob(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [id]: string[]): void {
  sendJson(res, 200, { cancelled: deps.jobs.cancel(id!) });
}

/** Cloudflare's answer for an account (the given one, or the one in use). */
function checkCloudflare(d: ApiDeps, account: { token: string; accountId: string } | null) {
  if (account && d.verifyCloudflare) return d.verifyCloudflare(account);
  return tools.cloudflareTest(d.factory, account);
}

/** Saves the person's Cloudflare account only after Cloudflare accepts it; the token is never sent back. */
async function saveAccount(d: ApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  let account: { token: string; accountId: string };
  try {
    account = validateCloudflare(body);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  const check = await checkCloudflare(d, account);
  if (!check.ok) throw new HttpError(400, `Kaydedilmedi: ${check.message}`);
  saveCloudflare(account, new Date().toISOString());
  sendJson(res, 200, { cloudflare: cloudflareAccountStatus(), message: check.message });
}
