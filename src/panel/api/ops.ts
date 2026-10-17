import { profitSummary } from "../profit.js";
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import os from "node:os";
import { addApproval, approvalPins, approvalTargets } from "../../lib/approvals.js";
import { clientStatus } from "../../lib/client.js";
import { readSettings, writeSettings } from "../settings.js";
import { backupNow, checkBackupDir, listBackups } from "../backup.js";
import { BUDGET_MODES, MODE_LABELS, PROFILES, summarise } from "../budget.js";
import { ZodError } from "zod";
import { assertSlug, clientPaths } from "../../lib/paths.js";
import { LOCALES } from "../../schema/site-config.js";
import * as tools from "../../tools.js";
import { HttpError, readJsonBody, sendJson, str } from "../http.js";
import { readHistory } from "../history.js";
import { serialiseJob } from "../jobs.js";
import { type ApiDeps, type Route, SLUG, JSON_LIMIT, runOrConflict } from "./common.js";

/** Jobs, build, deploy, preview, approvals, settings and other panel-wide endpoints. */
export const opsRoutes: Route[] = [
  { method: "GET", pattern: /^\/api\/profit$/, handler: (d, _r, res) => sendJson(res, 200, profitSummary(d.factory)) },
  { method: "GET", pattern: /^\/api\/usage$/, handler: (d, _r, res) => sendJson(res, 200, { ...summarise(d.factory), mode: readSettings(d.factory).budget.mode, modes: BUDGET_MODES.map((m) => ({ id: m, label: MODE_LABELS[m], ...PROFILES[m] })) }) },
  { method: "GET", pattern: /^\/api\/backups$/, handler: (d, _r, res) => { const dir = readSettings(d.factory).backupDir; sendJson(res, 200, { dir, backups: listBackups(dir) }); } },
  { method: "POST", pattern: /^\/api\/backups$/, handler: async (d, _r, res) => { try { sendJson(res, 201, await backupNow(d.factory)); } catch (e) { throw new HttpError(400, (e as Error).message); } } },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/build$`), handler: startBuild },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/deploy$`), handler: startDeploy },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/unpublish$`), handler: startUnpublish },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/preview$`), handler: showPreview },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/approve$`), handler: approveFromPanel },
  { method: "GET", pattern: /^\/api\/jobs\/([0-9a-f-]{36})$/, handler: getJob },
  { method: "POST", pattern: /^\/api\/jobs\/([0-9a-f-]{36})\/cancel$/, handler: cancelJob },
  { method: "GET", pattern: /^\/api\/meta$/, handler: meta },
  { method: "GET", pattern: /^\/api\/settings$/, handler: (d, _r, res) => sendJson(res, 200, readSettings(d.factory)) },
  { method: "PUT", pattern: /^\/api\/settings$/, handler: putSettings },
  { method: "GET", pattern: /^\/api\/cloudflare$/, handler: (_d, _r, res) => sendJson(res, 200, tools.cloudflareStatus()) },
  { method: "POST", pattern: /^\/api\/cloudflare\/test$/, handler: async (d, _r, res) => sendJson(res, 200, await tools.cloudflareTest(d.factory)) },
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

const PANEL_APPROVALS = new Set(["site", "production"]);

/**
 * Approval from the panel, with the one-time code shown only in the panel's terminal. Pins exactly what the
 * operator was looking at: if content or build changed meanwhile, nothing is approved.
 */
async function approveFromPanel(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  const body = await readJsonBody(req, JSON_LIMIT);
  const kind = str(body, "kind", { max: 20 })!;
  const kinds = PANEL_APPROVALS.has(kind) ? approvalTargets(kind) : null;
  if (!kinds) throw new HttpError(400, "Onay türü site ya da production olmalı.");
  if (deps.jobs.running()?.slug === s) throw new HttpError(409, "Bu müşteri için çalışan bir iş var. Bitince onayla.");
  if (deps.gate.locked) throw new HttpError(423, "Çok fazla yanlış kod girildi. Paneli kapatıp yeniden başlat (yeni kod çıkar).");
  if (!deps.gate.check(str(body, "code", { max: 12 }) ?? "")) {
    throw new HttpError(403, deps.gate.locked ? "Kod yanlış. Onay kilitlendi; paneli yeniden başlat." : `Kod yanlış. Kalan deneme: ${deps.gate.triesLeft}. Kod, paneli başlattığın terminalde yazıyor.`);
  }
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const pinsNow = kinds.map((k) => approvalPins(k, paths.root, paths.distDir, clientStatus(deps.factory, s).lastBuild));
  const seen = body.pins as { hash?: unknown; distHash?: unknown } | undefined;
  const last = pinsNow[pinsNow.length - 1]!;
  if (seen && (seen.hash !== last.hash || (last.distHash && seen.distHash !== last.distHash))) {
    throw new HttpError(409, "Site sen bakarken değişti. Sayfayı yenile, tekrar bak, sonra onayla.");
  }
  const at = new Date().toISOString();
  kinds.forEach((k, i) => {
    const { hash, distHash } = pinsNow[i]!;
    addApproval(paths.approvals, { kind: k, by: `panel:${os.userInfo().username}`, at, hash, ...(distHash ? { distHash } : {}), note: "panel" });
  });
  sendJson(res, 200, { approved: kinds, at });
}

function meta(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { locales: LOCALES, running: deps.jobs.running() ? serialiseJob(deps.jobs.running()!, 0) : null, typicalSeconds: typicalSeconds(deps) });
}

/** Rough time a job of each kind takes here: median of recent successful runs across clients, else a default. */
const DEFAULT_SECONDS: Readonly<Record<string, number>> = { autopilot: 900, "upgrade-template": 900, revise: 240, "fix-build": 300, answers: 180, "design-content": 300, build: 60, deploy: 90, unpublish: 60, concepts: 360, "quick-edit": 180, "brand-board": 300, redesign: 900, "from-library": 600, translate: 600 };
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

function startBuild(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  const job = runOrConflict(() =>
    deps.jobs.startTask(s, "build", "Build", async (log) => {
      log("Şablon derleniyor ve kalite kontrolleri çalışıyor…");
      const r = await tools.buildSite(deps.factory, { slug: s });
      for (const c of r.checks) log(`${c.status.toUpperCase().padEnd(4)}  ${c.name}: ${c.detail}`);
      if (!r.passed) throw new Error(`Build kontrolleri geçmedi. ${r.checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ")}`);
      return "Build geçti. Önizlemeyi açıp görsel kontrol listesiyle bakın, sonra görsel onayı terminalden verin.";
    }, "Build al."),
  );
  sendJson(res, 202, serialiseJob(job));
}

async function startDeploy(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  const body = await readJsonBody(req, JSON_LIMIT);
  const target = body.target === "production" ? "production" : body.target === "preview" ? "preview" : null;
  if (!target) throw new HttpError(400, "Hedef preview ya da production olmalı.");
  const dryRun = body.dryRun === true;
  const job = runOrConflict(() =>
    deps.jobs.startTask(s, "deploy", `Yayın: ${target}${dryRun ? " (deneme)" : ""}`, async (log) => {
      log("Onaylar ve build kontrol ediliyor, wrangler çalışıyor…");
      const r = await tools.deploy(deps.factory, { slug: s, target, dryRun });
      if (r.outputTail) log(r.outputTail);
      return dryRun ? "Deneme başarılı; hiçbir şey yüklenmedi." : r.url ? `Yayında: ${r.url}` : "Yüklendi. Adres wrangler çıktısında bulunamadı; Cloudflare panelinden bakın.";
    }, target === "production" ? `Siteyi canlıya al${dryRun ? " (deneme)" : ""}.` : `Önizlemeyi yayınla${dryRun ? " (deneme)" : ""}.`),
  );
  sendJson(res, 202, serialiseJob(job));
}

/**
 * Takes the preview or the live site off Cloudflare. The live site needs the client's short name typed again
 * (like archiving), so a mis-click cannot take a client's site down.
 */
async function startUnpublish(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  const target = body.target === "production" ? "production" : body.target === "preview" ? "preview" : null;
  if (!target) throw new HttpError(400, "Hedef preview ya da production olmalı.");
  if (target === "production" && body.confirm !== s) throw new HttpError(400, "Canlı siteyi kaldırmak için müşterinin kısa adını (slug) aynen yazın.");
  const label = target === "production" ? "canlı site" : "önizleme";
  const job = runOrConflict(() =>
    deps.jobs.startTask(s, "unpublish", `Yayından kaldır: ${label}`, async (log) => {
      log("Cloudflare'den kaldırılıyor…");
      const r = await tools.undeploy(deps.factory, { slug: s, target });
      return r.alreadyRemoved
        ? `${r.worker} Cloudflare'de zaten yoktu. Müşterinin dosyaları duruyor; istediğinizde yeniden yayınlayabilirsiniz.`
        : `${r.worker} yayından kaldırıldı. Müşterinin dosyaları ve sürümleri duruyor; istediğinizde yeniden yayınlayabilirsiniz.`;
    }, `${label[0]!.toUpperCase()}${label.slice(1)} yayından kaldırılsın.`),
  );
  sendJson(res, 202, serialiseJob(job));
}

function showPreview(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const paths = clientPaths(deps.factory.clientsRoot, assertSlug(slug!));
  if (!existsSync(path.join(paths.distDir, "index.html"))) throw new HttpError(409, "Henüz build yok. Önce build alın.");
  sendJson(res, 200, { url: deps.preview.show(paths.distDir) });
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
