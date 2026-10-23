import { readCloudflare } from "../lib/accounts.js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FACTORY_ROOT, type FactoryConfig } from "../config.js";
import { readBusiness } from "./business.js";
import { PACKAGE_LABELS } from "./budget.js";
import { readHistory } from "./history.js";
import { portalMessages, listLinks, readPortal, portalPaths } from "./portal.js";
import { readSettings } from "./settings.js";
import { siteHealth, type Fetcher } from "./health.js";
import * as tools from "../tools.js";
import { type Approval, approvalState, readApprovals } from "../lib/approvals.js";
import { readDraftConfig } from "../lib/client.js";
import { dirHash, readJsonIfExists } from "../lib/files.js";
import { clientPaths } from "../lib/paths.js";

/**
 * A read-only health report of the whole factory, for the operator to send after a test run: versions and set-up, every
 * client's state (build, approvals, deploys, payment, portal, recent jobs, the agent's tool calls) and automatic
 * checks of the promises the factory makes (approvals human-only, the agent never publishes, no secret in any client
 * file, nothing left on the portal). Secrets are never written: settings show only whether a value is set, and every
 * line passes through mask() with the real secret values. Nothing is changed.
 */
export type Verdict = "pass" | "warn" | "fail";
export interface Check {
  readonly verdict: Verdict;
  readonly area: string;
  readonly text: string;
}

const MAX_JOBS = 15;
const MAX_AUDIT = 25;
const MAX_SUMMARY = 300;
const MAX_SCAN_BYTES = 2_000_000;
const AGENT_FORBIDDEN_TOOLS = new Set([
  "Bash",
  "Edit",
  "Write",
  "NotebookEdit",
  "Task",
  "deploy",
  "create_client",
  "mcp__site-factory__deploy",
  "mcp__site-factory__create_client",
]);
const SCAN_SKIP = new Set(["node_modules", ".git", ".wrangler"]);
const TEXT_FILE = /\.(json|jsonl|md|log|txt|html|css|js|svg|xml|jsonc)$/i;

/** The secret values this machine holds (never printed): Cloudflare tokens from the environment, the portal secret. */
export function knownSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = Object.entries(env)
    .filter(([k, v]) => k.startsWith("SF_CF_") && k.endsWith("API_TOKEN") && typeof v === "string" && v.length >= 8)
    .map(([, v]) => v!);
  const portal = readPortal();
  const saved = readCloudflare();
  return [...fromEnv, ...(saved ? [saved.token] : []), ...(portal ? [portal.secret] : [])];
}

/** Hides the known secrets and anything that looks like a bearer token or an exported credential. */
export function mask(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("***");
  return out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/g, "$1***").replace(/((?:API_TOKEN|ACCOUNT_ID|SECRET|PASSWORD)\s*[=:]\s*["']?)[^\s"']{6,}/gi, "$1***");
}

function tryVersion(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .split("\n")[0]!
      .slice(0, 80);
  } catch {
    return "yok";
  }
}

function factoryVersion(): string {
  return (readJsonIfExists(path.join(FACTORY_ROOT, "package.json")) as { version?: string } | undefined)?.version ?? "?";
}

/** Files under a folder that may hold text, for the secret scan. */
function textFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SCAN_SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...textFiles(p));
    else if (e.isFile() && TEXT_FILE.test(e.name) && statSync(p).size <= MAX_SCAN_BYTES) out.push(p);
  }
  return out;
}

/** Client files that contain a secret value (paths only). */
export function filesWithSecrets(dirs: readonly string[], secrets: readonly string[]): string[] {
  if (!secrets.length) return [];
  return dirs
    .flatMap((d) => textFiles(d))
    .filter((f) => {
      const text = readFileSync(f, "utf8");
      return secrets.some((s) => s && text.includes(s));
    });
}

interface AuditLine {
  readonly ts: string;
  readonly tool: string;
  readonly ok: boolean;
  readonly error?: string;
}

function readAudit(file: string): AuditLine[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as AuditLine];
      } catch {
        return [];
      }
    });
}

const fmtDate = (iso: string | null | undefined) => (iso ? iso.replace("T", " ").slice(0, 16) : "–");
const yes = (b: boolean) => (b ? "var" : "yok");

interface ClientSection {
  readonly lines: string[];
  readonly checks: Check[];
}

/** Everything about one client, and the checks that concern it. */
async function clientSection(factory: FactoryConfig, slug: string, username: string, fetcher: Fetcher | null): Promise<ClientSection> {
  const paths = clientPaths(factory.clientsRoot, slug);
  const checks: Check[] = [];
  const add = (verdict: Verdict, text: string) => checks.push({ verdict, area: slug, text });
  const draft = readDraftConfig(paths) as {
    business?: { name?: string; country?: string; industry?: string };
    template?: string;
    i18n?: { locales?: string[] };
  };
  const status = tools.getClientStatus(factory, { slug });
  const lines = [
    `### ${draft.business?.name ?? slug} (${slug})`,
    "",
    `- Ülke ${draft.business?.country ?? "?"} · sektör ${draft.business?.industry ?? "?"} · tasarım ${draft.template ?? "?"} · diller ${(draft.i18n?.locales ?? []).join(", ")}`,
    `- Aşama: ${status.stage} · eksik soru: ${status.openQuestions.length}`,
  ];
  const c: Ctx = { factory, slug, paths, status, username, fetcher, lines, add };
  buildPart(c);
  approvalPart(c);
  await deployPart(c);
  paymentPart(c);
  portalPart(c);
  jobsPart(c);
  auditPart(c);
  lines.push("");
  return { lines, checks };
}

interface Ctx {
  readonly factory: FactoryConfig;
  readonly slug: string;
  readonly paths: ReturnType<typeof clientPaths>;
  readonly status: ReturnType<typeof tools.getClientStatus>;
  readonly username: string;
  readonly fetcher: Fetcher | null;
  readonly lines: string[];
  readonly add: (verdict: Verdict, text: string) => void;
  valid?: ReturnType<typeof approvalState>["valid"];
}

function buildPart(c: Ctx): void {
  const { paths, lines, add } = c;
  // Build: the last build, and whether dist/ is still its output.
  const build = c.status.lastBuild;
  if (build) {
    const distNow = existsSync(paths.distDir) ? dirHash(paths.distDir) : null;
    const untouched = Boolean(build.distHash && distNow === build.distHash);
    lines.push(`- Son build: ${fmtDate(build.at)} · ${build.passed ? "geçti" : "KALDI"} · dist ${untouched ? "build ile aynı" : "farklı"}`);
    if (!build.passed) add("warn", "Son build kontrollerden geçmedi.");
    if (build.passed && !untouched) add("warn", "dist/ son build'den sonra değişmiş; yayından önce yeniden build alınmalı.");
    const report = existsSync(paths.qualityReport) ? readFileSync(paths.qualityReport, "utf8") : "";
    const problems = [...report.matchAll(/^\|\s*([^|]+?)\s*\|\s*(WARN|FAIL)\s*\|\s*([^|]*)\|/gm)].map(
      (m) => `  - ${m[2]} ${m[1]}: ${m[3]!.trim().slice(0, 160)}`,
    );
    if (problems.length) lines.push("- Kalite uyarıları:", ...problems.slice(0, 12));
  } else lines.push("- Build: henüz yok");
}

function approvalPart(c: Ctx): void {
  const { paths, lines, add, username } = c;
  // Approvals: valid now, and who gave them (only the operator, from the panel or the terminal).
  const approvals = readApprovals(paths.approvals);
  const { valid } = approvalState(paths.root, paths.approvals, c.status.lastBuild?.distHash ?? null);
  c.valid = valid;
  lines.push(
    `- Onaylar: içerik ${valid.content ? "geçerli" : "yok"} · görsel ${valid.visual ? "geçerli" : "yok"} · yayın ${valid.production ? "geçerli" : "yok"} (toplam kayıt ${approvals.length})`,
  );
  const strangers = approvals.filter((a: Approval) => a.by !== username && a.by !== `panel:${username}`);
  if (strangers.length) {
    add(
      "warn",
      `Senin kullanıcı adınla verilmemiş onay: ${strangers.map((a) => `${a.kind} "${a.by}"`).join(", ")}. Başka bir bilgisayardan verdiysen sorun yok; değilse bana yaz.`,
    );
  } else if (approvals.length) add("pass", "Bütün onaylar senin (panel ya da terminal).");
}

async function deployPart(c: Ctx): Promise<void> {
  const { factory, slug, paths, lines, add, fetcher } = c;
  // Deploys and live checks.
  const deploys = (readJsonIfExists(path.join(paths.factoryDir, tools.DEPLOYS_FILE)) ?? {}) as Partial<
    Record<"preview" | "production", { url?: string | null; at?: string; rolledBackAt?: string; rolledBackBy?: string }>
  >;
  for (const target of ["preview", "production"] as const) {
    const d = deploys[target];
    if (d)
      lines.push(
        `- Yayın (${target}): ${d.url ?? "adres yok"} · ${fmtDate(d.at)}${d.rolledBackAt ? ` · önceki sürüme döndü ${fmtDate(d.rolledBackAt)} (${d.rolledBackBy ?? "?"})` : ""}`,
      );
    if (d?.rolledBackAt) add("warn", `${target} sitesi önceki sürüme döndürülmüş; yayındaki site bilgisayardaki dosyalardan eski. Düzeltip yeniden yayınla.`);
  }
  if (deploys.production && !c.valid?.production)
    add("warn", "Canlı yayın var ama şu anki içerik için yayın onayı yok (site yayından sonra değişmiş olabilir).");
  if (fetcher && (deploys.preview?.url || deploys.production?.url)) {
    const health = await siteHealth(factory, slug, fetcher);
    for (const c of health.live) {
      lines.push(`- Canlı kontrol (${c.target}): ${c.ok ? "açık" : "AÇILMIYOR"} ${c.status ?? ""} ${c.ms !== null ? `${c.ms} ms` : (c.error ?? "")}`);
      if (!c.ok) add("warn", `${c.target} adresi açılmıyor: ${c.url}`);
    }
  }
}

function paymentPart(c: Ctx): void {
  const { factory, slug, lines, add } = c;
  // Payment.
  const biz = readBusiness(factory, slug);
  if (biz) {
    const overdue = biz.payment !== "paid" && biz.paymentDue && biz.paymentDue < new Date().toISOString().slice(0, 10);
    lines.push(`- İş takibi: ${biz.price ?? "–"} ${biz.currency} · ödeme ${biz.payment} · vade ${biz.paymentDue ?? "–"}${overdue ? " · GECİKMİŞ" : ""}`);
    if (overdue) add("warn", "Ödeme gecikmiş.");
  }
}

function portalPart(c: Ctx): void {
  const { factory, slug, lines } = c;
  // Portal.
  const links = listLinks(factory, slug);
  const msgs = portalMessages(factory, slug);
  if (links.length || msgs.intake.length || msgs.comments.length || msgs.approval) {
    const by = (s: string) => msgs.comments.filter((c) => c.status === s).length;
    lines.push(
      `- Portal: açık link ${links.length} · gelen form ${msgs.intake.length} (işlenen ${msgs.intake.filter((e) => e.used).length}) · yorum açık ${by("open")}, iletilen ${by("sent")}, çözülen ${by("done")} · müşteri onayı ${msgs.approval ? `${msgs.approval.name} (${fmtDate(msgs.approval.at)})` : "yok"}`,
    );
  }
}

function jobsPart(c: Ctx): void {
  const { factory, slug, lines, add } = c;
  // Jobs, newest first, with the tools each agent job used.
  const history = readHistory(factory, slug).slice(-MAX_JOBS).reverse();
  if (history.length) {
    lines.push("- Son işler:");
    for (const j of history) {
      const secs = Math.round((Date.parse(j.endedAt) - Date.parse(j.startedAt)) / 1000);
      const cost = j.usage?.costUsd ? ` · $${j.usage.costUsd.toFixed(2)}` : "";
      lines.push(
        `  - ${fmtDate(j.startedAt)} · ${j.kind} · ${j.status} · ${secs} sn${j.tokens ? ` · ${j.tokens} birim` : ""}${cost}${j.provider ? ` · ${j.provider}` : ""}${j.model ? ` · ${j.model}` : ""}`,
      );
      if (j.summary) lines.push(`    Özet: ${j.summary.replace(/\s+/g, " ").slice(0, MAX_SUMMARY)}`);
      if (j.errors?.length) lines.push(`    Hatalar: ${j.errors.map((e) => e.replace(/\s+/g, " ").slice(0, 160)).join(" | ")}`);
      const forbidden = (j.tools ?? []).filter((t) => AGENT_FORBIDDEN_TOOLS.has(t.replace(/\(.*$/, "")));
      if (forbidden.length) add("fail", `"${j.title}" işinde agent yasak araç kullandı: ${forbidden.join(", ")}.`);
    }
    const failed = history.filter((j) => j.status === "failed");
    if (failed.length) add("warn", `${failed.length} iş başarısız bitti (son ${MAX_JOBS} iş içinde).`);
  }
}

function auditPart(c: Ctx): void {
  const { paths, lines, add } = c;
  // The agent's own tool calls (MCP audit log): it must never have called deploy.
  const audit = readAudit(paths.auditLog);
  if (audit.length) {
    const errorsN = audit.filter((a) => !a.ok).length;
    lines.push(`- Agent araç çağrıları: ${audit.length} (hatalı ${errorsN}); son ${Math.min(MAX_AUDIT, audit.length)}:`);
    for (const a of audit.slice(-MAX_AUDIT))
      lines.push(`  - ${fmtDate(a.ts)} ${a.tool} ${a.ok ? "ok" : `HATA: ${(a.error ?? "").replace(/\s+/g, " ").slice(0, 120)}`}`);
    const deploysByAgent = audit.filter((a) => a.tool === "deploy" || a.tool === "create_client");
    if (deploysByAgent.length)
      add("fail", `Agent ${deploysByAgent.map((a) => a.tool).join(", ")} aracını çağırmış (${deploysByAgent.length} kez). Bu araçlar agent'a kapalı olmalı.`);
    else add("pass", "Agent hiç yayın yapmadı ve müşteri oluşturmadı.");
  }
}

export interface ReportOptions {
  /** Live checks of the published addresses and the portal (read-only requests). Off: no network at all. */
  readonly network: boolean;
  readonly fetcher?: Fetcher;
  readonly env?: NodeJS.ProcessEnv;
  readonly username?: string;
}

export async function buildReport(factory: FactoryConfig, opts: ReportOptions): Promise<{ markdown: string; checks: Check[] }> {
  const env = opts.env ?? process.env;
  const username = opts.username ?? os.userInfo().username;
  const secrets = knownSecrets(env);
  const checks: Check[] = [];
  const add = (verdict: Verdict, area: string, text: string) => checks.push({ verdict, area, text });
  const fetcher = opts.network ? (opts.fetcher ?? (fetch as unknown as Fetcher)) : null;

  // Set-up: only whether values are set, never the values.
  const saved = readCloudflare();
  const cf = { token: Boolean(saved ?? env.SF_CF_MANAGED_API_TOKEN), account: Boolean(saved ?? env.SF_CF_MANAGED_ACCOUNT_ID) };
  const portal = readPortal();
  const settings = readSettings(factory);
  const head = [
    `# Site Factory raporu`,
    "",
    `- Tarih: ${fmtDate(new Date().toISOString())} · sürüm ${factoryVersion()} · Node ${process.version} · ${os.platform()} ${os.release()}`,
    `- Araçlar: claude ${tryVersion("claude", ["--version"])} · codex ${tryVersion("codex", ["--version"])} · wrangler ${existsSync(path.join(FACTORY_ROOT, "node_modules", "wrangler")) ? "kurulu" : "yok"}`,
    `- Cloudflare: token ${yes(cf.token)} · hesap kimliği ${yes(cf.account)} · portal ${portal ? `kurulu (${new URL(portal.url).host})` : "kurulmadı"}`,
    `- Ayarlar: paket ${PACKAGE_LABELS[settings.budget.mode]} · internet araştırması ${settings.webResearch ? "açık" : "kapalı"} · agent: ${
      Object.entries(settings.agents ?? {})
        .map(([g, a]) => `${g} ${a.provider || "paket"}${a.model ? `/${a.model}` : ""}`)
        .join(", ") || "paket varsayılanı"
    }`,
    "",
  ];
  if (!cf.token || !cf.account) add("warn", "kurulum", "Cloudflare token ya da hesap kimliği terminal ortamında yok; yayın yapılamaz.");
  else add("pass", "kurulum", "Cloudflare token ve hesap kimliği tanımlı.");
  if (portal) {
    const mode = statSync(portalPaths.file()).mode & 0o777;
    add(
      mode & 0o077 ? "warn" : "pass",
      "kurulum",
      mode & 0o077
        ? `Portal anahtar dosyasını başkaları okuyabiliyor (izin ${mode.toString(8)}); chmod 600 önerilir.`
        : "Portal anahtar dosyası yalnızca senin okuyabileceğin izinde.",
    );
  }

  // Clients.
  const { clients } = tools.listClients(factory);
  const body: string[] = [`## Müşteriler (${clients.length})`, ""];
  for (const c of clients) {
    if (c.stage === "unreadable") {
      body.push(`### ${c.slug}`, "", `- OKUNAMADI: ${"error" in c ? c.error : ""}`, "");
      add("fail", c.slug, "Müşteri dosyası okunamadı.");
      continue;
    }
    const s = await clientSection(factory, c.slug, username, fetcher);
    body.push(...s.lines);
    checks.push(...s.checks);
  }

  // Secrets: no client file may contain a token or the portal secret.
  const leaked = filesWithSecrets([factory.clientsRoot, factory.inboxDir], secrets);
  if (leaked.length)
    add(
      "fail",
      "gizlilik",
      `Gizli anahtar şu dosyalarda geçiyor: ${leaked
        .map((f) => path.relative(factory.clientsRoot, f))
        .slice(0, 10)
        .join(", ")}. Token'ı Cloudflare'de hemen yenile.`,
    );
  else
    add(
      "pass",
      "gizlilik",
      secrets.length ? `Müşteri klasörlerinde hiçbir gizli anahtar yok (${secrets.length} anahtar arandı).` : "Aranacak anahtar yok (token tanımlı değil).",
    );

  // The portal keeps nothing once collected.
  if (portal && fetcher) {
    try {
      const res = await (fetcher as unknown as typeof fetch)(`${portal.url}/api/items`, {
        headers: { Authorization: `Bearer ${portal.secret}` },
        signal: AbortSignal.timeout(10_000),
      });
      const items = res.ok ? ((await res.json()) as { items: unknown[] }).items.length : -1;
      if (items < 0) add("warn", "portal", `Portal yanıtı ${res.status}.`);
      else add(items ? "warn" : "pass", "portal", items ? `Portalda alınmamış ${items} kayıt var ("Gelenleri şimdi al").` : "Portalda bekleyen kayıt yok.");
    } catch (error) {
      add("warn", "portal", `Portala ulaşılamadı: ${(error as Error).message}`);
    }
  }

  const icon: Record<Verdict, string> = { pass: "GEÇTİ", warn: "UYARI", fail: "KALDI" };
  const order: Verdict[] = ["fail", "warn", "pass"];
  const summary = [
    `## Kontroller: ${checks.filter((c) => c.verdict === "fail").length} kaldı · ${checks.filter((c) => c.verdict === "warn").length} uyarı · ${checks.filter((c) => c.verdict === "pass").length} geçti`,
    "",
    "| Sonuç | Alan | Ayrıntı |",
    "|---|---|---|",
    ...order.flatMap((v) => checks.filter((c) => c.verdict === v).map((c) => `| ${icon[v]} | ${c.area} | ${c.text.replace(/\|/g, "/")} |`)),
    "",
  ];
  const markdown = mask([...head, ...summary, ...body, "_Bu rapor hiçbir şeyi değiştirmez. Token ve anahtarlar gizlenmiştir._", ""].join("\n"), secrets);
  return { markdown, checks };
}
