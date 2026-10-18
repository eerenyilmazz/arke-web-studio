import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FactoryConfig } from "../config.js";
import { clientPaths } from "../lib/paths.js";
import type { JobRecord } from "./jobs.js";
import { withCurrentKind } from "./kinds.js";

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
  for (const line of readFileSync(file, "utf8")
    .split("\n")
    .slice(-MAX_SHOWN - 1)) {
    if (!line.trim()) continue;
    try {
      out.push(withCurrentKind(JSON.parse(line) as JobRecord));
    } catch {
      // A torn last line after a crash is skipped, not fatal.
    }
  }
  return out.slice(-MAX_SHOWN);
}

/**
 * Everything Eren pasted or wrote about a client, one JSON line per agent job in .factory/inputs.jsonl.
 * Each agent job starts fresh, so facts that were only "noted" in an earlier job would otherwise be lost;
 * later jobs get these earlier inputs back (as client data) and can finish the site without asking again.
 */
const INPUTS_FILE = "inputs.jsonl";
const MAX_INPUTS = 12;
const MAX_INPUT_CHARS = 24_000;

export interface ClientInput {
  readonly at: string;
  readonly kind: string;
  readonly text: string;
}

function inputsFile(factory: FactoryConfig, slug: string): string {
  return path.join(clientPaths(factory.clientsRoot, slug).factoryDir, INPUTS_FILE);
}

export function appendInput(factory: FactoryConfig, slug: string, kind: string, text: string): void {
  const paths = clientPaths(factory.clientsRoot, slug);
  if (!text.trim() || !existsSync(paths.config)) return;
  mkdirSync(paths.factoryDir, { recursive: true });
  const record: ClientInput = { at: new Date().toISOString(), kind, text: text.trim() };
  appendFileSync(inputsFile(factory, slug), `${JSON.stringify(record)}\n`);
}

/** The most recent inputs, oldest first, trimmed to a total size the prompt can carry. */
export function readInputs(factory: FactoryConfig, slug: string): ClientInput[] {
  const file = inputsFile(factory, slug);
  // Clients from before this log existed: rebuild it from the job history (pasted text and change requests).
  if (!existsSync(file)) return trim(fromHistory(factory, slug));
  const all: ClientInput[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      all.push(withCurrentKind(JSON.parse(line) as ClientInput));
    } catch {
      // torn line after a crash: skipped
    }
  }
  return trim(all);
}

const KINDS_WITH_INPUT: ReadonlySet<string> = new Set(["create-site", "revise"]);
const PLACEHOLDER_REQUEST = /^Siteyi hazırla/;

function fromHistory(factory: FactoryConfig, slug: string): ClientInput[] {
  return readHistory(factory, slug)
    .filter((r) => KINDS_WITH_INPUT.has(r.kind) && r.request && !PLACEHOLDER_REQUEST.test(r.request))
    .map((r) => ({ at: r.startedAt, kind: r.kind, text: r.request! }));
}

function trim(all: readonly ClientInput[]): ClientInput[] {
  const out: ClientInput[] = [];
  let total = 0;
  for (const input of all.slice(-MAX_INPUTS).reverse()) {
    if (total + input.text.length > MAX_INPUT_CHARS) break;
    total += input.text.length;
    out.unshift(input);
  }
  return out;
}
