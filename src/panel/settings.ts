import path from "node:path";
import { z } from "zod";
import type { FactoryConfig } from "../config.js";
import { readJsonIfExists, writeJson } from "../lib/files.js";

/**
 * Panel-wide settings the operator changes on the settings page. Stored next to the client folders (not in the factory
 * folder, so updates keep them; the agent cannot write there, so it cannot change its own permissions).
 */
const FILE = ".panel-settings.json";

export const AGENT_PROVIDERS = ["claude", "codex"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];
export const JOB_GROUPS = ["design", "edit", "translate", "page"] as const;
export type JobGroup = (typeof JOB_GROUPS)[number];

const AgentRouteSchema = z
  .object({
    provider: z.enum(["", ...AGENT_PROVIDERS]).default(""),
    /** A model name the provider understands (Claude: opus, sonnet, haiku…; Codex: its model names). Letters, digits, . _ : - only. */
    model: z
      .string()
      .trim()
      .max(60)
      .regex(/^[A-Za-z0-9._:-]*$/)
      .default(""),
    maxTurns: z.number().int().min(0).max(500).default(0),
    tokenCap: z.number().int().min(0).max(50_000_000).default(0),
  })
  .default({ provider: "", model: "", maxTurns: 0, tokenCap: 0 });

export const SettingsSchema = z.object({
  /** The agent may search the web and read pages (business research, sector examples). */
  webResearch: z.boolean().default(true),
  /** Language of the panel and of the agent's notes to the operator; client sites keep their own languages. */
  panelLanguage: z.enum(["tr", "en"]).default("tr"),
  /**
   * Who uses this panel: their name, asked on first start (studio: optional, kept for older settings files). The agent addresses them by name (the rules
   * call them "the operator"); everyone runs their own panel with their own accounts.
   */
  profile: z
    .object({
      name: z
        .string()
        .trim()
        .max(60)
        .transform((v) => v.replace(/[\u0000-\u001f"<>`]/g, ""))
        .default(""),
      studio: z
        .string()
        .trim()
        .max(80)
        .transform((v) => v.replace(/[\u0000-\u001f"<>`]/g, ""))
        .default(""),
    })
    .default({ name: "", studio: "" }),
  /** Team sharing: the team's Git repository (https://… or git@…). Empty = this panel works alone. */
  team: z.object({ remote: z.string().trim().max(300).default("") }).default({ remote: "" }),
  /** Who the proposal (Teklif) is from. */
  sender: z
    .object({
      name: z.string().trim().max(80).default(""),
      email: z.string().trim().max(120).default(""),
      phone: z.string().trim().max(40).default(""),
      web: z.string().trim().max(120).default(""),
    })
    .default({ name: "", email: "", phone: "", web: "" }),
  /** Folder for automatic backups (a path on this computer, e.g. a OneDrive folder under /mnt/c). Empty = off. */
  backupDir: z.string().trim().max(400).default(""),
  /** Token budget: the mode decides models, step limits and caps per job (panel/budget.ts). 0 = no monthly budget. */
  budget: z
    .object({
      mode: z.enum(["economy", "balanced", "premium"]).default("balanced"),
      monthlyTokens: z.number().int().min(0).max(10_000_000_000).default(0),
    })
    .default({ mode: "balanced", monthlyTokens: 0 }),
  /**
   * Per kind of job: which agent (Claude Code or Codex), which model, step limit and token cap. Empty or 0 = the
   * package's value (budget.mode). Lets the operator send cheap work to a cheaper model or to another provider.
   */
  agents: z
    .object({
      design: AgentRouteSchema,
      edit: AgentRouteSchema,
      translate: AgentRouteSchema,
      page: AgentRouteSchema,
    })
    .partial()
    .default({}),
  /** Profit: how to turn the agent's USD cost into the client's currency, and a price per million units for jobs without a reported cost (Codex). */
  profit: z
    .object({
      usdRates: z
        .object({ TRY: z.number().min(0).max(1_000_000).default(0), GBP: z.number().min(0).max(1000).default(0), EUR: z.number().min(0).max(1000).default(0) })
        .default({ TRY: 0, GBP: 0, EUR: 0 }),
      usdPerMillionUnits: z.number().min(0).max(1000).default(0),
    })
    .default({ usdRates: { TRY: 0, GBP: 0, EUR: 0 }, usdPerMillionUnits: 0 }),
});
export type Settings = z.infer<typeof SettingsSchema>;

const file = (factory: FactoryConfig) => path.join(factory.clientsRoot, FILE);

export function readSettings(factory: FactoryConfig): Settings {
  const parsed = SettingsSchema.safeParse(readJsonIfExists(file(factory)) ?? {});
  return parsed.success ? parsed.data : SettingsSchema.parse({});
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Saves a partial change. Groups (profile, sender, budget…) are merged one level deep, so a form that sends one field
 * of a group (the profile's name) keeps the group's other fields instead of failing or wiping them.
 */
export function writeSettings(factory: FactoryConfig, input: unknown): Settings {
  const current = readSettings(factory) as Record<string, unknown>;
  const patch = isPlain(input) ? input : {};
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) merged[k] = isPlain(v) && isPlain(current[k]) ? { ...current[k], ...v } : v;
  const data = SettingsSchema.parse(merged);
  writeJson(file(factory), data);
  return data;
}

/** The first-start profile is filled in (name at least). */
export const profileComplete = (s: Settings): boolean => s.profile.name.length > 0;
