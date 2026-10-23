// Arke Web Studio ready-made part: the app Worker core (router, admin sign-in, rate limits, shared helpers).
// Factory-owned: copied into every app site as app/parts/core.js and replaced by newer factory versions.
// The agent never writes or edits this file.

const SESSION_COOKIE = "__Host-arke_admin";
const SESSION_HOURS = 12;
const LOGIN_FAILS_ALLOWED = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const PBKDF2_PREFIX = "pbkdf2-sha256";
const JSON_LIMIT_BYTES = 64 * 1024;

const encoder = new TextEncoder();

// ---------------------------------------------------------------- responses

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS, ...headers },
  });
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readJson(request) {
  const type = request.headers.get("Content-Type") ?? "";
  const text = await request.text();
  if (text.length > JSON_LIMIT_BYTES) throw new HttpError(413, "Gönderilen veri çok büyük.");
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
  try {
    const body = JSON.parse(text || "{}");
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    /* falls through */
  }
  throw new HttpError(400, "Geçersiz veri.");
}

/** A trimmed string field with a length limit; `required` refuses an empty one. */
export function text(body, key, { max, required = false } = {}) {
  const v = typeof body[key] === "string" ? body[key].trim() : body[key] == null ? "" : String(body[key]).trim();
  if (required && !v) throw new HttpError(400, `"${key}" boş olamaz.`);
  if (v.length > max) throw new HttpError(400, `"${key}" en fazla ${max} karakter olabilir.`);
  return v;
}

/** A whole number field (or null when empty) within limits. */
export function int(body, key, { min = 0, max = 2_000_000_000 } = {}) {
  const raw = body[key];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `"${key}" geçerli bir sayı olmalı.`);
  return n;
}

export const nowIso = () => new Date().toISOString();
export const clientIp = (request) => request.headers.get("CF-Connecting-IP") ?? "local";

/**
 * The visitor's address as rate limits store it: a keyed hash, never the address itself (personal data that only
 * counting needs). The key is the site's session secret, so the hash means nothing outside this site.
 */
export async function clientKey(request, env) {
  return (await hmac(env.SESSION_SECRET || "arke-rate", clientIp(request))).slice(0, 22);
}

// ---------------------------------------------------------------- rate limits (table rate_hits, migration 0001)

export async function recentHits(db, bucket, windowSeconds) {
  const since = Math.floor(Date.now() / 1000) - windowSeconds;
  await db.prepare("DELETE FROM rate_hits WHERE at < ?").bind(since - 86_400).run();
  const row = await db.prepare("SELECT COUNT(*) AS n FROM rate_hits WHERE bucket = ? AND at >= ?").bind(bucket, since).first();
  return Number(row?.n ?? 0);
}

export async function addHit(db, bucket) {
  await db.prepare("INSERT INTO rate_hits (bucket, at) VALUES (?, ?)").bind(bucket, Math.floor(Date.now() / 1000)).run();
}

/** Refuses with 429 once `limit` hits happened in the window, otherwise counts this one. */
export async function limit(db, bucket, max, windowSeconds) {
  if ((await recentHits(db, bucket, windowSeconds)) >= max) throw new HttpError(429, "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.");
  await addHit(db, bucket);
}

// ---------------------------------------------------------------- crypto helpers

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Checks a password against "pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>" (written by the panel). */
export async function verifyPassword(password, stored) {
  const [prefix, iter, salt, hash] = String(stored ?? "").split("$");
  const iterations = Number(iter);
  if (prefix !== PBKDF2_PREFIX || !Number.isInteger(iterations) || iterations < 10_000 || !salt || !hash) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations }, key, 256);
  return sameBytes(new Uint8Array(bits), unb64(hash));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

export function randomKey(bytes = 18) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ---------------------------------------------------------------- admin session

function cookieValue(request, name) {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function sessionValid(request, env) {
  const value = cookieValue(request, SESSION_COOKIE);
  if (!value || !env.SESSION_SECRET) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return sameBytes(encoder.encode(await hmac(env.SESSION_SECRET, exp)), encoder.encode(sig));
}

async function sessionCookie(env) {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600);
  return `${SESSION_COOKIE}=${exp}.${await hmac(env.SESSION_SECRET, exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

const CLEAR_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** Changes from the admin screen must come from this site (the cookie is SameSite=Strict as well). */
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}

async function login(request, env) {
  if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) throw new HttpError(503, "Yönetim ekranı henüz kurulmadı.");
  const bucket = `login:${await clientKey(request, env)}`;
  if ((await recentHits(env.DB, bucket, LOGIN_WINDOW_SECONDS)) >= LOGIN_FAILS_ALLOWED)
    throw new HttpError(429, "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.");
  const body = await readJson(request);
  const ok = await verifyPassword(text(body, "password", { max: 200 }), env.ADMIN_PASSWORD_HASH);
  if (!ok) {
    await addHit(env.DB, bucket);
    throw new HttpError(401, "Parola hatalı.");
  }
  return json(200, { ok: true }, { "Set-Cookie": await sessionCookie(env) });
}

// ---------------------------------------------------------------- admin page

function adminPage(html) {
  const nonce = randomKey(16);
  return new Response(html.replaceAll("{{NONCE}}", nonce), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' blob:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
      ...SECURITY_HEADERS,
    },
  });
}

// ---------------------------------------------------------------- personal data (KVKK / GDPR)

const DAY_MS = 86_400_000;
const MIN_QUERY = 3;
const MAX_ERASE = 500;
const RATE_ROWS_DAYS = 1;

/** Retention and the request deadline, from the settings the factory writes into the Worker (src/lib/privacy.ts). */
export function privacySettings(env) {
  const days = (name, fallback) => {
    const n = Number(env[name]);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  return {
    law: typeof env.ARKE_PRIVACY_LAW === "string" ? env.ARKE_PRIVACY_LAW : "GDPR",
    retentionDays: {
      messages: days("ARKE_RETENTION_MESSAGES_DAYS", 365),
      bookings: days("ARKE_RETENTION_BOOKINGS_DAYS", 365),
      orders: days("ARKE_RETENTION_ORDERS_DAYS", 6 * 365),
    },
    requestDays: days("ARKE_REQUEST_DAYS", 30),
  };
}

/** The ISO time before which a record of this kind is past its retention. */
export const cutoffIso = (days, now = Date.now()) => new Date(now - days * DAY_MS).toISOString();

async function logPrivacy(env, action, count) {
  await env.DB.prepare("INSERT INTO privacy_log (action, count, at) VALUES (?, ?, ?)").bind(action, count, nowIso()).run();
}

/**
 * The daily clean-up: every part deletes its records past their retention, rate-limit rows go after a day. Only the
 * number of deleted records is logged, never who they were about.
 */
export async function purge(env, parts, now = Date.now()) {
  if (!env.DB) return 0;
  const settings = privacySettings(env);
  let deleted = 0;
  for (const part of parts) if (part.personal?.purge) deleted += await part.personal.purge(env, settings, now);
  await env.DB.prepare("DELETE FROM rate_hits WHERE at < ?").bind(Math.floor(now / 1000) - RATE_ROWS_DAYS * 86_400).run();
  await logPrivacy(env, "purge", deleted);
  return deleted;
}

/** Admin: a person's records across the parts (find, download, delete), so a request is answered in minutes. */
function privacyRoutes(parts) {
  const holders = parts.filter((p) => p.personal);
  const query = (request) => {
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
    if (q.length < MIN_QUERY) throw new HttpError(400, `En az ${MIN_QUERY} karakter yazın (e-posta, telefon ya da ad).`);
    if (q.length > 160) throw new HttpError(400, "Arama çok uzun.");
    return q;
  };
  const find = async (env, q) => (await Promise.all(holders.map(async (p) => (await p.personal.find(env, q)).map((r) => ({ part: p.id, ...r }))))).flat();
  return [
    {
      method: "GET",
      path: /^\/api\/admin\/privacy$/,
      admin: true,
      handle: async (_r, env) => {
        const last = await env.DB.prepare("SELECT action, count, at FROM privacy_log ORDER BY id DESC LIMIT 10").all();
        return json(200, { ...privacySettings(env), log: last.results });
      },
    },
    {
      method: "GET",
      path: /^\/api\/admin\/privacy\/find$/,
      admin: true,
      handle: async (request, env) => {
        const rows = await find(env, query(request));
        return json(200, { results: rows.map(({ part, id, name, contact, summary, created_at }) => ({ part, id, name, contact, summary, created_at })) });
      },
    },
    {
      method: "GET",
      path: /^\/api\/admin\/privacy\/export$/,
      admin: true,
      handle: async (request, env) => {
        const q = query(request);
        const rows = await find(env, q);
        await logPrivacy(env, "export", rows.length);
        return json(200, { exportedAt: nowIso(), query: q, records: rows }, { "Content-Disposition": `attachment; filename="kisisel-veri-${Date.now()}.json"` });
      },
    },
    {
      method: "POST",
      path: /^\/api\/admin\/privacy\/erase$/,
      admin: true,
      handle: async (request, env) => {
        const items = (await readJson(request)).items;
        if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ERASE) throw new HttpError(400, "Silinecek kayıtları seçin.");
        let erased = 0;
        for (const p of holders) {
          const ids = items.filter((i) => i?.part === p.id && Number.isInteger(i.id) && i.id > 0).map((i) => i.id);
          if (ids.length) erased += await p.personal.erase(env, ids);
        }
        await logPrivacy(env, "erase", erased);
        return json(200, { ok: true, erased });
      },
    },
  ];
}

// ---------------------------------------------------------------- the app

/**
 * Builds the Worker from the parts a site uses. A part is { id, routes: [{ method, path: RegExp, admin?, handle }],
 * personal? }; admin routes need the sign-in cookie, and their changes must come from this site. A part that keeps
 * personal data gives `personal: { find(env, q), erase(env, ids), purge(env, settings, now) }`, used by the admin's
 * data-request tools and the daily clean-up. Everything that is not an API route is the built site (ASSETS).
 */
export function createApp({ adminHtml, parts }) {
  const routes = [...parts.flatMap((p) => p.routes), ...privacyRoutes(parts)];
  const partIds = parts.map((p) => p.id);
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const p = url.pathname;
      try {
        if (p === "/admin" || p === "/admin/") {
          if (request.method !== "GET") throw new HttpError(405, "İzin verilmeyen istek.");
          return adminPage(adminHtml);
        }
        if (!p.startsWith("/api/") && !p.startsWith("/media/")) return env.ASSETS.fetch(request);
        if (!env.DB) throw new HttpError(503, "Veritabanı bağlı değil.");
        if (p === "/api/admin/login" && request.method === "POST") return await login(request, env);
        if (p === "/api/admin/logout" && request.method === "POST") return json(200, { ok: true }, { "Set-Cookie": CLEAR_COOKIE });
        if (p === "/api/admin/session" && request.method === "GET")
          return json(200, {
            signedIn: await sessionValid(request, env),
            parts: partIds,
            personal: parts.some((x) => x.personal),
            configured: Boolean(env.ADMIN_PASSWORD_HASH),
          });
        for (const r of routes) {
          if (r.method !== request.method) continue;
          const m = r.path.exec(p);
          if (!m) continue;
          if (r.admin) {
            if (!(await sessionValid(request, env))) throw new HttpError(401, "Oturum süresi doldu. Lütfen yeniden giriş yapın.");
            if (request.method !== "GET" && !sameOrigin(request)) throw new HttpError(403, "İstek bu siteden gelmedi.");
          }
          return await r.handle(request, env, ctx, m);
        }
        throw new HttpError(404, "Bulunamadı.");
      } catch (error) {
        if (error instanceof HttpError) return json(error.status, { error: error.message });
        console.error("app error", error?.message ?? error);
        return json(500, { error: "Beklenmeyen bir hata oluştu." });
      }
    },
    /** The daily trigger (wrangler triggers.crons): personal data past its retention is deleted. */
    async scheduled(_event, env, ctx) {
      const work = purge(env, parts).catch((e) => console.error("purge failed", e?.message ?? e));
      if (ctx?.waitUntil) ctx.waitUntil(work);
      else await work;
    },
  };
}
