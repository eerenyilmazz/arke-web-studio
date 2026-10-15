import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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
 * SF_CLIENTS_ROOT / SF_INBOX_DIR override the file (used by tests and per-machine setups).
 */
export function loadFactoryConfig(root: string = FACTORY_ROOT): FactoryConfig {
  const raw: unknown = JSON.parse(readFileSync(path.join(root, "factory.config.json"), "utf8"));
  const parsed = FactoryConfigSchema.parse(raw);
  const abs = (p: string) => path.resolve(root, p);
  return {
    clientsRoot: abs(process.env.SF_CLIENTS_ROOT ?? parsed.clientsRoot),
    inboxDir: abs(process.env.SF_INBOX_DIR ?? parsed.inboxDir),
    templatesDir: abs(process.env.SF_TEMPLATES_DIR ?? parsed.templatesDir),
    defaultTemplate: parsed.defaultTemplate,
    uupmScript: abs(parsed.uupmScript),
    limits: parsed.limits,
  };
}
