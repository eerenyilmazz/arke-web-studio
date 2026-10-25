// Shared constants and helpers: stages, packages, DOM helpers, the API call, dialogs and printing.
import { locale } from "./i18n.js";

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

export const TABS = [
  ["duzenle", "Düzenleme"],
  ["marka", "Marka Kimliği"],
  ["teklif", "Teklif"],
  ["bilgiler", "Müşteri Bilgileri"],
];

/** Old tab links (bookmarks, earlier versions) land on the tab that now holds that content. */
export const OLD_TABS = {
  sohbet: "duzenle",
  akis: "duzenle",
  site: "duzenle",
  build: "duzenle",
  yayin: "bilgiler",
  sorular: "bilgiler",
  cevaplar: "bilgiler",
  metinler: "bilgiler",
};

/** Four steps the operator thinks in; the nine internal stages map onto them. */
export const STEPS = [
  { label: "Müşteri Bilgileri", stages: ["collecting-answers"] },
  { label: "Site Oluşturuluyor", stages: ["design", "content", "build"] },
  { label: "Onay Bekleniyor", stages: ["awaiting-content-approval", "awaiting-visual-approval", "awaiting-production-approval", "ready-to-deploy"] },
  { label: "Yayında", stages: ["live"] },
];

/** Plain status per stage for lists and cards. tone: who acts next (you / client / agent / done). */
export const PLAIN = {
  // Required facts are still missing from the config (the agent may already be planning or building meanwhile).
  "collecting-answers": { text: "Bilgiler eksik", tone: "you" },
  design: { text: "Oluşturuluyor", tone: "you" },
  content: { text: "Oluşturuluyor", tone: "you" },
  build: { text: "Oluşturulmayı bekliyor", tone: "you" },
  // Each approval named: the texts come before the first build, so a bare "Onay bekleniyor" read as "site ready".
  "awaiting-content-approval": { text: "İçerik onayı bekleniyor", tone: "you" },
  "awaiting-visual-approval": { text: "Görsel onay bekleniyor", tone: "you" },
  "awaiting-production-approval": { text: "Yayın onayı bekleniyor", tone: "you" },
  "ready-to-deploy": { text: "Yayına hazır", tone: "you" },
  live: { text: "Yayında", tone: "done" },
  unreadable: { text: "Dosya okunamadı", tone: "bad" },
};

export function plainOf(stage) {
  return PLAIN[stage] || { text: stage, tone: "you" };
}

export function stepIndex(stage) {
  const i = STEPS.findIndex((s) => s.stages.includes(stage));
  return i < 0 ? 0 : i;
}

export const LANG_NAMES = { en: "İngilizce", tr: "Türkçe", de: "Almanca", fr: "Fransızca", es: "İspanyolca", it: "İtalyanca", pl: "Lehçe", ar: "Arapça" };

export const APPROVAL_NAMES = { content: "İçerik", visual: "Görsel", production: "Yayın" };

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
  for (const c of children.flat())
    if (c !== null && c !== undefined && c !== false && c !== "") el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export const $ = (sel) => document.querySelector(sel);

export function svg(paths, size = 16, strokeWidth = 2) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": strokeWidth,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    el.setAttribute(k, String(v));
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
  // Quick edit, settings and the new-client form (lucide-style outlines, 24px grid).
  palette: ["M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22z", "M7.5 10.5h.01M10.5 7h.01M15 7.5h.01M17 11h.01"],
  pages: ["M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"],
  list: ["M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"],
  type: ["M5 6V4h14v2M12 4v16M9 20h6"],
  phone: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"],
  inbox: ["M3 13h5l1.5 3h5L16 13h5", "M5 5h14l2 8v6H3v-6z"],
  image: ["M4 5h16v14H4z", "m4 16 5-5 4 4 2-2 5 5", "M15.5 9.5h.01"],
  chevronRight: ["m9 6 6 6-6 6"],
  chevronLeft: ["m15 6-6 6 6 6"],
  up: ["m6 15 6-6 6 6"],
  down: ["m6 9 6 6 6-6"],
  grip: ["M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"],
  trash: ["M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"],
  undo: ["M9 14 4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-3"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  sliders: ["M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0", "M16 4v4M10 10v4M18 16v4"],
  users: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M2 21a7 7 0 0 1 14 0", "M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3"],
  gauge: ["M12 14l4-4", "M3.5 18a10 10 0 1 1 17 0z"],
  cloud: ["M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"],
  archive: ["M3 4h18v4H3z", "M5 8v12h14V8M10 12h4"],
  refresh: ["M20 11a8 8 0 0 0-14.6-4.5L4 8", "M4 4v4h4", "M4 13a8 8 0 0 0 14.6 4.5L20 16", "M20 20v-4h-4"],
  upload: ["M12 16V4M7 9l5-5 5 5", "M4 16v4h16v-4"],
  briefcase: ["M4 7h16v13H4z", "M9 7V4h6v3M4 12h16"],
  globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"],
  doc: ["M6 3h9l4 4v14H6z", "M14 3v5h5M9 13h7M9 17h5"],
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
  return h(
    "button",
    {
      class: "btn btn-sm",
      type: "button",
      onclick: async () => {
        await navigator.clipboard.writeText(text);
        toast("Kopyalandı.");
      },
    },
    label,
  );
}

export function initials(text) {
  const words = text
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  return ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
}

export function avatar(_slug, label, large = false, live = false) {
  return h("span", { class: large ? "avatar lg" : "avatar", "aria-hidden": "true" }, initials(label), live && h("span", { class: "live" }));
}

export function time(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const stageInfo = (id) => STAGES.find((s) => s.id === id) || { id, label: id, long: id };

export const isBusy = () => Boolean(state.running && state.running.status === "running");

// ---------------------------------------------------------------- budget

/** The three packages (budget modes economy / balanced / premium in the code) as the operator and their clients see them. */
export const PACKAGE_NAMES = { economy: "Temel", balanced: "Standart", premium: "Premium" };

export const fmtTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n || 0));

export const MODEL_TR = { opus: "en güçlü model", sonnet: "dengeli model", haiku: "hızlı model" };

export const usageLevel = (n) => (n < 150_000 ? "düşük" : n < 1_000_000 ? "orta" : "yüksek");

export const usageLine = (job) =>
  job.tokens
    ? h(
        "span",
        {
          class: "usage",
          title: `${fmtTokens(job.tokens)} birim (önbellekten okunan 1/10 sayılır)${job.usage?.costUsd ? ` · tahmini ~$${job.usage.costUsd.toFixed(2)}` : ""}`,
        },
        `Kaynak: ${usageLevel(job.tokens)}${job.model ? ` · ${MODEL_TR[job.model] || job.model}` : ""}`,
      )
    : null;

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
    if (typed)
      typed.addEventListener("input", () => {
        ok.disabled = typed.value.trim() !== typeToConfirm;
      });
    let answered = false;
    const done = (value) => {
      if (answered) return;
      answered = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      done(false);
    });
    dialog.append(
      h(
        "form",
        {
          method: "dialog",
          onsubmit: (e) => {
            e.preventDefault();
            if (!ok.disabled) done(true);
          },
        },
        h("h2", { id: "ask-title", text: title }),
        image && h("img", { class: "ask-image", src: image, alt: "" }),
        ...String(body)
          .split("\n\n")
          .filter(Boolean)
          .map((t) => h("p", { class: "muted", text: t })),
        typed && h("label", { for: "ask-typed" }, "Onaylamak için yazın: ", h("code", { text: typeToConfirm }), typed),
        h("div", { class: "row ask-actions" }, h("button", { class: "btn", type: "button", onclick: () => done(false) }, cancel), ok),
      ),
    );
    document.body.append(dialog);
    dialog.showModal();
    (typed || ok).focus();
  });
}

/**
 * Prints one document (proposal, work report, brand board) as a clean A4 PDF: a copy of it is placed alone at the
 * top of the page and everything else is taken out of the layout (not just hidden), so nothing pushes it down or
 * splits it. Text edited on screen (contenteditable) is kept, because the copy is made at the moment of printing.
 */
export function printDoc(el, { landscape = false, title = "" } = {}) {
  const root = document.createElement("div");
  root.id = "print-root";
  if (landscape) root.classList.add("landscape");
  const copy = el.cloneNode(true);
  // Live demos (iframes) would print blank: the copy keeps the description instead.
  for (const f of copy.querySelectorAll("iframe")) f.remove();
  for (const n of copy.querySelectorAll("[contenteditable]")) n.removeAttribute("contenteditable");
  root.append(copy);
  document.body.append(root);
  document.documentElement.classList.add("printing");
  const before = document.title;
  if (title) document.title = title; // the browser suggests it as the PDF file name
  const done = () => {
    root.remove();
    document.documentElement.classList.remove("printing");
    document.title = before;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  // Logos are images: print once they are loaded, so they are not missing from the PDF.
  const images = [...root.querySelectorAll("img")].filter((i) => !i.complete);
  Promise.all(
    images.map(
      (i) =>
        new Promise((r) => {
          i.onload = r;
          i.onerror = r;
        }),
    ),
  ).then(() => window.print());
}

/**
 * Colour names are upper-cased by CSS, which follows the page's language: in a Turkish panel "drawing-paper"
 * would become "DRAWİNG-PAPER". A name without Turkish letters is marked English so it upper-cases as written.
 */
export const nameLang = (name) => (/[çğıöşüÇĞİÖŞÜ]/.test(String(name || "")) ? {} : { lang: "en" });
