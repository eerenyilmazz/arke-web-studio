import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { snapshot } from "../../lib/versions.js";
import { FORM_ACTION, FORM_FILE, WEB3FORMS_KEY, readClientForm } from "../../lib/form.js";
import { findInSite, replaceInSite } from "../../lib/site-replace.js";
import { readDraftConfig } from "../../lib/client.js";
import { readJsonIfExists, writeJson } from "../../lib/files.js";
import { assertSlug, clientPaths, type ClientPaths } from "../../lib/paths.js";
import * as tools from "../../tools.js";
import { HttpError, readJsonBody, sendJson, str } from "../http.js";
import { serialiseJob, type Job } from "../jobs.js";
import { type ApiDeps, type Route, SLUG, JSON_LIMIT, BUSY, runOrConflict, launchAgent, rebuildAfterDirectEdit, pageFiles } from "./common.js";

/** Edits from the panel's forms: done directly when exact, otherwise a narrow agent job. */
export const editRoutes: Route[] = [
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/quick-edit$`), handler: quickEdit },
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/edit/(colors|pages|services|text|form)$`), handler: structuredEdit },
  { method: "PUT", pattern: new RegExp(`^/api/clients/${SLUG}/form$`), handler: saveForm },
];

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
  if (deps.jobs.running()) throw new HttpError(409, "Başka bir işlem sürüyor; tamamlanınca tekrar deneyiniz.");
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
  // E-mail, address and hours are written on the site exactly as saved: replace them directly when the old
  // value is found. Phone numbers are shown in local formats, so those still go to the assistant.
  const paths2 = clientPaths(deps.factory.clientsRoot, s);
  const direct = before.template === "custom"
    ? Object.entries(contact).filter(([k, v]) => k !== "phone" && v && typeof before.contact?.[k] === "string" && (before.contact[k] as string).length >= 4 && findInSite(paths2, before.contact[k] as string, { html: true }) > 0)
    : [];
  if (before.template === "custom" && direct.length === changes.length) {
    replaceInSite(paths2, direct.map(([k, v]) => [before.contact![k] as string, v as string] as const), { html: true });
    job = await rebuildAfterDirectEdit(deps, s, "Hızlı düzenleme", changes.join("; "), "İletişim bilgileri güncellendi.");
  } else if (before.template === "custom") {
    const prompt = [
      `Site Factory, client "${s}". Eren changed these contact details in the panel (already saved in site.config.json):`,
      ...changes.map((c) => `- ${c}`),
      "Update every place in the site files where the old values appear: header, footer, contact page, buttons (tel:, mailto:, wa.me links) and the JSON-LD. Show phone numbers in the usual local format. Change nothing else. Then build_site; if a check fails, fix it and build again.",
      "Finish with one or two sentences in Turkish saying what you changed.",
    ].join("\n");
    job = launchAgent(deps, s, "quick-edit", "Hızlı düzenleme", prompt, `Hızlı düzenleme: ${changes.join("; ")}`);
  } else {
    job = rebuildTask(deps, s, "Hızlı düzenleme", `Hızlı düzenleme: ${changes.join("; ")}`);
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
const KNOWN_PAGES = ["home", "about", "services", "gallery", "contact"];
const MAX_SERVICES = 12;
const EDIT_TITLES: Readonly<Record<EditType, string>> = { colors: "Renkleri değiştir", pages: "Sayfaları değiştir", services: "Hizmet ve fiyatlar", text: "Metin değiştir", form: "İletişim formu" };
const EDIT_TAIL = "Change nothing else: no other text, colour, layout or animation. build_site; if a check fails, fix only what the check names and build again (at most 3 builds). Do not deploy. Finish with one or two sentences in Turkish listing exactly what you changed.";

type EditType = "colors" | "pages" | "services" | "text" | "form";
type Draft = { template?: string; pages?: string[]; i18n?: { defaultLocale?: string; locales?: string[] }; design?: { palette?: Record<string, string> } };

interface EditContext {
  readonly deps: ApiDeps;
  readonly slug: string;
  readonly paths: ClientPaths;
  readonly draft: Draft;
  readonly custom: boolean;
  readonly body: Record<string, unknown>;
}

/**
 * What one form led to: either the panel already did it ("direct": a rebuild job is running), or an instruction
 * for the agent (or, when needsAgent is false, only a rebuild of a template site).
 */
type EditResult =
  | { readonly kind: "direct"; readonly job: Job }
  | { readonly kind: "plan"; readonly lines: string[]; readonly summary: string; readonly needsAgent: boolean };

/** A template site only needs a rebuild after its config or content changed. */
function rebuildTask(deps: ApiDeps, slug: string, title: string, request: string) {
  return runOrConflict(() =>
    deps.jobs.startTask(slug, "build", title, async (log) => {
      log("Kaydedildi, site yeniden oluşturuluyor…");
      const r = await tools.buildSite(deps.factory, { slug });
      if (!r.passed) throw new Error(`Kontroller geçmedi: ${r.checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ")}`);
      return "Kaydedildi ve site yeniden oluşturuldu.";
    }, request),
  );
}

async function editColors({ deps, slug, paths, draft, custom, body }: EditContext): Promise<EditResult> {
  const raw = (typeof body.colors === "object" && body.colors) ? (body.colors as Record<string, unknown>) : {};
  const current: Record<string, string> = custom
    ? ((readJsonIfExists(path.join(paths.root, "site", "brand", "brand.json")) as { palette?: Record<string, string> } | null)?.palette ?? {})
    : (draft.design?.palette ?? {});
  const changes = Object.entries(raw)
    .filter(([k, v]) => typeof v === "string" && HEX_COLOUR.test(v) && k in current && current[k]!.toLowerCase() !== v.toLowerCase())
    .map(([k, v]) => ({ name: k, from: current[k]!, to: (v as string).toUpperCase() }));
  if (changes.length === 0) throw new HttpError(400, "Değişen renk yok.");
  const summary = changes.map((c) => `${c.name} ${c.from}→${c.to}`).join(", ");
  if (!custom) {
    tools.updateClientConfig(deps.factory, { slug, patch: { design: { palette: Object.fromEntries(changes.map((c) => [c.name, c.to])) } } });
  } else if (changes.every((c) => findInSite(paths, c.from, { caseInsensitive: true }) > 0)) {
    // Every colour code is in the files: swap them directly (brand.json, CSS, SVG, signature demo).
    replaceInSite(paths, changes.map((c) => [c.from, c.to] as const), { caseInsensitive: true });
    return { kind: "direct", job: await rebuildAfterDirectEdit(deps, slug, EDIT_TITLES.colors, summary, "Renkler güncellendi.") };
  }
  return {
    kind: "plan",
    needsAgent: custom,
    summary,
    lines: ["Eren changed these brand colours in the panel:", ...changes.map((c) => `- ${c.name}: ${c.from} → ${c.to}`),
      "Replace each old value with the new one in brand/brand.json (palette), every css, js, html and svg file of the site and brand/signature.html, including tints you derived from it (rgb/hsl forms and lighter or darker variants: derive them again from the new colour). Mirror the change into design.palette in the config if that colour is there.",
      "If a text/background pair now fails AA contrast, adjust only the lightness of the derived tone, not Eren's colour, and say so."],
  };
}

function editPages({ deps, slug, draft, custom, body }: EditContext): EditResult {
  const wanted = Array.isArray(body.pages) ? body.pages.filter((p): p is string => typeof p === "string") : [];
  const next = KNOWN_PAGES.filter((p) => wanted.includes(p));
  if (!next.includes("home")) throw new HttpError(400, "Ana sayfa kaldırılamaz.");
  const before = draft.pages ?? [];
  const add = next.filter((p) => !before.includes(p));
  const remove = before.filter((p) => !next.includes(p));
  if (add.length === 0 && remove.length === 0) throw new HttpError(400, "Sayfalarda değişiklik yok.");
  // Removing is mechanical: saved here (its section settings go with it).
  if (remove.length && add.length === 0) tools.updateClientConfig(deps.factory, { slug, patch: { pages: next } });
  return {
    kind: "plan",
    needsAgent: custom || add.length > 0,
    summary: [add.length ? `eklenen: ${add.join(", ")}` : "", remove.length ? `kaldırılan: ${remove.join(", ")}` : ""].filter(Boolean).join("; "),
    lines: [`Eren changed the site's pages in the panel. Pages now: ${next.join(", ")}.`,
      ...(remove.length ? [`Remove: ${remove.join(", ")}. Delete their files (delete_site_file for custom sites), remove them from every navigation, footer, sitemap and internal link.`] : []),
      ...(add.length ? [`Add: ${add.join(", ")}. Set config.pages to the list above (with sections for template sites). Design the new pages in the existing brand and layout system, with content only from this client's facts. If a page has no facts to fill it (a gallery without photos), do not invent: tell Eren what is needed and do not add that page.`] : [])],
  };
}

function editServices({ deps, slug, paths, draft, custom, body }: EditContext): EditResult {
  const locale = (draft.i18n?.defaultLocale ?? "en") as Parameters<typeof tools.saveContent>[1]["locale"];
  const list = Array.isArray(body.services) ? body.services : [];
  const services = list.slice(0, MAX_SERVICES).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const price = typeof o.price === "string" && o.price.trim() ? o.price.trim().slice(0, 40) : undefined;
    return { title: String(o.title ?? "").trim().slice(0, 60), description: String(o.description ?? "").trim().slice(0, 300), ...(price ? { price } : {}) };
  }).filter((x) => x.title);
  if (services.length === 0) throw new HttpError(400, "En az bir hizmet gerekli.");
  // Keep icons that templates use for the same titles.
  const existing = ((readJsonIfExists(paths.content(locale)) as { services?: Array<{ title: string; icon?: string }> } | null)?.services ?? []);
  const withIcons = services.map((x) => {
    const icon = existing.find((e) => e.title === x.title)?.icon;
    return { ...x, ...(icon ? { icon } : {}) };
  });
  try {
    tools.saveContent(deps.factory, { slug, locale, content: { services: withIcons } });
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  const others = (draft.i18n?.locales ?? [locale]).filter((l) => l !== locale);
  return {
    kind: "plan",
    needsAgent: custom || others.length > 0,
    summary: `${withIcons.length} hizmet`,
    lines: [`Eren edited the services and prices in the panel. They are saved in content/${locale}.json; this is the exact list, in order:`,
      ...withIcons.map((x, i) => `${i + 1}. ${x.title}${x.price ? ` — ${x.price}` : ""}: ${x.description}`),
      ...(others.length ? [`Translate the same list into content for ${others.join(", ")} with save_content (same order and prices).`] : []),
      ...(custom ? ["Update the site files so every place that lists services or prices (home, services page, any price table) shows exactly this list, in this order, in the existing design."] : [])],
  };
}

function editForm({ paths }: EditContext): EditResult {
  const form = readClientForm(paths.factoryDir);
  if (!form) throw new HttpError(400, "Önce form adresini kaydet.");
  return {
    kind: "plan",
    needsAgent: true,
    summary: "form eklendi",
    lines: [`Eren set up a contact form service for this client. Add a contact form to the contact page (and remove any note that there is no form): <form action="${form.action}" method="POST">, fields name, email (type=email, required), phone (optional) and message (required), each with a visible label; a hidden honeypot field; a submit button in the brand's style.`,
      ...(form.accessKey ? [`Web3Forms needs <input type="hidden" name="access_key" value="${form.accessKey}">.`] : []),
      "Keep the phone, WhatsApp and e-mail buttons next to it. Never use any other form address."],
  };
}

/** The same text in content/*.json (JSON-escaped), so a later template build or translation keeps the change. */
function replaceInContentFiles(paths: ClientPaths, locales: readonly string[], oldText: string, newText: string): void {
  const enc = (t: string) => JSON.stringify(t).slice(1, -1);
  for (const locale of locales) {
    const file = paths.content(locale);
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    if (!raw.includes(enc(oldText))) continue;
    const next = raw.split(enc(oldText)).join(enc(newText));
    try {
      JSON.parse(next);
      writeFileSync(file, next);
    } catch {
      // The replacement would break the JSON: the content file is left as it was (the site files are changed).
    }
  }
}

async function editText({ deps, slug, paths, draft, custom, body }: EditContext): Promise<EditResult> {
  const page = str(body, "page", { max: 20 })!;
  const oldText = str(body, "oldText", { max: 2000 })!.trim();
  const newText = str(body, "newText", { max: 2000 })!.trim();
  if (!oldText || !newText) throw new HttpError(400, "Eski ve yeni metni yaz.");
  const summary = `${page}: "${oldText.slice(0, 40)}" → "${newText.slice(0, 40)}"`;
  // The exact text is on that page: replace it directly (and in the content file, if it is there too).
  if (custom && findInSite(paths, oldText, { html: true, files: pageFiles(page) }) > 0) {
    replaceInSite(paths, [[oldText, newText]], { html: true, files: pageFiles(page) });
    replaceInContentFiles(paths, draft.i18n?.locales ?? [], oldText, newText);
    return { kind: "direct", job: await rebuildAfterDirectEdit(deps, slug, EDIT_TITLES.text, summary, "Metin güncellendi.") };
  }
  return {
    kind: "plan",
    needsAgent: true,
    summary,
    lines: [`Eren wants one text changed on the "${page}" page (all languages if the text exists in several).`,
      "Current text (as he sees it on the site):", `«${oldText}»`, "New text, exactly as written:", `«${newText}»`,
      "Find that text (or the closest match on that page) and replace it. If it comes from content/*.json, change it there too. If you cannot find it, change nothing and say so."],
  };
}

const EDITS: Readonly<Record<EditType, (ctx: EditContext) => EditResult | Promise<EditResult>>> = {
  colors: editColors,
  pages: editPages,
  services: editServices,
  text: editText,
  form: editForm,
};

/**
 * Structured edits from the panel's "Düzenle" cards. Eren fills a form instead of writing to the agent; the panel
 * validates it, saves what it can itself, and gives the agent an exact, narrow instruction (or none at all).
 */
async function structuredEdit(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug, type]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  // Nothing is changed while another job works on the files.
  if (deps.jobs.running()) throw new HttpError(409, BUSY);
  tools.getClientStatus(deps.factory, { slug: s });
  const edit = EDITS[type as EditType];
  if (!edit) throw new HttpError(404, "Bilinmeyen düzenleme.");
  const paths = clientPaths(deps.factory.clientsRoot, s);
  const draft = readDraftConfig(paths) as Draft;
  const body = await readJsonBody(req, JSON_LIMIT);
  const result = await edit({ deps, slug: s, paths, draft, custom: draft.template === "custom", body });
  if (result.kind === "direct") {
    sendJson(res, 202, serialiseJob(result.job));
    return;
  }
  const title = EDIT_TITLES[type as EditType];
  let job;
  if (result.needsAgent) {
    await snapshot(paths.root, `Önce: ${title}`).catch(() => null);
    job = launchAgent(deps, s, `edit-${type}`, title, [`Site Factory, client "${s}".`, ...result.lines, EDIT_TAIL].join("\n"), `${title}: ${result.summary}`);
  } else {
    job = rebuildTask(deps, s, title, `${title}: ${result.summary}`);
  }
  sendJson(res, 202, serialiseJob(job));
}
