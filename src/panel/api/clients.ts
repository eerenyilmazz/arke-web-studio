import { clientProfit } from "../profit.js";
import { siteHealth } from "../health.js";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { approvalState, APPROVAL_KINDS } from "../../lib/approvals.js";
import { listVersions, restoreVersion, snapshot } from "../../lib/versions.js";
import { type Business, readBusiness, writeBusiness } from "../business.js";
import { modeFor, summarise } from "../budget.js";
import { readStartDesign, setStartDesign } from "../library.js";
import { ZodError } from "zod";
import { logoUsedElsewhere, markBrandStale, readBrandStale, sharedLogo } from "../logo-check.js";
import { archiveClient, deleteArchived, listArchived, restoreArchived } from "../../lib/archive.js";
import { readDraftConfig } from "../../lib/client.js";
import { dirHash, readJsonIfExists } from "../../lib/files.js";
import { assertSlug, clientPaths, safeJoin } from "../../lib/paths.js";
import { industryExtras } from "../../lib/questionnaire.js";
import { LOCALES } from "../../schema/site-config.js";
import { QUESTIONS } from "../../schema/questions.js";
import * as tools from "../../tools.js";
import { HttpError, readBody, readJsonBody, sendJson, str } from "../http.js";
import { appendInput, readHistory } from "../history.js";
import { serialiseJob } from "../jobs.js";
import { inlineMotionKit, readBrandBoard, readBrandOptions, SIGNATURE_FILE } from "../../lib/custom-site.js";
import { approvePlan, planState, previousPlans, readPlan } from "../../lib/design-plan.js";
import os from "node:os";
import { appPartsView, prepareAppParts, setAdminPassword, setNotifyWebhook } from "../app-parts.js";
import { readProductRecord, writeProductRecord } from "../../deploy/app.js";
import { clientSecretNames, removeClientSecret, saveClientSecret } from "../../lib/accounts.js";
import { PRODUCT_IDS, PRODUCTS, type ProductId } from "../../products/registry.js";
import { type ApiDeps, type Route, SLUG, JSON_LIMIT, UPLOAD_LIMIT, safeFileName, BUSY, asHttp, IMAGE_TYPES, assetFiles, inboxFiles } from "./common.js";

/** Clients: list, create, archive, detail, questionnaires, uploads, logo, business, versions. */
export const clientRoutes: Route[] = [
  { method: "GET", pattern: /^\/api\/clients$/, handler: listClients },
  { method: "POST", pattern: /^\/api\/clients$/, handler: createClient },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}$`), handler: clientDetail },
  { method: "DELETE", pattern: new RegExp(`^/api/clients/${SLUG}$`), handler: archive },
  {
    method: "GET",
    pattern: new RegExp(`^/api/clients/${SLUG}/health$`),
    handler: async (d, _r, res, [slug]) => {
      const s = assertSlug(slug!);
      tools.getClientStatus(d.factory, { slug: s });
      sendJson(res, 200, await siteHealth(d.factory, s));
    },
  },
  { method: "GET", pattern: /^\/api\/archive$/, handler: (d, _r, res) => sendJson(res, 200, { archived: listArchived(d.factory) }) },
  { method: "POST", pattern: /^\/api\/archive\/([a-z0-9-]{3,60})\/restore$/, handler: restoreFromArchive },
  { method: "DELETE", pattern: /^\/api\/archive\/([a-z0-9-]{3,60})$/, handler: deleteFromArchive },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/questionnaire/([12])$`), handler: getQuestionnaire },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/questionnaire/([12])$`), handler: writeQuestionnaire },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/inbox/([^/]{1,120})$`), handler: uploadInbox },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/(inbox|assets)/([^/]{1,120})$`), handler: serveClientImage },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/logo$`), handler: setLogo },
  { method: "DELETE", pattern: new RegExp(`^/api/clients/${SLUG}/logo$`), handler: removeLogo },
  { method: "DELETE", pattern: new RegExp(`^/api/clients/${SLUG}/(inbox|assets)/([^/]{1,120})$`), handler: deleteClientImage },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/versions$`), handler: versions },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/concepts$`), handler: concepts },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/design-plan$`), handler: designPlan },
  // The client's own secrets for app sites: names only ever leave the panel process.
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/secrets$`), handler: listSecrets },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/secrets$`), handler: putSecret },
  { method: "DELETE", pattern: new RegExp(`^/api/clients/${SLUG}/secrets/([A-Z][A-Z0-9_]{1,63})$`), handler: deleteSecret },
  // Ready-made parts of app sites: the client's admin screen password and the notification address.
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/app$`), handler: appParts },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/app/admin-password$`), handler: putAdminPassword },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/app/notify-webhook$`), handler: putNotifyWebhook },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/design-plan/approve$`), handler: approveDesignPlan },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/brand$`), handler: brandBoard },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/business$`), handler: saveBusiness },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/versions/restore$`), handler: restore },
];

function secretsView(deps: ApiDeps, s: string) {
  return { secrets: clientSecretNames(s), needed: readProductRecord(clientPaths(deps.factory.clientsRoot, s)).secrets ?? [] };
}

function listSecrets(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  sendJson(res, 200, secretsView(deps, s));
}

async function putSecret(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  try {
    saveClientSecret(s, str(body, "name", { max: 64 })!, str(body, "value", { max: 4000 })!);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, (error as Error).message);
  }
  sendJson(res, 200, secretsView(deps, s));
}

function deleteSecret(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug, name]: string[]): void {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  removeClientSecret(s, name!);
  sendJson(res, 200, secretsView(deps, s));
}

function appParts(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const cp = clientPaths(deps.factory.clientsRoot, s);
  prepareAppParts(cp, s);
  sendJson(res, 200, appPartsView(cp, s));
}

async function putAppSecret(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, slug: string, field: string, save: (s: string, v: string) => void) {
  const s = assertSlug(slug);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  try {
    save(s, str(body, field, { max: 2000 }) ?? "");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, (error as Error).message);
  }
  sendJson(res, 200, appPartsView(clientPaths(deps.factory.clientsRoot, s), s));
}

function putAdminPassword(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]) {
  return putAppSecret(deps, req, res, slug!, "password", setAdminPassword);
}
function putNotifyWebhook(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]) {
  return putAppSecret(deps, req, res, slug!, "url", setNotifyWebhook);
}

/** The design plan for the operator to read: state, the plan, how many earlier ones, and the signature preview if written. */
function designPlan(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const sig = path.join(paths.root, "site", SIGNATURE_FILE);
  sendJson(res, 200, {
    state: planState(paths),
    plan: readPlan(paths),
    earlier: previousPlans(paths).length,
    signatureHtml: existsSync(sig) ? inlineMotionKit(readFileSync(sig, "utf8")) : null,
  });
}

/** The operator approves the plan in the panel (never the agent: the approval is written in .factory/). */
function approveDesignPlan(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  if (deps.jobs.running()?.slug === s) throw new HttpError(409, BUSY);
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const state = planState(paths);
  if (state === "not-required" || state === "missing") throw new HttpError(409, "Onaylanacak bir tasarım planı yok.");
  approvePlan(paths, `panel:${os.userInfo().username}`);
  appendInput(deps.factory, s, "design-plan", "Tasarım planı onaylandı.");
  sendJson(res, 200, { state: planState(paths) });
}

function concepts(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  sendJson(res, 200, { options: readBrandOptions(clientPaths(deps.factory.clientsRoot, s)) });
}

/** The brand board: the custom brand (logo, signature demo) or, for template sites, the config's palette and fonts. */
function brandBoard(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): void {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const cfg = readDraftConfig(paths) as {
    template?: string;
    brand?: { logo?: string | null };
    business?: { name?: string; industry?: string };
    design?: { palette?: Record<string, string>; fonts?: { heading?: string; body?: string } };
  };
  sendJson(res, 200, {
    name: cfg.business?.name ?? s,
    industry: cfg.business?.industry ?? "",
    palette: cfg.design?.palette ?? null,
    fonts: cfg.design?.fonts ?? null,
    ...readBrandBoard(paths, cfg.template ?? "", cfg.brand?.logo ?? null),
  });
}

async function versions(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  sendJson(res, 200, { versions: await listVersions(clientPaths(deps.factory.clientsRoot, s).root) });
}

/** Back to an earlier version of config, texts, images and site code. Not while a job runs for this client. */
async function restore(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  if (deps.jobs.running()?.slug === s) throw new HttpError(409, "Bu müşteri için çalışan bir iş var. Bitince geri al.");
  const body = await readJsonBody(req, JSON_LIMIT);
  const root = clientPaths(deps.factory.clientsRoot, s).root;
  await snapshot(root, "Geri almadan önceki hâl");
  sendJson(res, 200, await restoreVersion(root, str(body, "id", { max: 40 })!));
}

function listClients(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  const { clients } = tools.listClients(deps.factory);
  sendJson(res, 200, { clients: clients.map((c) => ({ ...c, business: c.stage === "unreadable" ? null : readBusiness(deps.factory, c.slug) })) });
}

/**
 * A second language sold as an extra is added to the site's languages (additive only: un-ticking it never removes
 * a language or its pages; that stays a deliberate edit).
 */
function addSoldLanguage(deps: ApiDeps, slug: string, addons: Business["addons"]): void {
  const code = addons?.find((a) => a.id === "language")?.value;
  if (!code) return;
  const i18n = (readDraftConfig(clientPaths(deps.factory.clientsRoot, slug)) as { i18n?: { defaultLocale?: string; locales?: string[] } }).i18n;
  const locales = i18n?.locales ?? [];
  if (locales.includes(code) || i18n?.defaultLocale === code) return;
  tools.updateClientConfig(deps.factory, { slug, patch: { i18n: { locales: [...locales, code] } } });
}

async function saveBusiness(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  // Only kinds that are ready can be chosen (the others are listed as "yakında").
  if (typeof body.product === "string" && (PRODUCT_IDS as readonly string[]).includes(body.product) && PRODUCTS[body.product as ProductId].status !== "active")
    throw new HttpError(400, "Bu site türü henüz hazır değil.");
  try {
    const saved = writeBusiness(deps.factory, s, body);
    // The deploy tool reads the kind from .factory/ (the agent cannot change it); installed parts' secret names stay.
    const cp = clientPaths(deps.factory.clientsRoot, s);
    writeProductRecord(cp, { ...readProductRecord(cp), product: saved.product ?? "showcase" });
    prepareAppParts(cp, s);
    addSoldLanguage(deps, s, saved.addons);
    sendJson(res, 200, saved);
  } catch (error) {
    if (error instanceof ZodError) throw new HttpError(400, `Geçersiz bilgi: ${error.issues.map((i) => i.path.join(".")).join(", ")}`);
    throw error;
  }
}

async function createClient(deps: ApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  const hosting = str(body, "hostingModel");
  if (hosting !== "managed" && hosting !== "client") throw new HttpError(400, "Barındırma modeli managed ya da client olmalı.");
  const extra = str(body, "extraLocale", { optional: true });
  if (extra && !(LOCALES as readonly string[]).includes(extra)) throw new HttpError(400, "Desteklenmeyen dil.");
  const country = str(body, "country", { optional: true }) ?? "GB";
  if (!(tools.COUNTRIES as readonly string[]).includes(country)) throw new HttpError(400, `Ülke şunlardan biri olmalı: ${tools.COUNTRIES.join(", ")}.`);
  const result = await tools.createClient(deps.factory, {
    slug: str(body, "slug", { max: 40 })!,
    businessName: str(body, "businessName", { max: 80 })!,
    industry: str(body, "industry", { max: 60 })!,
    hostingModel: hosting,
    country: country as tools.Country,
    ...(extra ? { extraLocale: extra as (typeof LOCALES)[number] } : {}),
  });
  // Optional start design from the library; used by the first "Siteyi Oluştur" run.
  const startDesign = str(body, "startDesign", { optional: true, max: 41 });
  if (startDesign) {
    try {
      setStartDesign(deps.factory, result.slug, startDesign);
    } catch {
      // The client is created either way; a deleted design is simply not preselected.
    }
  }
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

async function restoreFromArchive(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [id]: string[]): Promise<void> {
  if (deps.jobs.running()) throw new HttpError(409, BUSY);
  const r = asHttp(() => restoreArchived(deps.factory, id!));
  sendJson(res, 200, { ...r, archived: listArchived(deps.factory) });
}

/** Permanent: the operator types the client's short name again; only archived clients can be deleted. */
async function deleteFromArchive(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [id]: string[]): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  const entry = listArchived(deps.factory).find((e) => e.id === id);
  if (!entry) throw new HttpError(404, "Arşivde böyle bir kayıt yok.");
  if (body.confirm !== entry.slug) throw new HttpError(400, "Kalıcı silmek için müşterinin kısa adını (slug) aynen yazın.");
  asHttp(() => deleteArchived(deps.factory, id!));
  sendJson(res, 200, { archived: listArchived(deps.factory) });
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
    contact?: Record<string, unknown>;
    whatsapp?: { number?: string | null };
  };
  const build = status.lastBuild;
  const { valid } = approvalState(paths.root, paths.approvals, build?.distHash ?? null);
  sendJson(res, 200, {
    status,
    business: draft.business ?? {},
    hosting: draft.hosting?.model ?? null,
    locales: draft.i18n?.locales ?? ["en"],
    domain: draft.site?.domain ?? null,
    pages: (draft as { pages?: string[] }).pages ?? [],
    defaultLocale: (draft as { i18n?: { defaultLocale?: string } }).i18n?.defaultLocale ?? "en",
    unmapped: draft.meta?.unmapped ?? [],
    laterInterests: draft.meta?.laterInterests ?? [],
    design: draft.design ?? null,
    template: draft.template ?? null,
    contact: draft.contact ?? {},
    whatsapp: draft.whatsapp?.number ?? null,
    country: (draft as { business?: { country?: string } }).business?.country ?? "GB",
    businessTracking: readBusiness(deps.factory, s),
    startDesign: readStartDesign(deps.factory, s),
    brandStale: readBrandStale(deps.factory, s),
    profit: clientProfit(deps.factory, s, draft.business?.name ?? s),
    sharedLogo: sharedLogo(deps.factory, s),
    budget: { mode: modeFor(deps.factory, s), usage: summarise(deps.factory).byClient[s] ?? { tokens: 0, costUsd: 0, jobs: 0 } },
    latestTemplate: deps.factory.defaultTemplate,
    inbox: inboxFiles(deps.factory, s),
    assets: assetFiles(paths.assetsDir),
    logo: (draft as { brand?: { logo?: string | null } }).brand?.logo ?? null,
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

/**
 * Thumbnails for the panel. Shown only with <img>; the headers stop anything in a file (an SVG script) from
 * running even if it were opened directly.
 */
function serveClientImage(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug, where, rawName]: string[]): void {
  const s = assertSlug(slug!);
  const name = safeFileName(decodeURIComponent(rawName!));
  const type = IMAGE_TYPES[path.extname(name).toLowerCase()];
  const dir = where === "inbox" ? safeJoin(deps.factory.inboxDir, s) : clientPaths(deps.factory.clientsRoot, s).assetsDir;
  const file = safeJoin(dir, name);
  if (!type || !existsSync(file)) throw new HttpError(404, "Dosya yok.");
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  res.end(readFileSync(file));
}

/** The operator marks a file as the client's logo: saved (checked like save_asset) and set as brand.logo. No agent needed. */
async function setLogo(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  if (deps.jobs.running()?.slug === s) throw new HttpError(409, "Agent bu müşteride çalışıyor; bitince tekrar dene.");
  const body = await readJsonBody(req, JSON_LIMIT);
  const name = safeFileName(str(body, "name", { max: 120 })!);
  const from = str(body, "from", { max: 10 });
  // The same file as another client's logo is almost always a mix-up (a pickle shop's logo for a barber):
  // refused unless the operator confirms it, before anything is saved or any job is paid for.
  const candidate =
    from === "inbox" ? safeJoin(deps.factory.inboxDir, s, name) : from === "assets" ? safeJoin(clientPaths(deps.factory.clientsRoot, s).assetsDir, name) : null;
  const owner = candidate && existsSync(candidate) ? logoUsedElsewhere(deps.factory, s, candidate) : null;
  if (owner && body.force !== true) {
    sendJson(res, 409, { error: `Bu dosya "${owner.name}" müşterisinin logosuyla aynı. Yanlış müşteriye mi ekliyorsunuz?`, code: "shared-logo", owner });
    return;
  }
  let relPath: string;
  if (from === "inbox") {
    relPath = tools.saveAssetTool(deps.factory, { slug: s, inboxFile: `${s}/${name}`, kind: "logo" }).relPath;
  } else if (from === "assets") {
    if (!existsSync(safeJoin(clientPaths(deps.factory.clientsRoot, s).assetsDir, name))) throw new HttpError(404, "Dosya yok.");
    relPath = `assets/${name}`;
  } else {
    throw new HttpError(400, "Kaynak inbox ya da assets olmalı.");
  }
  const previous = (readDraftConfig(clientPaths(deps.factory.clientsRoot, s)) as { brand?: { logo?: string | null } }).brand?.logo ?? null;
  tools.updateClientConfig(deps.factory, { slug: s, patch: { brand: { logo: relPath } } });
  // A new logo on an existing brand: colours, tagline and signature still follow the old one until redesigned.
  if (previous !== relPath) markBrandStale(deps.factory, s, relPath);
  appendInput(
    deps.factory,
    s,
    "logo",
    `The operator set the client's logo in the panel: ${relPath}. Build the brand from this logo (rules/custom-site.md); never draw a replacement.`,
  );
  sendJson(res, 200, { logo: relPath });
}

/**
 * The operator takes the logo off (a wrong or unwanted file): brand.logo is cleared and the next design job draws a
 * wordmark. The file stays among the images; deleting it is a separate, explicit step.
 */
async function removeLogo(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  if (deps.jobs.running()?.slug === s) throw new HttpError(409, "Agent bu müşteride çalışıyor; bitince tekrar dene.");
  const previous = (readDraftConfig(clientPaths(deps.factory.clientsRoot, s)) as { brand?: { logo?: string | null } }).brand?.logo ?? null;
  if (!previous) {
    sendJson(res, 200, { logo: null });
    return;
  }
  await snapshot(clientPaths(deps.factory.clientsRoot, s).root, "Önce: logo kaldırıldı").catch(() => null);
  tools.updateClientConfig(deps.factory, { slug: s, patch: { brand: { logo: null } } });
  markBrandStale(deps.factory, s, "");
  appendInput(
    deps.factory,
    s,
    "logo",
    `The operator removed the client's logo (${previous}) in the panel. Do not use that file as the logo any more; draw a wordmark (brand/logo.svg) from the business name in the next design job.`,
  );
  sendJson(res, 200, { logo: null });
}

/** Where a file is still used: the logo, the content (gallery) or a page of the site. Null when it is free to go. */
function imageInUse(deps: ApiDeps, slug: string, where: string, name: string): string | null {
  const paths = clientPaths(deps.factory.clientsRoot, slug);
  if (where !== "assets") return null;
  const rel = `assets/${name}`;
  if ((readDraftConfig(paths) as { brand?: { logo?: string | null } }).brand?.logo === rel) return "Bu dosya müşterinin logosu. Önce 'Logoyu kaldır'a basın.";
  const contentDir = path.dirname(paths.content("en"));
  const inContent =
    existsSync(contentDir) && readdirSync(contentDir).some((f) => f.endsWith(".json") && readFileSync(path.join(contentDir, f), "utf8").includes(rel));
  if (inContent) return "Bu görsel içerikte (ör. galeride) kullanılıyor. Önce oradan çıkarın.";
  const site = path.join(paths.root, "site");
  const inSite =
    existsSync(site) &&
    readdirSync(site, { recursive: true, withFileTypes: true }).some(
      (e) => e.isFile() && /\.(html|css)$/.test(e.name) && readFileSync(path.join(e.parentPath, e.name), "utf8").includes(`/${rel}`),
    );
  if (inSite) return "Bu görsel sitenin sayfalarında kullanılıyor. Önce agent'a sayfalardan kaldırmasını söyleyin (ya da yeni tasarımda kalkar).";
  return null;
}

/** Deletes an uploaded or saved image that nothing uses any more (a wrong upload, a duplicate). */
async function deleteClientImage(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse, [slug, where, rawName]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  if (deps.jobs.running()?.slug === s) throw new HttpError(409, "Agent bu müşteride çalışıyor; bitince tekrar dene.");
  const name = safeFileName(decodeURIComponent(rawName!));
  const dir = where === "inbox" ? safeJoin(deps.factory.inboxDir, s) : clientPaths(deps.factory.clientsRoot, s).assetsDir;
  const file = safeJoin(dir, name);
  if (!existsSync(file)) throw new HttpError(404, "Dosya yok.");
  const used = imageInUse(deps, s, where!, name);
  if (used) throw new HttpError(409, used);
  // A saved image can be brought back from Versions (inbox uploads are not versioned: they are not the site yet).
  if (where === "assets") await snapshot(clientPaths(deps.factory.clientsRoot, s).root, `Önce: ${name} silindi`).catch(() => null);
  rmSync(file);
  sendJson(res, 200, { inbox: inboxFiles(deps.factory, s), assets: assetFiles(clientPaths(deps.factory.clientsRoot, s).assetsDir) });
}

function existingQuestionnaires(dir: string): number[] {
  return [1, 2].filter((n) => existsSync(path.join(dir, `round-${n}.txt`)));
}
