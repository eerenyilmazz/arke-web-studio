// Site Factory ready-made part: notifications (the inbox). Messages from the site's forms land here; later parts
// (orders, bookings) add their own entries through addEntry(). Optionally each new entry is also sent to a
// webhook the client chose (NOTIFY_WEBHOOK_URL secret: Slack, Discord, a Telegram relay…).
// Factory-owned (app/parts/inbox.js); the agent never writes it. Table: migration 0003_inbox.sql.
import { HttpError, clientIp, int, json, limit, nowIso, readJson, text } from "./core.js";

const STATUSES = new Set(["new", "read", "done", "archived"]);
const PUBLIC_LIMIT = 8;
const PUBLIC_WINDOW_SECONDS = 3600;
const PAGE_SIZE = 50;
const WEBHOOK_TIMEOUT_MS = 5000;

/** Adds an entry and notifies (used by this part's form endpoint and by later parts). */
export async function addEntry(env, ctx, entry) {
  const row = await env.DB.prepare("INSERT INTO inbox (kind, name, contact, message, data, status, created_at) VALUES (?, ?, ?, ?, ?, 'new', ?) RETURNING id")
    .bind(entry.kind, entry.name, entry.contact, entry.message ?? "", JSON.stringify(entry.data ?? {}), nowIso())
    .first();
  const hook = env.NOTIFY_WEBHOOK_URL;
  if (typeof hook === "string" && hook.startsWith("https://")) {
    const summary = `Yeni ${entry.kind === "message" ? "mesaj" : entry.kind}: ${entry.name} (${entry.contact})${entry.message ? ` — ${entry.message.slice(0, 300)}` : ""}`;
    const send = fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summary, content: summary }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    }).catch(() => undefined); // a failing webhook never loses the entry
    if (ctx?.waitUntil) ctx.waitUntil(send);
  }
  return row.id;
}

async function submit(request, env, ctx) {
  const body = await readJson(request);
  // Honeypot: people never fill the hidden "website" field; bots get a quiet success.
  if (text(body, "website", { max: 200 })) return json(200, { ok: true });
  await limit(env.DB, `inbox:${clientIp(request)}`, PUBLIC_LIMIT, PUBLIC_WINDOW_SECONDS);
  const id = await addEntry(env, ctx, {
    kind: "message",
    name: text(body, "name", { max: 120, required: true }),
    contact: text(body, "contact", { max: 160, required: true }),
    message: text(body, "message", { max: 4000 }),
    data: { subject: text(body, "subject", { max: 160 }), page: text(body, "page", { max: 200 }) },
  });
  return json(201, { ok: true, id });
}

async function list(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const before = int({ b: url.searchParams.get("before") }, "b", { min: 1 });
  const where = [];
  const args = [];
  if (status && STATUSES.has(status)) {
    where.push("status = ?");
    args.push(status);
  } else where.push("status != 'archived'");
  if (before) {
    where.push("id < ?");
    args.push(before);
  }
  const rows = await env.DB.prepare(`SELECT * FROM inbox WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${PAGE_SIZE}`)
    .bind(...args)
    .all();
  const unread = await env.DB.prepare("SELECT COUNT(*) AS n FROM inbox WHERE status = 'new'").first();
  return json(200, {
    unread: Number(unread?.n ?? 0),
    entries: rows.results.map((r) => ({ ...r, data: safeParse(r.data) })),
  });
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

async function setStatus(request, env, _ctx, m) {
  const status = text(await readJson(request), "status", { max: 12, required: true });
  if (!STATUSES.has(status)) throw new HttpError(400, "Durum geçersiz.");
  const r = await env.DB.prepare("UPDATE inbox SET status = ? WHERE id = ?").bind(status, Number(m[1])).run();
  if (!r.meta?.changes) throw new HttpError(404, "Kayıt bulunamadı.");
  return json(200, { ok: true });
}

export default {
  id: "notifications",
  routes: [
    { method: "POST", path: /^\/api\/inbox$/, handle: submit },
    { method: "GET", path: /^\/api\/admin\/inbox$/, admin: true, handle: list },
    { method: "PUT", path: /^\/api\/admin\/inbox\/(\d{1,10})$/, admin: true, handle: setStatus },
  ],
};
