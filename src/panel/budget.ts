import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FactoryConfig } from "../config.js";
import { readBusiness } from "./business.js";
import { readSettings } from "./settings.js";

/**
 * Token budget: how much each agent job may spend, decided by a mode (Ekonomik / Dengeli / Premium).
 *
 * A mode picks the model per kind of job, the step limit, how the design skills are used, whether the agent
 * researches the web and a token cap per job (the panel stops a job that passes it). Usage of every job is
 * written to a ledger (<clientsRoot>/.usage.jsonl) for per-client and monthly totals.
 *
 * "Tokens" here are weighted: cache reads count 1/10 (they are much cheaper than fresh input), everything
 * else counts fully. Claude reports these numbers itself; nothing is estimated from text length.
 */
export const BUDGET_MODES = ["economy", "balanced", "premium"] as const;
export type BudgetMode = (typeof BUDGET_MODES)[number];
export type SkillUse = "none" | "search" | "full";

export interface AgentPolicy {
  readonly mode: BudgetMode;
  readonly model: string;
  readonly maxTurns: number;
  readonly tokenCap: number;
  readonly skills: SkillUse;
  readonly research: boolean;
  readonly screenshots: boolean;
}

/** Jobs that design or write a whole site; everything else is an edit. */
export const DESIGN_KINDS: ReadonlySet<string> = new Set(["autopilot", "upgrade-template", "concepts", "choose-concept", "redesign", "from-library", "brand-board", "design-content"]);

interface Profile {
  readonly design: { model: string; maxTurns: number; tokenCap: number };
  readonly edit: { model: string; maxTurns: number; tokenCap: number };
  readonly skills: SkillUse;
  readonly research: boolean;
  readonly screenshots: boolean;
}

const M = 1_000_000;
/** Model aliases Claude Code understands. */
export const PROFILES: Readonly<Record<BudgetMode, Profile>> = {
  economy: {
    design: { model: "sonnet", maxTurns: 150, tokenCap: 1.5 * M },
    edit: { model: "haiku", maxTurns: 30, tokenCap: 0.25 * M },
    skills: "search",
    research: false,
    screenshots: false,
  },
  balanced: {
    design: { model: "opus", maxTurns: 250, tokenCap: 3 * M },
    edit: { model: "sonnet", maxTurns: 40, tokenCap: 0.4 * M },
    skills: "search",
    research: true,
    screenshots: true,
  },
  premium: {
    design: { model: "opus", maxTurns: 300, tokenCap: 6 * M },
    edit: { model: "opus", maxTurns: 60, tokenCap: 0.8 * M },
    skills: "full",
    research: true,
    screenshots: true,
  },
};

export const MODE_LABELS: Readonly<Record<BudgetMode, string>> = { economy: "Ekonomik", balanced: "Dengeli", premium: "Premium" };

/** The client's own mode (set in its business info) wins over the panel-wide one. */
export function modeFor(factory: FactoryConfig, slug: string): BudgetMode {
  const own = readBusiness(factory, slug)?.budgetMode;
  return own && (BUDGET_MODES as readonly string[]).includes(own) ? (own as BudgetMode) : readSettings(factory).budget.mode;
}

export function resolvePolicy(factory: FactoryConfig, slug: string, kind: string): AgentPolicy {
  const mode = modeFor(factory, slug);
  const p = PROFILES[mode];
  // Translation is long but simple: the edit (cheaper) model with design-sized limits, half the design cap.
  const job = kind === "translate" ? { model: p.edit.model, maxTurns: p.design.maxTurns, tokenCap: Math.round(p.design.tokenCap / 2) } : DESIGN_KINDS.has(kind) ? p.design : p.edit;
  return { mode, ...job, skills: p.skills, research: p.research && readSettings(factory).webResearch, screenshots: p.screenshots };
}

// ---------------------------------------------------------------- usage

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd?: number;
}

export const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export function weighted(u: Usage): number {
  return Math.round(u.input + u.output + u.cacheWrite + u.cacheRead / 10);
}

/** Claude's usage object (snake_case) to ours. */
export function usageFrom(raw: unknown): Usage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0);
  return { input: n("input_tokens"), output: n("output_tokens"), cacheRead: n("cache_read_input_tokens"), cacheWrite: n("cache_creation_input_tokens") };
}

export interface LedgerEntry {
  readonly at: string;
  readonly slug: string;
  readonly kind: string;
  readonly mode: BudgetMode;
  readonly model: string;
  readonly usage: Usage;
  readonly tokens: number;
}

const LEDGER = ".usage.jsonl";
const ledgerFile = (factory: FactoryConfig) => path.join(factory.clientsRoot, LEDGER);

export function recordUsage(factory: FactoryConfig, entry: LedgerEntry): void {
  appendFileSync(ledgerFile(factory), `${JSON.stringify(entry)}\n`);
}

export function readLedger(factory: FactoryConfig): LedgerEntry[] {
  const f = ledgerFile(factory);
  if (!existsSync(f)) return [];
  const out: LedgerEntry[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as LedgerEntry);
    } catch {
      // torn line after a crash
    }
  }
  return out;
}

export interface UsageSummary {
  readonly monthTokens: number;
  readonly monthCostUsd: number;
  readonly monthJobs: number;
  readonly monthlyBudget: number;
  readonly byClient: Record<string, { tokens: number; costUsd: number; jobs: number }>;
}

export function summarise(factory: FactoryConfig, now = new Date()): UsageSummary {
  const month = now.toISOString().slice(0, 7);
  let monthTokens = 0;
  let monthCostUsd = 0;
  let monthJobs = 0;
  const byClient: Record<string, { tokens: number; costUsd: number; jobs: number }> = {};
  for (const e of readLedger(factory)) {
    const c = (byClient[e.slug] ??= { tokens: 0, costUsd: 0, jobs: 0 });
    c.tokens += e.tokens;
    c.costUsd += e.usage.costUsd ?? 0;
    c.jobs += 1;
    if (e.at.slice(0, 7) === month) {
      monthTokens += e.tokens;
      monthCostUsd += e.usage.costUsd ?? 0;
      monthJobs += 1;
    }
  }
  return { monthTokens, monthCostUsd, monthJobs, monthlyBudget: readSettings(factory).budget.monthlyTokens, byClient };
}

/** Refuses a new agent job when this month's budget is used up (0 = no monthly budget). */
export function monthlyBlock(factory: FactoryConfig): string | null {
  const s = summarise(factory);
  if (s.monthlyBudget > 0 && s.monthTokens >= s.monthlyBudget) {
    return `Bu ayın token bütçesi doldu (${(s.monthTokens / M).toFixed(1)}M / ${(s.monthlyBudget / M).toFixed(1)}M). Ayarlar → Bütçe'den artırabilir ya da Ekonomik moda geçebilirsin.`;
  }
  return null;
}
