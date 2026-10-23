import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { userConfigDir } from "../config.js";
import { writeJson } from "./files.js";

/**
 * The person's own accounts (each person runs the panel on their own computer with their own Cloudflare account).
 * Kept in ~/.config/arke-web-studio/accounts.json, readable only by that user, with the token encrypted (AES-256-GCM)
 * by a key in a separate file next to it. On WSL there is no OS keychain: this protects against the file being
 * shared by accident (backups, reports, screenshots), not against someone logged in as the same user. Inside
 * ArkeLab the OS's encrypted store (safeStorage) takes its place.
 *
 * Never sent to the agent: agent processes run with ARKE_NO_ACCOUNTS=1 (this module then reads nothing), and the
 * agent may not read ~/.config at all. The panel never returns the token, only a short hint.
 */
export interface CloudflareAccount {
  readonly token: string;
  readonly accountId: string;
}

export interface AccountStatus {
  readonly configured: boolean;
  readonly source: "panel" | "env" | null;
  /** First and last four characters only. */
  readonly accountId: string | null;
  /** Last four characters of the token. */
  readonly tokenHint: string | null;
  readonly savedAt: string | null;
  readonly verifiedAt: string | null;
}

interface Sealed {
  readonly iv: string;
  readonly tag: string;
  readonly data: string;
}
interface StoreFile {
  cloudflare?: { accountId: string; token: Sealed; savedAt: string; verifiedAt?: string | null };
}

export const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,200}$/;

const dir = () => process.env.ARKE_ACCOUNTS_DIR ?? userConfigDir();
const storeFile = () => path.join(dir(), "accounts.json");
const keyFile = () => path.join(dir(), "accounts.key");

/** Agent processes (and anything started for them) never see the person's accounts. */
export const accountsDisabled = (): boolean => process.env.ARKE_NO_ACCOUNTS === "1";

function privateFile(file: string): void {
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows file systems ignore modes */
  }
}

function key(create: boolean): Buffer | null {
  const file = keyFile();
  if (existsSync(file)) {
    const k = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
    return k.length === 32 ? k : null;
  }
  if (!create) return null;
  mkdirSync(dir(), { recursive: true });
  const k = randomBytes(32);
  writeFileSync(file, k.toString("base64"), { mode: 0o600 });
  privateFile(file);
  return k;
}

function seal(text: string, k: Buffer): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function open(s: Sealed, k: Buffer): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(s.iv, "base64"));
    d.setAuthTag(Buffer.from(s.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(s.data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null; // a changed key or file: treated as no account
  }
}

function readStore(): StoreFile {
  try {
    return existsSync(storeFile()) ? (JSON.parse(readFileSync(storeFile(), "utf8")) as StoreFile) : {};
  } catch {
    return {};
  }
}

function writeStore(s: StoreFile): void {
  writeJson(storeFile(), s);
  privateFile(storeFile());
}

/** Checks the shape of what was typed (not whether Cloudflare accepts it: that is the panel's test). */
export function validateCloudflare(input: { accountId?: unknown; token?: unknown }): CloudflareAccount {
  const accountId = typeof input.accountId === "string" ? input.accountId.trim().toLowerCase() : "";
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("Hesap kimliği 32 karakterlik bir kod olmalı (Cloudflare'de Account ID).");
  if (!TOKEN_PATTERN.test(token)) throw new Error("API token biçimi geçersiz. Cloudflare'de oluşturduğunuz token'ı olduğu gibi yapıştırın.");
  return { accountId, token };
}

export function saveCloudflare(account: CloudflareAccount, verifiedAt: string | null = null): void {
  if (accountsDisabled()) throw new Error("Hesaplar bu süreçte kullanılamaz.");
  const k = key(true)!;
  writeStore({ ...readStore(), cloudflare: { accountId: account.accountId, token: seal(account.token, k), savedAt: new Date().toISOString(), verifiedAt } });
}

export function markCloudflareVerified(): void {
  const s = readStore();
  if (s.cloudflare) writeStore({ ...s, cloudflare: { ...s.cloudflare, verifiedAt: new Date().toISOString() } });
}

export function removeCloudflare(): void {
  const s = readStore();
  delete s.cloudflare;
  writeStore(s);
}

/** The account saved in the panel, decrypted; null when none (or in an agent process). */
export function readCloudflare(): CloudflareAccount | null {
  if (accountsDisabled()) return null;
  const c = readStore().cloudflare;
  const k = c ? key(false) : null;
  if (!c || !k) return null;
  const token = open(c.token, k);
  return token ? { token, accountId: c.accountId } : null;
}

/** The account the panel uses: saved in the panel first, else the environment variables (older setups). */
export function managedCloudflare(): CloudflareAccount | null {
  const saved = readCloudflare();
  if (saved) return saved;
  const token = process.env.ARKE_CF_MANAGED_API_TOKEN;
  const accountId = process.env.ARKE_CF_MANAGED_ACCOUNT_ID;
  return token && accountId ? { token, accountId } : null;
}

const maskId = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;

export function cloudflareAccountStatus(): AccountStatus {
  const saved = readCloudflare();
  const meta = readStore().cloudflare;
  if (saved && meta)
    return {
      configured: true,
      source: "panel",
      accountId: maskId(saved.accountId),
      tokenHint: `…${saved.token.slice(-4)}`,
      savedAt: meta.savedAt,
      verifiedAt: meta.verifiedAt ?? null,
    };
  const env = managedCloudflare();
  if (env) return { configured: true, source: "env", accountId: maskId(env.accountId), tokenHint: `…${env.token.slice(-4)}`, savedAt: null, verifiedAt: null };
  return { configured: false, source: null, accountId: null, tokenHint: null, savedAt: null, verifiedAt: null };
}

/** For tests: forget the files (used with ARKE_ACCOUNTS_DIR). */
export function resetAccountsForTest(): void {
  rmSync(storeFile(), { force: true });
  rmSync(keyFile(), { force: true });
}

// ---------------------------------------------------------------- the client's own secrets (app sites)

/**
 * Secrets that belong to one client's app site (payment provider keys, the admin screen's password hash…). Kept
 * like the Cloudflare token: encrypted, readable only by this user, never sent to the agent, never shown back
 * (only their names). They reach Cloudflare as Worker secrets at publish time, through stdin.
 */
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const CLIENT_SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_SECRET_CHARS = 4000;

interface ClientSecretsFile {
  secrets: Record<string, { value: Sealed; savedAt: string }>;
}

function clientFile(slug: string): string {
  if (!CLIENT_SLUG.test(slug)) throw new Error("Geçersiz müşteri kısa adı.");
  return path.join(dir(), "clients", `${slug}.json`);
}

function readClientFile(slug: string): ClientSecretsFile {
  try {
    const f = clientFile(slug);
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as ClientSecretsFile) : { secrets: {} };
  } catch {
    return { secrets: {} };
  }
}

export function saveClientSecret(slug: string, name: string, value: string): void {
  if (accountsDisabled()) throw new Error("Gizli anahtarlar bu süreçte kullanılamaz.");
  if (!SECRET_NAME_PATTERN.test(name)) throw new Error("Anahtar adı büyük harf, rakam ve alt çizgiden oluşmalı (ör. IYZICO_API_KEY).");
  if (typeof value !== "string" || !value.trim() || value.length > MAX_SECRET_CHARS) throw new Error("Anahtar değeri boş ya da çok uzun.");
  const k = key(true)!;
  const f = readClientFile(slug);
  f.secrets[name] = { value: seal(value.trim(), k), savedAt: new Date().toISOString() };
  writeJson(clientFile(slug), f);
  privateFile(clientFile(slug));
}

export function removeClientSecret(slug: string, name: string): void {
  const f = readClientFile(slug);
  delete f.secrets[name];
  writeJson(clientFile(slug), f);
  privateFile(clientFile(slug));
}

/** Names and dates only: what the panel may show. */
export function clientSecretNames(slug: string): Array<{ name: string; savedAt: string }> {
  return Object.entries(readClientFile(slug).secrets)
    .map(([name, s]) => ({ name, savedAt: s.savedAt }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The values, for the publish step only; empty in an agent process. */
export function readClientSecrets(slug: string): Record<string, string> {
  if (accountsDisabled()) return {};
  const k = key(false);
  if (!k) return {};
  const out: Record<string, string> = {};
  for (const [name, s] of Object.entries(readClientFile(slug).secrets)) {
    const v = open(s.value, k);
    if (v !== null) out[name] = v;
  }
  return out;
}
