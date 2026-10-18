import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import os from "node:os";
import { addApproval, approvalPins, approvalTargets } from "../../lib/approvals.js";
import { clientStatus } from "../../lib/client.js";
import { assertSlug, clientPaths } from "../../lib/paths.js";
import * as tools from "../../tools.js";
import { HttpError, readJsonBody, sendJson, str } from "../http.js";
import { serialiseJob } from "../jobs.js";
import { type ApiDeps, type Route, SLUG, JSON_LIMIT, runOrConflict } from "./common.js";

/** Build, approvals from the panel, preview, deploy and unpublish for one client. */
export const publishRoutes: Route[] = [
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/build$`), handler: startBuild },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/deploy$`), handler: startDeploy },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/unpublish$`), handler: startUnpublish },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/rollback$`), handler: startRollback },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/preview$`), handler: showPreview },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/approve$`), handler: approveFromPanel },
];

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
    throw new HttpError(
      403,
      deps.gate.locked
        ? "Kod yanlış. Onay kilitlendi; paneli yeniden başlat."
        : `Kod yanlış. Kalan deneme: ${deps.gate.triesLeft}. Kod, paneli başlattığın terminalde yazıyor.`,
    );
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

function startBuild(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  const job = runOrConflict(() =>
    deps.jobs.startTask(
      s,
      "build",
      "Build",
      async (log) => {
        log("Şablon derleniyor ve kalite kontrolleri çalışıyor…");
        const r = await tools.buildSite(deps.factory, { slug: s });
        for (const c of r.checks) log(`${c.status.toUpperCase().padEnd(4)}  ${c.name}: ${c.detail}`);
        if (!r.passed)
          throw new Error(
            `Build kontrolleri geçmedi. ${r.checks
              .filter((c) => c.status === "fail")
              .map((c) => c.name)
              .join(", ")}`,
          );
        return "Build geçti. Önizlemeyi açıp görsel kontrol listesiyle bakın, sonra görsel onayı terminalden verin.";
      },
      "Build al.",
    ),
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
    deps.jobs.startTask(
      s,
      "deploy",
      `Yayın: ${target}${dryRun ? " (deneme)" : ""}`,
      async (log) => {
        log("Onaylar ve build kontrol ediliyor, wrangler çalışıyor…");
        const r = await tools.deploy(deps.factory, { slug: s, target, dryRun });
        if (r.outputTail) log(r.outputTail);
        return dryRun
          ? "Deneme başarılı; hiçbir şey yüklenmedi."
          : r.url
            ? `Yayında: ${r.url}`
            : "Yüklendi. Adres wrangler çıktısında bulunamadı; Cloudflare panelinden bakın.";
      },
      target === "production" ? `Siteyi canlıya al${dryRun ? " (deneme)" : ""}.` : `Önizlemeyi yayınla${dryRun ? " (deneme)" : ""}.`,
    ),
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
    deps.jobs.startTask(
      s,
      "unpublish",
      `Yayından kaldır: ${label}`,
      async (log) => {
        log("Cloudflare'den kaldırılıyor…");
        const r = await tools.undeploy(deps.factory, { slug: s, target });
        return r.alreadyRemoved
          ? `${r.worker} Cloudflare'de zaten yoktu. Müşterinin dosyaları duruyor; istediğinizde yeniden yayınlayabilirsiniz.`
          : `${r.worker} yayından kaldırıldı. Müşterinin dosyaları ve sürümleri duruyor; istediğinizde yeniden yayınlayabilirsiniz.`;
      },
      `${label[0]!.toUpperCase()}${label.slice(1)} yayından kaldırılsın.`,
    ),
  );
  sendJson(res, 202, serialiseJob(job));
}

function showPreview(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const paths = clientPaths(deps.factory.clientsRoot, assertSlug(slug!));
  if (!existsSync(path.join(paths.distDir, "index.html"))) throw new HttpError(409, "Henüz build yok. Önce build alın.");
  sendJson(res, 200, { url: deps.preview.show(paths.distDir) });
}

/** Puts the previous Cloudflare version of the preview or live site back (live needs the slug typed). */
async function startRollback(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  const target = body.target === "production" ? "production" : body.target === "preview" ? "preview" : null;
  if (!target) throw new HttpError(400, "Hedef preview ya da production olmalı.");
  if (target === "production" && body.confirm !== s) throw new HttpError(400, "Canlı siteyi geri almak için müşterinin kısa adını (slug) aynen yazın.");
  const label = target === "production" ? "canlı site" : "önizleme";
  const job = runOrConflict(() =>
    deps.jobs.startTask(
      s,
      "rollback",
      `Önceki sürüme dön: ${label}`,
      async (log) => {
        log("Cloudflare'de önceki sürüm geri getiriliyor…");
        const r = await tools.rollback(deps.factory, { slug: s, target, by: os.userInfo().username });
        return `${r.worker} bir önceki sürüme döndü. Bilgisayarındaki dosyalar değişmedi; düzeltip yeniden yayınlayabilirsin.`;
      },
      `${label[0]!.toUpperCase()}${label.slice(1)} bir önceki sürüme dönsün.`,
    ),
  );
  sendJson(res, 202, serialiseJob(job));
}
