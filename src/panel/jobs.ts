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
  /** What the operator asked for, shown as their message in the conversation. */
  readonly request?: string;
  readonly startedAt: string;
  status: JobStatus;
  endedAt?: string;
  log: LogLine[];
  summary?: string;
  /** Plain-language stage of an agent job, worked out from the tools it calls (see phaseOf). */
  phase?: Phase;
  /** Site files written so far (custom sites). */
  filesWritten?: number;
  /** Design skills the agent loaded (Skill tool), shown in the panel. */
  skillsUsed?: string[];
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
  "mcp__site-factory__list_site_files",
  "mcp__site-factory__read_site_file",
  "mcp__site-factory__write_site_file",
  "mcp__site-factory__delete_site_file",
  "Read",
  "Grep",
  "Glob",
  // Design skills in .claude/skills (impeccable, taste-skill, UI UX Pro Max): instructions only. Their scripts
  // would need Bash, which stays denied below.
  "Skill",
] as const;
export const AGENT_DENIED_TOOLS = ["Bash", "Edit", "Write", "NotebookEdit", "Task", "mcp__site-factory__deploy", "mcp__site-factory__create_client"] as const;
/** Web research tools: allowed only while the "İnternet araştırması" setting is on, denied otherwise. */
export const WEB_TOOLS = ["WebSearch", "WebFetch"] as const;
/** Change requests on a custom site may touch several files and rebuild. */
const MAX_AGENT_TURNS = 120;
/** "Prepare site" runs answers, design, content and build in one job, so it needs more turns. */
/** Custom sites (brand + every page written by hand) need many more tool calls than filling a template. */
export const MAX_AUTOPILOT_TURNS = 300;
/** Jobs that may design and write a whole site. */
const LONG_JOBS: ReadonlySet<string> = new Set(["autopilot", "upgrade-template", "concepts", "choose-concept", "redesign"]);
const MAX_LOG_LINES = 2000;
const MAX_TEXT = 4000;

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export function claudeArgs(maxTurns: number = MAX_AGENT_TURNS, web = false): string[] {
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--max-turns", String(maxTurns),
    "--mcp-config", ".mcp.json",
    "--strict-mcp-config",
    "--allowedTools", [...AGENT_ALLOWED_TOOLS, ...(web ? WEB_TOOLS : [])].join(","),
    "--disallowedTools", [...AGENT_DENIED_TOOLS, ...(web ? [] : WEB_TOOLS)].join(","),
  ];
}

/** The agent never needs Cloudflare credentials (it cannot deploy), so they are removed from its environment. */
export function agentEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(parent)) if (!k.startsWith("SF_CF_")) env[k] = v;
  return env;
}

/** What is kept of a finished job (the full log is not): enough to show it in the conversation later. */
export interface JobRecord {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly request?: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly status: JobStatus;
  readonly summary?: string;
  readonly tools: string[];
  readonly errors: string[];
}

const MAX_RECORD_ERRORS = 5;

export function toRecord(job: Job): JobRecord {
  return {
    id: job.id,
    kind: job.kind,
    title: job.title,
    ...(job.request ? { request: job.request } : {}),
    startedAt: job.startedAt,
    endedAt: job.endedAt ?? new Date().toISOString(),
    status: job.status,
    ...(job.summary ? { summary: job.summary } : {}),
    tools: job.log.filter((l) => l.kind === "tool").map((l) => l.text.split("(")[0] ?? l.text),
    errors: job.log.filter((l) => l.kind === "error").map((l) => l.text).slice(-MAX_RECORD_ERRORS),
  };
}

export class JobRunner {
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly factoryRoot: string,
    private readonly spawn: SpawnFn = nodeSpawn,
    private readonly claudeBin: string = process.env.SF_CLAUDE_BIN ?? "claude",
    /** Called once when a job ends (used to keep the conversation history in the client folder). */
    private readonly onFinish: (slug: string, record: JobRecord) => void = () => {},
    /** Read at the start of every job, so the setting applies from the next job on. */
    private readonly webResearch: () => boolean = () => false,
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

  private create(slug: string, kind: string, title: string, request?: string): Job {
    const active = this.running();
    if (active) throw new Error(`Şu an başka bir iş çalışıyor: "${active.title}" (${active.slug}). Bitmesini bekleyin.`);
    const job: Job = { id: randomUUID(), slug, kind, title, ...(request ? { request } : {}), startedAt: new Date().toISOString(), status: "running", log: [] };
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
    try {
      this.onFinish(job.slug, toRecord(job));
    } catch (error) {
      console.error("[panel] could not save job history:", error);
    }
  }

  /** Runs a factory function (build, deploy…) as a job. */
  startTask(slug: string, kind: string, title: string, fn: (log: (text: string) => void) => Promise<string>, request?: string): Job {
    const job = this.create(slug, kind, title, request);
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
  startAgent(slug: string, kind: string, title: string, prompt: string, request?: string): Job {
    const job = this.create(slug, kind, title, request);
    this.push(job, "info", "Agent başlatıldı (sadece site-factory araçları; shell ve dosya düzenleme kapalı).");
    let child: ChildProcess;
    try {
      child = this.spawn(this.claudeBin, claudeArgs(LONG_JOBS.has(kind) ? MAX_AUTOPILOT_TURNS : undefined, this.webResearch()), { cwd: this.factoryRoot, env: agentEnv(process.env), stdio: ["pipe", "pipe", "pipe"] });
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
        if (b.type === "tool_use") {
          this.push(job, "tool", `${shortTool(String(b.name))}(${summariseInput(b.input)})`);
          const phase = phaseOf(shortTool(String(b.name)), b.input);
          if (phase) job.phase = phase;
          if (phase === "pages" || phase === "brand") job.filesWritten = (job.filesWritten ?? 0) + 1;
          if (String(b.name) === "Skill") {
            const name = String((b.input as { skill?: unknown } | undefined)?.skill ?? "").slice(0, 60);
            if (name && !(job.skillsUsed ?? []).includes(name)) job.skillsUsed = [...(job.skillsUsed ?? []), name];
          }
        }
      }
    } else if (event.type === "user") {
      for (const b of blocks) {
        if (b.type === "tool_result" && b.is_error === true) this.push(job, "error", toolResultText(b.content));
      }
    } else if (event.type === "result") {
      job.summary = typeof event.result === "string" ? event.result : undefined;
      if (job.summary) this.push(job, "result", job.summary);
      if (event.is_error || event.subtype !== "success") {
        this.push(job, "error", failureText(job.summary, event.subtype));
        this.finish(job, "failed");
      }
    }
  }
}

/** What the operator sees while an agent works. Order matters: it is the usual sequence. */
/** A plain Turkish reason for a failed agent run; the usage limit is the common one and needs no fixing. */
export function failureText(summary: string | undefined, subtype: unknown): string {
  const text = summary ?? "";
  if (/session limit|usage limit|rate limit|limit reached/i.test(text)) {
    const reset = text.match(/resets\s+([^·\n]+)/i)?.[1]?.trim();
    return `Claude kullanım limitin doldu${reset ? ` (sıfırlanma: ${reset})` : ""}. Sitede bir sorun yok; yazılan dosyalar duruyor. Limit açılınca aynı düğmeye tekrar bas, agent kaldığı yerden devam eder.`;
  }
  if (subtype === "error_max_turns") return "Agent adım sınırına ulaştı. Tekrar başlatırsan yazdıklarının üstüne devam eder.";
  return `Agent tamamlanamadı (${typeof subtype === "string" ? subtype : "hata"}).`;
}

export const PHASES = ["reading", "saving", "design", "brand", "pages", "checking"] as const;
export type Phase = (typeof PHASES)[number];

export function phaseOf(tool: string, input: unknown): Phase | null {
  const path = typeof input === "object" && input !== null ? String((input as { path?: unknown }).path ?? "") : "";
  switch (tool) {
    case "get_client_status": case "list_clients": case "read_site_file": case "list_site_files": case "Read": case "Glob": case "Grep":
      return "reading";
    case "update_client_config": case "save_content": case "save_asset":
      return "saving";
    case "generate_design_system": case "Skill":
      return "design";
    case "write_site_file": case "delete_site_file":
      return path.startsWith("brand/") ? "brand" : "pages";
    case "build_site":
      return "checking";
    default:
      return null;
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
