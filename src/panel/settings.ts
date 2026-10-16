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
