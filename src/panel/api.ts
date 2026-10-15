import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { FactoryConfig } from "../config.js";
import { approvalState, APPROVAL_KINDS } from "../lib/approvals.js";
import { archiveClient } from "../lib/archive.js";
import { readDraftConfig } from "../lib/client.js";
import { dirHash, readJsonIfExists } from "../lib/files.js";
import { assertSlug, clientPaths, safeJoin } from "../lib/paths.js";
import { industryExtras } from "../lib/questionnaire.js";
import { LOCALES } from "../schema/site-config.js";
import { QUESTIONS } from "../schema/questions.js";
import * as tools from "../tools.js";
import { HttpError, readBody, readJsonBody, sendJson, str } from "./http.js";
import { appendInput, readHistory, readInputs } from "./history.js";
import { serialiseJob, type JobRunner } from "./jobs.js";
import { answersPrompt, autopilotPrompt, designContentPrompt, earlierInputsBlock, fixBuildPrompt, revisePrompt, upgradeTemplatePrompt, type AnswersInput } from "./prompts.js";
import type { PreviewServer } from "./preview.js";

const JSON_LIMIT = 256 * 1024;
const UPLOAD_LIMIT = 15 * 1024 * 1024;
const MAX_TEXT = 20_000;

export interface ApiDeps {
  readonly factory: FactoryConfig;
  readonly jobs: JobRunner;
  readonly preview: PreviewServer;
}

type Handler = (deps: ApiDeps, req: IncomingMessage, res: ServerResponse, params: string[]) => Promise<void> | void;

interface Route {
  readonly method: string;
  readonly pattern: RegExp;
  readonly handler: Handler;
}

const SLUG = "([a-z0-9-]{3,40})";
const routes: Route[] = [
  { method: "GET", pattern: /^\/api\/clients$/, handler: listClients },
  { method: "POST", pattern: /^\/api\/clients$/, handler: createClient },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}$`), handler: clientDetail },
  { method: "DELETE", pattern: new RegExp(`^/api/clients/${SLUG}$`), handler: archive },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/questionnaire/([12])$`), handler: getQuestionnaire },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/questionnaire/([12])$`), handler: writeQuestionnaire },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/inbox/([^/]{1,120})$`), handler: uploadInbox },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/agent/(answers|autopilot|design-content|fix-build|revise|upgrade-template)$`), handler: startAgent },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/build$`), handler: startBuild },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/deploy$`), handler: startDeploy },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/preview$`), handler: showPreview },
  { method: "GET", pattern: /^\/api\/jobs\/([0-9a-f-]{36})$/, handler: getJob },
  { method: "POST", pattern: /^\/api\/jobs\/([0-9a-f-]{36})\/cancel$/, handler: cancelJob },
  { method: "GET", pattern: /^\/api\/meta$/, handler: meta },
];

export async function handleApi(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const m = pathname.match(route.pattern);
    if (m) return route.handler(deps, req, res, m.slice(1));
  }
  throw new HttpError(404, "Bilinmeyen adres.");
}

// ---------------------------------------------------------------- handlers

function meta(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { locales: LOCALES, running: deps.jobs.running() ? serialiseJob(deps.jobs.running()!, 0) : null });
}

function listClients(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, tools.listClients(deps.factory));
}

async function createClient(deps: ApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  const hosting = str(body, "hostingModel");
  if (hosting !== "managed" && hosting !== "client") throw new HttpError(400, "Barındırma modeli managed ya da client olmalı.");
  const extra = str(body, "extraLocale", { optional: true });
  if (extra && !(LOCALES as readonly string[]).includes(extra)) throw new HttpError(400, "Desteklenmeyen dil.");
  const result = await tools.createClient(deps.factory, {
    slug: str(body, "slug", { max: 40 })!,
    businessName: str(body, "businessName", { max: 80 })!,
    industry: str(body, "industry", { max: 60 })!,
    hostingModel: hosting,
    ...(extra ? { extraLocale: extra as (typeof LOCALES)[number] } : {}),
  });
  sendJson(res, 201, result);
}

/** Archive, not delete: the operator must type the slug, and nothing may be running for this client. */
async function archive(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  const body = await readJsonBody(req, JSON_LIMIT);
  if (body.confirm !== s) throw new HttpError(400, "Onay için müşterinin kısa adını (slug) aynen yazın.");
  const running = deps.jobs.running();
  if (running?.slug === s) throw new HttpError(409, `Bu müşteri için çalışan bir iş var: "${running.title}". Bitmesini bekleyin.`);
  const r = archiveClient(deps.factory, s);
  sendJson(res, 200, { archived: true, slug: s, folder: path.basename(r.archivedTo) });
}

function clientDetail(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  const status = tools.getClientStatus(deps.factory, { slug: s });
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const draft = readDraftConfig(paths) as {
    business?: { name?: string; industry?: string };
    hosting?: { model?: string };
    i18n?: { locales?: string[] };
    site?: { domain?: string | null };
    meta?: { unmapped?: unknown[]; laterInterests?: string[] };
    design?: unknown;
    template?: string;
  };
  const build = status.lastBuild;
  const { valid } = approvalState(paths.root, paths.approvals, build?.distHash ?? null);
  sendJson(res, 200, {
    status,
    business: draft.business ?? {},
    hosting: draft.hosting?.model ?? null,
    locales: draft.i18n?.locales ?? ["en"],
    domain: draft.site?.domain ?? null,
    unmapped: draft.meta?.unmapped ?? [],
    laterInterests: draft.meta?.laterInterests ?? [],
    design: draft.design ?? null,
    template: draft.template ?? null,
    latestTemplate: deps.factory.defaultTemplate,
    inbox: inboxFiles(deps.factory, s),
    questionnaires: existingQuestionnaires(paths.questionnaireDir),
    qualityReport: existsSync(paths.qualityReport) ? readFileSync(paths.qualityReport, "utf8") : null,
    distReady: Boolean(build?.passed && build.distHash && dirHash(paths.distDir) === build.distHash),
    approvals: APPROVAL_KINDS.map((kind) => ({ kind, valid: valid[kind] !== null, at: valid[kind]?.at ?? null, command: `npm run approve -- ${s} ${kind}` })),
    siteApproveCommand: `npm run approve -- ${s} site`,
    lastDeploy: readJsonIfExists(paths.lastDeploy) ?? null,
    content: Object.fromEntries((draft.i18n?.locales ?? ["en"]).map((l) => [l, readJsonIfExists(paths.content(l)) ?? null])),
    history: readHistory(deps.factory, s),
    running: deps.jobs.running()?.slug === s ? serialiseJob(deps.jobs.running()!, 0) : null,
  });
}

function questionnaireView(deps: ApiDeps, slug: string, round: 1 | 2) {
  const { questionnaire, industry } = tools.questionnaireFor(deps.factory, { slug, round });
  const pick = (id: string) => {
    const q = QUESTIONS.find((x) => x.id === id);
    return q ? { id: q.id, text: q.text, hint: q.hint ?? null, example: q.example ?? null, choices: q.choices ?? null, required: q.required } : null;
  };
  return {
    round,
    plainText: questionnaire.plainText,
    questions: questionnaire.questionIds.map(pick).filter((q) => q !== null),
    extras: round === 2 ? industryExtras(industry) : [],
    later: round === 2 ? QUESTIONS.filter((q) => q.round === "later" && q.audience === "client").map((q) => ({ id: q.id, text: q.text })) : [],
  };
}

function getQuestionnaire(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug, round]: string[]): void {
  sendJson(res, 200, questionnaireView(deps, assertSlug(slug!), Number(round) as 1 | 2));
}

async function writeQuestionnaire(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug, round]: string[]): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  const replyBy = str(body, "replyBy", { optional: true, max: 40 });
  const s = assertSlug(slug!);
  tools.generateQuestionnaire(deps.factory, { slug: s, round: Number(round) as 1 | 2, ...(replyBy ? { replyBy } : {}) });
  sendJson(res, 200, questionnaireView(deps, s, Number(round) as 1 | 2));
}

/** Uploads land in <inbox>/<slug>/; save_asset later checks type, size and SVG safety. */
async function uploadInbox(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug, rawName]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s }); // 404-style error if the client does not exist
  const name = safeFileName(decodeURIComponent(rawName!));
  const bytes = await readBody(req, UPLOAD_LIMIT);
  if (bytes.length === 0) throw new HttpError(400, "Boş dosya.");
  const dir = safeJoin(deps.factory.inboxDir, s);
  mkdirSync(dir, { recursive: true });
  writeFileSync(safeJoin(dir, name), bytes);
  sendJson(res, 201, { name, inbox: inboxFiles(deps.factory, s) });
}

async function startAgent(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug, kind]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  const earlier = readInputs(deps.factory, s);
  let prompt: string;
  let title: string;
  let request: string;
  /** What Eren gave in this job, kept for later jobs (answers as "question: answer" lines). */
  let input = "";
  switch (kind) {
    case "answers": {
      const answers = stringRecord(body.answers);
      const extras = Array.isArray(body.extras) ? body.extras.filter(isQa).slice(0, 20) : [];
      const later = Array.isArray(body.later) ? body.later.filter((x): x is string => typeof x === "string" && /^later-[a-z0-9-]+$/.test(x)) : [];
      const freeText = str(body, "freeText", { optional: true, max: MAX_TEXT }) ?? "";
      const files = inboxFiles(deps.factory, s);
      if (!Object.values(answers).some((a) => a.trim()) && !extras.some((e) => e.answer.trim()) && !freeText.trim() && files.length === 0) {
        throw new HttpError(400, "İşlenecek cevap ya da dosya yok.");
      }
      prompt = answersPrompt(s, { answers, extras, later, freeText, files: files.map((f) => f.name) });
      input = [
        ...Object.entries(answers).filter(([, a]) => a.trim()).map(([id, a]) => `${id}: ${a.trim()}`),
        ...extras.filter((e) => e.answer.trim()).map((e) => `${e.question}: ${e.answer.trim()}`),
        freeText,
      ].filter((x) => x.trim()).join("\n");
      title = "Cevapları işle";
      const answered = Object.values(answers).filter((a) => a.trim()).length + extras.filter((e) => e.answer.trim()).length;
      request = [`Müşterinin cevaplarını işle: ${answered} cevap`, freeText.trim() ? "serbest metin" : "", files.length ? `${files.length} dosya` : ""].filter(Boolean).join(", ");
      break;
    }
    case "autopilot": {
      const pasted: AnswersInput = {
        answers: stringRecord(body.answers),
        extras: Array.isArray(body.extras) ? body.extras.filter(isQa).slice(0, 20) : [],
        later: [],
        freeText: str(body, "freeText", { optional: true, max: MAX_TEXT }) ?? "",
        files: inboxFiles(deps.factory, s).map((f) => f.name),
      };
      const hasInput = pasted.freeText.trim() !== "" || Object.values(pasted.answers).some((a) => a.trim()) || pasted.files.length > 0;
      prompt = autopilotPrompt(s, hasInput ? pasted : null);
      input = pasted.freeText;
      title = "Siteyi hazırla";
      request = pasted.freeText.trim() ? pasted.freeText.trim() : pasted.files.length ? `Siteyi hazırla (${pasted.files.length} dosya)` : "Siteyi hazırla.";
      break;
    }
    case "design-content":
      prompt = designContentPrompt(s);
      title = "Tasarım ve metinler";
      request = "Tasarımı seç ve bütün metinleri yaz.";
      break;
    case "fix-build":
      prompt = fixBuildPrompt(s);
      title = "Build ve düzeltme";
      request = "Build al, kontroller geçmezse düzelt.";
      break;
    case "upgrade-template":
      prompt = upgradeTemplatePrompt(s, deps.factory.defaultTemplate);
      title = "Yeni şablona geç";
      request = `Siteyi yeni şablona (${deps.factory.defaultTemplate}) taşı.`;
      break;
    default: {
      const change = str(body, "request", { max: 4000 })!;
      prompt = revisePrompt(s, change);
      input = change;
      title = "Değişiklik isteği";
      request = change;
    }
  }
  const job = runOrConflict(() => deps.jobs.startAgent(s, kind!, title, prompt + earlierInputsBlock(earlier), request));
  appendInput(deps.factory, s, kind!, input);
  sendJson(res, 202, serialiseJob(job));
}

function startBuild(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  const job = runOrConflict(() =>
    deps.jobs.startTask(s, "build", "Build", async (log) => {
      log("Şablon derleniyor ve kalite kontrolleri çalışıyor…");
      const r = await tools.buildSite(deps.factory, { slug: s });
      for (const c of r.checks) log(`${c.status.toUpperCase().padEnd(4)}  ${c.name}: ${c.detail}`);
      if (!r.passed) throw new Error(`Build kontrolleri geçmedi. ${r.checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ")}`);
      return "Build geçti. Önizlemeyi açıp görsel kontrol listesiyle bakın, sonra görsel onayı terminalden verin.";
    }, "Build al."),
  );
  sendJson(res, 202, serialiseJob(job));
}

async function startDeploy(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  const body = await readJsonBody(req, JSON_LIMIT);
  const target = body.target === "production" ? "production" : body.target === "preview" ? "preview" : null;
  if (!target) throw new HttpError(400, "Hedef preview ya da production olmalı.");
  const dryRun = body.dryRun === true;
  const job = runOrConflict(() =>
    deps.jobs.startTask(s, "deploy", `Yayın: ${target}${dryRun ? " (deneme)" : ""}`, async (log) => {
      log("Onaylar ve build kontrol ediliyor, wrangler çalışıyor…");
      const r = await tools.deploy(deps.factory, { slug: s, target, dryRun });
      if (r.outputTail) log(r.outputTail);
      return dryRun ? "Deneme başarılı; hiçbir şey yüklenmedi." : r.url ? `Yayında: ${r.url}` : "Yüklendi. Adres wrangler çıktısında bulunamadı; Cloudflare panelinden bakın.";
    }, target === "production" ? `Siteyi canlıya al${dryRun ? " (deneme)" : ""}.` : `Önizlemeyi yayınla${dryRun ? " (deneme)" : ""}.`),
  );
  sendJson(res, 202, serialiseJob(job));
}

function showPreview(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const paths = clientPaths(deps.factory.clientsRoot, assertSlug(slug!));
  if (!existsSync(path.join(paths.distDir, "index.html"))) throw new HttpError(409, "Henüz build yok. Önce build alın.");
  sendJson(res, 200, { url: deps.preview.show(paths.distDir) });
}

function getJob(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [id]: string[]): void {
  const job = deps.jobs.get(id!);
  if (!job) throw new HttpError(404, "İş bulunamadı.");
  const since = Number(new URL(req.url ?? "/", "http://x").searchParams.get("since") ?? 0);
  sendJson(res, 200, serialiseJob(job, Number.isFinite(since) && since >= 0 ? since : 0));
}

function cancelJob(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [id]: string[]): void {
  sendJson(res, 200, { cancelled: deps.jobs.cancel(id!) });
}

// ---------------------------------------------------------------- helpers

function runOrConflict<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new HttpError(409, (error as Error).message);
  }
}

export function safeFileName(name: string): string {
  const base = path.basename(name).normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^[-.]+/, "").slice(0, 80);
  if (!base || base === "." || base === "..") throw new HttpError(400, "Geçersiz dosya adı.");
  return base;
}

function inboxFiles(factory: FactoryConfig, slug: string): Array<{ name: string; bytes: number }> {
  const dir = safeJoin(factory.inboxDir, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => ({ name: e.name, bytes: statSync(path.join(dir, e.name)).size }));
}

function existingQuestionnaires(dir: string): number[] {
  return [1, 2].filter((n) => existsSync(path.join(dir, `round-${n}.txt`)));
}

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(k)) out[k] = v.slice(0, MAX_TEXT);
  }
  return out;
}

function isQa(x: unknown): x is { question: string; answer: string } {
  return typeof x === "object" && x !== null && typeof (x as { question?: unknown }).question === "string" && typeof (x as { answer?: unknown }).answer === "string";
}
