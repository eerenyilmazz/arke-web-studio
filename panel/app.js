// Site Factory panel. Plain browser JS, no build step.
// All text from the server (client data included) is inserted with textContent, never innerHTML.

const STAGES = [
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
const TABS = [["sohbet", "Sohbet"], ["duzenle", "Düzenle"], ["site", "Site ve yayın"], ["marka", "Marka"], ["bilgiler", "Bilgiler"]];
/** Old tab links (bookmarks, earlier versions) land on the tab that now holds that content. */
const OLD_TABS = { akis: "sohbet", build: "site", yayin: "site", sorular: "bilgiler", cevaplar: "bilgiler", metinler: "bilgiler" };
/** Four steps the operator thinks in; the nine internal stages map onto them. */
const STEPS = [
  { label: "Bilgiler", stages: ["collecting-answers"] },
  { label: "Site hazırlanıyor", stages: ["design", "content", "build"] },
  { label: "Senin onayın", stages: ["awaiting-content-approval", "awaiting-visual-approval", "awaiting-production-approval", "ready-to-deploy"] },
  { label: "Yayında", stages: ["live"] },
];
/** Plain status per stage for lists and cards. tone: who acts next (you / client / agent / done). */
const PLAIN = {
  "collecting-answers": { text: "Bilgi bekleniyor", tone: "client" },
  design: { text: "Hazırlanıyor", tone: "you" },
  content: { text: "Hazırlanıyor", tone: "you" },
  build: { text: "Oluşturulmayı bekliyor", tone: "you" },
  "awaiting-content-approval": { text: "Siteye bakıp onayla", tone: "you" },
  "awaiting-visual-approval": { text: "Siteye bakıp onayla", tone: "you" },
  "awaiting-production-approval": { text: "Önizleme / müşteri onayı", tone: "you" },
  "ready-to-deploy": { text: "Canlıya almaya hazır", tone: "you" },
  live: { text: "Yayında", tone: "done" },
  unreadable: { text: "Dosyası okunamadı", tone: "bad" },
};
function plainOf(stage) { return PLAIN[stage] || { text: stage, tone: "you" }; }
function stepIndex(stage) { const i = STEPS.findIndex((s) => s.stages.includes(stage)); return i < 0 ? 0 : i; }
const LANG_NAMES = { en: "İngilizce", tr: "Türkçe", de: "Almanca", fr: "Fransızca", es: "İspanyolca", it: "İtalyanca", pl: "Lehçe", ar: "Arapça" };
const APPROVAL_NAMES = { content: "İçerik", visual: "Görsel", production: "Yayın" };
const AVATAR_COLORS = ["#5b2333", "#1d4e89", "#2c6e8f", "#6b7a2e", "#8a4b16", "#6a3d8f", "#2f6b52", "#8f2d56"];
const POLL_MS = 1500;
const STATUS_POLL_MS = 5000;

const state = { clients: [], detail: null, running: null, logSince: 0, pollTimer: null, drafts: {}, composer: {}, search: "" };

// ---------------------------------------------------------------- DOM helpers

function h(tag, attrs = {}, ...children) {
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
const $ = (sel) => document.querySelector(sel);

function svg(paths, size = 16, strokeWidth = 2) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) el.setAttribute(k, String(v));
  for (const d of paths) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    el.append(p);
  }
  return el;
}
const ICON = {
  spark: ["M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"],
  send: ["M12 19V5M5 12l7-7 7 7"],
  more: ["M5 12h.01M12 12h.01M19 12h.01"],
  check: ["m5 12 4 4L19 6"],
  plus: ["M12 5v14M5 12h14"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
};

function toast(message, isError = false) {
  const t = $("#toast");
  t.textContent = message;
  t.className = isError ? "toast error" : "toast";
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), isError ? 7000 : 3500);
}

async function api(method, url, body, raw = false) {
  const res = await fetch(url, {
    method,
    headers: raw ? { "Content-Type": "application/octet-stream" } : body ? { "Content-Type": "application/json" } : {},
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.hint ? `${data.error} — ${data.hint}` : data.error || `Hata ${res.status}`);
  return data;
}

async function guarded(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(e.message, true);
    return undefined;
  }
}

function copyButton(text, label = "Kopyala") {
  return h("button", { class: "btn btn-sm", type: "button", onclick: async () => { await navigator.clipboard.writeText(text); toast("Kopyalandı."); } }, label);
}

function initials(text) {
  const words = text.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  return ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
}
function avatarColor(slug) {
  let n = 0;
  for (const ch of slug) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function avatar(slug, label, large = false, live = false) {
  return h("span", { class: large ? "avatar lg" : "avatar", style: `background:${avatarColor(slug)}`, "aria-hidden": "true" }, initials(label), live && h("span", { class: "live" }));
}
function time(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
const stageInfo = (id) => STAGES.find((s) => s.id === id) || { id, label: id, long: id };
const isBusy = () => Boolean(state.running && state.running.status === "running");

// ---------------------------------------------------------------- theme and status

$("#theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("sf-theme", next); } catch { /* private window: theme just isn't remembered */ }
});

function setStatus(job) {
  const pill = $("#agent-status");
  pill.className = job ? "status-pill busy" : "status-pill idle";
  // The mark's signature motion ("Katlar oturur") loops while the agent works.
  document.body.classList.toggle("agent-busy", Boolean(job));
  pill.querySelector(".label").textContent = job ? `${job.title} · ${job.slug}` : "Agent boşta";
}

async function refreshStatus() {
  const m = await api("GET", "/api/meta").catch(() => null);
  if (!m) return;
  state.typical = m.typicalSeconds || {};
  const before = state.running?.id;
  // Finished while the panel was on another page (no job polling): still announce it.
  if (before && !m.running && !state.pollTimer) {
    const done = await api("GET", `/api/jobs/${before}`).catch(() => null);
    if (done && done.status !== "running") announceFinished(done);
  }
  if (m.running) state.running = { ...m.running, log: [] };
  else if (!state.pollTimer) state.running = null;
  setStatus(m.running);
  renderSidebar();
  if (m.running && m.running.id !== before && route().slug === m.running.slug) render();
}
setInterval(refreshStatus, STATUS_POLL_MS);

$("#search").addEventListener("input", (e) => { state.search = e.target.value.toLowerCase(); renderSidebar(); });

// ---------------------------------------------------------------- routing

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "new") return { view: "new" };
  if (parts[0] === "ayarlar") return { view: "settings" };
  if (parts[0] === "kutuphane") return { view: "library" };
  if (parts[0] === "c" && parts[1]) return { view: "client", slug: parts[1], tab: OLD_TABS[parts[2]] || parts[2] || "sohbet" };
  return { view: "home" };
}

async function render() {
  await loadClients();
  const r = route();
  const view = $("#view");
  if (r.view === "new") view.replaceChildren(renderNew());
  else if (r.view === "settings") view.replaceChildren(await renderSettings());
  else if (r.view === "library") view.replaceChildren(await renderLibrary());
  else if (r.view === "client") await renderClient(view, r.slug, r.tab);
  else view.replaceChildren(renderHome());
}
window.addEventListener("hashchange", render);

// ---------------------------------------------------------------- sidebar

async function loadClients() {
  const data = await guarded(() => api("GET", "/api/clients"));
  if (data) state.clients = data.clients;
  renderSidebar();
}

function groupOf(stage) {
  if (stage === "collecting-answers") return "Müşteride";
  if (stage === "live") return "Yayında";
  if (stage === "unreadable") return "Okunamadı";
  return "Senin sıran";
}

function renderSidebar() {
  const r = route();
  const nav = $("#clients");
  const list = state.clients.filter((c) => !state.search || c.slug.includes(state.search) || (c.name || "").toLowerCase().includes(state.search));
  if (!list.length) {
    nav.replaceChildren(h("p", { class: "empty-nav", text: state.clients.length ? "Eşleşen müşteri yok." : "Henüz müşteri yok." }));
    return;
  }
  nav.replaceChildren(
    ...["Senin sıran", "Müşteride", "Yayında", "Okunamadı"].flatMap((g) => {
      const items = list.filter((c) => groupOf(c.stage) === g);
      if (!items.length) return [];
      return [
        h("p", { class: "group-title", text: g }),
        ...items.map((c) =>
          h("a", { class: "client-link", href: `#/c/${c.slug}`, "aria-current": r.slug === c.slug ? "page" : null },
            avatar(c.slug, c.name || c.slug, false, isBusy() && state.running.slug === c.slug),
            h("span", { class: "meta" }, h("span", { class: "name", text: c.name || c.slug }), h("span", { class: "sub", text: isBusy() && state.running.slug === c.slug ? "Agent çalışıyor…" : plainOf(c.stage).text })),
          )),
      ];
    }),
  );
}

// ---------------------------------------------------------------- home and new client

/** Home: who needs what, at a glance. One card per client with its next step. */
function renderHome() {
  if (!state.clients.length) {
    return h("section", { class: "empty" },
      h("h1", { text: "İlk müşteriyi ekleyin" }),
      h("p", { class: "muted", text: "Adını ve sektörünü yaz, bildiklerini yapıştır; agent markayı tasarlar ve siteyi hazırlar." }),
      h("p", { style: "margin-top:1.2rem" }, h("a", { class: "btn btn-primary btn-lg", href: "#/new" }, "Yeni müşteri")),
    );
  }
  const running = isBusy() ? state.running.slug : null;
  const bucket = (c) => (c.slug === running ? "agent" : plainOf(c.stage).tone);
  const COUNTS = [["you", "Senin sıran", "Bir adım seni bekliyor"], ["agent", "Agent çalışıyor", "Şu an hazırlanıyor"], ["client", "Müşteride", "Bilgi bekleniyor"], ["done", "Yayında", "Canlı siteler"]];
  const order = { agent: 0, you: 1, bad: 2, client: 3, done: 4 };
  // Grouping and filters (kept per browser): by step, by sector or by Eren's own tags.
  const pref = (() => { try { return JSON.parse(localStorage.getItem("sf-dash") || "{}"); } catch { return {}; } })();
  const groupBy = pref.groupBy || "step";
  const filter = pref.filter || "";
  const save = (p) => { try { localStorage.setItem("sf-dash", JSON.stringify({ groupBy, filter, ...p })); } catch { /* private mode */ } render(); };
  const sectorOf = (c) => (c.industry || "Diğer").toLowerCase();
  const tagsOf = (c) => (c.business?.tags || []).map((t) => t.toLowerCase());
  const filters = [...new Set([...state.clients.map(sectorOf), ...state.clients.flatMap(tagsOf)])].sort();
  const visible = state.clients.filter((c) => !filter || sectorOf(c) === filter || tagsOf(c).includes(filter));
  const sorted = [...visible].sort((a, b) => order[bucket(a)] - order[bucket(b)]);
  const keyOf = (c) => (groupBy === "sector" ? sectorOf(c) : groupBy === "tag" ? tagsOf(c)[0] || "etiketsiz" : null);
  const groups = groupBy === "step" ? [[null, sorted]] : [...new Set(sorted.map(keyOf))].sort().map((k) => [k, sorted.filter((c) => keyOf(c) === k)]);
  const card = (c) => {
    const b = bucket(c);
    const step = stepIndex(c.stage);
    return h("a", { class: `client-card tone-${b}`, href: `#/c/${c.slug}` },
      h("div", { class: "top" }, avatar(c.slug, c.name || c.slug, false, b === "agent"), h("span", { class: `pill tone-${b}`, text: b === "agent" ? "Agent çalışıyor" : plainOf(c.stage).text })),
      h("strong", { class: "name", text: c.name || c.slug }),
      h("span", { class: "sub", text: [c.industry, ...(c.business?.tags || [])].filter(Boolean).join(" · ") }),
      h("div", { class: "mini-steps", "aria-label": `Adım ${step + 1} / ${STEPS.length}: ${STEPS[step].label}` }, ...STEPS.map((s, i) => h("span", { class: i < step ? "done" : i === step ? "now" : "" }))),
      h("span", { class: "next", text: nextHint(c, b) }),
      businessLine(c.business),
    );
  };
  const toolbar = h("div", { class: "dash-tools" },
    h("div", { class: "seg", role: "group", "aria-label": "Gruplama" }, ...[["step", "Duruma göre"], ["sector", "Sektöre göre"], ["tag", "Etikete göre"]].map(([k, l]) =>
      h("button", { type: "button", "aria-pressed": String(groupBy === k), onclick: () => save({ groupBy: k }) }, l))),
    filters.length > 1 && h("div", { class: "chips", role: "group", "aria-label": "Filtre" },
      h("button", { type: "button", class: "chip", "aria-pressed": String(!filter), onclick: () => save({ filter: "" }) }, "Hepsi"),
      ...filters.map((f) => h("button", { type: "button", class: "chip", "aria-pressed": String(filter === f), onclick: () => save({ filter: f }) }, f))),
  );
  return h("section", { class: "dash" },
    h("div", { class: "dash-head" },
      h("div", {}, h("h1", { text: "Müşteriler" }), h("p", { class: "muted", text: "Sıradaki işi olan müşteriler en üstte." })),
      h("a", { class: "btn btn-primary btn-lg", href: "#/new" }, svg(ICON.plus, 18, 2.4), "Yeni müşteri"),
    ),
    h("div", { class: "counts" }, ...COUNTS.map(([key, label, sub]) => {
      const n = state.clients.filter((c) => bucket(c) === key).length;
      return h("div", { class: `count tone-${key}` }, h("strong", { text: String(n) }), h("span", { class: "label", text: label }), h("span", { class: "sub", text: sub }));
    })),
    toolbar,
    ...groups.map(([k, list]) => h("div", { class: "group" },
      k && h("h2", { class: "group-title", text: `${k} (${list.length})` }),
      h("div", { class: "client-cards" }, ...list.map(card)))),
    visible.length === 0 && h("p", { class: "muted", text: "Bu filtrede müşteri yok." }),
  );
}

/** One-line next step shown on a client card. */
function nextHint(c, tone) {
  if (tone === "agent") return "Bitince bildirim düşer";
  switch (c.stage) {
    case "collecting-answers": return "Bilgileri yapıştır → Siteyi hazırla";
    case "design": case "content": case "build": return "Siteyi hazırla'ya bas";
    case "awaiting-content-approval": case "awaiting-visual-approval": return "Siteye bak, beğenirsen onayla";
    case "awaiting-production-approval": return "Önizlemeyi müşteriye gönder";
    case "ready-to-deploy": return "Canlıya al";
    case "live": return "Değişiklik için yaz";
    default: return "Aç";
  }
}

function slugify(name) {
  return name.toLowerCase().replace(/ı/g, "i").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function renderNew() {
  const name = h("input", { type: "text", id: "nc-name", required: true, maxlength: 80, autocomplete: "off" });
  const slug = h("input", { type: "text", id: "nc-slug", required: true, maxlength: 40, pattern: "[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" });
  let slugTouched = false;
  name.addEventListener("input", () => { if (!slugTouched) slug.value = slugify(name.value); });
  slug.addEventListener("input", () => (slugTouched = true));
  const industry = h("input", { type: "text", id: "nc-industry", required: true, maxlength: 60, placeholder: "ör. hair salon, family law solicitor" });
  const info = h("textarea", { id: "nc-info", rows: 7, class: "field", maxlength: 20000, placeholder: "Ör: Erkek kuaförü, Mono. Saç kesimi 500 TL, sakal 300 TL. Ankara Sincan, 0534 985 63 19. Siyah-beyaz renkler." });
  const MAIN = { GB: "en", TR: "tr" };
  const country = h("select", { id: "nc-country" }, h("option", { value: "TR" }, "Türkiye (Türkçe, ₺)"), h("option", { value: "GB" }, "İngiltere (İngilizce, £)"));
  const lang = h("select", { id: "nc-lang" });
  const fillLangs = () => {
    const main = MAIN[country.value];
    lang.replaceChildren(h("option", { value: "" }, `Sadece ${LANG_NAMES[main]}`), ...Object.entries(LANG_NAMES).filter(([k]) => k !== main).map(([k, v]) => h("option", { value: k }, `${LANG_NAMES[main]} + ${v}`)));
  };
  country.addEventListener("change", fillLangs);
  fillLangs();

  const form = h("form", { class: "card stack", style: "max-width:40rem", onsubmit: async (e) => {
    e.preventDefault();
    const hosting = form.querySelector("input[name=hosting]:checked")?.value;
    const res = await guarded(() => api("POST", "/api/clients", { businessName: name.value.trim(), slug: slug.value.trim(), industry: industry.value.trim(), hostingModel: hosting, country: country.value, extraLocale: lang.value || undefined }));
    if (!res) return;
    toast("Müşteri oluşturuldu.");
    const text = info.value.trim();
    location.hash = `#/c/${res.slug}/sohbet`;
    if (!text) return;
    await runAgent(res.slug, "autopilot", { freeText: text });
  } },
    h("h1", { text: "Yeni müşteri" }),
    h("p", { class: "muted", text: "Adını ve sektörünü yaz. Bildiklerini alttaki kutuya yapıştırırsan site hemen hazırlanmaya başlar." }),
    h("label", { for: "nc-name" }, "İşletme adı", name),
    h("label", { for: "nc-slug" }, "Kısa ad (slug)", h("span", { class: "help", text: "Klasör ve web adresi için kullanılır, sonradan değişmez. Otomatik doldurulur." }), slug),
    h("label", { for: "nc-industry" }, "Sektör", h("span", { class: "help", text: "İngilizce kısa ad en iyi sonucu verir: barber shop, pickle shop, dentist. Tasarım ve sektör soruları buna göre seçilir." }), industry),
    h("fieldset", {}, h("legend", { text: "Barındırma" }),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "hosting", value: "managed", checked: true }), "Bizim Cloudflare hesabımız"),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "hosting", value: "client" }), "Müşterinin kendi hesabı"),
    ),
    h("div", { class: "two" }, h("label", { for: "nc-country" }, "Ülke", country), h("label", { for: "nc-lang" }, "Site dili", lang)),
    h("label", { for: "nc-info" }, "Elindeki bilgiler (isteğe bağlı)",
      h("span", { class: "help", text: "Müşteriden ne biliyorsan yapıştır. Doldurursan site hemen hazırlanmaya başlar; eksik bilgi olursa agent sorar." }),
      info),
    infoGuide(info),
    h("div", { class: "row" }, h("button", { class: "btn btn-primary btn-lg", type: "submit" }, "Müşteriyi oluştur")),
  );
  return form;
}

// ---------------------------------------------------------------- what to paste

/** What the agent can use from a pasted text. "need" = the site cannot be finished without it. */
const INFO_GROUPS = [
  { title: "İşletme", need: true, items: ["İşletmenin tam adı (sitede nasıl görünecekse)", "Ne iş yapıyor, hangi şehir/bölgede", "Hedef müşteri: kimler, nereden (ör. Manchester'da aileler)"] },
  { title: "Hizmetler", need: true, items: ["3–8 ana hizmet, her biri bir satır", "Fiyat varsa: \"kadın kesim £35\", \"£120'den başlayan\"", "Öne çıkan bilgiler: \"15 yıllık\", \"aynı gün servis\" (sadece gerçekse)"] },
  { title: "İletişim", need: true, items: ["E-posta ve telefon", "Adres ve çalışma saatleri", "WhatsApp numarası (buton istenirse)", "Online randevu linki, Google Maps linki, sosyal medya"] },
  { title: "Hikâye ve his", need: true, items: ["Nasıl başladılar, farkları ne (2–3 cümle)", "Sitenin havası: resmi, samimi, premium, enerjik…", "Çalışma şekli: ilk görüşme → teklif → iş → teslim"] },
  { title: "Görünüm", need: false, items: ["Logo ve fotoğraflar: 'Logo / fotoğraf ekle' ile yükle", "Marka renkleri (ör. lacivert + altın) ya da sevdikleri/sevmedikleri siteler"] },
  { title: "Ek bilgiler", need: false, items: ["Müşteri yorumları (ad + yorum, izinli)", "Sık sorulan sorular", "Şirket bilgileri: unvan, şirket no, kayıtlı adres", "Alan adı varsa adı ve kimin yönettiği"] },
];

const INFO_TEMPLATE = [
  "İşletme adı: ",
  "Ne iş yapıyor / şehir: ",
  "Hedef müşteri: ",
  "Hizmetler ve fiyatlar (her satıra bir tane):",
  "- ",
  "- ",
  "- ",
  "Öne çıkan bilgiler (yıl, bölge, hız…): ",
  "E-posta: ",
  "Telefon: ",
  "Adres ve saatler: ",
  "WhatsApp: ",
  "Randevu / Maps / sosyal medya linkleri: ",
  "Hikâye (nasıl başladı, farkı ne): ",
  "Çalışma şekli (adımlar): ",
  "Sitenin havası (resmi / samimi / premium / enerjik): ",
  "Renkler / beğendiği siteler: ",
  "Müşteri yorumları: ",
  "Sık sorulan sorular: ",
  "Şirket bilgileri (unvan, no, adres): ",
  "Alan adı: ",
].join("\n");

/** Collapsible checklist under a paste box, with a button that drops a fill-in template into it. */
function infoGuide(textarea, onChange) {
  const fill = () => {
    textarea.value = textarea.value.trim() ? `${textarea.value.trimEnd()}\n\n${INFO_TEMPLATE}` : INFO_TEMPLATE;
    onChange?.(textarea.value);
    textarea.focus();
  };
  return h("details", { class: "info-guide" },
    h("summary", { text: "Neler yazabilirim? (liste ve doldurulacak şablon)" }),
    h("p", { class: "small muted", text: "Sıra, dil ve biçim önemli değil; Türkçe yazabilirsin; agent site metinlerini sitenin dilinde yazar. ★ olanlar olmadan site bitmez: eksikse agent sana kısa sorularla sorar. Uydurma bilgi eklenmez." }),
    h("div", { class: "info-groups" },
      ...INFO_GROUPS.map((g) => h("div", {},
        h("p", { class: "info-title", text: `${g.need ? "★ " : ""}${g.title}` }),
        h("ul", {}, ...g.items.map((i) => h("li", { text: i }))),
      )),
    ),
    h("button", { class: "btn", type: "button", onclick: fill }, "Boş şablonu kutuya ekle"),
  );
}

// ---------------------------------------------------------------- client page

async function renderClient(view, slug, tab) {
  const d = await guarded(() => api("GET", `/api/clients/${slug}`));
  if (!d) { view.replaceChildren(renderHome()); return; }
  state.detail = d;
  if (d.running) { state.running = d.running; setStatus(d.running); }
  const stage = d.status.stage;
  const step = stepIndex(stage);
  const name = d.business.name || slug;
  if (!TABS.some(([id]) => id === tab) && tab !== "teklif") tab = "sohbet";

  const menu = h("details", { class: "menu" },
    h("summary", { class: "icon-btn", "aria-label": "Diğer işlemler" }, svg(ICON.more, 20, 3)),
    h("div", { class: "menu-items" },
      h("button", { type: "button", disabled: isBusy(), onclick: () => runTask(slug, "build", {}) }, "Siteyi yeniden oluştur"),
      h("button", { type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "fix-build", {}) }, "Hataları agent düzeltsin"),
      h("button", { type: "button", class: "danger", onclick: () => archiveClient(slug, stage) }, "Müşteriyi arşivle"),
    ),
  );

  const body = h("div");
  view.replaceChildren(
    h("div", { class: "client-head" },
      h("div", { class: "client-id" },
        avatar(slug, name, true),
        h("div", {},
          h("h1", { text: name }),
          h("div", { class: "facts" },
            h("span", { text: d.business.industry || "" }),
            h("span", { text: d.locales.map((l) => LANG_NAMES[l] || l).join(", ") }),
            h("span", { text: d.hosting === "client" ? "Müşteri hesabı" : "Bizim hesap" }),
            d.domain && h("span", { text: d.domain }),
          ),
        ),
      ),
      h("div", { class: "row" },
        h("button", { class: d.distReady ? "btn btn-primary" : "btn", type: "button", disabled: !d.distReady, title: d.distReady ? "" : "Site henüz oluşturulmadı", onclick: () => openPreview(slug) }, svg(ICON.eye, 18, 2), "Siteye bak"),
        // Windows "Animation effects" off = reduced motion: the sites calm their animations, which looks like a bug.
        matchMedia("(prefers-reduced-motion: reduce)").matches ? h("span", { class: "badge warn", title: "Windows Ayarlar → Erişilebilirlik → Görsel efektler → Animasyon efektleri: Açık", text: "Animasyonlar bilgisayarında kapalı" }) : null,
        menu,
      ),
    ),
    h("ol", { class: "steps4", "aria-label": `Adım ${step + 1} / ${STEPS.length}: ${STEPS[step].label}` },
      ...STEPS.map((s, i) => h("li", { class: i < step ? "done" : i === step ? "now" : "", "aria-current": i === step ? "step" : null },
        h("span", { class: "dot", text: i < step ? "✓" : String(i + 1) }), h("span", { class: "label", text: s.label })))),
    ...[nowCard(d), upgradeBanner(d)].filter(Boolean),
    h("nav", { class: "tabs", "aria-label": "Bölümler" }, ...TABS.map(([id, label]) => h("a", { href: `#/c/${slug}/${id}`, "aria-current": id === tab ? "page" : null, text: label }))),
    body,
  );

  if (tab === "site") tabSite(body, d);
  else if (tab === "marka") await tabBrand(body, d);
  else if (tab === "duzenle") await tabEdit(body, d);
  else if (tab === "teklif") await tabProposal(body, d);
  else if (tab === "bilgiler") await tabInfo(body, d);
  else tabFlow(body, d);

  if (isBusy() && state.running.slug === slug) startPolling();
}

/** The single most useful next step for the current stage, with its button. */
function nowCard(d) {
  const slug = d.status.slug;
  const stage = d.status.stage;
  const busy = isBusy();
  const go = (tab) => () => (location.hash = `#/c/${slug}/${tab}`);
  const cmd = (kind) => d.approvals.find((a) => a.kind === kind)?.command || "";
  const preview = d.lastDeploy && d.lastDeploy.target === "preview" && d.lastDeploy.hash === d.status.contentHash ? d.lastDeploy : null;
  const primary = (label, onclick, disabled = false) => h("button", { class: "btn btn-primary btn-lg", type: "button", disabled, onclick }, label);
  const secondary = (label, onclick, disabled = false) => h("button", { class: "btn btn-lg", type: "button", disabled, onclick }, label);

  // Until the operator has approved the built site, everything is one step: "Prepare site".
  const PREPARE_STAGES = ["collecting-answers", "design", "content", "awaiting-content-approval", "build", "awaiting-visual-approval"];
  if (PREPARE_STAGES.includes(stage)) {
    const approved = (k) => d.approvals.find((a) => a.kind === k)?.valid;
    return d.distReady && !(approved("content") && approved("visual")) ? readyCard(d) : prepareCard(d);
  }

  let title;
  let text;
  let actions = [];
  switch (stage) {
    case "awaiting-production-approval":
      if (!preview) {
        title = "Önizlemeyi yayınla ve linki müşteriye gönder";
        text = "Site Cloudflare'de geçici bir adreste açılır. Müşteri onaylayınca yayın onayını verirsin.";
        actions = [primary("Önizleme yayınla", () => runTask(slug, "deploy", { target: "preview", dryRun: false }), busy), secondary("Önce dene", () => runTask(slug, "deploy", { target: "preview", dryRun: true }), busy)];
      } else {
        title = "Müşterinin onayını bekle";
        text = "Önizleme yayında. Linki müşteriye gönder; o onaylayınca yayın onayını ver.";
        actions = [preview.url && h("a", { class: "btn btn-lg", href: preview.url, target: "_blank", rel: "noopener" }, "Önizleme linki"), preview.url && copyButton(preview.url, "Linki kopyala"), h("button", { class: "btn btn-ok btn-lg", type: "button", disabled: busy, onclick: () => approveDialog(d, "production") }, "Müşteri onayladı: yayın onayı ver")];
      }
      break;
    case "ready-to-deploy":
      title = "Siteyi canlıya al";
      text = d.domain ? `Site ${d.domain} adresinde yayınlanacak.` : "Alan adı yok; site workers.dev adresinde yayınlanır.";
      actions = [primary("Canlıya al", () => deployProduction(slug, false), busy), secondary("Önce dene", () => deployProduction(slug, true), busy)];
      break;
    default:
      title = "Site yayında";
      text = "Değişiklik için Akış'tan agent'a yaz. Her değişiklik onayları sıfırlar; build ve onaylardan sonra yeniden yayınlanır.";
      actions = [primary("Değişiklik iste", () => { location.hash = `#/c/${slug}/akis`; setTimeout(() => $("#composer")?.focus(), 80); })];
  }
  const working = busy && state.running.slug === slug;
  return h("section", { class: "now-card", "aria-label": "Şimdi yapılacak" },
    h("div", { class: "text" }, h("p", { class: "eyebrow", text: working ? "Agent çalışıyor, bitince devam" : "Şimdi yapılacak" }), h("h2", { text: title }), h("p", { text })),
    h("div", { class: "row" }, ...actions),
  );
}

/** Older sites can move to the newest template (animated, sector motif). Shown only when they are behind. */
function upgradeBanner(d) {
  if (!d.template || !d.latestTemplate || d.template === d.latestTemplate) return null;
  const slug = d.status.slug;
  return h("section", { class: "upgrade-banner", "aria-label": "Yeni şablon" },
    h("p", {}, h("strong", { text: "Serbest tasarım hazır. " }), h("span", { text: `Bu site hazır şablonla yapılmış (${d.template}). Serbest tasarımda agent markaya özel kimlik, logo ve animasyonlarla siteyi baştan yazar; bilgiler aynı kalır, onaylar sıfırlanır.` })),
    h("button", { class: "btn", type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "upgrade-template", {}) }, "Serbest tasarıma geç"),
  );
}

/** Paste what you know, press one button; the agent does answers, design, text and build. */
function prepareCard(d) {
  const slug = d.status.slug;
  const busy = isBusy();
  const working = busy && state.running.slug === slug;
  const draft = (state.drafts[slug] ||= { answers: {}, extras: {}, later: new Set(), freeText: "" });
  const ranBefore = d.history.some((j) => j.kind === "autopilot");
  const box = h("textarea", { id: "prep-text", class: "field big-paste", rows: 8, maxlength: 20000, disabled: working,
    placeholder: ranBefore
      ? "Agent'ın sorduğu eksikleri ya da yeni bilgileri yaz. Sonra tekrar 'Siteyi hazırla'ya bas."
      : "Müşteri hakkında ne biliyorsan yapıştır: ne iş yaptığı, hizmetler, fiyatlar, iletişim, renk isteği… Sıra, dil ve biçim önemli değil." });
  box.value = draft.freeText || "";
  box.addEventListener("input", () => (draft.freeText = box.value));

  const fileCount = h("span", { class: "small muted", text: d.inbox.length ? `${d.inbox.length} dosya eklendi` : "" });
  const fileInput = h("input", { type: "file", multiple: true, accept: "image/png,image/jpeg,image/webp,image/avif,image/svg+xml", id: "prep-files", class: "sr-only" });
  fileInput.addEventListener("change", async () => {
    let total = d.inbox.length;
    for (const file of fileInput.files) {
      const res = await guarded(() => api("PUT", `/api/clients/${slug}/inbox/${encodeURIComponent(file.name)}`, file, true));
      if (res) total = res.inbox.length;
    }
    fileCount.textContent = `${total} dosya eklendi`;
  });

  // Eren's rule: research and questions before design. Unticked = the agent decides open design choices itself.
  const askFirst = h("input", { type: "checkbox", id: "prep-ask", checked: draft.askFirst !== false, disabled: working, onchange: (e) => (draft.askFirst = e.target.checked) });
  // Optional starting point from the design library (custom sites); used once, on this run.
  const startFrom = h("select", { id: "prep-lib", disabled: working }, h("option", { value: "" }, "Başlangıç tasarımı: sıfırdan"));
  if (d.template === "custom") api("GET", "/api/library").then(({ designs }) => { for (const x of rankedDesigns(designs, slug, d.business.industry)) startFrom.append(h("option", { value: x.id }, `${x.score > 0 ? "★ Önerilen: " : "Kütüphaneden: "}${x.name}${x.sector ? ` · ${x.sector}` : ""}`)); }).catch(() => {});
  const go = async () => {
    const ok = await runAgent(slug, "autopilot", { freeText: draft.freeText || "", askFirst: askFirst.checked, ...(startFrom.value ? { libraryId: startFrom.value } : {}) });
    if (ok) draft.freeText = "";
  };
  return h("section", { class: "now-card prep", "aria-label": "Siteyi hazırla" },
    h("div", { class: "text" },
      h("p", { class: "eyebrow", text: working ? "Agent çalışıyor" : ranBefore ? "Devam" : "Başla" }),
      h("h2", { text: working ? "Site hazırlanıyor…" : "Siteyi hazırla" }),
      h("p", { text: working
        ? "Agent bilgileri kaydediyor, tasarımı seçiyor, metinleri yazıyor ve siteyi oluşturuyor. Birkaç dakika sürer; aşağıdan izleyebilirsin."
        : "Bilgileri yapıştır, logo ya da fotoğraf varsa ekle, düğmeye bas. Agent gerisini yapar; eksik bilgi olursa sana sorar." }),
    ),
    h("label", { for: "prep-text", class: "sr-only" }, "Müşteri bilgileri"),
    box,
    working ? null : infoGuide(box, (v) => (draft.freeText = v)),
    working || d.template !== "custom" ? null : h("label", { for: "prep-lib", class: "small row nowrap" }, startFrom),
    working ? null : h("label", { for: "prep-ask", class: "check small" }, askFirst, " Önce araştırsın ve bana sorsun (önerilen). Kapalıysa açık kalan tasarım kararlarını kendisi verir; bilgi yine uydurmaz."),
    h("div", { class: "row" },
      h("button", { class: "btn btn-primary btn-lg", type: "button", disabled: busy, onclick: go }, ranBefore ? "Tekrar hazırla" : "Siteyi hazırla"),
      h("label", { for: "prep-files", class: "btn btn-lg", style: working ? "pointer-events:none;opacity:.5" : "" }, "Logo / fotoğraf ekle"), fileInput,
      fileCount,
      h("a", { href: `#/c/${slug}/sorular`, class: "small", style: "margin-inline-start:auto" }, "Müşteriye soru formu göndermek istersen"),
    ),
  );
}

/** The site is built: look at it, then approve with one command (content + visuals). */
function readyCard(d) {
  const slug = d.status.slug;
  return h("section", { class: "now-card prep", "aria-label": "Site hazır" },
    h("div", { class: "text" },
      h("p", { class: "eyebrow", text: "Site hazır" }),
      h("h2", { text: "Siteye bak, beğenirsen onayla" }),
      h("p", { text: "Telefonda ve bilgisayarda göz at. Değişiklik istersen Sohbet'e yaz, agent düzeltir. Beğendiysen onayla." }),
    ),
    h("div", { class: "row" },
      h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => openPreview(slug) }, svg(ICON.eye, 18, 2), "Siteye bak"),
      h("button", { class: "btn btn-ok btn-lg", type: "button", disabled: isBusy(), onclick: () => approveDialog(d, "site") }, svg(ICON.check, 18, 2.4), "Onayla"),
      h("button", { class: "btn btn-lg", type: "button", onclick: () => { location.hash = `#/c/${slug}/sohbet`; setTimeout(() => $("#composer")?.focus(), 80); } }, "Değişiklik iste"),
    ),
    terminalFold(d.siteApproveCommand),
  );
}

// ---------------------------------------------------------------- tab: flow (agent conversation)

function tabFlow(body, d) {
  const slug = d.status.slug;
  const feed = h("div", { class: "feed", id: "feed" });
  drawFeed(feed, d);
  const busy = isBusy();
  const composer = h("textarea", { id: "composer", rows: 2, placeholder: "Agent'a yaz: ör. Başlığı kısalt, menüye mantı ekle, renkleri biraz koyulaştır." });
  // The page re-renders when a job ends; the draft lives in state so typing is never lost.
  const hadFocus = document.activeElement?.id === "composer";
  composer.value = state.composer[slug] || "";
  composer.addEventListener("input", () => {
    state.composer[slug] = composer.value;
    composer.style.height = "auto";
    composer.style.height = `${composer.scrollHeight}px`;
  });
  if (hadFocus) queueMicrotask(() => composer.focus());
  const send = async () => {
    const text = composer.value.trim();
    if (!text) { composer.focus(); return; }
    if (await runAgent(slug, "revise", { request: text })) { state.composer[slug] = ""; composer.value = ""; }
  };
  composer.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });

  body.append(h("div", { class: "flow" },
    h("div", { class: "feed-wrap" },
      feed,
      h("form", { class: "composer", onsubmit: (e) => { e.preventDefault(); send(); } },
        h("div", { class: "chips" },
          h("span", { class: "chips-label", text: "Hızlı:" }),
          h("button", { class: "chip", type: "button", disabled: busy, onclick: () => runAgent(slug, "autopilot", {}) }, "Eksikleri tamamla ve hazırla"),
          h("button", { class: "chip", type: "button", disabled: busy, onclick: () => runTask(slug, "build", {}) }, "Siteyi yeniden oluştur"),
          h("button", { class: "chip", type: "button", disabled: busy, onclick: () => runAgent(slug, "fix-build", {}) }, "Hataları düzelt"),
          d.template === "custom" ? h("button", { class: "chip", type: "button", disabled: busy, onclick: () => runAgent(slug, "concepts", {}) }, "3 tasarım önerisi") : null,
        ),
        h("label", { for: "composer", class: "sr-only" }, "Agent'a talimat"),
        h("div", { class: "box" }, composer, h("button", { class: "send", type: "submit", "aria-label": "Gönder (Ctrl+Enter)", disabled: busy }, svg(ICON.send, 18, 2.4))),
      ),
    ),
  ));
}

function toolChips(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  return h("div", { class: "tools" }, ...[...counts].map(([n, c]) => h("span", { class: "tool", text: c > 1 ? `${n} ×${c}` : n })));
}

const STATUS_BADGE = { succeeded: ["ok", "tamamlandı"], failed: ["bad", "başarısız"], cancelled: ["skip", "iptal"], running: ["accent", "çalışıyor"] };

function agentBlock(job, live) {
  const [cls, label] = STATUS_BADGE[job.status] || ["skip", job.status];
  const isAgent = !["build", "deploy"].includes(job.kind);
  const parts = [];
  if (live) {
    if (isAgent) parts.push(jobProgress(job));
    const lines = h("details", { class: "live-details" }, h("summary", { text: "Ayrıntılı kayıt" }), h("div", { class: "live-lines", id: "live-lines" }));
    appendLiveLines(lines.querySelector("#live-lines"), job.log || []);
    parts.push(lines);
    parts.push(h("div", { class: "row" }, h("span", { class: "typing", role: "img", "aria-label": "çalışıyor" }, h("span"), h("span"), h("span")), isAgent && h("button", { class: "btn btn-sm", type: "button", onclick: () => cancelJob(job.id) }, "Durdur")));
  } else {
    if (job.tools?.length) parts.push(toolChips(job.tools));
    const used = usageLine(job);
    if (used) parts.push(used);
    if (job.summary) parts.push(richText(job.summary));
    for (const e of job.errors || []) parts.push(h("p", { class: "err", text: e }));
  }
  return h("div", { class: "msg-agent" },
    h("span", { class: "who", "aria-hidden": "true" }, svg(isAgent ? ICON.spark : ICON.check, 16)),
    h("div", { class: "body" },
      h("div", { class: "head" }, h("strong", { text: isAgent ? `Agent · ${job.title}` : job.title }), h("span", { class: `badge ${cls}`, text: label }), h("span", { text: time(job.endedAt || job.startedAt) })),
      ...parts,
    ),
  );
}

/**
 * The agent writes its summary in light Markdown (**bold**, - bullets, `code`). Rendered into DOM nodes
 * with textContent only, so nothing in the text can become HTML.
 */
function inline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    out.push(m[1] !== undefined ? h("strong", { text: m[1] }) : h("code", { text: m[2] }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

function richText(text) {
  const root = h("div", { class: "summary rich" });
  let list = null;
  let depth = 0;
  for (const raw of text.split("\n")) {
    const bullet = raw.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet) {
      const indent = bullet[1].length >= 2 ? 1 : 0;
      if (!list || indent !== depth) {
        if (indent > depth && list?.lastElementChild) { const sub = h("ul"); list.lastElementChild.append(sub); list = sub; }
        else if (indent < depth || !list) { list = h("ul"); root.append(list); }
        depth = indent;
      }
      list.append(h("li", {}, ...inline(bullet[2])));
      continue;
    }
    list = null;
    depth = 0;
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    root.append(heading ? h("p", { class: "rich-h" }, ...inline(heading[1])) : h("p", {}, ...inline(line)));
  }
  return root;
}

function appendLiveLines(container, lines) {
  for (const line of lines) {
    if (line.kind === "tool") {
      let chips = container.lastElementChild;
      if (!chips || !chips.classList.contains("tools")) { chips = h("div", { class: "tools" }); container.append(chips); }
      chips.append(h("span", { class: "tool", text: line.text.split("(")[0] }));
    } else if (line.kind === "error") container.append(h("p", { class: "err", text: line.text }));
    else if (line.kind === "result") container.append(richText(line.text));
    else container.append(h("p", { class: line.kind === "agent" ? "agent" : "info", text: line.text }));
  }
}

function drawFeed(feed, d) {
  const items = [];
  for (const job of d.history) {
    items.push(h("div", { class: "msg-user" }, job.request || job.title, h("span", { class: "when", text: time(job.startedAt) })));
    items.push(agentBlock(job, false));
  }
  const running = d.running;
  if (running) {
    items.push(h("div", { class: "msg-user" }, running.request || running.title, h("span", { class: "when", text: time(running.startedAt) })));
    items.push(agentBlock(running, true));
    state.logSince = running.logTotal ?? (running.log || []).length;
  }
  // The approval step itself is shown once, in the "now" card above the tabs.
  if (!items.length) items.push(h("div", { class: "feed-empty" }, h("p", { text: "Henüz agent ile konuşma yok." }), h("p", { class: "small", text: "Yukarıdaki kutuya bildiklerini yapıştırıp 'Siteyi hazırla'ya bas ya da aşağıya yaz." })));
  feed.replaceChildren(...items);
}

/** A card at the end of the conversation when the next step is the operator's approval. */
function stageCard(d) {
  const kind = { "awaiting-content-approval": "content", "awaiting-visual-approval": "visual", "awaiting-production-approval": "production" }[d.status.stage];
  if (!kind) return null;
  if (kind !== "production") {
    if (!d.distReady) return null; // the "Prepare site" card covers it
    return h("section", { class: "feed-card warn", "aria-label": "Site onayı senden" },
      h("p", { class: "title", text: "Site onayı senden" }),
      h("p", { class: "small", text: "Siteye bak. Beğendiysen bu komutu terminalde çalıştır (metin ve görünüm birlikte onaylanır). Agent onay veremez." }),
      h("div", { class: "cmd" }, h("code", { text: d.siteApproveCommand }), copyButton(d.siteApproveCommand)),
    );
  }
  const a = d.approvals.find((x) => x.kind === kind);
  const what = { content: "İçerik onayı senden", visual: "Görsel onay senden", production: "Yayın onayı senden" }[kind];
  const why = {
    content: "Metinleri 'Metinler' sekmesinde oku. Uygunsa bu komutu terminalde çalıştır.",
    visual: "Önizlemeyi aç, kontrol listesine göre bak. Uygunsa bu komutu terminalde çalıştır.",
    production: "Müşteri önizlemeyi onaylayınca bu komutu terminalde çalıştır.",
  }[kind];
  return h("section", { class: "feed-card warn", "aria-label": what },
    h("p", { class: "title", text: what }),
    h("p", { class: "small", text: `${why} Agent onay veremez.` }),
    h("div", { class: "cmd" }, h("code", { text: a.command }), copyButton(a.command)),
  );
}

function rail(d) {
  const p = d.design?.palette;
  const b = d.status.lastBuild;
  return h("aside", { class: "rail", "aria-label": "Müşteri özeti" },
    h("section", { class: "card" },
      h("h3", { text: "Tasarım" }),
      p ? h("div", { class: "swatches" }, ...["primary", "secondary", "accent", "background", "text"].map((k) => h("span", { title: `${k} ${p[k]}`, style: `background:${/^#[0-9a-f]{6}$/i.test(p[k] || "") ? p[k] : "transparent"}` })))
        : h("p", { class: "small muted", text: "Henüz seçilmedi." }),
      d.design && h("p", { class: "small", style: "margin-top:0.6rem", text: `${d.design.fonts?.heading || ""} / ${d.design.fonts?.body || ""}` }),
      d.design && h("p", { class: "small muted", text: d.design.style || "" }),
    ),
    h("section", { class: "card" },
      h("h3", { text: "Durum" }),
      h("dl", { class: "kv" },
        h("div", {}, h("dt", { text: "Kontroller" }), h("dd", { text: b ? (b.passed ? "Geçti" : "Kaldı") : "Site yok" })),
        h("div", {}, h("dt", { text: "Eksik alan" }), h("dd", { text: String(d.status.config.missing.length) })),
        h("div", {}, h("dt", { text: "Gelen dosya" }), h("dd", { text: String(d.inbox.length) })),
        h("div", {}, h("dt", { text: "Eşleşmeyen cevap" }), h("dd", { text: String(d.unmapped.length) })),
        d.lastDeploy && h("div", {}, h("dt", { text: "Son yayın" }), h("dd", { text: `${d.lastDeploy.target === "production" ? "Canlı" : "Önizleme"} · ${time(d.lastDeploy.at)}` })),
      ),
    ),
    d.unmapped.length > 0 && h("section", { class: "card" }, h("h3", { text: "Hiçbir alana uymayan" }),
      h("ul", { class: "small", style: "margin:0;padding-inline-start:1.1rem" }, ...d.unmapped.map((u) => h("li", { text: `${u.question}: ${u.answer}` })))),
  );
}

// ---------------------------------------------------------------- tab: site and publish

/** Everything about the built site in one place: look, checks, approvals, publishing. */
function tabSite(body, d) {
  if (d.template === "custom") body.append(conceptsCard(d));
  if (d.distReady) body.append(devicePreview(d));
  const look = h("div", { class: "site-grid" });
  body.append(look);
  const left = h("div", { class: "stack" }, rail(d), quickEditCard(d));
  look.append(left);
  const right = h("div");
  look.append(right);
  tabPublish(right, d);
  tabBuild(right, d);
  right.append(versionsCard(d));
}

const PAYMENT_LABELS = { none: "Teklif verilmedi", quoted: "Teklif verildi", deposit: "Kapora alındı", paid: "Ödendi" };
const CURRENCY_SIGNS = { TRY: "₺", GBP: "£", EUR: "€", USD: "$" };

/** One line for a client card: price, payment and delivery date (red when late and unpaid). */
function businessLine(b) {
  if (!b) return null;
  const parts = [];
  if (b.price != null) parts.push(`${CURRENCY_SIGNS[b.currency] || ""}${Number(b.price).toLocaleString("tr-TR")}`);
  parts.push(PAYMENT_LABELS[b.payment] || b.payment);
  let late = false;
  if (b.deadline) {
    const due = new Date(`${b.deadline}T23:59:59`);
    late = due < new Date() && b.payment !== "paid";
    parts.push(`Teslim ${due.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`);
  }
  return h("span", { class: `biz ${late ? "late" : ""} pay-${b.payment}`, text: parts.join(" · ") });
}

function businessForm(d) {
  const slug = d.status.slug;
  const b = d.businessTracking || { price: null, currency: d.country === "TR" ? "TRY" : "GBP", payment: "none", deadline: null, note: "" };
  const price = h("input", { id: "biz-price", type: "number", min: 0, step: "50", value: b.price ?? "" });
  const currency = h("select", { id: "biz-cur" }, ...Object.entries(CURRENCY_SIGNS).map(([k, v]) => h("option", { value: k, selected: k === b.currency }, `${v} ${k}`)));
  const payment = h("select", { id: "biz-pay" }, ...Object.entries(PAYMENT_LABELS).map(([k, v]) => h("option", { value: k, selected: k === b.payment }, v)));
  const deadline = h("input", { id: "biz-date", type: "date", value: b.deadline || "" });
  const note = h("textarea", { id: "biz-note", rows: 2, maxlength: 2000 });
  note.value = b.note || "";
  const tags = h("input", { id: "biz-tags", placeholder: "ör. abim, acil, Ankara", value: (b.tags || []).join(", ") });
  const bmode = h("select", { id: "biz-mode" }, h("option", { value: "" }, "Genel ayar"), ...Object.entries(MODE_TR).map(([k, v]) => h("option", { value: k, selected: b.budgetMode === k }, v)));
  const form = h("form", { class: "card biz-form", onsubmit: async (e) => {
    e.preventDefault();
    const r = await guarded(() => api("PUT", `/api/clients/${slug}/business`, {
      price: price.value === "" ? null : Number(price.value), currency: currency.value, payment: payment.value, deadline: deadline.value || null, note: note.value,
      tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
      budgetMode: bmode.value,
    }));
    if (r) { toast("İş bilgileri kaydedildi."); loadClients(); }
  } },
    h("div", { class: "biz-grid" },
      h("label", { for: "biz-price" }, "Fiyat", h("div", { class: "row nowrap" }, price, currency)),
      h("label", { for: "biz-pay" }, "Ödeme", payment),
      h("label", { for: "biz-date" }, "Teslim tarihi", deadline),
    ),
    h("label", { for: "biz-note" }, "Not", note),
    h("label", { for: "biz-tags" }, "Etiketler (virgülle)", tags),
    h("label", { for: "biz-mode" }, `Token modu${d.budget ? ` (bu müşteri şimdiye kadar ${fmtTokens(d.budget.usage.tokens)} token, ${d.budget.usage.jobs} iş)` : ""}`, bmode),
    h("div", { class: "row" }, h("a", { class: "btn", href: `#/c/${slug}/teklif` }, "Teklif hazırla")),
    h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")),
  );
  return form;
}

/** Three brand proposals from the agent, shown as cards; choosing one builds the site with it. */
function conceptsCard(d) {
  const slug = d.status.slug;
  const busy = isBusy();
  const body = h("div", { class: "concepts" }, h("p", { class: "muted small", text: "Yükleniyor…" }));
  const card = h("section", { class: "card stack" },
    h("div", { class: "row", style: "justify-content:space-between" },
      h("h2", { text: "Tasarım önerileri" }),
      h("button", { class: "btn btn-sm", type: "button", disabled: busy, onclick: () => runAgent(slug, "concepts", {}) }, "3 yeni öneri hazırlat")),
    h("p", { class: "muted small", text: "Agent bu müşteri için üç farklı marka yönü çizer (logo, renkler, yazı tipleri, animasyon fikirleri). Müşteriye ekran görüntüsüyle gösterip seçtir; seçince site o tasarımla kurulur." }),
    body,
  );
  api("GET", `/api/clients/${slug}/concepts`).then(({ options }) => {
    if (!options.length) { body.replaceChildren(h("p", { class: "muted small", text: "Henüz öneri yok." })); return; }
    body.replaceChildren(...options.map((o) => {
      const b = o.brand || {};
      const colours = Object.entries(b.palette || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v)));
      // The logo is shown as an image (data URI): nothing in it can run in the panel.
      const logo = o.logoSvg ? h("img", { class: "concept-logo", alt: `Öneri ${o.id.toUpperCase()} logosu`, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(o.logoSvg)}` }) : null;
      return h("article", { class: "concept" },
        h("div", { class: "concept-head" }, h("span", { class: "letter", text: o.id.toUpperCase() }), h("strong", { text: b.name || `Öneri ${o.id.toUpperCase()}` })),
        logo,
        h("div", { class: "swatches" }, ...colours.map(([n, v]) => h("span", { title: `${n} ${v}`, style: `background:${v}` }))),
        b.fonts && h("p", { class: "small", text: `${b.fonts.heading || ""} / ${b.fonts.body || ""}` }),
        b.concept && h("p", { class: "small", text: b.concept }),
        Array.isArray(b.animations) && h("ul", { class: "small anims" }, ...b.animations.map((a) => h("li", { text: a.idea || a.id }))),
        o.problems.length ? h("p", { class: "err small", text: `Eksik: ${o.problems.join("; ")}` }) : null,
        h("button", { class: "btn btn-primary", type: "button", disabled: busy || o.problems.length > 0, onclick: () => {
          if (confirm(`Öneri ${o.id.toUpperCase()} ile site kurulacak (mevcut sayfalar yeniden yazılır; önceki hâl Sürümler'de kalır). Devam?`)) runAgent(slug, "choose-concept", { option: o.id });
        } }, "Bunu seç ve siteyi kur"),
      );
    }));
  }).catch(() => body.replaceChildren(h("p", { class: "err", text: "Öneriler okunamadı." })));
  return card;
}

// ---------------------------------------------------------------- brand board (Marka Atölyesi)

const PALETTE_TR = { primary: "Ana renk", secondary: "İkincil", accent: "Vurgu", background: "Zemin", text: "Yazı" };
const BOARD_MISSING_TR = [
  [/^tagline/, "Slogan"],
  [/^signature:/, "İmza hareketi (adı ve fikri)"],
  [/signature\.html/, "İmza hareketinin canlı demosu"],
  [/^typeSample/, "Tipografi örneği"],
];
const FONT_NAME = /^[A-Za-z0-9 ]{2,60}$/;
const HEX6 = /^#[0-9a-f]{6}$/i;

/** Relative luminance, to pick readable text on a brand colour. */
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Dark or light text, whichever has the higher contrast on this colour. */
function inkOn(hex) {
  const l = luminance(hex);
  const dark = (l + 0.05) / (luminance("#151719") + 0.05);
  const light = (luminance("#F4F3EF") + 0.05) / (l + 0.05);
  return dark >= light ? "#151719" : "#F4F3EF";
}

/** Loads the brand's Google Fonts into the panel (names are checked: letters, digits and spaces only). */
function loadBoardFonts(names) {
  const families = [...new Set(names.filter((n) => typeof n === "string" && FONT_NAME.test(n)))];
  if (!families.length) return;
  const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700`).join("&")}&display=swap`;
  if (document.querySelector(`link[data-board-fonts="${CSS.escape(href)}"]`)) return;
  document.head.append(h("link", { rel: "stylesheet", href, "data-board-fonts": href }));
}
const fontStack = (name, fallback) => (typeof name === "string" && FONT_NAME.test(name) ? `"${name}", ${fallback}` : fallback);

/**
 * The signature demo, written by the agent, runs in a sandboxed frame: scripts yes, same origin no (it cannot
 * read the panel, its cookie or its API), and a CSP that blocks every network request except Google Fonts.
 */
function signatureFrame(html, title) {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:">`;
  const doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${csp}`) : `${csp}${html}`;
  return h("iframe", { class: "sig-frame", title, sandbox: "allow-scripts", referrerpolicy: "no-referrer", srcdoc: doc });
}

function boardLabel(text) {
  return h("span", { class: "board-label", text });
}

async function tabBrand(body, d) {
  const slug = d.status.slug;
  body.replaceChildren(h("p", { class: "muted", text: "Marka kartı yükleniyor…" }));
  const b = await guarded(() => api("GET", `/api/clients/${slug}/brand`));
  if (!b) return;
  const custom = b.source === "custom";
  if (custom && !b.brand) {
    body.replaceChildren(h("section", { class: "card stack" },
      h("h2", { text: "Marka henüz tasarlanmadı" }),
      h("p", { class: "muted", text: "Agent siteyi hazırlarken önce markayı tasarlar: logo, renkler, yazı tipleri, slogan ve bu işletmeye özel imza hareketi. Sonra burada müşteriye gösterebileceğin marka kartı çıkar." }),
      h("p", { class: "muted small", text: "Seçenek görmek istersen 'Site ve yayın' sekmesinde 3 tasarım önerisi hazırlatabilirsin." })));
    return;
  }
  const brand = b.brand || {};
  const palette = custom
    ? Object.entries(brand.palette || {}).filter(([, v]) => HEX6.test(String(v))).map(([name, hex]) => ({ name: name.replace(/[-_]/g, " "), hex: hex.toUpperCase() }))
    : Object.entries(b.palette || {}).filter(([, v]) => HEX6.test(String(v))).map(([k, hex]) => ({ name: PALETTE_TR[k] || k, hex: hex.toUpperCase() }));
  const fonts = (custom ? brand.fonts : b.fonts) || {};
  const mono = custom && FONT_NAME.test(brand.monoFont || "") ? brand.monoFont : null;
  loadBoardFonts([fonts.heading, fonts.body, mono]);
  const heading = fontStack(fonts.heading, "Geist, sans-serif");
  const bodyFont = fontStack(fonts.body, "Geist, sans-serif");
  const monoFont = fontStack(mono, '"Geist Mono", ui-monospace, monospace');
  const main = palette[0]?.hex || "#F58255";
  // The client's own logo wins over a drawn one; both are shown as images (nothing in them can run).
  const logoUri = b.clientLogo || (b.logoSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(b.logoSvg)}` : null);
  const missing = custom ? b.missing.map((m) => BOARD_MISSING_TR.find(([re]) => re.test(m))?.[1] || "Marka temeli") : [];
  const signature = brand.signature && typeof brand.signature === "object" ? brand.signature : null;
  const others = (Array.isArray(brand.animations) ? brand.animations : []).filter((a) => a && a.id !== signature?.id);
  const TRIGGER_TR = { load: "açılışta", scroll: "kaydırınca", hover: "üstüne gelince", pointer: "fareyle", click: "tıklayınca" };

  const hero = h("article", { class: "board-card board-hero", style: `background:${main};color:${inkOn(main)}` },
    boardLabel(custom ? "Marka" : "Şablon marka"),
    logoUri
      ? h("div", { class: "hero-logo" }, h("img", { src: logoUri, alt: `${b.name} logosu` }))
      : h("div", { class: "hero-word", style: `font-family:${heading}`, text: b.name }),
    h("p", { class: "hero-tag", style: `font-family:${heading}`, text: brand.tagline || (custom ? "Slogan henüz yok." : b.industry) }),
  );

  const concept = h("article", { class: "board-card board-concept" },
    boardLabel("Konsept"),
    h("p", { class: "concept-text", style: `font-family:${heading}`, text: brand.concept || (custom ? "Konsept henüz yazılmadı." : "Şablon sitelerde marka konsepti yok; renkler ve yazı tipleri şablondan gelir.") }),
    h("ul", { class: "swatch-list" }, ...palette.map((p) => h("li", {},
      h("span", { class: "chip", style: `background:${p.hex}` }),
      h("span", { class: "sw-name", text: p.name }),
      h("button", { type: "button", class: "sw-hex", title: "Kopyala", onclick: () => navigator.clipboard?.writeText(p.hex).then(() => toast(`${p.hex} kopyalandı`)) }, p.hex),
    ))),
  );

  const sig = h("article", { class: "board-card board-sig" },
    boardLabel("İmza hareketi"),
    h("h3", { class: "sig-name", style: `font-family:${heading}`, text: signature?.name || (custom ? "Henüz seçilmedi" : "Şablonda yok") }),
    custom && b.signatureHtml
      ? signatureFrame(b.signatureHtml, `${b.name} imza hareketi`)
      : h("div", { class: "sig-empty", text: custom ? "Canlı demo henüz yok." : "Serbest tasarıma geçince agent bu işletmeye özel bir imza hareketi tasarlar." }),
    signature?.idea && h("p", { class: "small", text: signature.idea }),
    custom && h("p", { class: "board-note", text: "Hareket azaltma açık olan ziyaretçiler sakin hâlini görür." }),
  );

  const download = logoUri && h("a", { class: "btn board-btn", href: logoUri, download: `${slug}-logo${b.clientLogo ? "" : ".svg"}` }, b.clientLogo ? "Logoyu indir" : "Logoyu indir (SVG)");
  const type = h("article", { class: "board-card board-type" },
    boardLabel("Tipografi"),
    h("div", { class: "type-head" },
      h("span", { class: "type-aa", style: `font-family:${heading}`, text: "Aa" }),
      h("div", {}, h("strong", { text: fonts.heading || "—" }), h("span", { class: "muted small", text: fonts.body && fonts.body !== fonts.heading ? `Metin: ${fonts.body}` : "Başlık ve metin" }))),
    h("p", { class: "type-sample", style: `font-family:${heading}`, text: brand.typeSample || brand.tagline || b.name }),
    h("p", { class: "type-body", style: `font-family:${bodyFont}`, text: brand.voice || "Metinler sade, kısa ve işletmenin kendi sesiyle yazılır." }),
    h("p", { class: "type-mono", style: `font-family:${monoFont}`, text: palette.map((p) => p.hex).join("  ") }),
    logoUri && h("div", { class: "logo-dark" }, h("img", { src: logoUri, alt: "" }), h("span", { class: "board-note", text: "Koyu zeminde" })),
    download,
  );

  const anims = others.length > 0 && h("article", { class: "board-card board-anims" },
    boardLabel("Diğer imza animasyonları"),
    h("ul", {}, ...others.map((a) => h("li", {}, h("span", { class: "trigger", text: TRIGGER_TR[a.trigger] || a.trigger || "" }), h("span", { text: a.idea || a.id })))),
  );

  const board = h("section", { class: "board", "aria-label": `${b.name} marka kartı` },
    h("header", { class: "board-top" },
      h("div", {}, h("span", { class: "board-kicker", text: "Marka Atölyesi" }), h("h2", { text: b.name })),
      h("span", { class: "board-meta", text: [b.industry, Array.isArray(brand.personality) ? brand.personality.join(" · ") : ""].filter(Boolean).join("  /  ") })),
    h("div", { class: "board-grid" }, hero, concept, sig, type, anims),
    h("footer", { class: "board-foot" },
      h("span", { text: custom ? "Serbest tasarım" : "Şablon" }),
      h("span", { text: fonts.heading ? `${fonts.heading}${fonts.body && fonts.body !== fonts.heading ? ` + ${fonts.body}` : ""}` : "" }),
      h("span", { text: `${palette.length} renk` })),
  );

  const busy = isBusy();
  const actions = h("div", { class: "row board-actions" },
    h("button", { class: "btn", type: "button", onclick: () => window.print() }, "Yazdır / PDF"),
    custom && missing.length > 0 && h("button", { class: "btn", type: "button", disabled: busy, onclick: () => runAgent(slug, "brand-board", {}) }, "Marka kartını tamamlat"),
    custom && h("button", { class: "btn btn-primary", type: "button", disabled: busy, title: "Bilgiler ve metinler aynı kalır; sayfalar markanın imza tasarımıyla baştan yazılır.", onclick: () => {
      if (confirm("Site markanın imza tasarımıyla baştan yazılacak (bilgiler ve fiyatlar aynı kalır; önceki hâl Sürümler'de durur). Devam?")) runAgent(slug, "redesign", {});
    } }, "Markayla yeniden tasarla"),
  );
  const notice = custom && missing.length > 0
    ? h("p", { class: "notice small", text: `Eksik: ${[...new Set(missing)].join(", ")}. Agent mevcut markayı bozmadan tamamlar.` })
    : !custom ? h("p", { class: "muted small", text: "Bu site şablonla yapıldı: kartta şablonun renkleri ve yazı tipleri var. Özel logo, slogan ve imza hareketi için 'Serbest tasarıma geç'." }) : null;
  const logoNote = custom && !b.clientLogo
    ? h("p", { class: "muted small" }, "Logo agent'ın çizimi. Müşterinin kendi logosu varsa ", h("a", { href: `#/c/${slug}/bilgiler`, text: "Bilgiler" }), " sekmesinden yükle ve \"Logo olarak kullan\"a bas, sonra \"Markayla yeniden tasarla\".")
    : null;
  body.replaceChildren(h("div", { class: "stack" }, h("div", { class: "row", style: "justify-content:space-between;align-items:center" }, h("p", { class: "muted small", text: "Müşteriye göstermek için: ekran görüntüsü al ya da PDF olarak kaydet." }), actions), notice, logoNote, board,
    custom ? libraryControls(slug, Boolean(b.brand)) : null));
}

// ---------------------------------------------------------------- design library

/** Words of a text, lowercased, Turkish letters folded (for library search and suggestions). */
function words(text) {
  return String(text || "").toLowerCase().replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c]).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
}
/** How well a saved design fits a client: shared words in sector (counts double), tags, name and concept. */
function libraryScore(design, industry) {
  const want = new Set(words(industry));
  if (!want.size) return 0;
  let score = 0;
  for (const w of words(design.sector)) if (want.has(w)) score += 2;
  for (const w of words([design.name, ...(design.tags || []), design.concept].join(" "))) if (want.has(w)) score += 1;
  return score;
}
/** Library designs for a client, best fit first, with "önerilen" on those that match its sector. */
function rankedDesigns(designs, slug, industry) {
  return designs.filter((x) => x.sourceSlug !== slug).map((x) => ({ ...x, score: libraryScore(x, industry) })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function swatchRow(palette) {
  return h("div", { class: "swatches" }, ...Object.entries(palette || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v))).slice(0, 6).map(([n, v]) => h("span", { title: `${n} ${v}`, style: `background:${v}` })));
}

/** Saved designs, grouped by sector. A design starts a new site faster and keeps the quality of a good one. */
async function renderLibrary() {
  const data = await guarded(() => api("GET", "/api/library"));
  const designs = data?.designs || [];
  const head = h("div", { class: "dash-head" },
    h("div", {}, h("h1", { text: "Tasarım kütüphanesi" }),
      h("p", { class: "muted", text: "Beğendiğin siteleri buraya kaydet; yeni müşteride 'Başlangıç tasarımı' olarak seç. Agent düzeni ve hareketleri korur, renkleri, logoyu, metinleri ve imza hareketini yeni müşteriye göre yeniden yapar." })));
  if (!designs.length) {
    return h("section", { class: "dash" }, head, h("div", { class: "card stack" },
      h("p", { text: "Kütüphane boş." }),
      h("p", { class: "muted small", text: "Bir müşterinin Marka sekmesinde 'Kütüphaneye kaydet' ile ilk tasarımı ekle." })));
  }
  const q = (state.libQuery || "").trim();
  const shown = q ? designs.filter((d) => { const ws = new Set(words([d.name, d.sector, ...(d.tags || []), d.concept].join(" "))); return words(q).every((w) => [...ws].some((x) => x.startsWith(w))); }) : designs;
  const search = h("input", { type: "search", id: "lib-q", placeholder: "Ara: berber, koyu, premium…", value: q, class: "lib-search" });
  search.addEventListener("input", () => { state.libQuery = search.value; clearTimeout(search._t); search._t = setTimeout(async () => { $("#view").replaceChildren(await renderLibrary()); const el = $("#lib-q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); });
  const sectors = [...new Set(shown.map((d) => d.sector || "Diğer"))];
  return h("section", { class: "dash" }, head,
    h("label", { for: "lib-q", class: "sr-only" }, "Kütüphanede ara"), search,
    shown.length === 0 ? h("p", { class: "muted", text: "Bu aramaya uyan tasarım yok." }) : null,
    ...sectors.map((sec) => h("div", { class: "group" },
      h("h2", { class: "group-title", text: sec }),
      h("div", { class: "lib-cards" }, ...shown.filter((d) => (d.sector || "Diğer") === sec).map((d) => h("article", { class: "card lib-card" },
        d.hasPreview ? h("img", { class: "lib-shot", src: `/api/library/${d.id}/preview.png`, alt: `${d.name} önizleme`, loading: "lazy" }) : null,
        h("strong", { text: d.name }),
        swatchRow(d.palette),
        d.fonts && h("p", { class: "small muted", text: [d.fonts.heading, d.fonts.body].filter(Boolean).join(" / ") }),
        d.concept && h("p", { class: "small", text: d.concept.length > 180 ? `${d.concept.slice(0, 180)}…` : d.concept }),
        d.tags.length > 0 && h("div", { class: "chips" }, ...d.tags.map((t) => h("span", { class: "chip", text: t }))),
        h("p", { class: "small muted" }, "Kaynak: ", h("a", { href: `#/c/${d.sourceSlug}/marka`, text: d.sourceSlug }), ` · ${new Date(d.createdAt).toLocaleDateString("tr-TR")}`),
        h("button", { class: "btn btn-sm danger", type: "button", onclick: async () => {
          if (!confirm(`"${d.name}" kütüphaneden silinsin mi? Kaynak müşterinin sitesi etkilenmez.`)) return;
          if (await guarded(() => api("DELETE", `/api/library/${d.id}`))) render();
        } }, "Kütüphaneden sil"),
      )))),
    ));
}

/** Library controls on a custom site: save this design, or start over from a saved one. */
function libraryControls(slug, hasSite) {
  const box = h("div", { class: "card stack lib-controls" }, h("h3", { text: "Tasarım kütüphanesi" }));
  const name = h("input", { id: "lib-name", placeholder: "ör. Teknik koyu, kod pencereli", maxlength: 60 });
  const tags = h("input", { id: "lib-tags", placeholder: "Etiketler: koyu, teknik, premium", maxlength: 120 });
  if (hasSite) {
    box.append(h("form", { class: "row", onsubmit: async (e) => {
      e.preventDefault();
      if (!name.value.trim()) { name.focus(); return; }
      const r = await guarded(() => api("POST", `/api/clients/${slug}/library`, { name: name.value.trim(), tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean) }));
      if (r) { toast(`"${r.name}" kütüphaneye kaydedildi. Müşterinin adı, telefonu ve adresi yeni sitelere taşınmaz.`); name.value = ""; tags.value = ""; }
    } }, h("label", { for: "lib-name", class: "sr-only" }, "Tasarım adı"), name, h("label", { for: "lib-tags", class: "sr-only" }, "Etiketler"), tags, h("button", { class: "btn", type: "submit" }, "Kütüphaneye kaydet")));
  }
  const pick = h("select", { id: "lib-pick" }, h("option", { value: "" }, "Kütüphaneden tasarım seç…"));
  api("GET", "/api/library").then(({ designs }) => {
    const industry = state.detail?.business?.industry || "";
    for (const d of rankedDesigns(designs, slug, industry)) pick.append(h("option", { value: d.id }, `${d.score > 0 ? "★ " : ""}${d.name}${d.sector ? ` · ${d.sector}` : ""}`));
  }).catch(() => {});
  box.append(h("div", { class: "row" }, h("label", { for: "lib-pick", class: "sr-only" }, "Kütüphane tasarımı"), pick,
    h("button", { class: "btn", type: "button", disabled: isBusy(), onclick: () => {
      if (!pick.value) { pick.focus(); return; }
      if (confirm("Mevcut sayfalar kütüphane tasarımıyla değişecek (önceki hâl Sürümler'de kalır). Agent tasarımı bu müşteriye uyarlayacak. Devam?")) runAgent(slug, "from-library", { id: pick.value });
    } }, "Bu tasarımla yeniden kur")));
  return box;
}

// ---------------------------------------------------------------- Düzenle: forms instead of chat

const PAGE_TR = { home: "Ana sayfa", about: "Hakkımızda", services: "Hizmetler", gallery: "Galeri", contact: "İletişim" };

/** Runs one structured edit; the panel turns the form into an exact instruction (or saves it itself). */
async function submitEdit(slug, type, payload, button) {
  button.disabled = true;
  const job = await guarded(() => api("POST", `/api/clients/${slug}/edit/${type}`, payload));
  button.disabled = false;
  if (job) { toast("Değişiklik başladı; bitince ses ve bildirim gelir."); await jobStarted(job); }
}

async function tabEdit(body, d) {
  const slug = d.status.slug;
  const busy = isBusy();
  const custom = d.template === "custom";
  body.replaceChildren(h("p", { class: "muted small", text: "Sık yapılan değişiklikler için formlar. Yazmana gerek yok; agent sadece burada değiştirdiğini değiştirir. Özel bir istek için Sohbet sekmesini kullan." }));
  const grid = h("div", { class: "edit-grid" });
  body.append(grid);

  // Colours: current palette with colour pickers.
  const brand = custom ? await api("GET", `/api/clients/${slug}/brand`).catch(() => null) : null;
  const palette = custom ? (brand?.brand?.palette || {}) : (d.design?.palette || {});
  const pickers = Object.entries(palette).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v))).map(([name, hex]) => {
    const input = h("input", { type: "color", id: `col-${name}`, value: hex.toLowerCase() });
    const code = h("code", { text: hex.toUpperCase() });
    input.addEventListener("input", () => (code.textContent = input.value.toUpperCase()));
    return { name, input, el: h("label", { for: `col-${name}`, class: "colour-row" }, input, h("span", { text: PALETTE_TR[name] || name.replace(/[-_]/g, " ") }), code) };
  });
  const colourBtn = h("button", { class: "btn btn-primary", type: "button", disabled: busy || !pickers.length }, "Renkleri uygula");
  colourBtn.onclick = () => submitEdit(slug, "colors", { colors: Object.fromEntries(pickers.map((p) => [p.name, p.input.value])) }, colourBtn);
  grid.append(h("section", { class: "card stack" }, h("h3", { text: "Renkler" }),
    pickers.length ? h("div", { class: "stack-sm" }, ...pickers.map((p) => p.el)) : h("p", { class: "muted small", text: "Henüz renk paleti yok." }),
    colourBtn));

  // Pages: tick the pages the site should have.
  const boxes = Object.entries(PAGE_TR).map(([id, label]) => {
    const box = h("input", { type: "checkbox", id: `pg-${id}`, value: id, checked: d.pages.includes(id), disabled: id === "home" });
    return { id, box, el: h("label", { for: `pg-${id}`, class: "check" }, box, ` ${label}`) };
  });
  const pageBtn = h("button", { class: "btn btn-primary", type: "button", disabled: busy }, "Sayfaları uygula");
  pageBtn.onclick = () => submitEdit(slug, "pages", { pages: boxes.filter((b) => b.box.checked || b.id === "home").map((b) => b.id) }, pageBtn);
  grid.append(h("section", { class: "card stack" }, h("h3", { text: "Sayfalar" }),
    h("p", { class: "muted small", text: "Kaldırılan sayfa menüden de çıkar. Eklenen sayfa markaya uygun tasarlanır; doldurmak için bilgi yoksa agent sana sorar." }),
    ...boxes.map((b) => b.el), pageBtn));

  // Services and prices: a small table.
  const current = (d.content?.[d.defaultLocale]?.services || []).map((x) => ({ ...x }));
  const rows = h("div", { class: "svc-rows" });
  const addRow = (x = { title: "", description: "", price: "" }) => {
    const row = h("div", { class: "svc-row" },
      h("input", { placeholder: "Hizmet", value: x.title || "", maxlength: 60, "aria-label": "Hizmet adı" }),
      h("input", { placeholder: "Fiyat (ör. 400 TL)", value: x.price || "", maxlength: 40, "aria-label": "Fiyat" }),
      h("input", { placeholder: "Kısa açıklama", value: x.description || "", maxlength: 300, "aria-label": "Açıklama" }),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Satırı sil", onclick: () => row.remove() }, "✕"));
    rows.append(row);
  };
  (current.length ? current : [undefined]).forEach((x) => addRow(x));
  const svcBtn = h("button", { class: "btn btn-primary", type: "button", disabled: busy }, "Hizmetleri uygula");
  svcBtn.onclick = () => submitEdit(slug, "services", { services: [...rows.children].map((r) => { const [t, p, ds] = r.querySelectorAll("input"); return { title: t.value, price: p.value, description: ds.value }; }) }, svcBtn);
  grid.append(h("section", { class: "card stack wide" }, h("h3", { text: "Hizmetler ve fiyatlar" }), rows,
    h("div", { class: "row" }, h("button", { class: "btn btn-sm", type: "button", onclick: () => addRow() }, "+ Satır ekle"), svcBtn)));

  // One text change: page, current text, new text.
  const page = h("select", { id: "tx-page" }, ...d.pages.map((p) => h("option", { value: p }, PAGE_TR[p] || p)));
  const oldT = h("textarea", { id: "tx-old", rows: 2, placeholder: "Sitedeki metni kopyala yapıştır", maxlength: 2000 });
  const newT = h("textarea", { id: "tx-new", rows: 2, placeholder: "Yerine ne yazsın?", maxlength: 2000 });
  const txBtn = h("button", { class: "btn btn-primary", type: "button", disabled: busy }, "Metni değiştir");
  txBtn.onclick = () => submitEdit(slug, "text", { page: page.value, oldText: oldT.value, newText: newT.value }, txBtn);
  grid.append(h("section", { class: "card stack wide" }, h("h3", { text: "Metin değiştir" }),
    h("label", { for: "tx-page" }, "Sayfa", page), h("label", { for: "tx-old" }, "Şu an yazan", oldT), h("label", { for: "tx-new" }, "Yeni metin", newT), txBtn));

  grid.append(formCard(d), quickEditCard(d));
}

/** Contact form: Eren pastes the endpoint of a free form service; only he can set it, the agent only uses it. */
function formCard(d) {
  const slug = d.status.slug;
  const cur = d.status.contactForm || null;
  const action = h("input", { id: "fm-action", placeholder: "https://formspree.io/f/abcd1234", value: cur?.action || "", maxlength: 200 });
  const key = h("input", { id: "fm-key", placeholder: "Sadece Web3Forms: access key", value: cur?.accessKey || "", maxlength: 60 });
  const add = h("button", { class: "btn btn-primary", type: "button", disabled: isBusy() || !cur }, "Siteye formu ekle");
  add.onclick = () => submitEdit(slug, "form", {}, add);
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    const r = await guarded(() => api("PUT", `/api/clients/${slug}/form`, { action: action.value.trim(), accessKey: key.value.trim() }));
    if (r) { toast(r.form ? "Form adresi kaydedildi. Şimdi 'Siteye formu ekle'ye bas." : "Form adresi kaldırıldı."); add.disabled = !r.form; d.status.contactForm = r.form; }
  } },
    h("h3", { text: "İletişim formu" }),
    h("p", { class: "muted small" }, "Ücretsiz bir form servisi aç (ör. ", h("a", { href: "https://formspree.io", target: "_blank", rel: "noopener", text: "Formspree" }), "), formu müşterinin e-postasıyla oluştur, verdiği adresi buraya yapıştır. Mesajlar doğrudan müşteriye gider."),
    h("label", { for: "fm-action" }, "Form adresi", action),
    h("label", { for: "fm-key" }, "Erişim anahtarı (sadece Web3Forms)", key),
    h("div", { class: "row" }, h("button", { class: "btn", type: "submit" }, "Kaydet"), add));
}

// ---------------------------------------------------------------- Teklif (proposal), printable

const FEATURE_TR = [
  "Markaya özel tasarım: logo kullanımı ya da yeni logo, renkler, yazı tipleri ve imza hareketi",
  "Telefon, tablet ve bilgisayarda düzgün görünüm; açık ve koyu tema",
  "Hızlı açılan, güvenli, reklam ve takip kodu içermeyen site",
  "Arama motorları için temel ayarlar (başlıklar, açıklamalar, harita kaydı bilgisi, site haritası)",
  "WhatsApp ve telefonla tek dokunuşla iletişim",
  "Yayına alma ve SSL (https)",
];

async function tabProposal(body, d) {
  const slug = d.status.slug;
  const [settings, brand] = await Promise.all([api("GET", "/api/settings").catch(() => ({ sender: {} })), api("GET", `/api/clients/${slug}/brand`).catch(() => null)]);
  const s = settings.sender || {};
  const b = d.businessTracking || {};
  const today = new Date();
  const no = `T-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-${slug.slice(0, 6).toUpperCase()}`;
  const price = b.price != null ? `${CURRENCY_SIGNS[b.currency] || ""}${Number(b.price).toLocaleString("tr-TR")}` : "Belirtilecek";
  const palette = Object.entries((brand?.brand?.palette) || d.design?.palette || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v)));
  const logo = brand?.clientLogo || (brand?.logoSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brand.logoSvg)}` : null);
  // Editable on screen before printing (not saved): Eren adjusts wording per client.
  const editable = (tag, text, cls = "") => h(tag, { class: cls, contenteditable: "true", spellcheck: "true", text });
  const sheet = h("article", { class: "proposal" },
    h("header", { class: "p-head" },
      h("div", {}, h("span", { class: "p-kicker", text: "Web sitesi teklifi" }), h("h1", { text: d.business.name || slug }), h("p", { class: "p-meta", text: `${no} · ${today.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}` })),
      logo && h("img", { class: "p-logo", src: logo, alt: "" })),
    h("section", {}, h("h2", { text: "Kapsam" }),
      h("p", { text: `Sayfalar: ${(d.pages || []).map((p) => PAGE_TR[p] || p).join(", ") || "—"}` }),
      h("p", { text: `Diller: ${d.locales.map((l) => LANG_NAMES[l] || l).join(", ")}` }),
      h("ul", {}, ...FEATURE_TR.map((f) => editable("li", f))),
      d.domain ? h("p", { text: `Alan adı: ${d.domain}` }) : null),
    palette.length ? h("section", {}, h("h2", { text: "Marka" }),
      brand?.brand?.tagline ? h("p", { class: "p-tag", text: `“${brand.brand.tagline}”` }) : null,
      h("div", { class: "p-swatches" }, ...palette.slice(0, 6).map(([n, v]) => h("span", {}, h("i", { style: `background:${v}` }), `${n} ${v.toUpperCase()}`)))) : null,
    h("section", { class: "p-price" }, h("h2", { text: "Ücret ve teslim" }),
      h("table", {},
        h("tr", {}, h("th", { text: "Toplam" }), h("td", { class: "p-big", text: price })),
        h("tr", {}, h("th", { text: "Teslim" }), h("td", { text: b.deadline ? new Date(`${b.deadline}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "Onaydan sonra belirlenir" })),
        h("tr", {}, h("th", { text: "Ödeme" }), editable("td", "%50 başlangıçta, %50 yayına alırken.")),
        h("tr", {}, h("th", { text: "Barındırma" }), editable("td", d.hosting === "client" ? "Sizin hesabınızda (Cloudflare)." : "Bizim tarafımızdan; yıllık bakım ayrıca konuşulur.")))),
    h("section", {}, h("h2", { text: "Notlar" }), editable("p", "Bu teklif 15 gün geçerlidir. Sitede yer alacak bilgiler ve fotoğraflar işletme tarafından sağlanır; uydurma bilgi ya da yorum kullanılmaz.")),
    h("footer", { class: "p-foot" }, [s.name, s.email, s.phone, s.web].filter(Boolean).join(" · ") || "Gönderen bilgilerini Ayarlar → Teklif bölümünden ekle."),
  );
  body.replaceChildren(h("div", { class: "stack" },
    h("div", { class: "row", style: "justify-content:space-between;align-items:center" },
      h("p", { class: "muted small", text: "Fiyat ve teslim tarihi Bilgiler sekmesindeki iş bilgilerinden gelir. Metinlere tıklayıp düzeltebilirsin (kaydedilmez), sonra PDF olarak kaydet." }),
      h("button", { class: "btn btn-primary", type: "button", onclick: () => window.print() }, "Yazdır / PDF")),
    sheet));
}

/** Phone, email, address, hours and WhatsApp, fixed straight from the panel. */
function quickEditCard(d) {
  const slug = d.status.slug;
  const c = d.contact || {};
  const field = (id, label, value, attrs = {}) => {
    const input = h("input", { id: `qe-${id}`, name: id, value: value || "", ...attrs });
    return h("label", { for: `qe-${id}` }, label, input);
  };
  const form = h("form", { class: "card stack quick-edit", onsubmit: async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const job = await guarded(() => api("POST", `/api/clients/${slug}/quick-edit`, data));
    if (job) { toast("Kaydedildi; site güncelleniyor."); await jobStarted(job); }
  } },
    h("h3", { text: "Hızlı düzenle" }),
    h("p", { class: "muted small", text: "Telefonu 0 ile yazabilirsin; ülke koduna çevrilir." }),
    field("phone", "Telefon", c.phone, { type: "tel", autocomplete: "off" }),
    field("whatsapp", "WhatsApp", d.whatsapp, { type: "tel", autocomplete: "off" }),
    field("email", "E-posta", c.email, { type: "email" }),
    field("address", "Adres", c.address),
    field("hours", "Çalışma saatleri", c.hours),
    h("button", { class: "btn btn-primary", type: "submit", disabled: isBusy() }, "Kaydet ve siteye uygula"),
  );
  return form;
}

/** Earlier versions of the site (recorded before and after every job), with "go back". */
function versionsCard(d) {
  const slug = d.status.slug;
  const list = h("ul", { class: "versions" }, h("li", { class: "muted small", text: "Yükleniyor…" }));
  const card = h("details", { class: "card advanced", open: false }, h("summary", { text: "Önceki sürümler (geri al)" }),
    h("p", { class: "muted small", text: "Her işten önce ve sonra site kaydedilir. Bir sürüme dönünce metinler, görseller ve site kodu o hâline gelir; onayı yeniden vermen gerekir." }), list);
  card.addEventListener("toggle", async () => {
    if (!card.open || card.dataset.loaded) return;
    card.dataset.loaded = "1";
    const r = await guarded(() => api("GET", `/api/clients/${slug}/versions`));
    if (!r) return;
    if (!r.versions.length) { list.replaceChildren(h("li", { class: "muted small", text: "Henüz kayıtlı sürüm yok." })); return; }
    list.replaceChildren(...r.versions.map((v, i) => h("li", {},
      h("span", { class: "when", text: time(v.at) }),
      h("span", { class: "what", text: i === 0 ? `${v.message} (şu anki)` : v.message }),
      i === 0 ? null : h("button", { class: "btn btn-sm", type: "button", disabled: isBusy(), onclick: async () => {
        if (!confirm(`Site "${v.message}" sonrasındaki hâline dönecek. Sonraki değişiklikler kaybolmaz, yine listede kalır. Devam?`)) return;
        const res = await guarded(() => api("POST", `/api/clients/${slug}/versions/restore`, { id: v.id }));
        if (res) { toast("Geri alındı. Siteyi yeniden oluşturup bak."); render(); }
      } }, "Bu hâline dön"),
    )));
  });
  return card;
}

/** The built site in a phone frame and a desktop frame, side by side, without leaving the panel. */
function devicePreview(d) {
  const slug = d.status.slug;
  const wrap = h("section", { class: "card devices" });
  const head = h("div", { class: "row", style: "justify-content:space-between" },
    h("h2", { text: "Görünüm" }),
    h("div", { class: "row" },
      h("button", { class: "btn btn-sm", type: "button", onclick: () => openPreview(slug) }, "Yeni sekmede aç"),
    ),
  );
  const stage = h("div", { class: "device-stage" }, h("p", { class: "muted small", text: "Yükleniyor…" }));
  wrap.append(head, stage, h("p", { class: "muted small", text: "Müşteriye göstermek için: Windows'ta Win+Shift+S ile ekran görüntüsü al ve WhatsApp'tan gönder. Kalıcı link için Ayarlar'dan Cloudflare'i kur." }));
  api("POST", `/api/clients/${slug}/preview`).then((r) => {
    const frame = (cls, label) => h("figure", { class: `device ${cls}` }, h("div", { class: "screen" }, h("iframe", { src: r.url, title: `${label} görünümü`, tabindex: "-1" })), h("figcaption", { text: label }));
    stage.replaceChildren(frame("phone", "Telefon"), frame("desktop", "Masaüstü"));
  }).catch(() => stage.replaceChildren(h("p", { class: "err", text: "Önizleme açılamadı." })));
  return wrap;
}

// ---------------------------------------------------------------- tab: information

/** What the agent knows: the texts on the site, the answers and files, and the optional questionnaire. */
async function tabInfo(body, d) {
  const section = (title, sub) => {
    const el = h("section", { class: "info-section" }, h("div", { class: "info-head" }, h("h2", { text: title }), sub && h("p", { class: "muted small", text: sub })));
    body.append(el);
    return el;
  };
  section("İş takibi", "Teklif, ödeme ve teslim tarihi. Sadece panelde durur, siteye ve agent'a gitmez.").append(businessForm(d));
  if (d.status.openQuestions.length) {
    const miss = section("Eksik bilgiler", "Cevapları yukarıdaki kutuya yapıştırıp 'Siteyi hazırla'ya bas.");
    miss.append(h("ul", { class: "missing" }, ...d.status.openQuestions.map((q) => h("li", { title: q.text, text: MISSING_TR[q.id] || q.text }))));
  }
  tabContent(section("Sitedeki metinler", "Agent'ın yazdığı metinler. Değiştirmek için Sohbet'e yaz."), d);
  section("Logo ve fotoğraflar", "Yüklediklerini agent siteye ekler.").append(uploadCard(d.status.slug, d.inbox, d.assets, d.logo));
  const more = h("details", { class: "card advanced" }, h("summary", { text: "Müşteriye soru formu göndermek ya da formu soru soru girmek (isteğe bağlı)" }));
  body.append(more);
  tabQuestions(more, d, { compact: true });
  await tabAnswers(more, d, { compact: true });
}

// ---------------------------------------------------------------- tab: questions

function tabQuestions(body, d, { compact = false } = {}) {
  const slug = d.status.slug;
  const replyBy = h("input", { type: "text", id: "reply-by", maxlength: 40, placeholder: "ör. Friday 24 October" });
  const out = h("div");
  const make = async (round) => {
    const q = await guarded(() => api("POST", `/api/clients/${slug}/questionnaire/${round}`, { replyBy: replyBy.value.trim() || undefined }));
    if (!q) return;
    out.replaceChildren(h("div", { class: "copybox" }, h("pre", { text: q.plainText }), copyButton(q.plainText)));
    toast(`${round}. tur formu hazır. Metni kopyalayıp müşteriye gönderin.`);
  };
  body.append(h("section", { class: "card stack" },
    h("h2", { text: "Müşteriye gidecek soru formu" }),
    h("p", { class: "muted", text: "1. tur: 10 temel soru. 2. tur: sadece eksik kalanlar, sektöre özel sorular ve 'ileride ilginizi çekebilir' listesi. Form İngilizce; müşteriye siz gönderirsiniz." }),
    h("label", { for: "reply-by" }, "Son cevap tarihi (isteğe bağlı)", replyBy),
    h("div", { class: "row" },
      h("button", { class: "btn btn-primary", type: "button", onclick: () => make(1) }, "1. tur formunu oluştur"),
      h("button", { class: "btn", type: "button", onclick: () => make(2) }, "2. tur formunu oluştur"),
    ),
    out,
  ));
  if (!compact && d.status.openQuestions.length) {
    body.append(h("section", { class: "card" }, h("h2", { text: "Hâlâ açık sorular" }),
      h("ul", { style: "margin:0;padding-inline-start:1.2rem" }, ...d.status.openQuestions.map((q) => h("li", { text: `${q.text} (${q.round}. tur)` })))));
  }
}

// ---------------------------------------------------------------- tab: answers

async function tabAnswers(body, d, { compact = false } = {}) {
  const slug = d.status.slug;
  const round = d.questionnaires.includes(2) ? 2 : 1;
  const q = await guarded(() => api("GET", `/api/clients/${slug}/questionnaire/${round}`));
  if (!q) return;
  const draft = (state.drafts[slug] ||= { answers: {}, extras: {}, later: new Set(), freeText: "" });
  const area = (id, value, onInput, rows = 2) => {
    const ta = h("textarea", { id, rows, class: "field" });
    ta.value = value || "";
    ta.addEventListener("input", () => onInput(ta.value));
    return ta;
  };
  const qs = q.questions.map((item) => h("div", { class: "q" },
    h("label", { for: `a-${item.id}` }, item.text, item.required ? h("span", { class: "req", text: "gerekli" }) : null,
      (item.example || item.hint) ? h("span", { class: "help", text: [item.example && `Örnek: ${item.example}`, item.hint].filter(Boolean).join(" · ") }) : null,
      item.choices ? h("span", { class: "help", text: `Seçenekler: ${item.choices.join(" / ")}` }) : null),
    area(`a-${item.id}`, draft.answers[item.id], (v) => (draft.answers[item.id] = v)),
  ));
  const extras = q.extras.map((text, i) => h("div", { class: "q" }, h("label", { for: `x-${i}` }, text), area(`x-${i}`, draft.extras[i], (v) => (draft.extras[i] = v))));
  const later = q.later.map((l) => {
    const cb = h("input", { type: "checkbox", value: l.id, checked: draft.later.has(l.id) });
    cb.addEventListener("change", () => (cb.checked ? draft.later.add(l.id) : draft.later.delete(l.id)));
    return h("label", { class: "choice" }, cb, l.text);
  });
  const free = area("free", draft.freeText, (v) => (draft.freeText = v), 12);
  free.classList.add("big-paste");
  free.placeholder = "Müşterinin e-postasını, WhatsApp mesajını ya da kendi notlarını olduğu gibi yapıştır. Sıra, dil ve biçim önemli değil.\n\nÖr: Kuaför, adı Bella Hair. Kadın kesim 35£, boya 60£'dan başlıyor. Tel 07700 900123, Kingston'da. Renkleri pembe-gri olsun. Instagram @bellahair";

  body.append(
    compact ? null : h("section", { class: "card stack" },
      h("h2", { text: "Bilgileri yapıştır, agent dağıtsın" }),
      h("p", { class: "muted small", text: "Agent her bilgiyi doğru alana kendisi yerleştirir, siteye girecek metinleri sitenin dilinde yazar. Eksik kalanları uydurmaz; 2. tur formuna ekler." }),
      h("label", { for: "free", class: "sr-only" }, "Müşteri bilgileri"),
      free,
    ),
    compact ? null : uploadCard(slug, d.inbox, d.assets, d.logo),
    h("details", { class: "card" },
      h("summary", { style: "cursor:pointer;font-weight:600" }, `Soru soru gir (isteğe bağlı) · ${round}. tur, ${q.questions.length} soru`),
      h("p", { class: "muted small", style: "margin-top:0.6rem", text: "Müşteri formu soru soru cevapladıysa kullan. Boş bıraktıkların atlanır; 'please suggest' dediyse aynen yaz." }),
      ...qs,
      extras.length > 0 ? h("h3", { text: "Sektöre özel", style: "margin-top:1rem" }) : null, ...extras,
      later.length > 0 ? h("fieldset", { style: "margin-top:1rem" }, h("legend", { text: "İleride ilgilenebilecekleri" }), ...later) : null,
    ),
    h("section", { class: "card row" },
      h("button", { class: "btn btn-primary btn-lg", type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "answers", {
        answers: draft.answers,
        extras: q.extras.map((question, i) => ({ question, answer: draft.extras[i] || "" })),
        later: [...draft.later],
        freeText: draft.freeText,
      }) }, "Agent'a işlet"),
      h("span", { class: "muted small", text: "Agent sadece fabrika araçlarını kullanır; dosya düzenleyemez, komut çalıştıramaz, yayın yapamaz." }),
    ),
  );
}

function uploadCard(slug, inbox, assets = [], logo = null) {
  const list = h("ul", { class: "files thumbs" });
  let current = { inbox, assets, logo };
  // Every uploaded (inbox) and saved (assets) image, with "Logo olarak kullan": Eren decides, not the agent.
  const draw = () => {
    const rows = [
      ...current.assets.map((f) => ({ ...f, from: "assets", state: "Sitede" })),
      ...current.inbox.filter((f) => !current.assets.some((a) => a.name === f.name || a.name.endsWith(`-${f.name}`))).map((f) => ({ ...f, from: "inbox", state: "Yüklendi, agent kaydedecek" })),
    ];
    if (!rows.length) { list.replaceChildren(h("li", { class: "muted small", text: "Henüz dosya yok." })); return; }
    list.replaceChildren(...rows.map((f) => {
      const isLogo = current.logo === `assets/${f.name}`;
      return h("li", { class: isLogo ? "is-logo" : "" },
        h("img", { src: `/api/clients/${slug}/${f.from}/${encodeURIComponent(f.name)}`, alt: "", loading: "lazy" }),
        h("div", { class: "meta" }, h("span", { text: f.name }), h("span", { class: "muted small", text: `${Math.ceil(f.bytes / 1024)} KB · ${f.state}` })),
        isLogo
          ? h("span", { class: "badge ok", text: "Müşteri logosu" })
          : h("button", { class: "btn btn-sm", type: "button", disabled: isBusy(), onclick: async () => {
              const r = await guarded(() => api("POST", `/api/clients/${slug}/logo`, { name: f.name, from: f.from }));
              if (!r) return;
              current = { ...current, logo: r.logo, assets: current.assets.some((a) => a.name === r.logo.slice(7)) ? current.assets : [...current.assets, { name: r.logo.slice(7), bytes: f.bytes }] };
              draw();
              toast("Logo kaydedildi. Siteye uygulamak için Marka sekmesinden 'Markayla yeniden tasarla'.");
            } }, "Logo olarak kullan"));
    }));
  };
  draw();
  const input = h("input", { type: "file", multiple: true, accept: "image/png,image/jpeg,image/webp,image/avif,image/svg+xml", id: "files", class: "sr-only" });
  const upload = async (files) => {
    let ok = 0;
    for (const file of files) {
      const res = await guarded(() => api("PUT", `/api/clients/${slug}/inbox/${encodeURIComponent(file.name)}`, file, true));
      if (res) { ok++; current = { ...current, inbox: res.inbox }; draw(); }
    }
    // Only report what really arrived; failures already showed their own error.
    if (ok) toast(`${ok} dosya yüklendi. Logoysa yanındaki "Logo olarak kullan"a bas.`);
  };
  input.addEventListener("change", () => upload([...input.files]));
  const drop = h("div", { class: "drop" }, "Logo ve fotoğrafları buraya sürükleyin ya da ", h("label", { for: "files", style: "display:inline;text-decoration:underline;cursor:pointer" }, "dosya seçin"), input);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); upload([...e.dataTransfer.files]); });
  return h("section", { class: "card" }, h("h2", { text: "Dosyalar" }), h("p", { class: "muted small", style: "margin-bottom:0.7rem", text: "PNG, JPG, WebP, AVIF ya da SVG. Dosya içeriği kontrol edilir; zararlı SVG reddedilir." }), drop, list);
}

// ---------------------------------------------------------------- tab: content review

function tabContent(body, d) {
  const section = h("section", { class: "card content-view stack" });
  for (const [locale, c] of Object.entries(d.content)) {
    if (!c) { section.append(h("p", { class: "muted", text: `${LANG_NAMES[locale] || locale}: henüz metin yok.` })); continue; }
    const rows = [
      ["Slogan", c.tagline], ["Hero başlık", c.hero?.title], ["Hero alt metin", c.hero?.subtitle], ["Buton", c.hero?.ctaLabel],
      ["Hakkımızda", c.about ? `${c.about.title}\n${c.about.body}` : ""],
      ["Hizmetler", (c.services || []).map((s) => `• ${s.title}${s.price ? ` (${s.price})` : ""}: ${s.description}`).join("\n")],
      ["Yorumlar", (c.testimonials || []).map((t) => `“${t.quote}” ${t.author}`).join("\n")],
      ["SSS", (c.faq || []).map((f) => `${f.question}\n  ${f.answer}`).join("\n")],
      ["İletişim", c.contact ? `${c.contact.title}\n${c.contact.intro}` : ""],
      ["SEO", c.seo?.home ? `${c.seo.home.title}\n${c.seo.home.description}` : ""],
    ].filter(([, v]) => v);
    section.append(h("h3", { text: LANG_NAMES[locale] || locale }), h("dl", {}, ...rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })])));
  }
  body.append(section);
}

// ---------------------------------------------------------------- tab: build

function tabBuild(body, d) {
  const slug = d.status.slug;
  const b = d.status.lastBuild;
  const busy = isBusy();
  body.append(h("section", { class: "card stack" },
    h("h2", { text: "Kalite kontrolü" }),
    h("p", { class: "muted", text: b ? `Son oluşturma: ${time(b.at)} · ${b.passed ? "kontroller geçti" : "bazı kontroller geçmedi"}` : "Site henüz oluşturulmadı." }),
    h("div", { class: "row" },
      h("button", { class: "btn", type: "button", disabled: busy, onclick: () => runTask(slug, "build", {}) }, "Siteyi yeniden oluştur"),
      h("button", { class: "btn", type: "button", disabled: busy, onclick: () => runAgent(slug, "fix-build", {}) }, "Hataları agent düzeltsin"),
    ),
  ));
  if (d.qualityReport) body.append(qualityTable(d.qualityReport));
  body.append(h("details", { class: "card advanced" }, h("summary", { text: "Onaylamadan önce bakılacaklar" }),
    h("ul", { style: "margin:0;padding-inline-start:1.2rem" }, ...[
      "5 saniyede işletmenin ne yaptığı ve sonra ne yapılacağı anlaşılıyor.",
      "Her sayfada tek net çağrı; iletişim en fazla bir dokunuş uzakta.",
      "Bölümler ne boş ne kalabalık; boşluklar tutarlı.",
      "Logo, renkler ve ton her sayfada aynı.",
      "Sektöre uygun hissettiriyor.",
      "Aynı şablondan başka bir siteyle yan yana belirgin şekilde farklı.",
      "Telefonda ve masaüstünde bakıldı; Lighthouse elle çalıştırıldı.",
    ].map((t) => h("li", { text: t })))));
}

/** Short Turkish names for the open questions (the questions themselves are written for the client, in English). */
const MISSING_TR = {
  "business-name": "İşletmenin tam adı",
  services: "Hizmetler / ürünler (3–8 tane, fiyatlarıyla)",
  audience: "Hedef müşteri ve bölge",
  logo: "Logo (yoksa yazı logo yapılır)",
  "brand-colours": "Marka renkleri (yoksa agent seçer)",
  tone: "Sitenin havası (samimi, premium…)",
  pages: "Hangi sayfalar olsun",
  "contact-details": "E-posta, telefon, adres, saatler",
  whatsapp: "WhatsApp numarası",
  languages: "Ek dil",
  about: "Hikâye: nasıl başladı, farkı ne",
  photos: "Fotoğraflar",
  "testimonials-faq": "Müşteri yorumları ve sık sorulanlar",
  "form-recipient": "Form mesajlarının gideceği e-posta",
  "maps-booking": "Google Maps / online randevu linki",
  social: "Sosyal medya linkleri",
  domain: "Alan adı",
  legal: "Şirket bilgileri (unvan, numara, adres)",
  "style-references": "Beğendiği / beğenmediği siteler",
  "ai-crawlers": "Yapay zekâ aramalarına açık mı",
  rights: "Logo ve fotoğraf kullanım izni",
  approver: "Siteyi kim onaylayacak",
};

/** Check names from the quality report, in plain Turkish for the panel. */
const CHECK_NAMES = [
  [/^Config and content schema/, "Bilgiler eksiksiz"],
  [/^Contrast: body/, "Yazı okunurluğu"],
  [/^Contrast: button/, "Buton okunurluğu"],
  [/^Contrast: accent/, "Vurgu rengi okunurluğu"],
  [/^Referenced images/, "Görseller yerinde"],
  [/^Legal details/, "Yasal bilgiler"],
  [/^Locales have/, "Diller aynı içerikte"],
  [/^Contact form/, "İletişim formu"],
  [/^(Custom site build|Template build)/, "Site oluşturuldu"],
  [/^Build output/, "Sayfalar üretildi"],
  [/^HTML basics/, "Başlık, açıklama, alt metin"],
  [/^HTML warnings/, "Sayfa uyarıları"],
  [/^Custom code safety/, "Kod güvenliği"],
  [/^Brand identity/, "Marka kimliği"],
  [/^Fonts have lowercase/, "Yazı tipi"],
  [/^Impeccable/, "Tasarım kontrolü (Impeccable)"],
  [/^Inputs unchanged/, "Oluştururken değişiklik olmadı"],
];

function qualityTable(md) {
  const rows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Check") && !l.startsWith("| ---")).map((l) => l.slice(2, -2).split(" | "));
  const cls = { PASS: "ok", FAIL: "bad", WARN: "warn", SKIP: "skip" };
  const names = { PASS: "geçti", FAIL: "kaldı", WARN: "uyarı", SKIP: "atlandı" };
  const tr = (n) => {
    for (const [re, t] of CHECK_NAMES) if (re.test(n)) return t;
    return n;
  };
  const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
  for (const [, r] of rows) counts[r] = (counts[r] || 0) + 1;
  const issues = rows.filter(([, r]) => r === "FAIL" || r === "WARN");
  return h("section", { class: "card stack" },
    h("div", { class: "row" }, h("span", { class: "badge ok", text: `${counts.PASS} geçti` }), counts.WARN ? h("span", { class: "badge warn", text: `${counts.WARN} uyarı` }) : null, counts.FAIL ? h("span", { class: "badge bad", text: `${counts.FAIL} kaldı` }) : null),
    issues.length ? h("ul", { class: "issues" }, ...issues.map(([n, r, detail]) => h("li", {}, h("span", { class: `badge ${cls[r]}`, text: names[r] }), h("strong", { text: tr(n) }), h("span", { class: "muted small", text: (detail || "").replace(/\\\|/g, "|") })))) : h("p", { class: "muted small", text: "Sorun yok." }),
    h("details", {}, h("summary", { class: "small", text: "Bütün kontroller" }),
    h("div", { style: "overflow-x:auto" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Kontrol" }), h("th", { text: "Sonuç" }), h("th", { text: "Ayrıntı" }))),
      h("tbody", {}, ...rows.map(([name, result, detail]) => h("tr", {}, h("td", { text: tr(name) }), h("td", {}, h("span", { class: `badge ${cls[result] || "skip"}`, text: names[result] || result })), h("td", { text: (detail || "").replace(/\\\|/g, "|") }))))))));
}

// ---------------------------------------------------------------- tab: approvals and publish

function tabPublish(body, d) {
  const slug = d.status.slug;
  const dry = h("input", { type: "checkbox", id: "dry" });
  const busy = isBusy();
  const ld = d.lastDeploy;
  const site = d.approvals.filter((a) => a.kind !== "production");
  const prod = d.approvals.find((a) => a.kind === "production");
  const siteOk = site.every((a) => a.valid);
  body.append(
    h("section", { class: "card stack" },
      h("h2", { text: "Onay" }),
      h("p", { class: "muted small", text: "Onayı sadece sen verirsin: panel, başlattığın terminalde yazan onay kodunu sorar (agent bu kodu göremez). Sitede her değişiklik onayı sıfırlar." }),
      h("ol", { class: "approve-steps" },
        h("li", { class: siteOk ? "ok" : "" },
          h("div", {}, h("strong", { text: "1. Siteyi onayla" }), h("span", { class: "muted small", text: " metin ve görünüm birlikte" })),
          siteOk ? h("span", { class: "badge ok", text: "onaylandı" }) : h("button", { class: "btn btn-ok", type: "button", disabled: !d.distReady || isBusy(), onclick: () => approveDialog(d, "site") }, "Onayla")),
        prod && h("li", { class: prod.valid ? "ok" : "" },
          h("div", {}, h("strong", { text: "2. Yayın onayı" }), h("span", { class: "muted small", text: " müşteri önizlemeyi beğenince" })),
          prod.valid ? h("span", { class: "badge ok", text: "onaylandı" }) : h("button", { class: "btn btn-ok", type: "button", disabled: !siteOk || isBusy(), onclick: () => approveDialog(d, "production") }, "Yayın onayı ver")),
      ),
      h("details", { class: "small" }, h("summary", { text: "Terminalden onaylamak istersen (komutlar)" }),
      h("ul", { class: "approvals" }, ...d.approvals.map((a) =>
        h("li", {},
          h("strong", { text: APPROVAL_NAMES[a.kind] }),
          h("span", { class: `badge ${a.valid ? "ok" : "skip"}`, text: a.valid ? `verildi · ${time(a.at)}` : "yok" }),
          h("span", { class: "cmd" }, h("code", { text: a.command }), copyButton(a.command)),
        )))),
      h("button", { class: "btn btn-sm", type: "button", onclick: render }, "Onayı verdim, yenile"),
    ),
    h("section", { class: "card stack" },
      h("h2", { text: "Yayın" }),
      h("p", { class: "muted small", text: "Önizleme: site onayından sonra geçici bir adreste açılır, linki müşteriye gönder. Canlı: ayrıca yayın onayı gerekir." }),
      h("label", { class: "choice", for: "dry" }, dry, "Deneme (hiçbir şey yüklemeden kontrol et)"),
      h("div", { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", disabled: busy, onclick: () => runTask(slug, "deploy", { target: "preview", dryRun: dry.checked }) }, "Önizleme yayınla"),
        h("button", { class: "btn btn-danger", type: "button", disabled: busy, onclick: () => deployProduction(slug, dry.checked) }, "Canlıya al"),
      ),
      ld && h("p", { class: "small" }, `Son yayın: ${ld.target === "production" ? "canlı" : "önizleme"} · ${time(ld.at)} `, ld.url && h("a", { href: ld.url, target: "_blank", rel: "noopener", text: ld.url })),
    ),
  );
}

// ---------------------------------------------------------------- settings: publishing setup

/** Step-by-step Cloudflare setup with live checks. Only whether a value is set is ever shown, never the value. */
async function renderSettings() {
  const st = await guarded(() => api("GET", "/api/cloudflare"));
  const ok = (b) => h("span", { class: `badge ${b ? "ok" : "warn"}`, text: b ? "tamam" : "eksik" });
  const result = h("p", { class: "small", role: "status" });
  const test = async (btn) => {
    btn.disabled = true; result.textContent = "Deneniyor…";
    const r = await guarded(() => api("POST", "/api/cloudflare/test"));
    btn.disabled = false;
    if (r) { result.textContent = r.message; result.className = `small ${r.ok ? "ok-text" : "err"}`; }
  };
  const lines = 'export SF_CF_MANAGED_API_TOKEN="buraya-token"\nexport SF_CF_MANAGED_ACCOUNT_ID="buraya-hesap-kimligi"';
  const ready = st && st.managed.token && st.managed.accountId;
  return h("section", { class: "settings stack", style: "max-width:46rem" },
    h("h1", { text: "Ayarlar" }),
    h("section", { class: "card stack" },
      h("div", { class: "row", style: "justify-content:space-between" }, h("h2", { text: "Yayın: Cloudflare bağlantısı" }), ready ? h("span", { class: "badge ok", text: "hazır" }) : h("span", { class: "badge warn", text: "kurulmadı" })),
      h("p", { class: "muted small", text: "Önizleme linki ve canlı yayın için bir kez yapılır. Token panelde ya da dosyada saklanmaz; sadece terminal ortamında durur ve agent'a hiç verilmez." }),
      st && h("ul", { class: "checks" },
        h("li", {}, ok(st.managed.token), " API token (SF_CF_MANAGED_API_TOKEN)"),
        h("li", {}, ok(st.managed.accountId), " Hesap kimliği (SF_CF_MANAGED_ACCOUNT_ID)"),
        h("li", {}, ok(st.wrangler), " Yayın aracı (wrangler)"),
      ),
      h("ol", { class: "setup-steps" },
        h("li", {}, h("strong", { text: "Cloudflare hesabı aç " }), "(ücretsiz): ", h("a", { href: "https://dash.cloudflare.com/sign-up", target: "_blank", rel: "noopener", text: "dash.cloudflare.com" })),
        h("li", {}, h("strong", { text: "Token oluştur: " }), "Profil → API Tokens → Create Token → ", h("em", { text: "Edit Cloudflare Workers" }), " şablonu → Continue → Create. Çıkan token'ı kopyala (bir kez gösterilir). ", h("a", { href: "https://dash.cloudflare.com/profile/api-tokens", target: "_blank", rel: "noopener", text: "Token sayfası" })),
        h("li", {}, h("strong", { text: "Hesap kimliğini al: " }), "Cloudflare'de Workers & Pages sayfasının sağında ", h("em", { text: "Account ID" }), " yazar."),
        h("li", {}, h("strong", { text: "WSL'de kaydet: " }), h("code", { text: "nano ~/.bashrc" }), " ile dosyanın en altına şu iki satırı ekle (tırnak içine kendi değerlerini yaz), kaydet:",
          h("div", { class: "copybox" }, h("pre", { text: lines }), copyButton(lines))),
        h("li", {}, h("strong", { text: "Paneli yeniden başlat: " }), "terminalde Ctrl+C, sonra ", h("code", { text: "source ~/.bashrc && npm run panel" }), "."),
        h("li", {}, h("strong", { text: "Dene: " }), h("button", { class: "btn btn-sm", type: "button", onclick: (e) => test(e.currentTarget) }, "Bağlantıyı test et"), " ", result),
      ),
      h("p", { class: "muted small", text: "Token'ı kimseyle, bana da gönderme. Sızdığını düşünürsen Cloudflare'de silip yenisini oluştur." }),
    ),
    h("section", { class: "card stack" },
      h("h2", { text: "Onay kodu" }),
      h("p", { class: "muted small", text: "Panelden onay verirken sorulan 6 haneli kod, paneli başlattığın terminalde \"Onay kodu\" satırında yazar. Her başlatmada değişir; 5 yanlış denemede onay kilitlenir (paneli yeniden başlat)." }),
    ),
    budgetCard(),
    webResearchCard(),
    senderCard(),
    backupCard(),
    h("section", { class: "card stack" },
      h("h2", { text: "Bildirimler" }),
      h("p", { class: "muted small", text: "Uzun işler bitince ses çalar; panel arka plandaysa bilgisayar bildirimi gelir." }),
      h("div", { class: "row" },
        h("button", { class: "btn btn-sm", type: "button", onclick: () => { askNotifyPermission(); toast("Tarayıcı izin sorabilir; izin ver."); } }, "Bildirime izin ver"),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => chime(true) }, "Sesi dene"),
      ),
    ),
  );
}

// ---------------------------------------------------------------- budget

const MODE_TR = { economy: "Ekonomik", balanced: "Dengeli", premium: "Premium" };
const fmtTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n || 0));
const usageLine = (job) => job.tokens ? h("span", { class: "usage", title: "Ağırlıklı token: önbellekten okunan 1/10 sayılır" }, `${fmtTokens(job.tokens)} token${job.model ? ` · ${job.model}` : ""}${job.usage?.costUsd ? ` · ~$${job.usage.costUsd.toFixed(2)}` : ""}`) : null;

/** Budget mode, monthly budget and this month's use. */
function budgetCard() {
  const mode = h("select", { id: "bd-mode" }, ...Object.entries(MODE_TR).map(([k, v]) => h("option", { value: k }, v)));
  const monthly = h("input", { id: "bd-month", type: "number", min: 0, step: 1, placeholder: "0 = sınırsız" });
  const meter = h("div", { class: "meter" }, h("span"));
  const stats = h("p", { class: "small", role: "status" });
  const profile = h("ul", { class: "small muted profile" });
  let modes = [];
  const showProfile = () => {
    const m = modes.find((x) => x.id === mode.value);
    if (!m) return;
    const skills = { full: "skill'ler tam yüklenir", search: "skill'lerde sadece arama", none: "skill yok" }[m.skills];
    profile.replaceChildren(
      h("li", { text: `Tasarım işleri: ${m.design.model}, en fazla ${m.design.maxTurns} adım, iş başına ${fmtTokens(m.design.tokenCap)} token` }),
      h("li", { text: `Düzenlemeler: ${m.edit.model}, en fazla ${m.edit.maxTurns} adım, iş başına ${fmtTokens(m.edit.tokenCap)} token` }),
      h("li", { text: `${skills} · internet araştırması ${m.research ? "açık" : "kapalı"} · ekran görüntüsüne ${m.screenshots ? "bakar" : "bakmaz"}` }));
  };
  mode.addEventListener("change", showProfile);
  const load = () => api("GET", "/api/usage").then((u) => {
    modes = u.modes;
    mode.value = u.mode;
    monthly.value = u.monthlyBudget ? String(Math.round(u.monthlyBudget / 1e6)) : "";
    const pct = u.monthlyBudget ? Math.min(100, Math.round((u.monthTokens / u.monthlyBudget) * 100)) : 0;
    meter.firstChild.style.width = `${pct}%`;
    meter.className = `meter ${pct >= 90 ? "bad" : pct >= 70 ? "warn" : ""}`;
    stats.textContent = `Bu ay: ${fmtTokens(u.monthTokens)} token, ${u.monthJobs} iş${u.monthCostUsd ? `, tahmini ~$${u.monthCostUsd.toFixed(2)}` : ""}${u.monthlyBudget ? ` · bütçe ${fmtTokens(u.monthlyBudget)} (%${pct})` : ""}`;
    showProfile();
  }).catch(() => {});
  load();
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    const r = await guarded(() => api("PUT", "/api/settings", { budget: { mode: mode.value, monthlyTokens: Math.max(0, Math.round(Number(monthly.value || 0) * 1e6)) } }));
    if (r) { toast("Bütçe kaydedildi; bir sonraki işten itibaren geçerli."); load(); }
  } },
    h("h2", { text: "Token bütçesi" }),
    h("p", { class: "muted small", text: "Mod, her işte hangi modelin, kaç adımın ve en fazla kaç token'ın kullanılacağını belirler. Tavanı aşan iş durdurulur (yazdıkları kalır). Müşteri bazında farklı mod Bilgiler → iş bilgilerinden seçilir." }),
    h("label", { for: "bd-mode" }, "Varsayılan mod", mode), profile,
    h("label", { for: "bd-month" }, "Aylık bütçe (milyon token; 0 = sınırsız)", monthly),
    meter, stats,
    h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")));
}

/** Who proposals are from. */
function senderCard() {
  const f = (id, label, attrs = {}) => { const i = h("input", { id: `snd-${id}`, ...attrs }); return [i, h("label", { for: `snd-${id}` }, label, i)]; };
  const [name, nameL] = f("name", "Ad / firma", { maxlength: 80 });
  const [email, emailL] = f("email", "E-posta", { type: "email", maxlength: 120 });
  const [phone, phoneL] = f("phone", "Telefon", { type: "tel", maxlength: 40 });
  const [web, webL] = f("web", "Web", { maxlength: 120 });
  api("GET", "/api/settings").then((s) => { name.value = s.sender?.name || ""; email.value = s.sender?.email || ""; phone.value = s.sender?.phone || ""; web.value = s.sender?.web || ""; }).catch(() => {});
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    if (await guarded(() => api("PUT", "/api/settings", { sender: { name: name.value, email: email.value, phone: phone.value, web: web.value } }))) toast("Teklif bilgileri kaydedildi.");
  } }, h("h2", { text: "Teklif" }), h("p", { class: "muted small", text: "Tekliflerin altında görünen gönderen bilgileri." }), nameL, emailL, phoneL, webL, h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")));
}

/** Backups to a folder Eren chooses; automatic after jobs (at most every 30 minutes) and on demand. */
function backupCard() {
  const dir = h("input", { id: "bk-dir", placeholder: "/mnt/c/Users/eeren/OneDrive/SiteFactory-Yedek", maxlength: 400 });
  const list = h("ul", { class: "files" });
  const status = h("p", { class: "small", role: "status" });
  const load = () => api("GET", "/api/backups").then((r) => {
    dir.value = r.dir || "";
    list.replaceChildren(...r.backups.slice(0, 5).map((b) => h("li", {}, h("span", { text: b.file }), h("span", { class: "muted", text: `${(b.bytes / 1048576).toFixed(1)} MB · ${new Date(b.at).toLocaleString("tr-TR")}` }))));
    if (!r.backups.length) list.replaceChildren(h("li", { class: "muted small", text: r.dir ? "Henüz yedek yok." : "Yedekleme kapalı." }));
  }).catch(() => {});
  load();
  const now = h("button", { class: "btn", type: "button", onclick: async () => {
    now.disabled = true; status.textContent = "Yedek alınıyor…";
    const r = await guarded(() => api("POST", "/api/backups"));
    now.disabled = false; status.textContent = r ? `Yedek alındı: ${r.file}` : "";
    load();
  } }, "Şimdi yedekle");
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    if (await guarded(() => api("PUT", "/api/settings", { backupDir: dir.value.trim() }))) { toast(dir.value.trim() ? "Yedek klasörü kaydedildi." : "Otomatik yedek kapatıldı."); load(); }
  } },
    h("h2", { text: "Yedek" }),
    h("p", { class: "muted small", text: "Bütün müşteriler, sürüm geçmişleri, tasarım kütüphanesi ve ayarlar tek dosya (.tar.gz) olarak bu klasöre yedeklenir. İş bittikçe otomatik (en sık 30 dakikada bir); son 10 yedek tutulur. OneDrive ya da Google Drive klasörü seçersen bulutta da durur." }),
    h("label", { for: "bk-dir" }, "Klasör (WSL yolu; Windows'taki C:\\Users\\… = /mnt/c/Users/…)", dir),
    h("div", { class: "row" }, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet"), now),
    status, list);
}

/** The agent's web access (search and page reading), on by default; applies from the next job. */
function webResearchCard() {
  const box = h("input", { type: "checkbox", id: "web-research", disabled: true });
  const note = h("p", { class: "small muted", role: "status" });
  api("GET", "/api/settings").then((s) => { box.checked = s.webResearch; box.disabled = false; }).catch(() => (note.textContent = "Ayar okunamadı."));
  box.addEventListener("change", async () => {
    box.disabled = true;
    const s = await guarded(() => api("PUT", "/api/settings", { webResearch: box.checked }));
    box.disabled = false;
    if (s) { box.checked = s.webResearch; note.textContent = s.webResearch ? "Açık: bir sonraki işten itibaren agent araştırma yapabilir." : "Kapalı: agent sadece senin verdiğin bilgilerle çalışır."; }
  });
  return h("section", { class: "card stack" },
    h("h2", { text: "İnternet araştırması" }),
    h("p", { class: "muted small", text: "Agent işletmeyi internette ve haritalarda arar, sektördeki iyi siteleri inceler; bulduklarını kaynaklarıyla gösterir, emin olmadığını sana sorar. Okuduğu sayfalardaki yazılar sadece bilgi sayılır; yayın yapamaz, onay veremez, anahtarları göremez." }),
    h("label", { for: "web-research", class: "check" }, box, " Agent internette araştırma yapabilsin"),
    note,
  );
}

// ---------------------------------------------------------------- job progress and notifications

const PHASE_LABELS = { reading: "Bilgileri okuyor", saving: "Bilgileri kaydediyor", design: "Tasarımı araştırıyor", brand: "Markayı tasarlıyor", pages: "Sayfaları yazıyor", checking: "Kontrol ediyor" };
const PHASE_ORDER = ["reading", "saving", "design", "brand", "pages", "checking"];

function fmtDuration(secs) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return m ? `${m} dk ${s.toString().padStart(2, "0")} sn` : `${s} sn`;
}

/** Where a running agent job is: plain stages, elapsed time and a rough estimate from earlier runs. */
function jobProgress(job) {
  const typical = (state.typical || {})[job.kind];
  const now = PHASE_ORDER.indexOf(job.phase);
  const el = h("div", { class: "progress", id: "job-progress", "data-started": job.startedAt, "data-typical": typical || "" },
    h("ol", { class: "phases" }, ...PHASE_ORDER.map((p, i) => h("li", { class: i < now ? "done" : i === now ? "now" : "" }, PHASE_LABELS[p]))),
    h("p", { class: "small muted" },
      h("span", { id: "job-elapsed", text: `Geçen süre ${fmtDuration((Date.now() - Date.parse(job.startedAt)) / 1000)}` }),
      job.filesWritten ? ` · ${job.filesWritten} dosya yazıldı` : "",
      job.skillsUsed?.length ? ` · skill: ${job.skillsUsed.join(", ")}` : "",
      typical ? ` · genelde ${fmtDuration(typical)} sürer` : ""),
    h("div", { class: "bar" }, h("span", { id: "job-bar" })),
  );
  return el;
}

/** Ticks the elapsed time and the bar once a second while a job runs. */
setInterval(() => {
  const p = $("#job-progress");
  if (!p) return;
  const secs = (Date.now() - Date.parse(p.dataset.started)) / 1000;
  const typical = Number(p.dataset.typical) || 0;
  const el = $("#job-elapsed");
  if (el) el.textContent = `Geçen süre ${fmtDuration(secs)}`;
  const bar = $("#job-bar");
  // Never shows 100% before the job really ends; slows down past the usual time instead.
  if (bar && typical) bar.style.width = `${Math.min(95, (secs / typical) * 85)}%`;
}, 1000);

/** Asked once, on a click that starts a job (browsers only allow it after a user action). */
function askNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
}

function chime(ok) {
  try {
    const ctx = new AudioContext();
    const notes = ok ? [660, 880] : [440, 330];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch { /* no audio */ }
}

/** A finished job: sound, a system notification when the panel is in the background, and the tab title. */
function announceFinished(job) {
  const ok = job.status === "succeeded";
  const name = state.clients.find((c) => c.slug === job.slug)?.name || job.slug;
  chime(ok);
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification(ok ? `${name}: hazır` : `${name}: tamamlanamadı`, { body: `${job.title} ${ok ? "bitti. Panelde sonucu gör." : "başarısız oldu."}`, tag: job.id });
  }
  if (document.hidden) {
    const original = "Site Factory";
    document.title = ok ? `✓ ${name} hazır · ${original}` : `✕ ${name} · ${original}`;
    const reset = () => { document.title = original; document.removeEventListener("visibilitychange", reset); };
    document.addEventListener("visibilitychange", reset);
  }
}

// ---------------------------------------------------------------- approval from the panel

/** Folded terminal alternative under an approval button. */
function terminalFold(command) {
  return h("details", { class: "small term-fold" }, h("summary", { text: "Terminalden onaylamak istersen" }), h("div", { class: "cmd" }, h("code", { text: command }), copyButton(command)));
}

/**
 * Asks for the one-time code printed in the panel's terminal and approves exactly what is on screen:
 * the content and build fingerprints go with the request, so a change in the meantime approves nothing.
 */
function approveDialog(d, kind) {
  const slug = d.status.slug;
  const what = kind === "site" ? "Siteyi onayla (metin + görünüm)" : "Yayın onayı";
  const code = h("input", { id: "approve-code", inputmode: "numeric", autocomplete: "off", maxlength: 6, pattern: "[0-9]{6}", placeholder: "6 haneli kod", class: "code-input" });
  const err = h("p", { class: "err", role: "alert" });
  const dialog = h("dialog", { class: "approve-dialog", "aria-labelledby": "approve-title" });
  const close = () => { dialog.close(); dialog.remove(); };
  const submit = async (e) => {
    e.preventDefault();
    err.textContent = "";
    const res = await fetch(`/api/clients/${slug}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, code: code.value, pins: { hash: d.status.contentHash, distHash: d.status.lastBuild?.distHash ?? null } }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { err.textContent = data.error || "Onay verilemedi."; code.select(); return; }
    close();
    toast(kind === "site" ? "Site onaylandı." : "Yayın onayı verildi.");
    render();
  };
  dialog.append(h("form", { method: "dialog", onsubmit: submit },
    h("h2", { id: "approve-title", text: what }),
    h("p", { class: "muted small", text: `${d.business.name || slug}: şu an ekranda gördüğün hâli onaylanır. Kod, paneli başlattığın terminalde "Onay kodu" satırında yazıyor.` }),
    h("label", { for: "approve-code" }, "Onay kodu", code),
    err,
    h("div", { class: "row" },
      h("button", { class: "btn btn-ok", type: "submit" }, "Onayla"),
      h("button", { class: "btn", type: "button", onclick: close }, "Vazgeç"),
    ),
  ));
  document.body.append(dialog);
  dialog.showModal();
  code.focus();
}

// ---------------------------------------------------------------- actions

async function openPreview(slug) {
  const r = await guarded(() => api("POST", `/api/clients/${slug}/preview`));
  if (r) window.open(r.url, "_blank", "noopener");
}

function deployProduction(slug, dryRun) {
  if (!dryRun && !confirm(`${slug} canlıya alınacak. Emin misiniz?`)) return;
  runTask(slug, "deploy", { target: "production", dryRun });
}

async function archiveClient(slug, stage) {
  const liveNote = stage === "live" ? "\n\nDikkat: site yayında. Arşivlemek siteyi kapatmaz; Cloudflare'de yayında kalır." : "";
  const typed = prompt(`"${slug}" arşivlenecek: listeden kalkar, klasörü sf-clients/_archive altına taşınır (silinmez, geri alınabilir).${liveNote}\n\nOnaylamak için kısa adı yazın: ${slug}`);
  if (typed === null) return;
  if (typed.trim() !== slug) { toast("Kısa ad eşleşmedi, hiçbir şey yapılmadı.", true); return; }
  const r = await guarded(() => api("DELETE", `/api/clients/${slug}`, { confirm: slug }));
  if (r) { toast(`${slug} arşivlendi (${r.folder}).`); location.hash = "#/"; }
}

async function runAgent(slug, kind, payload) {
  askNotifyPermission();
  const job = await guarded(() => api("POST", `/api/clients/${slug}/agent/${kind}`, payload));
  if (!job) return false;
  toast("Agent çalışıyor. Bitince ses ve bildirim gelir.");
  await jobStarted(job);
  return true;
}

async function runTask(slug, kind, payload) {
  const job = await guarded(() => api("POST", `/api/clients/${slug}/${kind}`, payload));
  if (job) await jobStarted(job);
}

async function jobStarted(job) {
  state.running = job;
  setStatus(job);
  const r = route();
  if (r.slug === job.slug && r.tab !== "akis") location.hash = `#/c/${job.slug}/akis`;
  else await render();
}

async function cancelJob(id) {
  if (!confirm("Çalışan agent işi durdurulsun mu? O ana kadar kaydedilenler kalır.")) return;
  await guarded(() => api("POST", `/api/jobs/${id}/cancel`));
}

function startPolling() {
  clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(async () => {
    const j = state.running;
    if (!j || j.status !== "running") { state.pollTimer = null; return; }
    const next = await api("GET", `/api/jobs/${j.id}?since=${state.logSince}`).catch(() => null);
    if (!next) { startPolling(); return; }
    const lines = $("#live-lines");
    if (lines && next.log.length) appendLiveLines(lines, next.log);
    state.logSince = next.logTotal;
    if (next.status === "running") {
      state.running = { ...next, log: [] };
      const old = $("#job-progress");
      if (old && (old.dataset.phase !== String(next.phase) || old.dataset.files !== String(next.filesWritten || 0))) {
        const fresh = jobProgress(next);
        fresh.dataset.phase = String(next.phase);
        fresh.dataset.files = String(next.filesWritten || 0);
        old.replaceWith(fresh);
      }
      startPolling();
      return;
    }
    announceFinished(next);
    state.running = null;
    state.pollTimer = null;
    setStatus(null);
    toast(next.status === "succeeded" ? `${next.title}: tamamlandı.` : `${next.title}: ${STATUS_BADGE[next.status]?.[1] || next.status}.`, next.status !== "succeeded");
    render();
  }, POLL_MS);
}

// ---------------------------------------------------------------- start

(async () => {
  await refreshStatus();
  render();
})();
