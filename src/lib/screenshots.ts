import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import type { CheckResult } from "./quality.js";

/**
 * Phone and desktop screenshots of a built site, so the agent can look at what it made (Read shows images).
 * Uses a browser already on the machine (no download): SF_BROWSER, a Linux Chrome/Chromium, or on WSL the
 * Windows Edge/Chrome. Best effort: without a browser the check is skipped and nothing else changes.
 */
const run = promisify(execFile);
const TIMEOUT_MS = 45_000;
/**
 * Headless Chrome will not make a window narrower than about 500px, so the phone shot loads the page in a
 * 390px-wide frame inside a wider window (grey margins around a real phone-width layout).
 */
const PHONE_WIDTH = 390;
export const SHOTS = [
  { name: "telefon", width: 520, height: 1700, path: "/__phone__" },
  { name: "masaustu", width: 1440, height: 2200, path: "/" },
] as const;
const PHONE_FRAME = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#3a3f45}iframe{display:block;margin:0 auto;border:0;width:${PHONE_WIDTH}px;height:100vh;background:#fff}</style></head><body><iframe src="/"></iframe></body></html>`;

const LINUX_BROWSERS = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge"];
const WINDOWS_BROWSERS = [
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
  "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
];

async function onPath(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await run("sh", ["-c", `command -v ${cmd}`], { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function findBrowser(): Promise<{ bin: string; windows: boolean } | null> {
  const env = process.env.SF_BROWSER;
  if (env && existsSync(env)) return { bin: env, windows: env.endsWith(".exe") };
  for (const c of LINUX_BROWSERS) {
    const p = await onPath(c);
    if (p) return { bin: p, windows: false };
  }
  for (const p of WINDOWS_BROWSERS) if (existsSync(p)) return { bin: p, windows: true };
  return null;
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
};

/** A tiny static server for dist/ on a random local port (closed right after). */
function serve(distDir: string): Promise<Server> {
  const root = path.resolve(distDir);
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (url === "/__phone__") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PHONE_FRAME);
      return;
    }
    let file = path.resolve(root, `.${url}`);
    // Inside dist/ only: a plain prefix test would also accept a sibling such as dist2/.
    const rel = path.relative(root, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/** The same server for tests: its address and a way to close it. */
export async function serveDistForTest(distDir: string): Promise<{ url: string; close: () => void }> {
  const server = await serve(distDir);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

async function toWindowsPath(p: string): Promise<string> {
  const { stdout } = await run("wslpath", ["-w", p], { timeout: 5000 });
  return stdout.trim();
}

export async function takeScreenshots(distDir: string, outDir: string): Promise<CheckResult> {
  const name = "Screenshots (look at them: phone and desktop)";
  if (process.env.SF_SCREENSHOTS === "off") return { name, status: "skip", detail: "Turned off (SF_SCREENSHOTS=off)." };
  const browser = await findBrowser();
  if (!browser) return { name, status: "skip", detail: "No browser found (set SF_BROWSER to Chrome/Edge to enable). Nothing else is affected." };
  const server = await serve(distDir);
  const port = (server.address() as AddressInfo).port;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const made: string[] = [];
  try {
    for (const shot of SHOTS) {
      const file = path.join(outDir, `${shot.name}.png`);
      const target = browser.windows ? await toWindowsPath(file) : file;
      const args = [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        ...(browser.windows ? [] : ["--no-sandbox"]),
        `--window-size=${shot.width},${shot.height}`,
        "--virtual-time-budget=4000",
        `--screenshot=${target}`,
        `http://127.0.0.1:${port}${shot.path}`,
      ];
      await run(browser.bin, args, { timeout: TIMEOUT_MS }).catch(() => null);
      if (existsSync(file) && statSync(file).size > 0) made.push(file);
    }
  } finally {
    server.close();
  }
  return made.length
    ? {
        name,
        status: "pass",
        detail: `Read these images and fix what looks wrong (overlaps, empty areas, unreadable text, broken layout). The phone image shows a ${PHONE_WIDTH}px-wide page in the middle of grey margins: ${made.join(", ")}`,
      }
    : { name, status: "skip", detail: `The browser (${path.basename(browser.bin)}) did not produce screenshots. Nothing else is affected.` };
}

/** Moments of the signature motion captured as stills, as a share of its total length (then just after the end). */
const FRAME_POINTS = [0.05, 0.3, 0.6, 1] as const;
const FRAME_SIZE = { width: 900, height: 640 } as const;

/**
 * The signature motion as four stills (start, a third, two thirds, end), so the agent can see how it moves:
 * headless Chrome runs the page on virtual time for a set budget, then takes the picture.
 */
export async function takeSignatureFrames(distDir: string, outDir: string, totalMs: number): Promise<CheckResult | null> {
  const name = "Signature motion frames (look at them in order)";
  if (!existsSync(path.join(distDir, "brand", "signature.html"))) return null;
  if (process.env.SF_SCREENSHOTS === "off") return { name, status: "skip", detail: "Turned off (SF_SCREENSHOTS=off)." };
  const browser = await findBrowser();
  if (!browser) return { name, status: "skip", detail: "No browser found; the motion could not be filmed. Nothing else is affected." };
  const server = await serve(distDir);
  const port = (server.address() as AddressInfo).port;
  mkdirSync(outDir, { recursive: true });
  const made: string[] = [];
  try {
    for (const [i, share] of FRAME_POINTS.entries()) {
      const file = path.join(outDir, `imza-${i + 1}.png`);
      rmSync(file, { force: true });
      const budget = Math.max(60, Math.round(totalMs * share) + (share === 1 ? 300 : 0));
      const args = [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        ...(browser.windows ? [] : ["--no-sandbox"]),
        `--window-size=${FRAME_SIZE.width},${FRAME_SIZE.height}`,
        `--virtual-time-budget=${budget}`,
        `--screenshot=${browser.windows ? await toWindowsPath(file) : file}`,
        `http://127.0.0.1:${port}/brand/signature.html`,
      ];
      await run(browser.bin, args, { timeout: TIMEOUT_MS }).catch(() => null);
      if (existsSync(file) && statSync(file).size > 0) made.push(file);
    }
  } finally {
    server.close();
  }
  return made.length
    ? {
        name,
        status: "pass",
        detail: `Read these in order (start → end) and check the motion against the plan's beats: does something real move, in the planned order, and end in a composed state? ${made.join(", ")}`,
      }
    : { name, status: "skip", detail: "The browser did not produce frames. Nothing else is affected." };
}
