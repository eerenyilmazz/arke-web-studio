import path from "node:path";
import { z } from "zod";
import type { FactoryConfig } from "../config.js";
import { readJsonIfExists, writeJson } from "../lib/files.js";

/**
 * Panel-wide settings Eren changes on the settings page. Stored next to the client folders (not in the factory
 * folder, so updates keep them; the agent cannot write there, so it cannot change its own permissions).
 */
const FILE = ".panel-settings.json";

export const SettingsSchema = z.object({
  /** The agent may search the web and read pages (business research, sector examples). */
  webResearch: z.boolean().default(true),
  /** Who the proposal (Teklif) is from. */
  sender: z.object({
    name: z.string().trim().max(80).default(""),
    email: z.string().trim().max(120).default(""),
    phone: z.string().trim().max(40).default(""),
    web: z.string().trim().max(120).default(""),
  }).default({ name: "", email: "", phone: "", web: "" }),
  /** Folder for automatic backups (a path on this computer, e.g. a OneDrive folder under /mnt/c). Empty = off. */
  backupDir: z.string().trim().max(400).default(""),
  /** Token budget: the mode decides models, step limits and caps per job (panel/budget.ts). 0 = no monthly budget. */
  budget: z.object({
    mode: z.enum(["economy", "balanced", "premium"]).default("balanced"),
    monthlyTokens: z.number().int().min(0).max(10_000_000_000).default(0),
  }).default({ mode: "balanced", monthlyTokens: 0 }),
});
export type Settings = z.infer<typeof SettingsSchema>;

const file = (factory: FactoryConfig) => path.join(factory.clientsRoot, FILE);

export function readSettings(factory: FactoryConfig): Settings {
  const parsed = SettingsSchema.safeParse(readJsonIfExists(file(factory)) ?? {});
  return parsed.success ? parsed.data : SettingsSchema.parse({});
}

export function writeSettings(factory: FactoryConfig, input: unknown): Settings {
  const data = SettingsSchema.parse({ ...readSettings(factory), ...(typeof input === "object" && input ? input : {}) });
  writeJson(file(factory), data);
  return data;
}
