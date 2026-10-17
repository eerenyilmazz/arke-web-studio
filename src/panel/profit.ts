import type { FactoryConfig } from "../config.js";
import { readBusiness } from "./business.js";
import { readLedger, type LedgerEntry } from "./budget.js";
import { readSettings } from "./settings.js";
import * as tools from "../tools.js";

/**
 * Money per client: the price in the proposal, minus Eren's own costs for that client (domain, stock photos…),
 * minus what the agent cost. Claude reports a USD cost per job; Codex does not, so its jobs are priced from the
 * "USD per million units" setting. USD is turned into the client's currency with the rate Eren enters.
 * Nothing here is sent anywhere; it is arithmetic on files the panel already keeps.
 */
export interface ClientProfit {
  readonly slug: string;
  readonly name: string;
  readonly currency: string;
  readonly price: number | null;
  readonly payment: string;
  readonly extraCosts: number;
  readonly agentUsd: number;
  /** The agent cost in the client's currency; null when the USD rate for it is not set. */
  readonly agentCost: number | null;
  /** price − extras − agent; null without a price or without the rate. */
  readonly profit: number | null;
  readonly jobs: number;
}

/** USD cost of one ledger entry: Claude's own figure, else units × the per-million price (Codex). */
export function entryUsd(e: LedgerEntry, usdPerMillionUnits: number): number {
  if (typeof e.usage.costUsd === "number") return e.usage.costUsd;
  return (e.tokens / 1_000_000) * usdPerMillionUnits;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function clientProfit(factory: FactoryConfig, slug: string, name = slug, ledger = readLedger(factory)): ClientProfit {
  const s = readSettings(factory).profit;
  const b = readBusiness(factory, slug);
  const currency = b?.currency ?? "TRY";
  const entries = ledger.filter((e) => e.slug === slug);
  const agentUsd = round2(entries.reduce((sum, e) => sum + entryUsd(e, s.usdPerMillionUnits), 0));
  const rate = currency === "USD" ? 1 : s.usdRates[currency as "TRY" | "GBP" | "EUR"] || 0;
  const agentCost = rate > 0 ? round2(agentUsd * rate) : agentUsd === 0 ? 0 : null;
  const extraCosts = round2((b?.costs ?? []).reduce((sum, c) => sum + c.amount, 0));
  const price = b?.price ?? null;
  return {
    slug, name, currency, price, payment: b?.payment ?? "none", extraCosts, agentUsd, agentCost,
    profit: price !== null && agentCost !== null ? round2(price - extraCosts - agentCost) : null,
    jobs: entries.length,
  };
}

export interface ProfitSummary {
  readonly clients: ClientProfit[];
  /** Per currency: sums over clients with a price (profit only where it could be computed). */
  readonly totals: Record<string, { price: number; extraCosts: number; agentCost: number; profit: number; missingRate: boolean }>;
  /** Agent cost of the current month across all clients, in USD. */
  readonly monthAgentUsd: number;
}

export function profitSummary(factory: FactoryConfig, now = new Date()): ProfitSummary {
  const ledger = readLedger(factory);
  const s = readSettings(factory).profit;
  const clients = tools.listClients(factory).clients
    .filter((c) => c.stage !== "unreadable")
    .map((c) => clientProfit(factory, c.slug, "name" in c && c.name ? c.name : c.slug, ledger));
  const totals: ProfitSummary["totals"] = {};
  for (const c of clients) {
    if (c.price === null) continue;
    const t = (totals[c.currency] ??= { price: 0, extraCosts: 0, agentCost: 0, profit: 0, missingRate: false });
    t.price = round2(t.price + c.price);
    t.extraCosts = round2(t.extraCosts + c.extraCosts);
    if (c.agentCost === null) t.missingRate = true;
    else t.agentCost = round2(t.agentCost + c.agentCost);
    if (c.profit !== null) t.profit = round2(t.profit + c.profit);
  }
  const month = now.toISOString().slice(0, 7);
  const monthAgentUsd = round2(ledger.filter((e) => e.at.slice(0, 7) === month).reduce((sum, e) => sum + entryUsd(e, s.usdPerMillionUnits), 0));
  return { clients, totals, monthAgentUsd };
}
