import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { FactoryConfig } from "../config.js";
import os from "node:os";
import { addApproval, approvalPins, approvalState, approvalTargets, APPROVAL_KINDS } from "../lib/approvals.js";
import { clientStatus } from "../lib/client.js";
import type { ApprovalGate } from "./approval-gate.js";
import { listVersions, restoreVersion, snapshot } from "../lib/versions.js";
import { readBusiness, writeBusiness } from "./business.js";
import { readSettings, writeSettings } from "./settings.js";
import { backupNow, checkBackupDir, listBackups } from "./backup.js";
import { BUDGET_MODES, MODE_LABELS, PROFILES, monthlyBlock, modeFor, resolvePolicy, summarise } from "./budget.js";
import { FORM_ACTION, FORM_FILE, WEB3FORMS_KEY, readClientForm } from "../lib/form.js";
import { applyLibraryDesign, deleteFromLibrary, libraryPreview, listLibrary, saveToLibrary } from "./library.js";
import { ZodError } from "zod";
import { archiveClient } from "../lib/archive.js";
import { readDraftConfig } from "../lib/client.js";
import { dirHash, readJsonIfExists, writeJson } from "../lib/files.js";
import { assertSlug, clientPaths, safeJoin } from "../lib/paths.js";
import { industryExtras } from "../lib/questionnaire.js";
import { LOCALES } from "../schema/site-config.js";
import { QUESTIONS } from "../schema/questions.js";
import * as tools from "../tools.js";
import { HttpError, readBody, readJsonBody, sendJson, str } from "./http.js";
import { appendInput, readHistory, readInputs } from "./history.js";
import { serialiseJob, type JobRunner } from "./jobs.js";
import { TOOLS_NOTE, finalPrompt, fromLibraryPrompt, redesignPrompt, answersPrompt, autopilotPrompt, brandBoardPrompt, chooseConceptPrompt, conceptsPrompt, designContentPrompt, earlierInputsBlock, fixBuildPrompt, revisePrompt, upgradeTemplatePrompt, type AnswersInput } from "./prompts.js";
import { OPTION_IDS, readBrandBoard, readBrandOptions } from "../lib/custom-site.js";
import type { PreviewServer } from "./preview.js";

const JSON_LIMIT = 256 * 1024;
const UPLOAD_LIMIT = 15 * 1024 * 1024;
const MAX_TEXT = 20_000;

export interface ApiDeps {
  readonly factory: FactoryConfig;
  readonly jobs: JobRunner;
  readonly preview: PreviewServer;
  readonly gate: ApprovalGate;
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
  { method: "GET", pattern: /^\/api\/usage$/, handler: (d, _r, res) => sendJson(res, 200, { ...summarise(d.factory), mode: readSettings(d.factory).budget.mode, modes: BUDGET_MODES.map((m) => ({ id: m, label: MODE_LABELS[m], ...PROFILES[m] })) }) },
  { method: "GET", pattern: /^\/api\/backups$/, handler: (d, _r, res) => { const dir = readSettings(d.factory).backupDir; sendJson(res, 200, { dir, backups: listBackups(dir) }); } },
  { method: "POST", pattern: /^\/api\/backups$/, handler: async (d, _r, res) => { try { sendJson(res, 201, await backupNow(d.factory)); } catch (e) { throw new HttpError(400, (e as Error).message); } } },
  { method: "GET", pattern: /^\/api\/library\/([a-z0-9-]{2,41})\/preview\.png$/, handler: (d, _r, res, [id]) => {
    const f = libraryPreview(d.factory, id!);
    if (!f) throw new HttpError(404, "Önizleme yok.");
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(readFileSync(f));
  } },
  { method: "GET", pattern: /^\/api\/library$/, handler: (d, _r, res) => sendJson(res, 200, { designs: listLibrary(d.factory) }) },
  { method: "DELETE", pattern: /^\/api\/library\/([a-z0-9-]{2,41})$/, handler: (d, _r, res, [id]) => { asHttp(() => deleteFromLibrary(d.factory, id!)); sendJson(res, 200, { designs: listLibrary(d.factory) }); } },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/library$`), handler: saveDesign },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/questionnaire/([12])$`), handler: getQuestionnaire },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/questionnaire/([12])$`), handler: writeQuestionnaire },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/inbox/([^/]{1,120})$`), handler: uploadInbox },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/(inbox|assets)/([^/]{1,120})$`), handler: serveClientImage },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/logo$`), handler: setLogo },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/agent/(answers|autopilot|design-content|fix-build|revise|upgrade-template|concepts|choose-concept|brand-board|redesign|from-library)$`), handler: startAgent },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/build$`), handler: startBuild },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/deploy$`), handler: startDeploy },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/preview$`), handler: showPreview },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/approve$`), handler: approveFromPanel },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/versions$`), handler: versions },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/quick-edit$`), handler: quickEdit },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/edit/(colors|pages|services|text|form)$`), handler: structuredEdit },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/form$`), handler: saveForm },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/concepts$`), handler: concepts },
  { method: "GET", pattern: new RegExp(`^/api/clients/${SLUG}/brand$`), handler: brandBoard },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/business$`), handler: saveBusiness },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/versions/restore$`), handler: restore },
  { method: "GET", pattern: /^\/api\/jobs\/([0-9a-f-]{36})$/, handler: getJob },
  { method: "POST", pattern: /^\/api\/jobs\/([0-9a-f-]{36})\/cancel$/, handler: cancelJob },
  { method: "GET", pattern: /^\/api\/meta$/, handler: meta },
  { method: "GET", pattern: /^\/api\/settings$/, handler: (d, _r, res) => sendJson(res, 200, readSettings(d.factory)) },
  { method: "PUT", pattern: /^\/api\/settings$/, handler: putSettings },
  { method: "GET", pattern: /^\/api\/cloudflare$/, handler: (_d, _r, res) => sendJson(res, 200, tools.cloudflareStatus()) },
  { method: "POST", pattern: /^\/api\/cloudflare\/test$/, handler: async (d, _r, res) => sendJson(res, 200, await tools.cloudflareTest(d.factory)) },
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

/** Library and similar helpers throw plain errors with Turkish messages: shown to Eren as a 400. */
function asHttp<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, (error as Error).message);
  }
}

async function saveDesign(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  const name = str(body, "name", { max: 60 })!;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 8).map((t) => t.slice(0, 30)) : [];
  const meta = asHttp(() => saveToLibrary(deps.factory, s, { name, tags }));
  sendJson(res, 201, meta);
}

async function putSettings(deps: ApiDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req, JSON_LIMIT);
  if (typeof body.backupDir === "string" && body.backupDir.trim()) {
    try {
      body.backupDir = checkBackupDir(body.backupDir.trim(), deps.factory);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  try {
    sendJson(res, 200, writeSettings(deps.factory, body));
  } catch (error) {
    if (error instanceof ZodError) throw new HttpError(400, "Geçersiz ayar.");
    throw error;
  }
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
  const cfg = readDraftConfig(paths) as { template?: string; brand?: { logo?: string | null }; business?: { name?: string; industry?: string }; design?: { palette?: Record<string, string>; fonts?: { heading?: string; body?: string } } };
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

/** "0534 985 63 19" → "+905349856319" (country decides the prefix for numbers starting with 0). */
export function normalisePhone(raw: string, country: string): string {
  let n = raw.replace(/[\s().-]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (!n.startsWith("+") && n.startsWith("0")) n = `${country === "TR" ? "+90" : "+44"}${n.slice(1)}`;
  if (!n.startsWith("+") && /^\d{10,13}$/.test(n)) n = `+${n}`;
  return n;
}

const QUICK_FIELDS = ["phone", "email", "address", "hours"] as const;

/**
 * Small fixes without writing to the agent: contact details are validated and saved in the config, then
 * template sites rebuild; custom sites get a short agent job that changes those values in the site files.
 */
async function quickEdit(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const before = readDraftConfig(paths) as { template?: string; business?: { country?: string }; contact?: Record<string, unknown>; whatsapp?: { number?: string | null } };
  const body = await readJsonBody(req, JSON_LIMIT);
  const country = before.business?.country ?? "GB";
  const contact: Record<string, string | null> = {};
  for (const f of QUICK_FIELDS) {
    const v = str(body, f, { optional: true, max: 300 });
    if (v === undefined) continue;
    const t = v.trim();
    if (f === "email") {
      if (t) contact.email = t; // the email is required: an empty box keeps the old one
      continue;
    }
    contact[f] = t === "" ? null : f === "phone" ? normalisePhone(t, country) : t;
  }
  const waRaw = str(body, "whatsapp", { optional: true, max: 40 });
  const patch: Record<string, unknown> = { contact };
  if (waRaw !== undefined) patch.whatsapp = { number: waRaw.trim() ? normalisePhone(waRaw.trim(), country) : null };
  tools.updateClientConfig(deps.factory, { slug: s, patch });

  const changes = [
    ...Object.entries(contact).map(([k, v]) => `${k}: "${String(before.contact?.[k] ?? "")}" → "${v ?? ""}"`),
    ...(waRaw !== undefined ? [`whatsapp: "${before.whatsapp?.number ?? ""}" → "${(patch.whatsapp as { number: string | null }).number ?? ""}"`] : []),
  ];
  if (changes.length === 0) throw new HttpError(400, "Değişiklik yok.");
  let job;
  if (before.template === "custom") {
    const prompt = [
      `Site Factory, client "${s}". Eren changed these contact details in the panel (already saved in site.config.json):`,
      ...changes.map((c) => `- ${c}`),
      "Update every place in the site files where the old values appear: header, footer, contact page, buttons (tel:, mailto:, wa.me links) and the JSON-LD. Show phone numbers in the usual local format. Change nothing else. Then build_site; if a check fails, fix it and build again.",
      "Finish with one or two sentences in Turkish saying what you changed.",
    ].join("\n");
    job = launchAgent(deps, s, "quick-edit", "Hızlı düzenleme", prompt, `Hızlı düzenleme: ${changes.join("; ")}`);
  } else {
    job = runOrConflict(() =>
      deps.jobs.startTask(s, "build", "Hızlı düzenleme", async (log) => {
        log("Bilgiler kaydedildi, site yeniden oluşturuluyor…");
        const r = await tools.buildSite(deps.factory, { slug: s });
        if (!r.passed) throw new Error(`Kontroller geçmedi: ${r.checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ")}`);
        return "Kaydedildi ve site yeniden oluşturuldu.";
      }, `Hızlı düzenleme: ${changes.join("; ")}`),
    );
  }
  sendJson(res, 202, serialiseJob(job));
}

/** Eren's contact form endpoint for this client (.factory/form.json, never writable by the agent). Empty = remove. */
async function saveForm(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  const action = (str(body, "action", { optional: true, max: 200 }) ?? "").trim();
  const accessKey = (str(body, "accessKey", { optional: true, max: 60 }) ?? "").trim();
  const file = path.join(clientPaths(deps.factory.clientsRoot, s).factoryDir, FORM_FILE);
  if (!action) {
    rmSync(file, { force: true });
    sendJson(res, 200, { form: null });
    return;
  }
  if (!FORM_ACTION.test(action)) throw new HttpError(400, "Desteklenen adresler: formspree.io/f/…, getform.io/f/…, formsubmit.co/…, api.web3forms.com/submit");
  if (action.includes("web3forms") && !WEB3FORMS_KEY.test(accessKey)) throw new HttpError(400, "Web3Forms için erişim anahtarını (access key) da yaz.");
  const form = { action, ...(action.includes("web3forms") ? { accessKey } : {}) };
  writeJson(file, form);
  sendJson(res, 200, { form });
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const EDIT_TITLES: Readonly<Record<string, string>> = { colors: "Renkleri değiştir", pages: "Sayfaları değiştir", services: "Hizmet ve fiyatlar", text: "Metin değiştir", form: "İletişim formu" };
const EDIT_TAIL = "Change nothing else: no other text, colour, layout or animation. build_site; if a check fails, fix only what the check names and build again (at most 3 builds). Do not deploy. Finish with one or two sentences in Turkish listing exactly what you changed.";

/**
 * Structured edits from the panel's "Düzenle" cards. Eren fills a form instead of writing to the agent; the panel
 * validates it, saves what it can itself, and gives the agent an exact, narrow instruction (or none at all).
 */
async function structuredEdit(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug, type]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const draft = readDraftConfig(paths) as { template?: string; pages?: string[]; i18n?: { defaultLocale?: string; locales?: string[] }; design?: { palette?: Record<string, string> } };
  const custom = draft.template === "custom";
  const body = await readJsonBody(req, JSON_LIMIT);
  const lines: string[] = [];
  let summary: string;
  let needsAgent = custom;

  switch (type) {
    case "colors": {
      const raw = (typeof body.colors === "object" && body.colors) ? (body.colors as Record<string, unknown>) : {};
      const current: Record<string, string> = custom
        ? ((readJsonIfExists(path.join(paths.root, "site", "brand", "brand.json")) as { palette?: Record<string, string> } | null)?.palette ?? {})
        : (draft.design?.palette ?? {});
      const changes = Object.entries(raw)
        .filter(([k, v]) => typeof v === "string" && HEX_COLOUR.test(v) && k in current && current[k]!.toLowerCase() !== v.toLowerCase())
        .map(([k, v]) => ({ name: k, from: current[k]!, to: (v as string).toUpperCase() }));
      if (changes.length === 0) throw new HttpError(400, "Değişen renk yok.");
      if (!custom) {
        tools.updateClientConfig(deps.factory, { slug: s, patch: { design: { palette: Object.fromEntries(changes.map((c) => [c.name, c.to])) } } });
      }
      lines.push("Eren changed these brand colours in the panel:", ...changes.map((c) => `- ${c.name}: ${c.from} → ${c.to}`),
        "Replace each old value with the new one in brand/brand.json (palette), every css, js, html and svg file of the site and brand/signature.html, including tints you derived from it (rgb/hsl forms and lighter or darker variants: derive them again from the new colour). Mirror the change into design.palette in the config if that colour is there.",
        "If a text/background pair now fails AA contrast, adjust only the lightness of the derived tone, not Eren's colour, and say so.");
      summary = changes.map((c) => `${c.name} ${c.from}→${c.to}`).join(", ");
      break;
    }
    case "pages": {
      const wanted = Array.isArray(body.pages) ? body.pages.filter((p): p is string => typeof p === "string") : [];
      const known = ["home", "about", "services", "gallery", "contact"];
      const next = known.filter((p) => wanted.includes(p));
      if (!next.includes("home")) throw new HttpError(400, "Ana sayfa kaldırılamaz.");
      const before = draft.pages ?? [];
      const add = next.filter((p) => !before.includes(p));
      const remove = before.filter((p) => !next.includes(p));
      if (add.length === 0 && remove.length === 0) throw new HttpError(400, "Sayfalarda değişiklik yok.");
      if (remove.length && add.length === 0) {
        // Removing is mechanical: saved here (its section settings go with it).
        tools.updateClientConfig(deps.factory, { slug: s, patch: { pages: next } });
      }
      needsAgent = custom || add.length > 0;
      lines.push(`Eren changed the site's pages in the panel. Pages now: ${next.join(", ")}.`,
        ...(remove.length ? [`Remove: ${remove.join(", ")}. Delete their files (delete_site_file for custom sites), remove them from every navigation, footer, sitemap and internal link.`] : []),
        ...(add.length ? [`Add: ${add.join(", ")}. Set config.pages to the list above (with sections for template sites). Design the new pages in the existing brand and layout system, with content only from this client's facts. If a page has no facts to fill it (a gallery without photos), do not invent: tell Eren what is needed and do not add that page.`] : []));
      summary = [add.length ? `eklenen: ${add.join(", ")}` : "", remove.length ? `kaldırılan: ${remove.join(", ")}` : ""].filter(Boolean).join("; ");
      break;
    }
    case "services": {
      const locale = (draft.i18n?.defaultLocale ?? "en") as Parameters<typeof tools.saveContent>[1]["locale"];
      const list = Array.isArray(body.services) ? body.services : [];
      const services = list.slice(0, 12).map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        const price = typeof o.price === "string" && o.price.trim() ? o.price.trim().slice(0, 40) : undefined;
        return { title: String(o.title ?? "").trim().slice(0, 60), description: String(o.description ?? "").trim().slice(0, 300), ...(price ? { price } : {}) };
      }).filter((x) => x.title);
      if (services.length === 0) throw new HttpError(400, "En az bir hizmet gerekli.");
      // Keep icons that templates use for the same titles.
      const existing = ((readJsonIfExists(paths.content(locale)) as { services?: Array<{ title: string; icon?: string }> } | null)?.services ?? []);
      const withIcons = services.map((x) => ({ ...x, ...(existing.find((e) => e.title === x.title)?.icon ? { icon: existing.find((e) => e.title === x.title)!.icon } : {}) }));
      try {
        tools.saveContent(deps.factory, { slug: s, locale, content: { services: withIcons } });
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
      const others = (draft.i18n?.locales ?? [locale]).filter((l) => l !== locale);
      needsAgent = custom || others.length > 0;
      lines.push(`Eren edited the services and prices in the panel. They are saved in content/${locale}.json; this is the exact list, in order:`,
        ...withIcons.map((x, i) => `${i + 1}. ${x.title}${x.price ? ` — ${x.price}` : ""}: ${x.description}`),
        ...(others.length ? [`Translate the same list into content for ${others.join(", ")} with save_content (same order and prices).`] : []),
        ...(custom ? ["Update the site files so every place that lists services or prices (home, services page, any price table) shows exactly this list, in this order, in the existing design."] : []));
      summary = `${withIcons.length} hizmet`;
      break;
    }
    case "form": {
      const form = readClientForm(paths.factoryDir);
      if (!form) throw new HttpError(400, "Önce form adresini kaydet.");
      needsAgent = true;
      lines.push(`Eren set up a contact form service for this client. Add a contact form to the contact page (and remove any note that there is no form): <form action="${form.action}" method="POST">, fields name, email (type=email, required), phone (optional) and message (required), each with a visible label; a hidden honeypot field; a submit button in the brand's style.`,
        ...(form.accessKey ? [`Web3Forms needs <input type="hidden" name="access_key" value="${form.accessKey}">.`] : []),
        "Keep the phone, WhatsApp and e-mail buttons next to it. Never use any other form address.");
      summary = "form eklendi";
      break;
    }
    default: {
      const page = str(body, "page", { max: 20 })!;
      const oldText = str(body, "oldText", { max: 2000 })!.trim();
      const newText = str(body, "newText", { max: 2000 })!.trim();
      if (!oldText || !newText) throw new HttpError(400, "Eski ve yeni metni yaz.");
      needsAgent = true;
      lines.push(`Eren wants one text changed on the "${page}" page (all languages if the text exists in several).`,
        "Current text (as he sees it on the site):", `«${oldText}»`, "New text, exactly as written:", `«${newText}»`,
        "Find that text (or the closest match on that page) and replace it. If it comes from content/*.json, change it there too. If you cannot find it, change nothing and say so.");
      summary = `${page}: "${oldText.slice(0, 40)}" → "${newText.slice(0, 40)}"`;
    }
  }

  const title = EDIT_TITLES[type!]!;
  let job;
  if (needsAgent) {
    const prompt = [`Site Factory, client "${s}".`, ...lines, EDIT_TAIL].join("\n");
    await snapshot(paths.root, `Önce: ${title}`).catch(() => null);
    job = launchAgent(deps, s, `edit-${type}`, title, prompt, `${title}: ${summary}`);
  } else {
    job = runOrConflict(() =>
      deps.jobs.startTask(s, "build", title, async (log) => {
        log("Kaydedildi, site yeniden oluşturuluyor…");
        const r = await tools.buildSite(deps.factory, { slug: s });
        if (!r.passed) throw new Error(`Kontroller geçmedi: ${r.checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ")}`);
        return "Kaydedildi ve site yeniden oluşturuldu.";
      }, `${title}: ${summary}`),
    );
  }
  sendJson(res, 202, serialiseJob(job));
}

const PANEL_APPROVALS = new Set(["site", "production"]);

/**
 * Approval from the panel, with the one-time code shown only in the panel's terminal. Pins exactly what the
 * operator was looking at: if content or build changed meanwhile, nothing is approved.
 */
async function approveFromPanel(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  const body = await readJsonBody(req, JSON_LIMIT);
  const kind = str(body, "kind", { max: 20 })!;
  const kinds = PANEL_APPROVALS.has(kind) ? approvalTargets(kind) : null;
  if (!kinds) throw new HttpError(400, "Onay türü site ya da production olmalı.");
  if (deps.jobs.running()?.slug === s) throw new HttpError(409, "Bu müşteri için çalışan bir iş var. Bitince onayla.");
  if (deps.gate.locked) throw new HttpError(423, "Çok fazla yanlış kod girildi. Paneli kapatıp yeniden başlat (yeni kod çıkar).");
  if (!deps.gate.check(str(body, "code", { max: 12 }) ?? "")) {
    throw new HttpError(403, deps.gate.locked ? "Kod yanlış. Onay kilitlendi; paneli yeniden başlat." : `Kod yanlış. Kalan deneme: ${deps.gate.triesLeft}. Kod, paneli başlattığın terminalde yazıyor.`);
  }
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const pinsNow = kinds.map((k) => approvalPins(k, paths.root, paths.distDir, clientStatus(deps.factory, s).lastBuild));
  const seen = body.pins as { hash?: unknown; distHash?: unknown } | undefined;
  const last = pinsNow[pinsNow.length - 1]!;
  if (seen && (seen.hash !== last.hash || (last.distHash && seen.distHash !== last.distHash))) {
    throw new HttpError(409, "Site sen bakarken değişti. Sayfayı yenile, tekrar bak, sonra onayla.");
  }
  const at = new Date().toISOString();
  kinds.forEach((k, i) => {
    const { hash, distHash } = pinsNow[i]!;
    addApproval(paths.approvals, { kind: k, by: `panel:${os.userInfo().username}`, at, hash, ...(distHash ? { distHash } : {}), note: "panel" });
  });
  sendJson(res, 200, { approved: kinds, at });
}

function meta(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { locales: LOCALES, running: deps.jobs.running() ? serialiseJob(deps.jobs.running()!, 0) : null, typicalSeconds: typicalSeconds(deps) });
}

/** Rough time a job of each kind takes here: median of recent successful runs across clients, else a default. */
const DEFAULT_SECONDS: Readonly<Record<string, number>> = { autopilot: 900, "upgrade-template": 900, revise: 240, "fix-build": 300, answers: 180, "design-content": 300, build: 60, deploy: 90, concepts: 360, "quick-edit": 180, "brand-board": 300, redesign: 900, "from-library": 600 };
const RECENT_RUNS = 20;
function typicalSeconds(deps: ApiDeps): Record<string, number> {
  const byKind = new Map<string, number[]>();
  for (const c of tools.listClients(deps.factory).clients) {
    for (const r of readHistory(deps.factory, c.slug)) {
      if (r.status !== "succeeded") continue;
      const secs = (Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000;
      if (secs > 0) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), secs]);
    }
  }
  const out: Record<string, number> = { ...DEFAULT_SECONDS };
  for (const [kind, list] of byKind) {
    const recent = list.slice(-RECENT_RUNS).sort((a, b) => a - b);
    out[kind] = Math.round(recent[Math.floor(recent.length / 2)]!);
  }
  return out;
}

function listClients(deps: ApiDeps, _req: IncomingMessage, res: ServerResponse): void {
  const { clients } = tools.listClients(deps.factory);
  sendJson(res, 200, { clients: clients.map((c) => ({ ...c, business: c.stage === "unreadable" ? null : readBusiness(deps.factory, c.slug) })) });
}

async function saveBusiness(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const body = await readJsonBody(req, JSON_LIMIT);
  try {
    sendJson(res, 200, writeBusiness(deps.factory, s, body));
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
  if (!(tools.COUNTRIES as readonly string[]).includes(country)) throw new HttpError(400, "Ülke GB ya da TR olmalı.");
  const result = await tools.createClient(deps.factory, {
    slug: str(body, "slug", { max: 40 })!,
    businessName: str(body, "businessName", { max: 80 })!,
    industry: str(body, "industry", { max: 60 })!,
    hostingModel: hosting,
    country: country as tools.Country,
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
      const libraryId = str(body, "libraryId", { optional: true, max: 41 });
      let libraryName: string | undefined;
      if (libraryId) {
        const template = (readDraftConfig(clientPaths(deps.factory.clientsRoot, s)) as { template?: string }).template;
        if (template !== "custom") throw new HttpError(409, "Kütüphane tasarımları serbest tasarımlı sitelerde kullanılır.");
        if (deps.jobs.running()) throw new HttpError(409, "Agent başka bir işte; bitince tekrar dene.");
        await snapshot(clientPaths(deps.factory.clientsRoot, s).root, "Önce: kütüphaneden tasarım").catch(() => null);
        libraryName = asHttp(() => applyLibraryDesign(deps.factory, s, libraryId)).name;
      }
      prompt = autopilotPrompt(s, hasInput ? pasted : null, { web: resolvePolicy(deps.factory, s, "autopilot").research, askFirst: body.askFirst !== false, libraryName });
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
    case "redesign":
    case "brand-board": {
      const template = (readDraftConfig(clientPaths(deps.factory.clientsRoot, s)) as { template?: string }).template;
      if (template !== "custom") throw new HttpError(409, "Marka kartı serbest tasarımlı sitelerde var. Önce 'Serbest tasarıma geç'.");
      if (kind === "redesign") {
        prompt = redesignPrompt(s);
        title = "Markayla yeniden tasarla";
        request = "Siteyi markanın imza tasarımıyla baştan tasarla.";
      } else {
        prompt = brandBoardPrompt(s);
        title = "Marka kartını tamamla";
        request = "Marka kartını tamamla: slogan, imza hareketi ve tipografi örneği.";
      }
      break;
    }
    case "concepts":
    case "choose-concept": {
      const template = (readDraftConfig(clientPaths(deps.factory.clientsRoot, s)) as { template?: string }).template;
      if (template !== "custom") throw new HttpError(409, "Tasarım önerileri serbest tasarımlı sitelerde var. Önce 'Serbest tasarıma geç'.");
      if (kind === "concepts") {
        prompt = conceptsPrompt(s);
        title = "3 tasarım önerisi";
        request = "Bu müşteri için 3 farklı tasarım önerisi hazırla.";
      } else {
        const option = str(body, "option", { max: 1 })!;
        if (!(OPTION_IDS as readonly string[]).includes(option)) throw new HttpError(400, "Öneri a, b ya da c olmalı.");
        prompt = chooseConceptPrompt(s, option);
        title = "Seçilen tasarımla siteyi kur";
        request = `Öneri ${option.toUpperCase()} seçildi; siteyi bu tasarımla kur.`;
      }
      break;
    }
    case "from-library": {
      const template = (readDraftConfig(clientPaths(deps.factory.clientsRoot, s)) as { template?: string }).template;
      if (template !== "custom") throw new HttpError(409, "Kütüphane tasarımları serbest tasarımlı sitelerde kullanılır. Önce 'Serbest tasarıma geç'.");
      if (deps.jobs.running()) throw new HttpError(409, "Agent başka bir işte; bitince tekrar dene.");
      const id = str(body, "id", { max: 41 })!;
      // The current site is kept as a version before it is replaced by the library design.
      await snapshot(clientPaths(deps.factory.clientsRoot, s).root, "Önce: kütüphaneden tasarım").catch(() => null);
      const entry = asHttp(() => applyLibraryDesign(deps.factory, s, id));
      prompt = fromLibraryPrompt(s, entry.name);
      title = `Kütüphaneden: ${entry.name}`;
      request = `"${entry.name}" tasarımını bu müşteriye uyarla.`;
      break;
    }
    case "upgrade-template":
      prompt = upgradeTemplatePrompt(s, deps.factory.defaultTemplate);
      title = deps.factory.defaultTemplate === "custom" ? "Serbest tasarıma geç" : "Yeni şablona geç";
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
  // A version before the agent touches anything, so its changes can always be undone.
  if (!deps.jobs.running()) await snapshot(clientPaths(deps.factory.clientsRoot, s).root, `Önce: ${title}`).catch(() => null);
  const job = launchAgent(deps, s, kind!, title, `${prompt}${earlierInputsBlock(earlier)}`, request);
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

/**
 * Every agent job starts here: the monthly budget is checked, the client's budget mode decides model, steps,
 * cap, skills and research, and the prompt gets the mode-dependent parts.
 */
function launchAgent(deps: ApiDeps, slug: string, kind: string, title: string, prompt: string, request: string) {
  const blocked = monthlyBlock(deps.factory);
  if (blocked) throw new HttpError(409, blocked);
  const policy = resolvePolicy(deps.factory, slug, kind);
  const text = finalPrompt(prompt.startsWith(TOOLS_NOTE) ? prompt : `${TOOLS_NOTE}\n${prompt}`, policy);
  return runOrConflict(() => deps.jobs.startAgent(slug, kind, title, text, request, policy));
}

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

const IMAGE_TYPES: Readonly<Record<string, string>> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml" };

function assetFiles(dir: string): Array<{ name: string; bytes: number }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && IMAGE_TYPES[path.extname(e.name).toLowerCase()])
    .map((e) => ({ name: e.name, bytes: statSync(path.join(dir, e.name)).size }));
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
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
  res.end(readFileSync(file));
}

/** Eren marks a file as the client's logo: saved (checked like save_asset) and set as brand.logo. No agent needed. */
async function setLogo(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  if (deps.jobs.running()?.slug === s) throw new HttpError(409, "Agent bu müşteride çalışıyor; bitince tekrar dene.");
  const body = await readJsonBody(req, JSON_LIMIT);
  const name = safeFileName(str(body, "name", { max: 120 })!);
  const from = str(body, "from", { max: 10 });
  let relPath: string;
  if (from === "inbox") {
    relPath = tools.saveAssetTool(deps.factory, { slug: s, inboxFile: `${s}/${name}`, kind: "logo" }).relPath;
  } else if (from === "assets") {
    if (!existsSync(safeJoin(clientPaths(deps.factory.clientsRoot, s).assetsDir, name))) throw new HttpError(404, "Dosya yok.");
    relPath = `assets/${name}`;
  } else {
    throw new HttpError(400, "Kaynak inbox ya da assets olmalı.");
  }
  tools.updateClientConfig(deps.factory, { slug: s, patch: { brand: { logo: relPath } } });
  appendInput(deps.factory, s, "logo", `Eren set the client's logo in the panel: ${relPath}. Build the brand from this logo (rules/custom-site.md); never draw a replacement.`);
  sendJson(res, 200, { logo: relPath });
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
