import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface AuditEntry {
  readonly tool: string;
  readonly ok: boolean;
  readonly ms: number;
  /** Argument names and short scalar values only; long strings and objects are summarised. */
  readonly args: Record<string, unknown>;
  readonly error?: string;
}

/** One id per server process, so all lines from one agent session can be grouped. */
export const RUN_ID = `${new Date().toISOString().slice(0, 19).replaceAll(":", "")}-${process.pid}`;

const SECRET_KEY = /token|secret|password|key/i;

export function summariseArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (SECRET_KEY.test(key)) out[key] = "***";
    else if (typeof value === "string") out[key] = value.length > 60 ? `${value.slice(0, 57)}…` : value;
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
    else if (Array.isArray(value)) out[key] = `[array:${value.length}]`;
    else if (typeof value === "object") out[key] = `{${Object.keys(value as object).join(",")}}`;
  }
  return out;
}

/** Appends a JSON line to the client's audit log. Never throws: logging must not break a tool. */
export function audit(logFile: string, entry: AuditEntry): void {
  try {
    if (!existsSync(path.dirname(logFile))) mkdirSync(path.dirname(logFile), { recursive: true });
    appendFileSync(logFile, `${JSON.stringify({ ts: new Date().toISOString(), runId: RUN_ID, ...entry })}\n`);
  } catch (error) {
    console.error(`[arke-web] audit write failed: ${(error as Error).message}`);
  }
}
