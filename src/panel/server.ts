#!/usr/bin/env node
import { createServer, type Server } from "node:http";
import path from "node:path";
import { FACTORY_ROOT, loadFactoryConfig, type FactoryConfig } from "../config.js";
import { handleApi } from "./api.js";
import { allowedHost, allowedOrigin, cookieHeader, hasSession, newSessionKey, safeEqual } from "./auth.js";
import { HttpError, sendError } from "./http.js";
import { appendHistory } from "./history.js";
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
}

export interface Panel {
  readonly server: Server;
  readonly preview: PreviewServer;
  readonly jobs: JobRunner;
  listen(): Promise<void>;
  close(): void;
}

export function createPanel(opts: PanelOptions): Panel {
  const jobs = new JobRunner(FACTORY_ROOT, opts.spawn, undefined, (slug, record) => appendHistory(opts.factory, slug, record));
  const preview = new PreviewServer(opts.previewPort);
  const deps = { factory: opts.factory, jobs, preview };

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

