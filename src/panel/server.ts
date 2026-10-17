#!/usr/bin/env node
import { createServer, type Server } from "node:http";
import { readSettings } from "./settings.js";
import { autoBackup } from "./backup.js";
import { DESIGN_KINDS, recordUsage, type BudgetMode } from "./budget.js";
import { clearBrandStale } from "./logo-check.js";
import path from "node:path";
import { FACTORY_ROOT, loadFactoryConfig, type FactoryConfig } from "../config.js";
import { handleApi, startTranslation } from "./api.js";
import { ApprovalGate } from "./approval-gate.js";
import { allowedHost, allowedOrigin, cookieHeader, hasSession, newSessionKey, safeEqual } from "./auth.js";
import { HttpError, sendError } from "./http.js";
import { appendHistory } from "./history.js";
import { clientPaths } from "../lib/paths.js";
import { snapshot } from "../lib/versions.js";
import { JobRunner, type SpawnFn } from "./jobs.js";
import { PreviewServer } from "./preview.js";
import { serveFile } from "./static.js";

const DEFAULT_PORT = 4777;
const HOST = "127.0.0.1";
const UI_DIR = path.join(FACTORY_ROOT, "panel");
const LOCKED_PAGE = `<!doctype html><meta charset="utf-8"><title>Site Factory</title><body style="font-family:system-ui;padding:3rem;max-width:40rem">
<h1>Oturum yok</h1><p>Paneli, terminalde <code>npm run panel</code> komutunun yazdığı bağlantıyla açın.</p></body>`;

export interface PanelOptions {
  readonly factory: FactoryConfig;
  readonly port: number;
  readonly previewPort: number;
  readonly sessionKey: string;
  readonly spawn?: SpawnFn;
  /** Tests pass a known code; normally a random one is made and printed in the terminal. */
  readonly approvalCode?: string;
}

export interface Panel {
  readonly server: Server;
  readonly preview: PreviewServer;
  readonly jobs: JobRunner;
  readonly gate: ApprovalGate;
  listen(): Promise<void>;
  close(): void;
}

export function createPanel(opts: PanelOptions): Panel {
  const jobs = new JobRunner(FACTORY_ROOT, opts.spawn, undefined, (slug, record) => {
    appendHistory(opts.factory, slug, record);
    // Every finished job leaves a version the operator can go back to (no-op when nothing changed).
    void snapshot(clientPaths(opts.factory.clientsRoot, slug).root, record.title).catch((error) => console.error(`[panel] version not saved for ${slug}:`, (error as Error).message));
    autoBackup(opts.factory, (msg) => console.log(msg));
    // A finished design job on a multilingual custom site continues with the cheaper translation job.
    // A finished design job rebuilt the brand from the current logo.
    if (record.status === "succeeded" && DESIGN_KINDS.has(record.kind)) clearBrandStale(opts.factory, slug);
    if (record.status === "succeeded" && DESIGN_KINDS.has(record.kind)) {
      setTimeout(() => { try { startTranslation(deps, slug); } catch { /* the operator can start it again */ } }, 300);
    }
    if (record.usage) recordUsage(opts.factory, { at: record.endedAt, slug, kind: record.kind, mode: (record.mode ?? "balanced") as BudgetMode, model: record.model ?? "", usage: record.usage, tokens: record.tokens ?? 0, ...(record.provider ? { provider: record.provider } : {}) });
  }, () => readSettings(opts.factory).webResearch, [opts.factory.clientsRoot, opts.factory.inboxDir]);
  const preview = new PreviewServer(opts.previewPort);
  const gate = new ApprovalGate(opts.approvalCode);
  const deps = { factory: opts.factory, jobs, preview, gate };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    void (async () => {
      try {
        if (!allowedHost(req, opts.port)) throw new HttpError(403, "Bu adresten erişilemez.");

        if (url.pathname === "/login") {
          const key = url.searchParams.get("key") ?? "";
          if (!safeEqual(key, opts.sessionKey)) throw new HttpError(403, "Geçersiz oturum anahtarı.");
          res.writeHead(303, { "Set-Cookie": cookieHeader(opts.sessionKey), Location: "/" }).end();
          return;
        }
        if (!hasSession(req, opts.sessionKey)) {
          if (url.pathname.startsWith("/api/")) throw new HttpError(401, "Oturum yok. Terminaldeki bağlantıyla açın.");
          res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" }).end(LOCKED_PAGE);
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD" && !allowedOrigin(req, opts.port)) {
          throw new HttpError(403, "İstek panelin kendisinden gelmedi.");
        }
        if (url.pathname.startsWith("/api/")) {
          await handleApi(deps, req, res, url.pathname);
          return;
        }
        if (req.method !== "GET") throw new HttpError(405, "İzin verilmeyen yöntem.");
        serveFile(res, UI_DIR, url.pathname === "/" ? "/index.html" : url.pathname);
      } catch (error) {
        if (!res.headersSent) sendError(res, error);
        else res.end();
      }
    })();
  });
  server.on("clientError", (_err, socket) => socket.destroy());

  return {
    server,
    preview,
    jobs,
    gate,
    listen: async () => {
      await new Promise<void>((resolve) => server.listen(opts.port, HOST, resolve));
      await preview.listen(HOST);
    },
    close: () => {
      server.close();
      preview.close();
    },
  };
}

async function main(): Promise<void> {
  const port = Number(process.env.PANEL_PORT ?? DEFAULT_PORT);
  const sessionKey = newSessionKey();
  const panel = createPanel({ factory: loadFactoryConfig(), port, previewPort: port + 1, sessionKey });
  await panel.listen();
  console.log("\nSite Factory paneli hazır. Bu bağlantıyı tarayıcıda açın (anahtar sadece bu oturum için geçerli):\n");
  console.log(`  http://${HOST}:${port}/login?key=${sessionKey}\n`);
  console.log(`Önizleme adresi: http://${HOST}:${port + 1}/   ·   Kapatmak için Ctrl+C\n`);
  console.log(`Onay kodu: ${panel.gate.code}   (panelde "Onayla" derken sorulur; sadece bu terminalde görünür, kimseyle paylaşma)\n`);
  const stop = () => {
    panel.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (process.argv[1] && /panel[\\/]server\.(ts|js)$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error("[panel] başlatılamadı:", error);
    process.exit(1);
  });
}

