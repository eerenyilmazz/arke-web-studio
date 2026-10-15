import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";

/*
 * Jobs are long-running work started from the panel: agent runs (Claude Code in headless mode) and
 * factory tasks such as build and deploy. One job runs at a time, so two writers never touch the same
 * client folder, and the operator sees a single live log.
 */

export type JobStatus = "running" | "succeeded" | "failed" | "cancelled";

export interface LogLine {
  readonly at: string;
  readonly kind: "info" | "agent" | "tool" | "result" | "error";
  readonly text: string;
}

export interface Job {
  readonly id: string;
  readonly slug: string;
  readonly kind: string;
  readonly title: string;
  readonly startedAt: string;
  status: JobStatus;
  endedAt?: string;
  log: LogLine[];
  summary?: string;
  /** Not serialised. */
  child?: ChildProcess;
}

/** The only tools an agent job may use. No shell, no file edits, no deploy, no new clients. */
export const AGENT_ALLOWED_TOOLS = [
  "mcp__site-factory__get_client_status",
  "mcp__site-factory__list_clients",
  "mcp__site-factory__update_client_config",
  "mcp__site-factory__save_content",
  "mcp__site-factory__save_asset",
  "mcp__site-factory__generate_design_system",
  "mcp__site-factory__build_site",
  "Read",
  "Grep",
  "Glob",
] as const;
export const AGENT_DENIED_TOOLS = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Task", "mcp__site-factory__deploy", "mcp__site-factory__create_client"] as const;
const MAX_AGENT_TURNS = 60;
const MAX_LOG_LINES = 2000;
const MAX_TEXT = 4000;

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export function claudeArgs(): string[] {
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--max-turns", String(MAX_AGENT_TURNS),
    "--mcp-config", ".mcp.json",
    "--strict-mcp-config",
    "--allowedTools", AGENT_ALLOWED_TOOLS.join(","),
    "--disallowedTools", AGENT_DENIED_TOOLS.join(","),
  ];
}

/** The agent never needs Cloudflare credentials (it cannot deploy), so they are removed from its environment. */
export function agentEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(parent)) if (!k.startsWith("SF_CF_")) env[k] = v;
  return env;
}

export class JobRunner {
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly factoryRoot: string,
    private readonly spawn: SpawnFn = nodeSpawn,
    private readonly claudeBin: string = process.env.SF_CLAUDE_BIN ?? "claude",
  ) {}

  running(): Job | undefined {
    return [...this.jobs.values()].find((j) => j.status === "running");
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(slug?: string): Job[] {
    return [...this.jobs.values()].filter((j) => !slug || j.slug === slug).reverse();
  }

  private create(slug: string, kind: string, title: string): Job {
    const active = this.running();
    if (active) throw new Error(`Şu an başka bir iş çalışıyor: "${active.title}" (${active.slug}). Bitmesini bekleyin.`);
    const job: Job = { id: randomUUID(), slug, kind, title, startedAt: new Date().toISOString(), status: "running", log: [] };
    this.jobs.set(job.id, job);
    return job;
  }

  private push(job: Job, kind: LogLine["kind"], text: string): void {
    job.log.push({ at: new Date().toISOString(), kind, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text });
    if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
  }

  private finish(job: Job, status: JobStatus): void {
    if (job.status !== "running") return;
    job.status = status;
    job.endedAt = new Date().toISOString();
    delete job.child;
  }

  /** Runs a factory function (build, deploy…) as a job. */
  startTask(slug: string, kind: string, title: string, fn: (log: (text: string) => void) => Promise<string>): Job {
    const job = this.create(slug, kind, title);
    fn((text) => this.push(job, "info", text))
      .then((summary) => {
        job.summary = summary;
        this.push(job, "result", summary);
        this.finish(job, "succeeded");
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        job.summary = message;
        this.push(job, "error", message);
        this.finish(job, "failed");
      });
    return job;
  }

  /** Runs Claude Code headless in the factory folder with the restricted tool set. */
  startAgent(slug: string, kind: string, title: string, prompt: string): Job {
    const job = this.create(slug, kind, title);
    this.push(job, "info", "Agent başlatıldı (sadece site-factory araçları; shell ve dosya düzenleme kapalı).");
    let child: ChildProcess;
    try {
      child = this.spawn(this.claudeBin, claudeArgs(), { cwd: this.factoryRoot, env: agentEnv(process.env), stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      this.push(job, "error", `Claude Code başlatılamadı: ${(error as Error).message}`);
      this.finish(job, "failed");
      return job;
    }
    job.child = child;

    let buffer = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) this.handleEvent(job, line);
      }
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", (error) => {
      this.push(job, "error", `Claude Code çalıştırılamadı (${error.message}). WSL içinde "claude" kurulu mu?`);
      this.finish(job, "failed");
    });
    child.on("close", (code) => {
      if (job.status !== "running") return;
      if (code === 0) this.finish(job, "succeeded");
      else {
        this.push(job, "error", `Agent ${code} koduyla bitti.${stderr ? `\n${stderr}` : ""}`);
        this.finish(job, "failed");
      }
    });
    child.stdin?.end(prompt);
    return job;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running" || !job.child) return false;
    job.child.kill("SIGTERM");
    this.push(job, "info", "İptal edildi.");
    this.finish(job, "cancelled");
    return true;
  }

  /** Turns one stream-json event from Claude Code into readable log lines. */
  private handleEvent(job: Job, line: string): void {
    let event: { type?: string; subtype?: string; message?: { content?: unknown }; result?: string; is_error?: boolean; num_turns?: number };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      this.push(job, "info", line);
      return;
    }
    const blocks = Array.isArray(event.message?.content) ? (event.message.content as Array<Record<string, unknown>>) : [];
    if (event.type === "assistant") {
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) this.push(job, "agent", b.text.trim());
        if (b.type === "tool_use") this.push(job, "tool", `${shortTool(String(b.name))}(${summariseInput(b.input)})`);
      }
    } else if (event.type === "user") {
      for (const b of blocks) {
        if (b.type === "tool_result" && b.is_error === true) this.push(job, "error", toolResultText(b.content));
      }
    } else if (event.type === "result") {
      job.summary = typeof event.result === "string" ? event.result : undefined;
      if (job.summary) this.push(job, "result", job.summary);
      if (event.is_error || event.subtype !== "success") {
        this.push(job, "error", `Agent tamamlanamadı (${event.subtype ?? "error"}).`);
        this.finish(job, "failed");
      }
    }
  }
}

function shortTool(name: string): string {
  return name.replace(/^mcp__site-factory__/, "");
}

function summariseInput(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  return Object.entries(input as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v.length > 40 ? `${v.slice(0, 37)}…` : v) : typeof v === "object" && v !== null ? `{${Object.keys(v).join(",")}}` : String(v)}`)
    .join(", ");
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === "object" && c && "text" in c ? String((c as { text: unknown }).text) : "")).join("\n");
  return "Araç hatası";
}

export function serialiseJob(job: Job, since = 0): Omit<Job, "child" | "log"> & { log: LogLine[]; logTotal: number } {
  const { child: _child, log, ...rest } = job;
  return { ...rest, log: log.slice(since), logTotal: log.length };
}
