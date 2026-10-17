import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { FactoryConfig } from "../config.js";
import { clientStatus, readDraftConfig } from "../lib/client.js";
import { readJsonIfExists } from "../lib/files.js";
import { clientPaths } from "../lib/paths.js";
import { DEPLOYS_FILE } from "../tools.js";

/**
 * A site's health for the monthly report: is it up (status, time, HTTPS), how heavy are the pages, and what the
 * last build said. The panel itself fetches the public addresses; nothing is sent elsewhere. Visitor numbers
 * need Cloudflare analytics, which this does not read.
 */
const TIMEOUT_MS = 8000;
const PUBLIC_URL = /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i;

export interface LiveCheck {
  readonly target: "production" | "preview";
  readonly url: string;
  readonly ok: boolean;
  readonly status: number | null;
  readonly ms: number | null;
  readonly error?: string;
  readonly at: string;
}

export interface SiteHealth {
  readonly live: LiveCheck[];
  readonly pages: number;
  readonly totalKb: number;
  readonly images: number;
  readonly heaviestKb: number;
  readonly checks: { pass: number; warn: number; fail: number; at: string | null; warnings: string[] };
}

export type Fetcher = (url: string, init: { signal: AbortSignal; redirect: "follow"; method: "GET" }) => Promise<{ status: number }>;

async function check(target: LiveCheck["target"], url: string, fetcher: Fetcher): Promise<LiveCheck> {
  const at = new Date().toISOString();
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, { signal: ctrl.signal, redirect: "follow", method: "GET" });
    return { target, url, ok: res.status >= 200 && res.status < 400, status: res.status, ms: Date.now() - started, at };
  } catch (error) {
    const msg = (error as Error).name === "AbortError" ? `${TIMEOUT_MS / 1000} saniyede yanıt yok` : "Bağlanılamadı (adres, DNS ya da HTTPS sorunu)";
    return { target, url, ok: false, status: null, ms: null, error: msg, at };
  } finally {
    clearTimeout(timer);
  }
}

function distStats(distDir: string) {
  if (!existsSync(distDir)) return { pages: 0, totalKb: 0, images: 0, heaviestKb: 0 };
  let total = 0;
  let pages = 0;
  let images = 0;
  let heaviest = 0;
  for (const e of readdirSync(distDir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const size = statSync(path.join(e.parentPath, e.name)).size;
    total += size;
    if (e.name.endsWith(".html")) pages += 1;
    if (/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(e.name)) {
      images += 1;
      heaviest = Math.max(heaviest, size);
    }
  }
  return { pages, totalKb: Math.round(total / 1024), images, heaviestKb: Math.round(heaviest / 1024) };
}

/** PASS/WARN/FAIL counts and the warnings from the last build's report. */
function lastChecks(reportFile: string, at: string | null) {
  if (!existsSync(reportFile)) return { pass: 0, warn: 0, fail: 0, at, warnings: [] };
  const md = readFileSync(reportFile, "utf8");
  const rows = [...md.matchAll(/^\|\s*([^|]+?)\s*\|\s*(PASS|WARN|FAIL|SKIP)\s*\|\s*([^|]*)\|/gm)];
  return {
    pass: rows.filter((r) => r[2] === "PASS").length,
    warn: rows.filter((r) => r[2] === "WARN").length,
    fail: rows.filter((r) => r[2] === "FAIL").length,
    at,
    warnings: rows.filter((r) => r[2] === "WARN" || r[2] === "FAIL").map((r) => `${r[1]}: ${r[3]!.trim()}`.slice(0, 200)),
  };
}

export async function siteHealth(factory: FactoryConfig, slug: string, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<SiteHealth> {
  const paths = clientPaths(factory.clientsRoot, slug);
  const draft = readDraftConfig(paths) as { site?: { domain?: string | null } };
  const deploys = (readJsonIfExists(path.join(paths.factoryDir, DEPLOYS_FILE)) ?? {}) as Partial<Record<"production" | "preview", { url?: string | null }>>;
  const targets: Array<[LiveCheck["target"], string]> = [];
  const prod = deploys.production?.url ?? (deploys.production && draft.site?.domain ? `https://${draft.site.domain}` : null);
  if (prod && PUBLIC_URL.test(prod)) targets.push(["production", prod]);
  const prev = deploys.preview?.url;
  if (prev && PUBLIC_URL.test(prev)) targets.push(["preview", prev]);
  const live = await Promise.all(targets.map(([t, u]) => check(t, u, fetcher)));
  const build = clientStatus(factory, slug).lastBuild;
  return { live, ...distStats(paths.distDir), checks: lastChecks(paths.qualityReport, build?.at ?? null) };
}
