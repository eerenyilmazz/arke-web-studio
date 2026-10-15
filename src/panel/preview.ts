import { createServer, type Server } from "node:http";
import { serveFile } from "./static.js";

/**
 * Serves one client's dist/ at the root of a second port, because built sites use root-relative links.
 * Read-only; only answers requests addressed to its own localhost address.
 */
export class PreviewServer {
  private distDir: string | null = null;
  private readonly server: Server;

  constructor(private readonly port: number) {
    this.server = createServer((req, res) => {
      const host = req.headers.host ?? "";
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
        res.writeHead(403).end();
        return;
      }
      if (!this.distDir || (req.method !== "GET" && req.method !== "HEAD")) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Önizleme için panelden bir müşteri seçin.");
        return;
      }
      serveFile(res, this.distDir, req.url ?? "/");
    });
  }

  listen(host: string): Promise<void> {
    return new Promise((resolve) => this.server.listen(this.port, host, resolve));
  }

  show(distDir: string): string {
    this.distDir = distDir;
    return `http://127.0.0.1:${this.port}/`;
  }

  close(): void {
    this.server.close();
  }
}
