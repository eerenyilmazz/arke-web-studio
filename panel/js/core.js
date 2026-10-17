


export const STAGES = [
  { id: "collecting-answers", label: "Cevaplar", long: "Cevaplar toplanıyor" },
  { id: "design", label: "Tasarım", long: "Tasarım" },
  { id: "content", label: "Metinler", long: "Metinler" },
  { id: "awaiting-content-approval", label: "İçerik onayı", long: "İçerik onayı bekliyor" },
  { id: "build", label: "Build", long: "Build" },
  { id: "awaiting-visual-approval", label: "Görsel onay", long: "Görsel onay bekliyor" },
  { id: "awaiting-production-approval", label: "Önizleme", long: "Önizleme ve yayın onayı" },
  { id: "ready-to-deploy", label: "Yayın onayı", long: "Yayına hazır" },
  { id: "live", label: "Yayında", long: "Yayında" },
];
export const TABS = [["duzenle", "Düzenleme"], ["marka", "Marka Kimliği"], ["teklif", "Teklif"], ["bilgiler", "Müşteri Bilgileri"]];
/** Old tab links (bookmarks, earlier versions) land on the tab that now holds that content. */
export const OLD_TABS = { sohbet: "duzenle", akis: "duzenle", site: "duzenle", build: "duzenle", yayin: "bilgiler", sorular: "bilgiler", cevaplar: "bilgiler", metinler: "bilgiler" };
/** Four steps the operator thinks in; the nine internal stages map onto them. */
export const STEPS = [
  { label: "Müşteri Bilgileri", stages: ["collecting-answers"] },
  { label: "Site Oluşturuluyor", stages: ["design", "content", "build"] },
  { label: "Onay Bekleniyor", stages: ["awaiting-content-approval", "awaiting-visual-approval", "awaiting-production-approval", "ready-to-deploy"] },
  { label: "Yayında", stages: ["live"] },
];
/** Plain status per stage for lists and cards. tone: who acts next (you / client / agent / done). */
export const PLAIN = {
  "collecting-answers": { text: "Bilgi bekleniyor", tone: "client" },
  design: { text: "Oluşturuluyor", tone: "you" },
  content: { text: "Oluşturuluyor", tone: "you" },
  build: { text: "Oluşturulmayı bekliyor", tone: "you" },
  "awaiting-content-approval": { text: "Onay bekleniyor", tone: "you" },
  "awaiting-visual-approval": { text: "Onay bekleniyor", tone: "you" },
  "awaiting-production-approval": { text: "Müşteri onayı bekleniyor", tone: "you" },
  "ready-to-deploy": { text: "Yayına hazır", tone: "you" },
  live: { text: "Yayında", tone: "done" },
  unreadable: { text: "Dosya okunamadı", tone: "bad" },
};
export function plainOf(stage) { return PLAIN[stage] || { text: stage, tone: "you" }; }
export function stepIndex(stage) { const i = STEPS.findIndex((s) => s.stages.includes(stage)); return i < 0 ? 0 : i; }
export const LANG_NAMES = { en: "İngilizce", tr: "Türkçe", de: "Almanca", fr: "Fransızca", es: "İspanyolca", it: "İtalyanca", pl: "Lehçe", ar: "Arapça" };
export const APPROVAL_NAMES = { content: "İçerik", visual: "Görsel", production: "Yayın" };
export const AVATAR_COLORS = ["#5b2333", "#1d4e89", "#2c6e8f", "#6b7a2e", "#8a4b16", "#6a3d8f", "#2f6b52", "#8f2d56"];
export const POLL_MS = 1500;
export const STATUS_POLL_MS = 5000;

export const state = { clients: [], detail: null, running: null, logSince: 0, pollTimer: null, drafts: {}, composer: {}, search: "" };

// ---------------------------------------------------------------- DOM helpers

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false && c !== "") el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const $ = (sel) => document.querySelector(sel);

export function svg(paths, size = 16, strokeWidth = 2) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) el.setAttribute(k, String(v));
  for (const d of paths) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    el.append(p);
  }
  return el;
}
export const ICON = {
  spark: ["M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"],
  send: ["M12 19V5M5 12l7-7 7 7"],
  more: ["M5 12h.01M12 12h.01M19 12h.01"],
  check: ["m5 12 4 4L19 6"],
  plus: ["M12 5v14M5 12h14"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
};

export function toast(message, isError = false) {
  const t = $("#toast");
  t.textContent = message;
  t.className = isError ? "toast error" : "toast";
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), isError ? 7000 : 3500);
}

export async function api(method, url, body, raw = false) {
  const res = await fetch(url, {
    method,
    headers: raw ? { "Content-Type": "application/octet-stream" } : body ? { "Content-Type": "application/json" } : {},
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.hint ? `${data.error} — ${data.hint}` : data.error || `Hata ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function guarded(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(e.message, true);
    return undefined;
  }
}

export function copyButton(text, label = "Kopyala") {
  return h("button", { class: "btn btn-sm", type: "button", onclick: async () => { await navigator.clipboard.writeText(text); toast("Kopyalandı."); } }, label);
}

export function initials(text) {
  const words = text.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  return ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
}
export function avatarColor(slug) {
  let n = 0;
  for (const ch of slug) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
export function avatar(slug, label, large = false, live = false) {
  return h("span", { class: large ? "avatar lg" : "avatar", style: `background:${avatarColor(slug)}`, "aria-hidden": "true" }, initials(label), live && h("span", { class: "live" }));
}
export function time(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export const stageInfo = (id) => STAGES.find((s) => s.id === id) || { id, label: id, long: id };
export const isBusy = () => Boolean(state.running && state.running.status === "running");


// ---------------------------------------------------------------- budget

export const MODE_TR = { economy: "Temel", balanced: "Standart", premium: "Premium" };
export const PACKAGE_TR = MODE_TR;
export const fmtTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n || 0));
export const MODEL_TR = { opus: "en güçlü model", sonnet: "dengeli model", haiku: "hızlı model" };
export const usageLevel = (n) => (n < 150_000 ? "düşük" : n < 1_000_000 ? "orta" : "yüksek");
export const usageLine = (job) => job.tokens ? h("span", { class: "usage", title: `${fmtTokens(job.tokens)} birim (önbellekten okunan 1/10 sayılır)${job.usage?.costUsd ? ` · tahmini ~$${job.usage.costUsd.toFixed(2)}` : ""}` }, `Kaynak: ${usageLevel(job.tokens)}${job.model ? ` · ${MODEL_TR[job.model] || job.model}` : ""}`) : null;

/**
 * For data a screen can do without (a dropdown of library designs, saved settings shown as defaults): the screen
 * stays usable, and the reason is left in the browser console instead of being dropped silently.
 */
export function ignoreOptional(error) {
  console.debug("[panel] optional data not loaded:", error);
}

/**
 * The panel's own confirmation dialog (instead of the browser's confirm/prompt, which ignore the theme).
 * Resolves true when confirmed. With `typeToConfirm`, the button stays disabled until that text is typed.
 */
export function ask({ title, body = "", confirm = "Devam", cancel = "Vazgeç", danger = false, typeToConfirm = null, image = null }) {
  return new Promise((resolve) => {
    const dialog = h("dialog", { class: "ask-dialog", "aria-labelledby": "ask-title" });
    const typed = typeToConfirm ? h("input", { type: "text", id: "ask-typed", autocomplete: "off", spellcheck: "false", placeholder: typeToConfirm }) : null;
    const ok = h("button", { class: `btn ${danger ? "btn-danger-solid" : "btn-primary"}`, type: "submit", disabled: Boolean(typeToConfirm) }, confirm);
    if (typed) typed.addEventListener("input", () => { ok.disabled = typed.value.trim() !== typeToConfirm; });
    let answered = false;
    const done = (value) => { if (answered) return; answered = true; dialog.close(); dialog.remove(); resolve(value); };
    dialog.addEventListener("cancel", (e) => { e.preventDefault(); done(false); });
    dialog.append(h("form", { method: "dialog", onsubmit: (e) => { e.preventDefault(); if (!ok.disabled) done(true); } },
      h("h2", { id: "ask-title", text: title }),
      image && h("img", { class: "ask-image", src: image, alt: "" }),
      ...String(body).split("\n\n").filter(Boolean).map((t) => h("p", { class: "muted", text: t })),
      typed && h("label", { for: "ask-typed" }, "Onaylamak için yazın: ", h("code", { text: typeToConfirm }), typed),
      h("div", { class: "row ask-actions" },
        h("button", { class: "btn", type: "button", onclick: () => done(false) }, cancel),
        ok),
    ));
    document.body.append(dialog);
    dialog.showModal();
    (typed || ok).focus();
  });
}
