import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FactoryConfig } from "../config.js";
import { clientPaths } from "../lib/paths.js";
import type { JobRecord } from "./jobs.js";

/**
 * Conversation history per client, one JSON line per finished job in .factory/jobs.jsonl,
 * so the panel shows past agent work after a restart. Kept with the client (moves with it on archive).
 */
const FILE = "jobs.jsonl";
const MAX_SHOWN = 40;

function historyFile(factory: FactoryConfig, slug: string): string {
  return path.join(clientPaths(factory.clientsRoot, slug).factoryDir, FILE);
}

export function appendHistory(factory: FactoryConfig, slug: string, record: JobRecord): void {
  const paths = clientPaths(factory.clientsRoot, slug);
  if (!existsSync(paths.config)) return; // archived meanwhile
  appendFileSync(historyFile(factory, slug), `${JSON.stringify(record)}\n`);
}

export function readHistory(factory: FactoryConfig, slug: string): JobRecord[] {
  const file = historyFile(factory, slug);
  if (!existsSync(file)) return [];
  const out: JobRecord[] = [];
  for (const line of readFileSync(file, "utf8").split("\n").slice(-MAX_SHOWN - 1)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as JobRecord);
    } catch {
      // A torn last line after a crash is skipped, not fatal.
    }
  }
  return out.slice(-MAX_SHOWN);
}
