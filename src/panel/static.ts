import { createReadStream, existsSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { safeJoin } from "../lib/paths.js";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
};

/**
 * Serves one file from `root` for a URL path. Paths go through safeJoin, so ../ and symlinks cannot leave `root`.
 * Directory URLs map to index.html; unknown paths fall back to 404.html when the site has one.
 */
export function serveFile(res: ServerResponse, root: string, urlPath: string): void {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0] ?? "/").replace(/^\/+/, "");
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file: string;
  try {
    file = safeJoin(root, rel);
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  } catch {
    res.writeHead(403).end();
    return;
  }
  let status = 200;
  if (!existsSync(file)) {
    const notFound = path.join(root, "404.html");
    if (!existsSync(notFound)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    file = notFound;
    status = 404;
  }
  res.writeHead(status, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(file).pipe(res);
}
