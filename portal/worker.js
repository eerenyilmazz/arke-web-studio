// Site Factory client portal: a small Cloudflare Worker on Eren's own account (free plan, Workers KV).
//
// Clients open a link Eren sends them:
//   /f/<token>  a form for their business details, logo and photos
//   /r/<token>  the preview of their site, with comments and "Onaylıyorum"
// The panel (on Eren's computer) creates the links and collects what arrives through /api/*, which needs the
// portal secret (Bearer). What the panel has collected is deleted here, so the store stays small.
//
// Pages are plain HTML forms: no scripts, no cookies, no trackers. Everything a client typed is escaped.
// A link is an unguessable random token, expires after 60 days and takes a limited number of submissions.

const MAX_FILES = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 200_000;
const MAX_TEXT = 4000;
const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif" };
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const T = {
  tr: {
    intakeTitle: "İşletme bilgileri", intakeLead: "Siteniz için bilgileri doldurun. Bilmediğiniz soruları boş bırakabilirsiniz.",
    free: "Eklemek istedikleriniz", files: "Logo ve fotoğraflar (en fazla 8 dosya, her biri 5 MB)", send: "Gönder",
    thanks: "Teşekkürler, bilgileriniz iletildi.", thanksLead: "Bu sayfayı kapatabilirsiniz.",
    reviewTitle: "Sitenizin önizlemesi", reviewLead: "Siteye bakın; değişmesini istediğiniz yerleri yazın. Her şey tamamsa onaylayın.",
    open: "Önizlemeyi yeni sekmede aç", page: "Sayfa", comment: "Yorumunuz", sendComment: "Yorumu gönder",
    approveTitle: "Onay", yourName: "Adınız", approve: "Onaylıyorum", approveNote: "Onay, sitenin bu hâlinin yayına alınmasını kabul ettiğiniz anlamına gelir.",
    commentThanks: "Yorumunuz iletildi.", approveThanks: "Onayınız iletildi. Teşekkürler!", back: "Önizlemeye dön",
    gone: "Bu bağlantı geçersiz ya da süresi dolmuş.", full: "Bu bağlantıyla gönderim sınırına ulaşıldı.", bad: "Gönderim okunamadı.",
  },
  en: {
    intakeTitle: "Business details", intakeLead: "Fill in what you know for your website. Leave any question you are unsure about empty.",
    free: "Anything else", files: "Logo and photos (up to 8 files, 5 MB each)", send: "Send",
    thanks: "Thank you, your details have been sent.", thanksLead: "You can close this page.",
    reviewTitle: "Your website preview", reviewLead: "Have a look; tell us what should change. If everything is right, approve it.",
    open: "Open the preview in a new tab", page: "Page", comment: "Your comment", sendComment: "Send comment",
    approveTitle: "Approval", yourName: "Your name", approve: "I approve", approveNote: "Approving means you accept this version of the site going live.",
    commentThanks: "Your comment has been sent.", approveThanks: "Your approval has been sent. Thank you!", back: "Back to the preview",
    gone: "This link is not valid or has expired.", full: "This link has reached its limit.", bad: "The form could not be read.",
  },
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clip = (s, n = MAX_TEXT) => String(s ?? "").slice(0, n);

function headers(extra = {}, frameOrigin = null) {
  const frame = frameOrigin ? ` frame-src ${frameOrigin};` : "";
  return {
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none';${frame}`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    ...extra,
  };
}

function page(lang, title, body, frameOrigin = null, status = 200) {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f2f4f3;--card:#fff;--ink:#12202a;--mute:#5f6b74;--line:#dde3e2;--accent:#1f5a6b;--accent-ink:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0d171b;--card:#13222a;--ink:#e6eef0;--mute:#8ea2a8;--line:#22363f;--accent:#7cc0cf;--accent-ink:#0d171b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 3rem;display:grid;gap:1rem}.wide{max-width:72rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:1.25rem;display:grid;gap:.9rem}
h1{margin:0;font-size:1.6rem}h2{margin:0;font-size:1.1rem}p{margin:0}.mute{color:var(--mute);font-size:.92rem}
label{display:grid;gap:.35rem;font-weight:600;font-size:.95rem}.hint{font-weight:400;color:var(--mute);font-size:.85rem}
input,textarea,select{font:inherit;padding:.65rem .75rem;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);width:100%}
textarea{min-height:5.5rem;resize:vertical}button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:.75rem 1.2rem;background:var(--accent);color:var(--accent-ink);cursor:pointer;justify-self:start}
a{color:var(--accent)}.frame{width:100%;height:70vh;border:1px solid var(--line);border-radius:12px;background:#fff}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
</style></head><body><main${frameOrigin ? ' class="wide"' : ""}>${body}</main></body></html>`;
  return new Response(html, { status, headers: headers({ "Content-Type": "text/html; charset=utf-8" }, frameOrigin) });
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: headers({ "Content-Type": "application/json" }) });

async function getLink(env, token) {
  if (!TOKEN.test(token)) return null;
  const link = await env.SF_PORTAL.get(`link:${token}`, "json");
  if (!link || (link.expiresAt && Date.parse(link.expiresAt) < Date.now())) return null;
  return link;
}

/** Counts a submission on the link; false when the link has reached its limit. */
async function count(env, token, link) {
  const used = Number(link.count || 0);
  if (used >= Number(link.maxSubmissions || 20)) return false;
  const ttl = link.expiresAt ? Math.max(60, Math.round((Date.parse(link.expiresAt) - Date.now()) / 1000)) : undefined;
  await env.SF_PORTAL.put(`link:${token}`, JSON.stringify({ ...link, count: used + 1 }), ttl ? { expirationTtl: ttl } : undefined);
  return true;
}

const itemKey = (slug) => `item:${slug}:${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

/** Sniffs the first bytes: only real images are kept, whatever the browser said. */
function imageType(bytes, declared) {
  const b = new Uint8Array(bytes.slice(0, 16));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 && (brand === "avif" || brand === "avis")) return "image/avif";
  if (declared === "image/svg+xml") {
    const head = new TextDecoder().decode(bytes.slice(0, 512)).toLowerCase();
    if (head.includes("<svg")) return "image/svg+xml"; // the panel checks SVGs again before they reach a site
  }
  return null;
}

function intakeForm(link, t) {
  const qs = (link.questions || []).map((q) => `<label>${esc(q.text)}${q.hint ? `<span class="hint">${esc(q.hint)}</span>` : ""}<textarea name="q:${esc(q.id)}" maxlength="${MAX_TEXT}"></textarea></label>`).join("");
  return `<form class="card" method="post" enctype="multipart/form-data">
<div><h1>${esc(link.name)}</h1><p class="mute">${esc(t.intakeLead)}</p></div>
${qs}
<label>${esc(t.free)}<textarea name="freeText" maxlength="${MAX_TEXT}"></textarea></label>
<label>${esc(t.files)}<input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"></label>
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<button type="submit">${esc(t.send)}</button></form>`;
}

function reviewPage(link, t, token) {
  const pages = (link.pages || []).map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("");
  return `<div class="card"><div><h1>${esc(link.name)}</h1><p class="mute">${esc(t.reviewLead)}</p></div>
<p><a href="${esc(link.previewUrl)}" target="_blank" rel="noopener noreferrer">${esc(t.open)}</a></p>
<iframe class="frame" src="${esc(link.previewUrl)}" title="${esc(t.reviewTitle)}" sandbox="allow-scripts allow-same-origin"></iframe></div>
<form class="card" method="post" action="/r/${esc(token)}/comment"><h2>${esc(t.comment)}</h2>
${pages ? `<label>${esc(t.page)}<select name="page">${pages}</select></label>` : ""}
<label class="sr">${esc(t.comment)}<textarea name="text" required maxlength="${MAX_TEXT}"></textarea></label>
<div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
<button type="submit">${esc(t.sendComment)}</button></form>
<form class="card" method="post" action="/r/${esc(token)}/approve"><h2>${esc(t.approveTitle)}</h2>
<label>${esc(t.yourName)}<input name="name" required maxlength="80"></label><p class="mute">${esc(t.approveNote)}</p>
<div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
<button type="submit">${esc(t.approve)}</button></form>`;
}

async function handleIntake(request, env, token, link, t) {
  if (request.method === "GET") return page(link.lang, `${t.intakeTitle} · ${link.name}`, intakeForm(link, t));
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return page(link.lang, t.bad, `<div class="card"><p>${esc(t.bad)}</p></div>`, null, 413);
  let form;
  try { form = await request.formData(); } catch { return page(link.lang, t.bad, `<div class="card"><p>${esc(t.bad)}</p></div>`, null, 400); }
  if (form.get("website")) return page(link.lang, t.thanks, `<div class="card"><h1>${esc(t.thanks)}</h1></div>`); // bots
  if (!(await count(env, token, link))) return page(link.lang, t.full, `<div class="card"><p>${esc(t.full)}</p></div>`, null, 429);
  const answers = {};
  for (const q of link.questions || []) {
    const v = clip(form.get(`q:${q.id}`)).trim();
    if (v) answers[q.id] = { question: clip(q.text, 300), answer: v };
  }
  const key = itemKey(link.slug);
  const files = [];
  for (const f of form.getAll("files").slice(0, MAX_FILES)) {
    if (typeof f === "string" || !f.size || f.size > MAX_FILE_BYTES) continue;
    const bytes = await f.arrayBuffer();
    const type = imageType(bytes, f.type);
    if (!type) continue;
    const fileKey = `file:${link.slug}:${key.slice(5 + link.slug.length + 1)}-${files.length}`;
    const name = clip(String(f.name || `file.${IMAGE_TYPES[type]}`).replace(/[^\w.-]+/g, "-"), 80);
    await env.SF_PORTAL.put(fileKey, bytes, { metadata: { name, type } });
    files.push({ key: fileKey, name, type, bytes: f.size });
  }
  await env.SF_PORTAL.put(key, JSON.stringify({ type: "intake", token, at: new Date().toISOString(), answers, freeText: clip(form.get("freeText")).trim(), files }));
  return page(link.lang, t.thanks, `<div class="card"><h1>${esc(t.thanks)}</h1><p class="mute">${esc(t.thanksLead)}</p></div>`);
}

async function handleReview(request, env, token, action, link, t) {
  const origin = (() => { try { return new URL(link.previewUrl).origin; } catch { return null; } })();
  if (request.method === "GET" && !action) return page(link.lang, `${t.reviewTitle} · ${link.name}`, reviewPage(link, t, token), origin);
  if (request.method !== "POST" || (action !== "comment" && action !== "approve")) return page(link.lang, t.gone, `<div class="card"><p>${esc(t.gone)}</p></div>`, null, 404);
  let form;
  try { form = await request.formData(); } catch { return page(link.lang, t.bad, `<div class="card"><p>${esc(t.bad)}</p></div>`, null, 400); }
  const back = `<p><a href="/r/${esc(token)}">${esc(t.back)}</a></p>`;
  if (form.get("website")) return page(link.lang, t.commentThanks, `<div class="card"><h1>${esc(t.commentThanks)}</h1></div>`);
  if (!(await count(env, token, link))) return page(link.lang, t.full, `<div class="card"><p>${esc(t.full)}</p>${back}</div>`, null, 429);
  const at = new Date().toISOString();
  if (action === "comment") {
    const text = clip(form.get("text")).trim();
    if (!text) return page(link.lang, t.bad, `<div class="card"><p>${esc(t.bad)}</p>${back}</div>`, null, 400);
    const pageId = clip(form.get("page"), 60);
    await env.SF_PORTAL.put(itemKey(link.slug), JSON.stringify({ type: "comment", token, at, page: pageId, text }));
    return page(link.lang, t.commentThanks, `<div class="card"><h1>${esc(t.commentThanks)}</h1>${back}</div>`);
  }
  const name = clip(form.get("name"), 80).trim();
  if (!name) return page(link.lang, t.bad, `<div class="card"><p>${esc(t.bad)}</p>${back}</div>`, null, 400);
  await env.SF_PORTAL.put(itemKey(link.slug), JSON.stringify({ type: "approval", token, at, name, previewUrl: link.previewUrl }));
  return page(link.lang, t.approveThanks, `<div class="card"><h1>${esc(t.approveThanks)}</h1>${back}</div>`);
}

/** Constant-time comparison of the Bearer secret. */
function authorised(request, env) {
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const want = String(env.PORTAL_SECRET || "");
  if (want.length < 32 || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function handleApi(request, env, parts) {
  if (!authorised(request, env)) return json({ error: "unauthorised" }, 401);
  const [what, id] = parts;
  if (what === "links" && id && TOKEN.test(id)) {
    if (request.method === "PUT") {
      const link = await request.json();
      if (!SLUG.test(String(link.slug || "")) || !["intake", "review"].includes(link.kind)) return json({ error: "bad link" }, 400);
      const ttl = Math.max(60, Math.round((Date.parse(link.expiresAt) - Date.now()) / 1000) || 60 * 60 * 24 * 60);
      await env.SF_PORTAL.put(`link:${id}`, JSON.stringify({ ...link, count: 0 }), { expirationTtl: ttl });
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      await env.SF_PORTAL.delete(`link:${id}`);
      return json({ ok: true });
    }
  }
  if (what === "items" && request.method === "GET" && !id) {
    const out = [];
    let cursor;
    do {
      const page = await env.SF_PORTAL.list({ prefix: "item:", cursor });
      for (const k of page.keys) {
        const value = await env.SF_PORTAL.get(k.name, "json");
        if (value) out.push({ key: k.name, slug: k.name.split(":")[1], ...value });
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor && out.length < 500);
    return json({ items: out });
  }
  if (what === "items" && request.method === "DELETE" && id && id.startsWith("item:")) {
    const value = await env.SF_PORTAL.get(id, "json");
    for (const f of value?.files || []) await env.SF_PORTAL.delete(f.key);
    await env.SF_PORTAL.delete(id);
    return json({ ok: true });
  }
  if (what === "files" && request.method === "GET" && id && id.startsWith("file:")) {
    const { value, metadata } = await env.SF_PORTAL.getWithMetadata(id, "arrayBuffer");
    if (!value) return json({ error: "not found" }, 404);
    return new Response(value, { headers: headers({ "Content-Type": "application/octet-stream", "X-File-Name": metadata?.name || "file", "X-File-Type": metadata?.type || "" }) });
  }
  if (what === "ping") return json({ ok: true, version: 1 });
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
    try {
      if (parts[0] === "api") return await handleApi(request, env, parts.slice(1));
      if ((parts[0] === "f" || parts[0] === "r") && parts[1]) {
        const link = await getLink(env, parts[1]);
        const lang = link?.lang === "en" ? "en" : "tr";
        const t = T[lang];
        if (!link || link.kind !== (parts[0] === "f" ? "intake" : "review")) return page(lang, t.gone, `<div class="card"><p>${esc(t.gone)}</p></div>`, null, 404);
        return parts[0] === "f" ? await handleIntake(request, env, parts[1], link, t) : await handleReview(request, env, parts[1], parts[2], link, t);
      }
      return page("tr", "Site Factory", `<div class="card"><p>${esc(T.tr.gone)}</p></div>`, null, 404);
    } catch {
      return page("tr", "Hata", `<div class="card"><p>Bir hata oluştu. Lütfen daha sonra tekrar deneyin.</p></div>`, null, 500);
    }
  },
};
