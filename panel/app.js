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
const TABS = [["akis", "Akış"], ["sorular", "Sorular"], ["cevaplar", "Cevaplar"], ["metinler", "Metinler"], ["build", "Build"], ["yayin", "Onay ve yayın"]];
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
  pill.querySelector(".label").textContent = job ? `${job.title} · ${job.slug}` : "Agent boşta";
}

async function refreshStatus() {
  const m = await api("GET", "/api/meta").catch(() => null);
  if (!m) return;
  const before = state.running?.id;
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
  if (parts[0] === "c" && parts[1]) return { view: "client", slug: parts[1], tab: parts[2] || "akis" };
  return { view: "home" };
}

async function render() {
  await loadClients();
  const r = route();
  const view = $("#view");
  if (r.view === "new") view.replaceChildren(renderNew());
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
  const list = state.clients.filter((c) => !state.search || c.slug.includes(state.search));
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
            avatar(c.slug, c.slug, false, isBusy() && state.running.slug === c.slug),
            h("span", { class: "meta" }, h("span", { class: "name", text: c.slug }), h("span", { class: "sub", text: stageInfo(c.stage).long })),
          )),
      ];
    }),
  );
}

// ---------------------------------------------------------------- home and new client

function renderHome() {
  return h("section", { class: "empty" },
    h("h1", { text: state.clients.length ? "Bir müşteri seçin" : "İlk müşteriyi ekleyin" }),
    h("p", { class: "muted", text: state.clients.length ? "Soldan bir müşteri seçin. 'Senin sıran' grubundakiler sizden bir adım bekliyor." : "'Yeni müşteri' ile başlayın: panel soru formunu hazırlar, cevapları agent işler, site şablondan çıkar." }),
    !state.clients.length && h("p", { style: "margin-top:1.2rem" }, h("a", { class: "btn btn-primary btn-lg", href: "#/new" }, "Yeni müşteri")),
  );
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
  const info = h("textarea", { id: "nc-info", rows: 7, class: "field", maxlength: 20000, placeholder: "Ör: Diş kliniği, Harbour Dental. Dr. Sarah Lee. NHS ve özel hasta. Beyazlatma, implant, acil randevu. 0161 496 0000, Manchester." });
  const lang = h("select", { id: "nc-lang" }, h("option", { value: "" }, "Sadece İngilizce"), ...Object.entries(LANG_NAMES).filter(([k]) => k !== "en").map(([k, v]) => h("option", { value: k }, `İngilizce + ${v}`)));

  const form = h("form", { class: "card stack", style: "max-width:40rem", onsubmit: async (e) => {
    e.preventDefault();
    const hosting = form.querySelector("input[name=hosting]:checked")?.value;
    const res = await guarded(() => api("POST", "/api/clients", { businessName: name.value.trim(), slug: slug.value.trim(), industry: industry.value.trim(), hostingModel: hosting, extraLocale: lang.value || undefined }));
    if (!res) return;
    toast("Müşteri oluşturuldu.");
    const text = info.value.trim();
    if (!text) { location.hash = `#/c/${res.slug}/akis`; return; }
    location.hash = `#/c/${res.slug}/akis`;
    await runAgent(res.slug, "autopilot", { freeText: text });
  } },
    h("h1", { text: "Yeni müşteri" }),
    h("p", { class: "muted", text: "Adını ve sektörünü yaz. Bildiklerini alttaki kutuya yapıştırırsan site hemen hazırlanmaya başlar." }),
    h("label", { for: "nc-name" }, "İşletme adı", name),
    h("label", { for: "nc-slug" }, "Kısa ad (slug)", h("span", { class: "help", text: "Klasör ve Cloudflare adı olur, sonradan değişmez. Küçük harf, rakam ve tire." }), slug),
    h("label", { for: "nc-industry" }, "Sektör (İngilizce)", h("span", { class: "help", text: "Tasarım önerisi ve sektöre özel sorular buna göre seçilir." }), industry),
    h("fieldset", {}, h("legend", { text: "Barındırma" }),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "hosting", value: "managed", checked: true }), "Bizim Cloudflare hesabımız"),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "hosting", value: "client" }), "Müşterinin kendi hesabı"),
    ),
    h("label", { for: "nc-lang" }, "Dil", lang),
    h("label", { for: "nc-info" }, "Elindeki bilgiler (isteğe bağlı)",
      h("span", { class: "help", text: "Müşteriden ne biliyorsan yapıştır: hizmetler, fiyatlar, iletişim, renkler… Doldurursan site hemen hazırlanmaya başlar; eksik bilgi olursa agent sorar." }),
      info),
    h("div", { class: "row" }, h("button", { class: "btn btn-primary btn-lg", type: "submit" }, "Müşteriyi oluştur")),
  );
  return form;
}

// ---------------------------------------------------------------- client page

async function renderClient(view, slug, tab) {
  const d = await guarded(() => api("GET", `/api/clients/${slug}`));
  if (!d) { view.replaceChildren(renderHome()); return; }
  state.detail = d;
  if (d.running) { state.running = d.running; setStatus(d.running); }
  const stage = d.status.stage;
  const idx = STAGES.findIndex((s) => s.id === stage);
  const name = d.business.name || slug;

  const menu = h("details", { class: "menu" },
    h("summary", { class: "icon-btn", "aria-label": "Diğer işlemler" }, svg(ICON.more, 20, 3)),
    h("div", { class: "menu-items" },
      h("button", { type: "button", disabled: !d.distReady, onclick: () => openPreview(slug) }, "Önizlemeyi aç"),
      h("button", { type: "button", disabled: isBusy(), onclick: () => runTask(slug, "build", {}) }, "Build al"),
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
        h("button", { class: "btn", type: "button", disabled: !d.distReady, onclick: () => openPreview(slug) }, "Önizlemeyi aç"),
        menu,
      ),
    ),
    h("ol", { class: "stepper", "aria-label": `Aşama ${idx + 1} / ${STAGES.length}: ${stageInfo(stage).long}` },
      ...STAGES.map((s, i) => h("li", { class: i < idx ? "done" : i === idx ? "now" : "", "aria-current": i === idx ? "step" : null }, h("span", { class: "bar" }), h("span", { class: "label", text: s.label })))),
    nowCard(d),
    upgradeBanner(d),
    h("nav", { class: "tabs", "aria-label": "Bölümler" }, ...TABS.map(([id, label]) => h("a", { href: `#/c/${slug}/${id}`, "aria-current": id === tab ? "page" : null, text: label }))),
    body,
  );

  if (tab === "sorular") tabQuestions(body, d);
  else if (tab === "cevaplar") await tabAnswers(body, d);
  else if (tab === "metinler") tabContent(body, d);
  else if (tab === "build") tabBuild(body, d);
  else if (tab === "yayin") tabPublish(body, d);
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
        text = "Site Cloudflare'de geçici bir adreste açılır. Müşteri onaylayınca yayın onayını terminalden verirsin.";
        actions = [primary("Önizleme yayınla", () => runTask(slug, "deploy", { target: "preview", dryRun: false }), busy), secondary("Önce dene", () => runTask(slug, "deploy", { target: "preview", dryRun: true }), busy)];
      } else {
        title = "Müşterinin onayını bekle";
        text = "Önizleme yayında. Müşteri onaylayınca yayın onayını terminalden ver.";
        actions = [preview.url && h("a", { class: "btn btn-lg", href: preview.url, target: "_blank", rel: "noopener" }, "Önizleme linki"), preview.url && copyButton(preview.url, "Linki kopyala"), copyButton(cmd("production"), "Onay komutunu kopyala")];
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
    h("p", {}, h("strong", { text: "Yeni şablon hazır. " }), h("span", { text: `Bu site eski şablonda (${d.template}). Yeni şablon sektöre göre kişilik ve animasyonlu motif kullanır; metinler aynı kalır, onaylar sıfırlanır.` })),
    h("button", { class: "btn", type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "upgrade-template", {}) }, "Yeni şablona geç"),
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

  const go = async () => {
    const ok = await runAgent(slug, "autopilot", { freeText: draft.freeText || "" });
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
      h("p", { text: "Telefonda ve bilgisayarda göz at. Değişiklik istersen aşağıdaki kutuya yaz, agent düzeltir. Beğendiysen bu komutu WSL terminalinde site-factory klasöründe çalıştır ve sorulunca kısa adı yaz." }),
    ),
    h("div", { class: "cmd" }, h("code", { text: d.siteApproveCommand }), copyButton(d.siteApproveCommand)),
    h("div", { class: "row" },
      h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => openPreview(slug) }, "Siteye bak"),
      h("button", { class: "btn btn-lg", type: "button", onclick: () => { location.hash = `#/c/${slug}/akis`; setTimeout(() => $("#composer")?.focus(), 80); } }, "Değişiklik iste"),
    ),
  );
}

// ---------------------------------------------------------------- tab: flow (agent conversation)

function tabFlow(body, d) {
  const slug = d.status.slug;
  const feed = h("div", { class: "feed", id: "feed" });
  drawFeed(feed, d);
  const busy = isBusy();
  const composer = h("textarea", { id: "composer", rows: 2, placeholder: "Agent'a talimat yaz: ör. Hero başlığını kısalt, hizmetlere gelinlik temizliğini ekle." });
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
          h("button", { class: "chip", type: "button", disabled: busy, onclick: () => runAgent(slug, "autopilot", {}) }, "Siteyi hazırla"),
          h("button", { class: "chip", type: "button", disabled: busy, onclick: () => runAgent(slug, "design-content", {}) }, "Tasarım ve metinler"),
          h("button", { class: "chip", type: "button", disabled: busy, onclick: () => runTask(slug, "build", {}) }, "Build al"),
          h("button", { class: "chip", type: "button", disabled: busy, onclick: () => runAgent(slug, "fix-build", {}) }, "Build hatalarını düzelt"),
        ),
        h("label", { for: "composer", class: "sr-only" }, "Agent'a talimat"),
        h("div", { class: "box" }, composer, h("button", { class: "send", type: "submit", "aria-label": "Gönder (Ctrl+Enter)", disabled: busy }, svg(ICON.send, 18, 2.4))),
      ),
    ),
    rail(d),
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
    const lines = h("div", { class: "live-lines", id: "live-lines" });
    appendLiveLines(lines, job.log || []);
    parts.push(lines);
    parts.push(h("div", { class: "row" }, h("span", { class: "typing", role: "img", "aria-label": "çalışıyor" }, h("span"), h("span"), h("span")), isAgent && h("button", { class: "btn btn-sm", type: "button", onclick: () => cancelJob(job.id) }, "Durdur")));
  } else {
    if (job.tools?.length) parts.push(toolChips(job.tools));
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
  const card = running ? null : stageCard(d);
  if (card) items.push(card);
  if (!items.length) items.push(h("div", { class: "feed-empty" }, h("p", { text: "Henüz agent işi yok." }), h("p", { class: "small", text: "Müşterinin cevapları gelince Cevaplar sekmesinden girin ya da aşağıya talimat yazın." })));
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
    h("section", { class: "card" }, h("h3", { text: "Onaylar" }),
      h("div", { class: "row" }, ...d.approvals.map((a) => h("span", { class: `badge ${a.valid ? "ok" : "skip"}`, text: `${APPROVAL_NAMES[a.kind]}${a.valid ? " ✓" : ""}` })))),
    h("section", { class: "card" },
      h("h3", { text: "Bilgiler" }),
      h("dl", { class: "kv" },
        h("div", {}, h("dt", { text: "Kalite" }), h("dd", { text: b ? (b.passed ? "Build geçti" : "Kontroller kaldı") : "Build yok" })),
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

// ---------------------------------------------------------------- tab: questions

function tabQuestions(body, d) {
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
  if (d.status.openQuestions.length) {
    body.append(h("section", { class: "card" }, h("h2", { text: "Hâlâ açık sorular" }),
      h("ul", { style: "margin:0;padding-inline-start:1.2rem" }, ...d.status.openQuestions.map((q) => h("li", { text: `${q.text} (${q.round}. tur)` })))));
  }
}

// ---------------------------------------------------------------- tab: answers

async function tabAnswers(body, d) {
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
    h("section", { class: "card stack" },
      h("h2", { text: "Bilgileri yapıştır, agent dağıtsın" }),
      h("p", { class: "muted small", text: "Agent her bilgiyi doğru alana kendisi yerleştirir, siteye girecek metinleri İngilizce yazar. Eksik kalanları uydurmaz; 2. tur formuna ekler." }),
      h("label", { for: "free", class: "sr-only" }, "Müşteri bilgileri"),
      free,
    ),
    uploadCard(slug, d.inbox),
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

function uploadCard(slug, inbox) {
  const list = h("ul", { class: "files" });
  const draw = (files) => list.replaceChildren(...files.map((f) => h("li", {}, h("span", { text: f.name }), h("span", { class: "muted", text: `${Math.ceil(f.bytes / 1024)} KB` }))));
  draw(inbox);
  const input = h("input", { type: "file", multiple: true, accept: "image/png,image/jpeg,image/webp,image/avif,image/svg+xml", id: "files", class: "sr-only" });
  const upload = async (files) => {
    for (const file of files) {
      const res = await guarded(() => api("PUT", `/api/clients/${slug}/inbox/${encodeURIComponent(file.name)}`, file, true));
      if (res) draw(res.inbox);
    }
    if (files.length) toast("Dosyalar yüklendi. Agent cevapları işlerken bunları da kaydeder.");
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
  const section = h("section", { class: "card content-view stack" }, h("h2", { text: "Metinleri gözden geçir" }),
    h("p", { class: "muted small", text: "İçerik onayından önce okuyun. Değişiklik için Akış'tan agent'a yazın." }));
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
    h("h2", { text: "Build ve kalite kontrolü" }),
    h("p", { class: "muted", text: b ? `Son build: ${time(b.at)} · ${b.passed ? "geçti" : "kontroller geçmedi"}` : "Henüz build alınmadı." }),
    h("div", { class: "row" },
      h("button", { class: "btn btn-primary", type: "button", disabled: busy, onclick: () => runTask(slug, "build", {}) }, "Build al"),
      h("button", { class: "btn", type: "button", disabled: busy, onclick: () => runAgent(slug, "fix-build", {}) }, "Agent build alsın ve düzeltsin"),
      h("button", { class: "btn", type: "button", disabled: !d.distReady, onclick: () => openPreview(slug) }, "Önizlemeyi aç"),
    ),
  ));
  if (d.qualityReport) body.append(qualityTable(d.qualityReport));
  body.append(h("section", { class: "card" }, h("h2", { text: "Görsel kontrol listesi" }),
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

function qualityTable(md) {
  const rows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Check") && !l.startsWith("| ---")).map((l) => l.slice(2, -2).split(" | "));
  const cls = { PASS: "ok", FAIL: "bad", WARN: "warn", SKIP: "skip" };
  const names = { PASS: "geçti", FAIL: "kaldı", WARN: "uyarı", SKIP: "atlandı" };
  return h("section", { class: "card" }, h("h2", { text: "Kalite raporu" }),
    h("div", { style: "overflow-x:auto" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Kontrol" }), h("th", { text: "Sonuç" }), h("th", { text: "Ayrıntı" }))),
      h("tbody", {}, ...rows.map(([name, result, detail]) => h("tr", {}, h("td", { text: name }), h("td", {}, h("span", { class: `badge ${cls[result] || "skip"}`, text: names[result] || result })), h("td", { text: (detail || "").replace(/\\\|/g, "|") })))))));
}

// ---------------------------------------------------------------- tab: approvals and publish

function tabPublish(body, d) {
  const slug = d.status.slug;
  const dry = h("input", { type: "checkbox", id: "dry" });
  const busy = isBusy();
  const ld = d.lastDeploy;
  body.append(
    h("section", { class: "card stack" },
      h("h2", { text: "Onaylar" }),
      h("p", { class: "muted small", text: "Onaylar güvenlik için sadece terminalden verilir (agent veremez). Komutu kopyalayıp WSL terminalinde factory klasöründe çalıştırın, sorulduğunda kısa adı yazın. Her değişiklik onayları sıfırlar." }),
      h("ul", { class: "approvals" }, ...d.approvals.map((a) =>
        h("li", {},
          h("strong", { text: APPROVAL_NAMES[a.kind] }),
          h("span", { class: `badge ${a.valid ? "ok" : "skip"}`, text: a.valid ? `verildi · ${time(a.at)}` : "yok" }),
          h("span", { class: "cmd" }, h("code", { text: a.command }), copyButton(a.command)),
        ))),
      h("button", { class: "btn btn-sm", type: "button", onclick: render }, "Durumu yenile"),
    ),
    h("section", { class: "card stack" },
      h("h2", { text: "Yayın" }),
      h("p", { class: "muted small", text: "Önizleme: içerik ve görsel onayı gerekir; çıkan linki müşteriye gönderin. Canlı: ayrıca yayın onayı gerekir." }),
      h("label", { class: "choice", for: "dry" }, dry, "Deneme (hiçbir şey yüklemeden kontrol et)"),
      h("div", { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", disabled: busy, onclick: () => runTask(slug, "deploy", { target: "preview", dryRun: dry.checked }) }, "Önizleme yayınla"),
        h("button", { class: "btn btn-danger", type: "button", disabled: busy, onclick: () => deployProduction(slug, dry.checked) }, "Canlıya al"),
      ),
      ld && h("p", { class: "small" }, `Son yayın: ${ld.target === "production" ? "canlı" : "önizleme"} · ${time(ld.at)} `, ld.url && h("a", { href: ld.url, target: "_blank", rel: "noopener", text: ld.url })),
    ),
  );
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
  const job = await guarded(() => api("POST", `/api/clients/${slug}/agent/${kind}`, payload));
  if (!job) return false;
  toast("Agent çalışıyor. Akış'tan takip edin.");
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
    if (next.status === "running") { state.running = { ...next, log: [] }; startPolling(); return; }
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
