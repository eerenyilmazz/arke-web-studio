import { randomBytes } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FACTORY_ROOT, type FactoryConfig } from "../config.js";
import { readDraftConfig } from "../lib/client.js";
import { run } from "../lib/exec.js";
import { readJsonIfExists, writeJson } from "../lib/files.js";
import { clientPaths, safeJoin } from "../lib/paths.js";
import { QUESTIONS } from "../schema/questions.js";
import * as tools from "../tools.js";

/**
 * The panel's side of the client portal (portal/worker.js on Eren's Cloudflare account).
 *
 * The portal secret and address are kept in ~/.config/site-factory/portal.json: outside the client folders,
 * where agent jobs are refused reads (AGENT_DENIED_READS covers ~/.config), so no agent can call the portal.
 * Links are created here and pushed to the portal; what clients send is pulled here, saved in the client's
 * folder (files into the inbox, text into .factory/), and then deleted from the portal.
 */
const LINK_DAYS = 60;
const PORTAL_NAME = "sf-portal";
const KV_TITLE = "sf-portal-store";
const COMPAT_DATE = "2026-06-01";
const FETCH_TIMEOUT_MS = 15_000;
const LINKS_FILE = "portal-links.json";
const INBOX_FILE = "portal-inbox.json";
const FEEDBACK_FILE = "client-feedback.json";
const APPROVAL_FILE = "client-approval.json";

export interface PortalConfig {
  readonly url: string;
  readonly secret: string;
  readonly kvId: string;
  readonly at: string;
}

/** Overridable in tests. */
export const portalPaths = {
  file: () => path.join(process.env.SF_PORTAL_CONFIG_DIR ?? path.join(os.homedir(), ".config", "site-factory"), "portal.json"),
};

export function readPortal(): PortalConfig | null {
  const c = readJsonIfExists(portalPaths.file()) as Partial<PortalConfig> | undefined;
  return c?.url && c.secret && c.secret.length >= 32 ? (c as PortalConfig) : null;
}

function writePortal(c: PortalConfig): void {
  const file = portalPaths.file();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(c, null, 2), { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* Windows file systems ignore modes */ }
}

/** Whether the portal is set up (never the secret). */
export function portalStatus(): { configured: boolean; url: string | null; at: string | null } {
  const c = readPortal();
  return { configured: Boolean(c), url: c?.url ?? null, at: c?.at ?? null };
}

// ---------------------------------------------------------------- setup (wrangler, Eren's managed account)

function managedCreds(): { token: string; accountId: string } | null {
  const token = process.env.SF_CF_MANAGED_API_TOKEN;
  const accountId = process.env.SF_CF_MANAGED_ACCOUNT_ID;
  return token && accountId ? { token, accountId } : null;
}

/**
 * Creates (or finds) the KV store, deploys the portal Worker and sets its secret. Safe to run again: it updates
 * the Worker and keeps the store and the secret, so existing links keep working.
 */
export async function setupPortal(factory: FactoryConfig, log: (t: string) => void): Promise<string> {
  const creds = managedCreds();
  if (!creds) throw new Error("Cloudflare token ve hesap kimliği tanımlı değil (SF_CF_MANAGED_API_TOKEN, SF_CF_MANAGED_ACCOUNT_ID).");
  const wrangler = path.join(FACTORY_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!existsSync(wrangler)) throw new Error("wrangler kurulu değil (npm install).");
  const env = { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.accountId, WRANGLER_SEND_METRICS: "false" };
  const dir = mkdtempSync(path.join(os.tmpdir(), "sf-portal-"));
  const w = (args: string[], input?: string) => run(process.execPath, [wrangler, ...args], { cwd: dir, timeoutMs: factory.limits.deployTimeoutMs, env, secrets: [creds.token], ...(input !== undefined ? { input } : {}), maxOutputChars: 40_000 });
  try {
    const old = readPortal();
    let kvId = old?.kvId ?? "";
    if (!kvId) {
      log("Depolama (KV) aranıyor…");
      const list = await w(["kv", "namespace", "list"]);
      try {
        const found = (JSON.parse(list.stdout.slice(list.stdout.indexOf("["))) as Array<{ id: string; title: string }>).find((n) => n.title === KV_TITLE || n.title.endsWith(KV_TITLE));
        if (found) kvId = found.id;
      } catch { /* not JSON: create below */ }
    }
    if (!kvId) {
      log("Depolama (KV) oluşturuluyor…");
      const created = await w(["kv", "namespace", "create", KV_TITLE]);
      kvId = /"?id"?\s*[:=]\s*"([0-9a-f]{32})"/i.exec(`${created.stdout}\n${created.stderr}`)?.[1] ?? "";
      if (!kvId) throw new Error(`Depolama oluşturulamadı. Token'da "Workers KV Storage: Edit" izni var mı?\n${created.stderr.slice(-600)}`);
    }
    cpSync(path.join(FACTORY_ROOT, "portal", "worker.js"), path.join(dir, "worker.js"));
    writeFileSync(path.join(dir, "wrangler.jsonc"), JSON.stringify({ name: PORTAL_NAME, main: "worker.js", compatibility_date: COMPAT_DATE, workers_dev: true, kv_namespaces: [{ binding: "SF_PORTAL", id: kvId }] }, null, 2));
    log("Portal yayınlanıyor…");
    const dep = await w(["deploy"]);
    if (dep.code !== 0) throw new Error(`Portal yayınlanamadı:\n${(dep.stderr || dep.stdout).slice(-800)}`);
    const url = /https:\/\/[a-z0-9.-]+\.workers\.dev/i.exec(dep.stdout)?.[0] ?? old?.url;
    if (!url) throw new Error("Portal yayınlandı ama adresi okunamadı. Cloudflare panelinde workers.dev alt alan adı seçili mi?");
    const secret = old?.secret ?? randomBytes(32).toString("base64url");
    log("Portal anahtarı ayarlanıyor…");
    const sec = await w(["secret", "put", "PORTAL_SECRET"], secret);
    if (sec.code !== 0) throw new Error(`Portal anahtarı ayarlanamadı:\n${sec.stderr.slice(-600)}`);
    writePortal({ url, secret, kvId, at: new Date().toISOString() });
    return url;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- talking to the portal

export type PortalFetch = (url: string, init: RequestInit) => Promise<Response>;

async function call(c: PortalConfig, method: string, apiPath: string, body?: unknown, fetcher: PortalFetch = fetch): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetcher(`${c.url}/api/${apiPath}`, {
      method,
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${c.secret}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Portal yanıtı ${res.status}`);
    return res;
  } catch (error) {
    throw new Error((error as Error).name === "AbortError" ? "Portala ulaşılamadı (zaman aşımı)." : `Portala ulaşılamadı: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export interface PortalLink {
  readonly token: string;
  readonly kind: "intake" | "review";
  readonly url: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

const linksFile = (factory: FactoryConfig, slug: string) => path.join(clientPaths(factory.clientsRoot, slug).factoryDir, LINKS_FILE);

export function listLinks(factory: FactoryConfig, slug: string): PortalLink[] {
  const all = (readJsonIfExists(linksFile(factory, slug)) as PortalLink[] | undefined) ?? [];
  return all.filter((l) => Date.parse(l.expiresAt) > Date.now());
}

const PAGE_LABELS: Readonly<Record<string, Record<string, string>>> = {
  tr: { home: "Ana sayfa", about: "Hakkımızda", services: "Hizmetler", gallery: "Galeri", contact: "İletişim", other: "Genel" },
  en: { home: "Home", about: "About", services: "Services", gallery: "Gallery", contact: "Contact", other: "General" },
};

const MAX_QUESTIONS = 25;

/** Client questions for the intake form: the questionnaire's client questions (the questionnaire is English). */
function intakeQuestions(): Array<{ id: string; text: string; hint?: string }> {
  return QUESTIONS.filter((q) => q.audience === "client" && q.round !== "later").slice(0, MAX_QUESTIONS).map((q) => ({
    id: q.id,
    text: q.text,
    ...(q.hint ? { hint: q.hint } : {}),
  }));
}

/** A new link for this client: the details form, or the preview with comments and approval. */
export async function createLink(factory: FactoryConfig, slug: string, kind: "intake" | "review", fetcher?: PortalFetch): Promise<PortalLink> {
  const c = readPortal();
  if (!c) throw new Error("Müşteri portalı kurulmadı (Ayarlar → Yayın → Müşteri Portalı).");
  const paths = clientPaths(factory.clientsRoot, slug);
  const draft = readDraftConfig(paths) as { business?: { name?: string }; i18n?: { defaultLocale?: string }; pages?: string[] };
  const lang = draft.i18n?.defaultLocale === "tr" ? "tr" : "en";
  const deploys = (readJsonIfExists(path.join(paths.factoryDir, tools.DEPLOYS_FILE)) ?? {}) as { preview?: { url?: string | null } };
  const previewUrl = deploys.preview?.url ?? null;
  if (kind === "review" && !(previewUrl && /^https:\/\//.test(previewUrl))) throw new Error("Önce önizlemeyi yayınlayınız (Yayın → Önizleme yayınla); yorum linki o adresi gösterir.");
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_DAYS * 86_400_000).toISOString();
  const labels = PAGE_LABELS[lang]!;
  const record = {
    slug, kind, lang, name: draft.business?.name ?? slug, createdAt: now.toISOString(), expiresAt,
    maxSubmissions: kind === "intake" ? 10 : 100,
    ...(kind === "intake" ? { questions: intakeQuestions() } : { previewUrl, pages: [...(draft.pages ?? ["home"]), "other"].map((p) => ({ id: p, label: labels[p] ?? p })) }),
  };
  await call(c, "PUT", `links/${token}`, record, fetcher);
  const link: PortalLink = { token, kind, url: `${c.url}/${kind === "intake" ? "f" : "r"}/${token}`, createdAt: record.createdAt, expiresAt };
  writeJson(linksFile(factory, slug), [...listLinks(factory, slug), link]);
  return link;
}

export async function closeLink(factory: FactoryConfig, slug: string, token: string, fetcher?: PortalFetch): Promise<void> {
  const c = readPortal();
  if (!c) throw new Error("Müşteri portalı kurulmadı.");
  const links = listLinks(factory, slug);
  if (!links.some((l) => l.token === token)) throw new Error("Bu müşteride böyle bir link yok.");
  await call(c, "DELETE", `links/${token}`, undefined, fetcher);
  writeJson(linksFile(factory, slug), links.filter((l) => l.token !== token));
}

// ---------------------------------------------------------------- what clients sent

export interface IntakeEntry {
  readonly id: string;
  readonly at: string;
  readonly answers: Record<string, { question: string; answer: string }>;
  readonly freeText: string;
  readonly files: string[];
  readonly used?: boolean;
}

export interface FeedbackEntry {
  readonly id: string;
  readonly at: string;
  readonly page: string;
  readonly text: string;
  readonly status: "open" | "sent" | "done";
}

const fdir = (factory: FactoryConfig, slug: string) => clientPaths(factory.clientsRoot, slug).factoryDir;
const readList = <T>(file: string): T[] => (readJsonIfExists(file) as T[] | undefined) ?? [];

export function clientInbox(factory: FactoryConfig, slug: string) {
  return {
    intake: readList<IntakeEntry>(path.join(fdir(factory, slug), INBOX_FILE)),
    feedback: readList<FeedbackEntry>(path.join(fdir(factory, slug), FEEDBACK_FILE)),
    approval: (readJsonIfExists(path.join(fdir(factory, slug), APPROVAL_FILE)) as { at: string; name: string; previewUrl?: string } | undefined) ?? null,
  };
}

/** Marks one entry (an intake used for a job, a comment sent to the agent or done). */
export function updateEntry(factory: FactoryConfig, slug: string, kind: "intake" | "feedback", id: string, patch: Record<string, unknown>): void {
  const file = path.join(fdir(factory, slug), kind === "intake" ? INBOX_FILE : FEEDBACK_FILE);
  const list = readList<{ id: string }>(file);
  if (!list.some((e) => e.id === id)) throw new Error("Kayıt bulunamadı.");
  writeJson(file, list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

const SAFE_NAME = /[^\w.-]+/g;

/**
 * Collects everything clients sent since the last time, for every client: files into the client's inbox, text
 * into .factory/, then deletes it from the portal. Items for unknown clients are left alone.
 */
export async function pullPortal(factory: FactoryConfig, fetcher?: PortalFetch): Promise<{ intake: number; comments: number; approvals: number }> {
  const c = readPortal();
  if (!c) return { intake: 0, comments: 0, approvals: 0 };
  const res = await call(c, "GET", "items", undefined, fetcher);
  const { items } = (await res.json()) as { items: Array<Record<string, unknown> & { key: string; slug: string; type: string; at: string }> };
  const known = new Set(tools.listClients(factory).clients.map((x) => x.slug));
  const counts = { intake: 0, comments: 0, approvals: 0 };
  for (const item of items) {
    if (!known.has(item.slug)) continue;
    const id = item.key.split(":").slice(2).join(":");
    const dir = fdir(factory, item.slug);
    mkdirSync(dir, { recursive: true });
    if (item.type === "intake") {
      const saved: string[] = [];
      const inbox = safeJoin(factory.inboxDir, item.slug);
      mkdirSync(inbox, { recursive: true });
      for (const f of (item.files as Array<{ key: string; name: string }> | undefined) ?? []) {
        const fr = await call(c, "GET", `files/${encodeURIComponent(f.key)}`, undefined, fetcher);
        if (!fr.ok) continue;
        const name = `musteri-${id.slice(0, 13)}-${String(f.name).replace(SAFE_NAME, "-").replace(/^[-.]+/, "").slice(0, 60) || "dosya"}`;
        writeFileSync(safeJoin(inbox, name), Buffer.from(await fr.arrayBuffer()));
        saved.push(name);
      }
      const file = path.join(dir, INBOX_FILE);
      const entry: IntakeEntry = { id, at: item.at, answers: (item.answers as IntakeEntry["answers"]) ?? {}, freeText: String(item.freeText ?? ""), files: saved };
      writeJson(file, [...readList<IntakeEntry>(file).filter((e) => e.id !== id), entry]);
      counts.intake += 1;
    } else if (item.type === "comment") {
      const file = path.join(dir, FEEDBACK_FILE);
      const entry: FeedbackEntry = { id, at: item.at, page: String(item.page ?? ""), text: String(item.text ?? "").slice(0, 4000), status: "open" };
      writeJson(file, [...readList<FeedbackEntry>(file).filter((e) => e.id !== id), entry]);
      counts.comments += 1;
    } else if (item.type === "approval") {
      writeJson(path.join(dir, APPROVAL_FILE), { at: item.at, name: String(item.name ?? "").slice(0, 80), previewUrl: item.previewUrl ?? null });
      counts.approvals += 1;
    }
    await call(c, "DELETE", `items/${encodeURIComponent(item.key)}`, undefined, fetcher);
  }
  return counts;
}

/** The intake as text for an agent job (answers as "question: answer"); data from the client. */
export function intakeText(e: IntakeEntry): string {
  const lines = Object.values(e.answers).map((a) => `${a.question}: ${a.answer}`);
  if (e.freeText) lines.push(e.freeText);
  if (e.files.length) lines.push(`Dosyalar (inbox): ${e.files.join(", ")}`);
  return lines.join("\n");
}

const AUTO_PULL_MS = 5 * 60_000;
let pulling: Promise<unknown> | null = null;

/** One pull at a time (the timer and the button may meet). */
export function pullOnce(factory: FactoryConfig, fetcher?: PortalFetch): Promise<{ intake: number; comments: number; approvals: number }> {
  if (pulling) return pulling as Promise<{ intake: number; comments: number; approvals: number }>;
  const p = pullPortal(factory, fetcher).finally(() => { pulling = null; });
  pulling = p;
  return p;
}

/** Collects new client messages every 5 minutes while the panel runs (only when the portal is set up). */
export function startAutoPull(factory: FactoryConfig, log: (t: string) => void): () => void {
  const timer = setInterval(() => {
    if (!readPortal()) return;
    pullOnce(factory)
      .then((c) => { if (c.intake + c.comments + c.approvals) log(`[portal] yeni: ${c.intake} form, ${c.comments} yorum, ${c.approvals} onay`); })
      .catch((e: Error) => log(`[portal] alınamadı: ${e.message}`));
  }, AUTO_PULL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
