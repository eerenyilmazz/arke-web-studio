import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { FactoryConfig } from "../config.js";
import type { BuildRecord, DeployRecord } from "../lib/client.js";
import { draftLocales, readDraftConfig } from "../lib/client.js";
import { clientPaths } from "../lib/paths.js";
import * as tools from "../tools.js";
import { readLedger } from "./budget.js";
import { readBusiness } from "./business.js";
import { readHistory } from "./history.js";
import { clientProfit } from "./profit.js";

/**
 * One row per client for the panel's analysis table: business, money, work and the built site, read from files
 * the panel already keeps (business.json, the job history and ledger, the last build/deploy records, the quality
 * report and dist/). Read-only; nothing is computed by the agent and nothing leaves the machine.
 *
 * "Performance" here is what can be measured without a browser: how heavy the built site is (bytes per page,
 * images) and what the build checks said. Lighthouse scores are not measured, so none are shown.
 */
export interface SiteFacts {
  readonly pages: number;
  /** Every file in dist/. */
  readonly totalBytes: number;
  /** Average HTML page plus the site's shared CSS and JS (what a first visit downloads before images). */
  readonly pageBytes: number;
  readonly images: number;
  readonly imageBytes: number;
  readonly largestImage: { readonly file: string; readonly bytes: number } | null;
}

export interface ClientAnalytics {
  readonly slug: string;
  readonly name: string;
  readonly industry: string;
  readonly stage: string;
  readonly country: string | null;
  readonly locales: string[];
  readonly hosting: string | null;
  readonly packageMode: string;
  readonly addons: string[];
  readonly tags: string[];
  readonly currency: string;
  readonly price: number | null;
  readonly payment: string;
  readonly deadline: string | null;
  readonly paymentDue: string | null;
  /** Past the delivery date and not live yet. */
  readonly lateDelivery: boolean;
  /** Past the payment date and not paid. */
  readonly latePayment: boolean;
  readonly extraCosts: number;
  readonly agentUsd: number;
  readonly agentCost: number | null;
  readonly profit: number | null;
  readonly jobs: { readonly total: number; readonly failed: number; readonly minutes: number; readonly firstAt: string | null; readonly lastAt: string | null };
  readonly checks: { readonly pass: number; readonly warn: number; readonly fail: number } | null;
  readonly lastBuild: { readonly at: string; readonly passed: boolean } | null;
  readonly lastDeploy: { readonly at: string; readonly target: string; readonly url: string | null } | null;
  /** Days from the first job to the last production publish (null until published). */
  readonly daysToLive: number | null;
  readonly site: SiteFacts | null;
}

const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
const DAY_MS = 86_400_000;

function filesUnder(dir: string): Array<{ rel: string; bytes: number }> {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const full = path.join(e.parentPath, e.name);
      return { rel: path.relative(dir, full).split(path.sep).join("/"), bytes: statSync(full).size };
    });
}

/** Weight of a built site, from dist/. Null when nothing is built yet. */
export function siteFacts(distDir: string): SiteFacts | null {
  if (!existsSync(distDir)) return null;
  const files = filesUnder(distDir);
  const html = files.filter((f) => f.rel.endsWith(".html") && f.rel !== "404.html" && !f.rel.startsWith("brand/"));
  if (html.length === 0) return null;
  const shared = files.filter((f) => /\.(css|js)$/i.test(f.rel)).reduce((s, f) => s + f.bytes, 0);
  const images = files.filter((f) => IMAGE.test(f.rel));
  const largest = images.reduce<(typeof images)[number] | null>((m, f) => (!m || f.bytes > m.bytes ? f : m), null);
  return {
    pages: html.length,
    totalBytes: files.reduce((s, f) => s + f.bytes, 0),
    pageBytes: Math.round(html.reduce((s, f) => s + f.bytes, 0) / html.length + shared),
    images: images.length,
    imageBytes: images.reduce((s, f) => s + f.bytes, 0),
    largestImage: largest ? { file: largest.rel, bytes: largest.bytes } : null,
  };
}

/** PASS / WARN / FAIL counts from quality-report.md's table. Null when there is no report. */
export function checkCounts(reportFile: string): ClientAnalytics["checks"] {
  if (!existsSync(reportFile)) return null;
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const m of readFileSync(reportFile, "utf8").matchAll(/^\|[^|\n]*\| (PASS|WARN|FAIL) \|/gm)) {
    counts[m[1]!.toLowerCase() as keyof typeof counts]++;
  }
  return counts;
}

function readJson<T>(file: string): T | null {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
  } catch {
    return null;
  }
}

const isPast = (date: string | null, now: Date) => date !== null && new Date(`${date}T23:59:59`) < now;

export function clientAnalytics(factory: FactoryConfig, now = new Date()): ClientAnalytics[] {
  const ledger = readLedger(factory);
  return tools
    .listClients(factory)
    .clients.filter((c) => c.stage !== "unreadable")
    .map((c) => {
      const paths = clientPaths(factory.clientsRoot, c.slug);
      const draft = readDraftConfig(paths) as {
        business?: { name?: string; industry?: string; country?: string };
        hosting?: { model?: string };
      };
      const b = readBusiness(factory, c.slug);
      const money = clientProfit(factory, c.slug, c.name, ledger);
      const history = readHistory(factory, c.slug);
      const build = readJson<BuildRecord>(paths.buildRecord);
      const deploy = readJson<DeployRecord>(paths.lastDeploy);
      const firstAt = history.length ? history.map((j) => j.startedAt).sort()[0]! : null;
      const lastAt = history.length
        ? history
            .map((j) => j.endedAt)
            .sort()
            .at(-1)!
        : null;
      const minutes = Math.round(history.reduce((s, j) => s + Math.max(0, Date.parse(j.endedAt) - Date.parse(j.startedAt)), 0) / 60_000);
      const live = deploy?.target === "production" ? deploy : null;
      return {
        slug: c.slug,
        name: c.name ?? c.slug,
        industry: c.industry ?? "",
        stage: c.stage,
        country: draft.business?.country ?? null,
        locales: draftLocales(draft as Record<string, unknown>),
        hosting: draft.hosting?.model ?? null,
        packageMode: b?.budgetMode ?? "",
        addons: (b?.addons ?? []).map((a) => a.id),
        tags: b?.tags ?? [],
        currency: money.currency,
        price: money.price,
        payment: money.payment,
        deadline: b?.deadline ?? null,
        paymentDue: b?.paymentDue ?? null,
        lateDelivery: c.stage !== "live" && isPast(b?.deadline ?? null, now),
        latePayment: money.payment !== "paid" && isPast(b?.paymentDue ?? null, now),
        extraCosts: money.extraCosts,
        agentUsd: money.agentUsd,
        agentCost: money.agentCost,
        profit: money.profit,
        jobs: { total: history.length, failed: history.filter((j) => j.status === "failed").length, minutes, firstAt, lastAt },
        checks: checkCounts(paths.qualityReport),
        lastBuild: build ? { at: build.at, passed: build.passed } : null,
        lastDeploy: deploy ? { at: deploy.at, target: deploy.target, url: deploy.url } : null,
        daysToLive: live && firstAt ? Math.max(0, Math.round((Date.parse(live.at) - Date.parse(firstAt)) / DAY_MS)) : null,
        site: siteFacts(paths.distDir),
      };
    });
}
