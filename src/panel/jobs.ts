import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyUsage, PACKAGE_LABELS, usageFrom, weighted, type AgentPolicy, type Usage } from "./budget.js";

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
  /** Who started it (the computer's user name), so records stay attributable when more people use the factory. */
  readonly by?: string;
  /** Which agent ran it (agent jobs only). */
  provider?: "claude" | "codex";
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
  /** Budget used so far (agent jobs): Claude's own token counts, plus the model and the cap that applied. */
  usage?: Usage;
  tokens?: number;
  model?: string;
  mode?: string;
  tokenCap?: number;
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
  "mcp__site-factory__edit_site_file",
  "mcp__site-factory__site_map",
  "mcp__site-factory__read_site_file_part",
  "mcp__site-factory__search_design_knowledge",
  "mcp__site-factory__save_research_notes",
  "mcp__site-factory__save_design_plan",
  // No bare "Read", "Grep" or "Glob" here: a bare name allows reading ANY file on the machine. Without it, Claude
  // Code lets these read-only tools work without a prompt only in the working directory (the factory) and the
  // --add-dir folders (clients, inbox); anything else is refused in a headless run.
  // Design skills in .claude/skills (impeccable, taste-skill, animate, UI UX Pro Max): instructions only. Their scripts
  // would need Bash, which stays denied below.
  "Skill",
] as const;
export const AGENT_DENIED_TOOLS = ["Bash", "Edit", "Write", "NotebookEdit", "Task", "mcp__site-factory__deploy", "mcp__site-factory__create_client"] as const;
/**
 * Secrets the agent must never read, even if a client text or a web page tells it to (prompt injection): process
 * environments (the panel's holds the Cloudflare tokens), keys, shell profiles where tokens may be exported,
 * tool credentials and .env files. Explicit denies, on top of the folder limit above.
 */
export const AGENT_DENIED_READS = [
  "Read(//proc/**)",
  "Read(//sys/**)",
  "Read(~/.ssh/**)",
  "Read(~/.gnupg/**)",
  "Read(~/.aws/**)",
  "Read(~/.docker/**)",
  "Read(~/.claude/**)",
  "Read(~/.config/**)",
  "Read(~/.wrangler/**)",
  "Read(~/.bashrc)",
  "Read(~/.bash_profile)",
  "Read(~/.profile)",
  "Read(~/.zshrc)",
  "Read(~/.zprofile)",
  "Read(~/.netrc)",
  "Read(~/.npmrc)",
  "Read(~/.git-credentials)",
  "Read(~/.gitconfig)",
  "Read(**/.env)",
  "Read(**/.env.*)",
  "Read(**/.dev.vars)",
] as const;
/** Web research tools: allowed only while the "İnternet araştırması" setting is on, denied otherwise. */
export const WEB_TOOLS = ["WebSearch", "WebFetch"] as const;
/** Change requests on a custom site may touch several files and rebuild. */
const MAX_AGENT_TURNS = 120;
/** "Prepare site" runs answers, design, content and build in one job, so it needs more turns. */
/** Custom sites (brand + every page written by hand) need many more tool calls than filling a template. */
export const MAX_AUTOPILOT_TURNS = 300;
/** Jobs that may design and write a whole site. */
const LONG_JOBS: ReadonlySet<string> = new Set(["create-site", "upgrade-template", "concepts", "choose-concept", "redesign"]);
const MAX_LOG_LINES = 2000;
const MAX_TEXT = 4000;

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export function claudeArgs(maxTurns: number = MAX_AGENT_TURNS, web = false, readDirs: readonly string[] = []): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--max-turns",
    String(maxTurns),
    "--mcp-config",
    ".mcp.json",
    "--strict-mcp-config",
    // Only the factory's own settings (.claude/settings.json + settings.local.json): hooks, permissions and plugins
    // from the operator's user settings (~/.claude, e.g. a code-graph tool's PreToolUse hooks) never run in an agent job.
    "--setting-sources",
    "project,local",
    "--allowedTools",
    [...AGENT_ALLOWED_TOOLS, ...(web ? WEB_TOOLS : [])].join(","),
    "--disallowedTools",
    [...AGENT_DENIED_TOOLS, ...AGENT_DENIED_READS, ...(web ? [] : WEB_TOOLS)].join(","),
    // Client folders and the inbox, so Read can open logos, uploads and screenshots (writing stays denied).
    ...readDirs.flatMap((d) => ["--add-dir", d]),
  ];
}

/**
 * Codex features that would widen what the agent can do beyond the site-factory tools: a shell (reading any file),
 * browsers and computer use (network, the desktop), apps, plugins, hooks, sub-agents, image generation. All off.
 * The list is kept explicit (not "everything but"), so a new Codex version cannot silently turn on less.
 */
export const CODEX_DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "unified_exec_tty",
  "shell_snapshot",
  "write_stdin_approval",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "browser_annotation_api",
  "in_app_browser",
  "computer_use",
  "in_app_local_automation",
  "apps",
  "plugins",
  "remote_plugin",
  "plugin_sharing",
  "hooks",
  "multi_agent",
  "image_generation",
  "realtime_conversation",
  "skill_mcp_dependency_install",
  "tool_suggest",
  "workspace_dependencies",
  "worktrees",
  "goals",
] as const;

/** TOML string for a -c override (JSON strings are valid TOML basic strings). */
const toml = (v: string) => JSON.stringify(v);

/**
 * `codex exec` with the same boundaries as the Claude jobs: read-only sandbox, never asks, no shell or browser
 * features, only the site-factory MCP server (given here, user config ignored), no web search unless asked.
 * It runs in an empty working folder, so even its read-only workspace holds nothing.
 */
export function codexArgs(opts: { factoryRoot: string; workDir: string; model?: string; web?: boolean; serverEnv?: Record<string, string> }): string[] {
  const server = path.join(opts.factoryRoot, "dist", "server.js");
  const envPairs = Object.entries(opts.serverEnv ?? {}).flatMap(([k, v]) => ["-c", `mcp_servers.site-factory.env.${k}=${toml(v)}`]);
  return [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "-s",
    "read-only",
    "-c",
    `approval_policy=${toml("never")}`,
    "-C",
    opts.workDir,
    ...CODEX_DISABLED_FEATURES.flatMap((f) => ["--disable", f]),
    "-c",
    `mcp_servers.site-factory.command=${toml(process.execPath)}`,
    "-c",
    `mcp_servers.site-factory.args=[${toml(server)}]`,
    ...envPairs,
    ...(opts.web ? ["--search"] : []),
    ...(opts.model ? ["-m", opts.model] : []),
    "-",
  ];
}

/** Factory paths the MCP server needs, when the panel was started with overrides (SF_CLIENTS_ROOT…). */
function serverEnvFrom(parent: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["SF_CLIENTS_ROOT", "SF_INBOX_DIR", "SF_TEMPLATES_DIR", "SF_FORM_ACTION", "SF_BROWSER", "SF_SCREENSHOTS"]) {
    const v = parent[k];
    if (v) out[k] = v;
  }
  out.SF_NO_ACCOUNTS = "1"; // the MCP server Codex starts never reads the person's saved accounts
  return out;
}

/**
 * The agent never needs Cloudflare credentials (it cannot deploy): they are removed from its environment, and
 * SF_NO_ACCOUNTS=1 keeps its processes (and the MCP server it starts) from reading the accounts saved in the panel.
 */
export function agentEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(parent)) if (!k.startsWith("SF_CF_") && k !== "SF_ACCOUNTS_DIR") env[k] = v;
  env.SF_NO_ACCOUNTS = "1";
  return env;
}

/** What is kept of a finished job (the full log is not): enough to show it in the conversation later. */
export interface JobRecord {
  readonly id: string;
  readonly by?: string;
  readonly kind: string;
  readonly title: string;
  readonly request?: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly status: JobStatus;
  readonly summary?: string;
  readonly tools: string[];
  readonly errors: string[];
  readonly usage?: Usage;
  readonly tokens?: number;
  readonly model?: string;
  readonly mode?: string;
  readonly provider?: "claude" | "codex";
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
    errors: job.log
      .filter((l) => l.kind === "error")
      .map((l) => l.text)
      .slice(-MAX_RECORD_ERRORS),
    ...(job.usage ? { usage: job.usage, tokens: job.tokens ?? weighted(job.usage), model: job.model, mode: job.mode } : {}),
    ...(job.provider ? { provider: job.provider } : {}),
    ...(job.by ? { by: job.by } : {}),
  };
}

export class JobRunner {
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly factoryRoot: string,
    private readonly spawn: SpawnFn = nodeSpawn,
    private readonly claudeBin: string = process.env.SF_CLAUDE_BIN ?? "claude",
    /** Called once when a job ends (used to keep the conversation history in the client folder). */
    private readonly onFinish: (slug: string, record: JobRecord) => void = () => {
      /* nothing to do unless the panel passes a hook */
    },
    /** Read at the start of every job, so the setting applies from the next job on. */
    private readonly webResearch: () => boolean = () => false,
    private readonly readDirs: readonly string[] = [],
    private readonly codexBin: string = process.env.SF_CODEX_BIN ?? "codex",
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
    const job: Job = {
      id: randomUUID(),
      slug,
      kind,
      title,
      ...(request ? { request } : {}),
      by: os.userInfo().username,
      startedAt: new Date().toISOString(),
      status: "running",
      log: [],
    };
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
  startAgent(slug: string, kind: string, title: string, prompt: string, request?: string, policy?: AgentPolicy): Job {
    const job = this.create(slug, kind, title, request);
    job.usage = emptyUsage();
    job.tokens = 0;
    if (policy) {
      job.model = policy.model;
      job.mode = policy.mode;
      job.tokenCap = policy.tokenCap;
    }
    const codex = policy?.provider === "codex";
    job.provider = codex ? "codex" : "claude";
    const engine = codex ? "Codex" : "Claude Code";
    this.push(
      job,
      "info",
      `Agent başlatıldı: ${engine} (sadece site-factory araçları; shell ve dosya düzenleme kapalı)${policy ? ` · ${PACKAGE_LABELS[policy.mode]} paket, ${policy.model || "varsayılan model"}, en fazla ${Math.round(policy.tokenCap / 1000)}K token` : ""}.`,
    );
    let child: ChildProcess;
    let workDir: string | null = null;
    try {
      const web = policy ? policy.research : this.webResearch();
      if (codex) {
        // An empty folder as Codex's workspace: nothing to read there, nothing it may write.
        workDir = mkdtempSync(path.join(os.tmpdir(), "sf-codex-"));
        const args = codexArgs({ factoryRoot: this.factoryRoot, workDir, model: policy?.model || undefined, web, serverEnv: serverEnvFrom(process.env) });
        child = this.spawn(this.codexBin, args, { cwd: workDir, env: agentEnv(process.env), stdio: ["pipe", "pipe", "pipe"] });
      } else {
        const turns = policy?.maxTurns ?? (LONG_JOBS.has(kind) ? MAX_AUTOPILOT_TURNS : undefined);
        const args = [...claudeArgs(turns, web, this.readDirs), ...(policy ? ["--model", policy.model] : [])];
        child = this.spawn(this.claudeBin, args, { cwd: this.factoryRoot, env: agentEnv(process.env), stdio: ["pipe", "pipe", "pipe"] });
      }
    } catch (error) {
      this.push(job, "error", `${engine} başlatılamadı: ${(error as Error).message}`);
      this.finish(job, "failed");
      return job;
    }
    const cleanup = () => {
      if (workDir) rmSync(workDir, { recursive: true, force: true });
    };
    job.child = child;

    let buffer = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) codex ? this.handleCodexEvent(job, line) : this.handleEvent(job, line);
      }
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", (error) => {
      cleanup();
      this.push(
        job,
        "error",
        codex
          ? `Codex çalıştırılamadı (${error.message}). WSL içinde "codex" kurulu ve giriş yapılmış mı? (npm i -g @openai/codex, sonra codex login)`
          : `Claude Code çalıştırılamadı (${error.message}). WSL içinde "claude" kurulu mu?`,
      );
      this.finish(job, "failed");
    });
    child.on("close", (code) => {
      cleanup();
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

  /** Adds one assistant message's usage (counted once per message id) and stops the job past its cap. */
  private countUsage(job: Job, messageId: string | undefined, raw: unknown): void {
    const u = usageFrom(raw);
    if (!u || !job.usage) return;
    const seen = (job as Job & { _seen?: Set<string> })._seen ?? new Set<string>();
    (job as Job & { _seen?: Set<string> })._seen = seen;
    if (messageId) {
      if (seen.has(messageId)) return;
      seen.add(messageId);
    }
    job.usage.input += u.input;
    job.usage.output += u.output;
    job.usage.cacheRead += u.cacheRead;
    job.usage.cacheWrite += u.cacheWrite;
    this.stopIfOverCap(job, "Yazılanlar duruyor; devam için tekrar başlat ya da Ayarlar → Kaynak Kullanımı'ndan paketi yükselt.");
  }

  /** Recomputes the job's units and stops it once they pass its cap. */
  private stopIfOverCap(job: Job, advice: string): void {
    if (!job.usage) return;
    job.tokens = weighted(job.usage);
    if (!job.tokenCap || job.tokens <= job.tokenCap || job.status !== "running" || !job.child) return;
    job.child.kill("SIGTERM");
    this.push(job, "error", `Bu işin token tavanı aşıldı (${Math.round(job.tokens / 1000)}K / ${Math.round(job.tokenCap / 1000)}K), iş durduruldu. ${advice}`);
    this.finish(job, "failed");
  }

  /** A tool call started by either agent: shown in the log, and it moves the progress phase. */
  private noteToolCall(job: Job, tool: string, input: unknown): void {
    this.push(job, "tool", `${tool}(${summariseInput(input)})`);
    const phase = phaseOf(tool, input);
    if (phase) job.phase = phase;
    if (phase === "pages" || phase === "brand") job.filesWritten = (job.filesWritten ?? 0) + 1;
    if (tool === "Skill") {
      const name = String((input as { skill?: unknown } | undefined)?.skill ?? "").slice(0, 60);
      if (name && !(job.skillsUsed ?? []).includes(name)) job.skillsUsed = [...(job.skillsUsed ?? []), name];
    }
  }

  // ---------------------------------------------------------------- Codex events

  /**
   * One JSONL event from `codex exec --json`: messages, MCP tool calls, usage at the end of a turn, failures.
   * Codex reports no price, so cost is left to the profit settings (USD per million units).
   */
  private handleCodexEvent(job: Job, line: string): void {
    let event: CodexEvent;
    try {
      event = JSON.parse(line) as CodexEvent;
    } catch {
      return; // log lines on stdout that are not events
    }
    if (event.type === "item.completed" || event.type === "item.started") this.codexItem(job, event.type, event.item ?? {});
    else if (event.type === "turn.completed") this.codexUsage(job, event.usage);
    else if (event.type === "turn.failed" || (event.type === "error" && !/^Reconnecting/i.test(event.message ?? ""))) this.codexFailure(job, event);
  }

  private codexItem(job: Job, type: "item.started" | "item.completed", item: Record<string, unknown>): void {
    const kind = String(item.type ?? "");
    if (type === "item.completed" && kind === "agent_message" && typeof item.text === "string" && item.text.trim()) {
      job.summary = item.text.trim();
      this.push(job, "agent", job.summary);
      return;
    }
    if (kind !== "mcp_tool_call") return;
    const tool = String(item.tool ?? item.name ?? "");
    if (type === "item.started") this.noteToolCall(job, tool, item.arguments);
    else if (item.status === "failed" || item.error) {
      const err = item.error as { message?: string } | string | undefined;
      this.push(job, "error", typeof err === "string" ? err : (err?.message ?? `${tool} başarısız`));
    }
  }

  private codexUsage(job: Job, usage: Record<string, unknown> | undefined): void {
    if (!usage || !job.usage) return;
    const n = (k: string) => (typeof usage[k] === "number" ? (usage[k] as number) : 0);
    const cached = n("cached_input_tokens");
    // OpenAI counts cached tokens inside input_tokens.
    job.usage.input += Math.max(0, n("input_tokens") - cached);
    job.usage.cacheRead += cached;
    job.usage.output += n("output_tokens");
    this.stopIfOverCap(job, "Yazılanlar duruyor; devam için tekrar başlat.");
  }

  private codexFailure(job: Job, event: CodexEvent): void {
    const text = event.error?.message ?? event.message ?? "Codex hatası";
    this.push(
      job,
      "error",
      /usage limit|rate limit|quota/i.test(text)
        ? `Codex kullanım limiti doldu. Yazılan dosyalar duruyor; limit açılınca tekrar deneyin. (${text.slice(0, 200)})`
        : text,
    );
    if (event.type === "turn.failed") this.finish(job, "failed");
  }

  // ---------------------------------------------------------------- Claude Code events

  /** One stream-json event from Claude Code, turned into readable log lines. */
  private handleEvent(job: Job, line: string): void {
    let event: ClaudeEvent;
    try {
      event = JSON.parse(line) as ClaudeEvent;
    } catch {
      this.push(job, "info", line);
      return;
    }
    const blocks = Array.isArray(event.message?.content) ? (event.message.content as Array<Record<string, unknown>>) : [];
    if (event.type === "assistant") this.claudeAssistant(job, event, blocks);
    else if (event.type === "user") {
      for (const b of blocks) if (b.type === "tool_result" && b.is_error === true) this.push(job, "error", toolResultText(b.content));
    } else if (event.type === "result") this.claudeResult(job, event);
  }

  private claudeAssistant(job: Job, event: ClaudeEvent, blocks: Array<Record<string, unknown>>): void {
    this.countUsage(job, event.message?.id, event.message?.usage);
    for (const b of blocks) {
      if (b.type === "text" && typeof b.text === "string" && b.text.trim()) this.push(job, "agent", b.text.trim());
      if (b.type === "tool_use") this.noteToolCall(job, shortTool(String(b.name)), b.input);
    }
  }

  private claudeResult(job: Job, event: ClaudeEvent): void {
    // The final totals from Claude replace the running count (they include everything, e.g. retries).
    const total = usageFrom(event.usage);
    if (total && job.usage) {
      job.usage = { ...total, ...(typeof event.total_cost_usd === "number" ? { costUsd: Math.round(event.total_cost_usd * 10000) / 10000 } : {}) };
      job.tokens = weighted(job.usage);
    }
    job.summary = typeof event.result === "string" ? event.result : undefined;
    if (job.summary) this.push(job, "result", job.summary);
    if (event.is_error || event.subtype !== "success") {
      this.push(job, "error", failureText(job.summary, event.subtype));
      this.finish(job, "failed");
    }
  }
}

interface CodexEvent {
  type?: string;
  message?: string;
  item?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  error?: { message?: string };
}

interface ClaudeEvent {
  type?: string;
  subtype?: string;
  message?: { id?: string; content?: unknown; usage?: unknown };
  result?: string;
  is_error?: boolean;
  num_turns?: number;
  usage?: unknown;
  total_cost_usd?: number;
}

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

/** What the operator sees while an agent works. Order matters: it is the usual sequence. */
export const PHASES = ["reading", "saving", "design", "brand", "pages", "checking"] as const;
export type Phase = (typeof PHASES)[number];

export function phaseOf(tool: string, input: unknown): Phase | null {
  const path = typeof input === "object" && input !== null ? String((input as { path?: unknown }).path ?? "") : "";
  switch (tool) {
    case "get_client_status":
    case "list_clients":
    case "read_site_file":
    case "list_site_files":
    case "Read":
    case "Glob":
    case "Grep":
    case "site_map":
    case "read_site_file_part":
      return "reading";
    case "update_client_config":
    case "save_content":
    case "save_asset":
      return "saving";
    case "generate_design_system":
    case "Skill":
    case "search_design_knowledge":
      return "design";
    case "write_site_file":
    case "delete_site_file":
    case "edit_site_file":
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
    .map(
      ([k, v]) =>
        `${k}=${typeof v === "string" ? JSON.stringify(v.length > 40 ? `${v.slice(0, 37)}…` : v) : typeof v === "object" && v !== null ? `{${Object.keys(v).join(",")}}` : String(v)}`,
    )
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
