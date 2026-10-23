import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Before the rename to Arke Web Studio (1.30.0) the environment variables started with SF_. They still work: an
 * SF_ variable stands in for its ARKE_ name when that is not set (e.g. SF_CF_MANAGED_API_TOKEN in an old profile).
 * Runs once, as soon as anything imports the configuration.
 */
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("SF_") && value !== undefined && process.env[`ARKE_${key.slice(3)}`] === undefined) process.env[`ARKE_${key.slice(3)}`] = value;
}

/**
 * Where the person's own settings live (accounts, client secrets, portal): ~/.config/arke-web-studio, or the old
 * ~/.config/site-factory when only that exists (an install from before the rename; scripts/migrate-name.sh moves it).
 */
export function userConfigDir(): string {
  const now = path.join(os.homedir(), ".config", "arke-web-studio");
  const before = path.join(os.homedir(), ".config", "site-factory");
  return !existsSync(now) && existsSync(before) ? before : now;
}

/** Factory root = the folder containing factory.config.json (one level above src/ or dist/). */
export const FACTORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FactoryConfigSchema = z.object({
  clientsRoot: z.string().min(1),
  inboxDir: z.string().min(1),
  templatesDir: z.string().min(1),
  defaultTemplate: z.string().min(1),
  uupmScript: z.string().min(1),
  limits: z.object({
    maxImageBytes: z.number().int().positive(),
    maxLogoBytes: z.number().int().positive(),
    buildTimeoutMs: z.number().int().positive(),
    deployTimeoutMs: z.number().int().positive(),
  }),
});

export interface FactoryConfig {
  readonly clientsRoot: string;
  readonly inboxDir: string;
  readonly templatesDir: string;
  readonly defaultTemplate: string;
  readonly uupmScript: string;
  readonly limits: z.infer<typeof FactoryConfigSchema>["limits"];
}

/**
 * Loads factory.config.json. Relative paths resolve against the factory root so the
 * server behaves the same no matter which directory the MCP client launches it from.
 * ARKE_CLIENTS_ROOT / ARKE_INBOX_DIR override the file (used by tests and per-machine setups).
 */
export function loadFactoryConfig(root: string = FACTORY_ROOT): FactoryConfig {
  const raw: unknown = JSON.parse(readFileSync(path.join(root, "factory.config.json"), "utf8"));
  const parsed = FactoryConfigSchema.parse(raw);
  const abs = (p: string) => path.resolve(root, p);
  return {
    clientsRoot: process.env.ARKE_CLIENTS_ROOT ? abs(process.env.ARKE_CLIENTS_ROOT) : withLegacy(abs(parsed.clientsRoot)),
    inboxDir: process.env.ARKE_INBOX_DIR ? abs(process.env.ARKE_INBOX_DIR) : withLegacy(abs(parsed.inboxDir)),
    templatesDir: abs(process.env.ARKE_TEMPLATES_DIR ?? parsed.templatesDir),
    defaultTemplate: parsed.defaultTemplate,
    uupmScript: abs(parsed.uupmScript),
    limits: parsed.limits,
  };
}

/** ../arke-clients and ../arke-inbox were ../sf-clients and ../sf-inbox before the rename: the old folder is used while only it exists. */
const LEGACY_FOLDERS: Readonly<Record<string, string>> = { "arke-clients": "sf-clients", "arke-inbox": "sf-inbox" };

function withLegacy(dir: string): string {
  const old = LEGACY_FOLDERS[path.basename(dir)];
  if (!old || existsSync(dir)) return dir;
  const before = path.join(path.dirname(dir), old);
  return existsSync(before) ? before : dir;
}
