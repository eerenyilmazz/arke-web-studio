// Site Factory panel. Plain browser JS, no build step.
// All text from the server (client data included) is inserted with textContent, never innerHTML.

const STAGES = [
  ["collecting-answers", "Cevaplar toplanıyor", "cevaplar"],
  ["design", "Tasarım", "agent"],
  ["content", "Metinler", "agent"],
  ["awaiting-content-approval", "İçerik onayı bekliyor", "yayin"],
  ["build", "Build", "build"],
  ["awaiting-visual-approval", "Görsel onay bekliyor", "build"],
  ["awaiting-production-approval", "Önizleme ve yayın onayı", "yayin"],
  ["ready-to-deploy", "Yayına hazır", "yayin"],
  ["live", "Yayında", "yayin"],
];
const STAGE_HELP = {
  "collecting-answers": "Müşteriye soru formunu gönderin, gelen cevapları Cevaplar sekmesinden agent'a işletin.",
  design: "Agent sekmesinden 'Tasarım ve metinleri oluştur' ile devam edin.",
  content: "Agent sekmesinden metinleri tamamlatın.",
  "awaiting-content-approval": "Metinleri Agent sekmesinde okuyun; uygunsa içerik onayını terminalden verin (Yayın sekmesinde komut var).",
  build: "Build sekmesinden build alın.",
  "awaiting-visual-approval": "Önizlemeyi açıp görsel kontrol listesine göre bakın; uygunsa görsel onayı terminalden verin.",
  "awaiting-production-approval": "Önizlemeyi yayınlayıp linki müşteriye gönderin. Müşteri onaylayınca yayın onayını terminalden verin.",
  "ready-to-deploy": "Production yayınını başlatın.",
  live: "Site yayında. Değişiklik için Agent sekmesinden istekte bulunun; değişiklik onayları sıfırlar.",
};
const TABS = [["sorular", "Sorular"], ["cevaplar", "Cevaplar"], ["agent", "Agent"], ["build", "Build"], ["yayin", "Onay ve yayın"]];
const LANG_NAMES = { en: "İngilizce", tr: "Türkçe", de: "Almanca", fr: "Fransızca", es: "İspanyolca", it: "İtalyanca", pl: "Lehçe", ar: "Arapça" };
const APPROVAL_NAMES = { content: "İçerik", visual: "Görsel", production: "Yayın" };
const POLL_MS = 1500;

const state = { clients: [], detail: null, questionnaire: {}, job: null, logSince: 0, pollTimer: null, drafts: {} };

// ---------------------------------------------------------------- tiny DOM helpers

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const $ = (sel) => document.querySelector(sel);

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
  return h("button", { class: "btn btn-small", type: "button", onclick: async () => { await navigator.clipboard.writeText(text); toast("Kopyalandı."); } }, label);
}

// ---------------------------------------------------------------- routing

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "new") return { view: "new" };
  if (parts[0] === "c" && parts[1]) return { view: "client", slug: parts[1], tab: parts[2] || null };
  return { view: "home" };
}

async function render() {
  await loadClients();
  const r = route();
  const view = $("#view");
  view.replaceChildren();
  if (r.view === "new") view.append(renderNew());
  else if (r.view === "client") await renderClient(view, r.slug, r.tab);
  else view.append(renderHome());
}

window.addEventListener("hashchange", render);

// ---------------------------------------------------------------- sidebar

async function loadClients() {
  const data = await guarded(() => api("GET", "/api/clients"));
  if (!data) return;
  state.clients = data.clients;
  const r = route();
  const list = $("#clients");
  list.replaceChildren(
    ...state.clients.map((c) =>
      h("li", {}, h("a", { href: `#/c/${c.slug}`, "aria-current": r.slug === c.slug ? "page" : null },
        h("span", { class: "name", text: c.slug }),
        h("span", { class: "stage", text: stageLabel(c.stage) }),
      )),
    ),
  );
}

function stageLabel(stage) {
  return (STAGES.find((s) => s[0] === stage) || [stage, stage])[1];
}

// ---------------------------------------------------------------- views

function renderHome() {
  return h("section", { class: "empty" },
    h("h1", { text: state.clients.length ? "Bir müşteri seçin" : "Henüz müşteri yok" }),
    h("p", { class: "muted", text: state.clients.length ? "Soldaki listeden bir müşteri seçin ya da yeni müşteri ekleyin." : "İlk müşteriyi eklemek için 'Yeni müşteri'ye tıklayın." }),
  );
}

function slugify(name) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function renderNew() {
  const name = h("input", { type: "text", id: "nc-name", required: true, maxlength: 80, autocomplete: "off" });
  const slug = h("input", { type: "text", id: "nc-slug", required: true, maxlength: 40, pattern: "[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" });
  let slugTouched = false;
  name.addEventListener("input", () => { if (!slugTouched) slug.value = slugify(name.value); });
  slug.addEventListener("input", () => (slugTouched = true));
  const industry = h("input", { type: "text", id: "nc-industry", required: true, maxlength: 60, placeholder: "ör. hair salon, family law solicitor" });
  const lang = h("select", { id: "nc-lang" }, h("option", { value: "" }, "Sadece İngilizce"), ...Object.entries(LANG_NAMES).filter(([k]) => k !== "en").map(([k, v]) => h("option", { value: k }, `İngilizce + ${v}`)));

  const form = h("form", { class: "panel stack", onsubmit: async (e) => {
    e.preventDefault();
    const hosting = form.querySelector("input[name=hosting]:checked")?.value;
    const res = await guarded(() => api("POST", "/api/clients", { businessName: name.value.trim(), slug: slug.value.trim(), industry: industry.value.trim(), hostingModel: hosting, extraLocale: lang.value || undefined }));
    if (res) { toast("Müşteri oluşturuldu."); location.hash = `#/c/${res.slug}/sorular`; }
  } },
    h("h1", { text: "Yeni müşteri" }),
    h("p", { class: "muted", text: "Sadece iç bilgiler. Geri kalanını müşteriye soru formuyla soracağız." }),
    h("label", { for: "nc-name" }, "İşletme adı", name),
    h("label", { for: "nc-slug" }, "Kısa ad (slug)", h("span", { class: "field-help", text: "Klasör ve Cloudflare adı olur, sonradan değişmez. Küçük harf, rakam ve tire." }), slug),
    h("label", { for: "nc-industry" }, "Sektör (İngilizce)", h("span", { class: "field-help", text: "Tasarım önerisi ve sektöre özel sorular buna göre seçilir." }), industry),
    h("fieldset", {}, h("legend", { text: "Barındırma" }),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "hosting", value: "managed", checked: true }), "Bizim Cloudflare hesabımız (managed)"),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "hosting", value: "client" }), "Müşterinin kendi hesabı (client)"),
    ),
    h("label", { for: "nc-lang" }, "Dil", lang),
    h("div", { class: "row" }, h("button", { class: "btn btn-primary", type: "submit" }, "Müşteriyi oluştur")),
  );
  return form;
}

async function renderClient(view, slug, tab) {
  const d = await guarded(() => api("GET", `/api/clients/${slug}`));
  if (!d) { view.append(renderHome()); return; }
  state.detail = d;
  const stage = d.status.stage;
  const stageIndex = STAGES.findIndex((s) => s[0] === stage);
  const activeTab = tab || (STAGES[stageIndex] || STAGES[0])[2];
  if (!state.job && d.jobs.length) showJob(d.jobs[0], false);

  view.append(
    h("div", { class: "client-head" },
      h("div", {},
        h("h1", { text: d.business.name || slug }),
        h("div", { class: "facts" },
          h("span", { text: slug }),
          h("span", { text: d.business.industry || "" }),
          h("span", { text: d.locales.map((l) => LANG_NAMES[l] || l).join(", ") }),
          h("span", { text: d.hosting === "client" ? "Müşteri hesabı" : "Bizim hesap" }),
          d.domain && h("span", { text: d.domain }),
        ),
      ),
      h("span", { class: "badge ok", text: stageLabel(stage) }),
    ),
    h("ol", { class: "steps", "aria-label": `Aşama ${stageIndex + 1} / ${STAGES.length}` }, ...STAGES.map((s, i) => h("li", { class: i < stageIndex ? "done" : i === stageIndex ? "now" : "", title: s[1] }))),
    h("p", { class: "next" }, h("strong", { text: "Sıradaki adım: " }), STAGE_HELP[stage] || d.status.nextStep),
    h("nav", { class: "tabs", "aria-label": "Bölümler" }, ...TABS.map(([id, label]) => h("a", { href: `#/c/${slug}/${id}`, "aria-current": id === activeTab ? "page" : null, text: label }))),
  );

  const body = h("div");
  view.append(body);
  if (activeTab === "sorular") await tabQuestions(body, d);
  else if (activeTab === "cevaplar") await tabAnswers(body, d);
  else if (activeTab === "agent") tabAgent(body, d);
  else if (activeTab === "build") tabBuild(body, d);
  else tabPublish(body, d);
}

// ---------------------------------------------------------------- tab: questions

async function tabQuestions(body, d) {
  const slug = d.status.slug;
  const replyBy = h("input", { type: "text", id: "reply-by", maxlength: 40, placeholder: "ör. Friday 24 October" });
  const out = h("div");
  const make = async (round) => {
    const q = await guarded(() => api("POST", `/api/clients/${slug}/questionnaire/${round}`, { replyBy: replyBy.value.trim() || undefined }));
    if (!q) return;
    state.questionnaire[slug] = q;
    out.replaceChildren(h("div", { class: "copybox" }, h("pre", { text: q.plainText }), copyButton(q.plainText)));
    toast(`${round}. tur formu hazır. Metni kopyalayıp müşteriye gönderin.`);
  };
  body.append(
    h("section", { class: "panel stack" },
      h("h2", { text: "Müşteriye gidecek soru formu" }),
      h("p", { class: "muted", text: "1. tur: 10 temel soru. 2. tur: sadece eksik kalanlar, sektöre özel sorular ve 'ileride ilginizi çekebilir' listesi. Form İngilizce; müşteriye siz gönderirsiniz." }),
      h("label", { for: "reply-by" }, "Son cevap tarihi (isteğe bağlı)", replyBy),
      h("div", { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", onclick: () => make(1) }, "1. tur formunu oluştur"),
        h("button", { class: "btn", type: "button", onclick: () => make(2) }, "2. tur formunu oluştur"),
      ),
      out,
    ),
  );
  if (d.status.openQuestions.length) {
    body.append(h("section", { class: "panel" }, h("h2", { text: "Hâlâ açık sorular" }),
      h("ul", {}, ...d.status.openQuestions.map((q) => h("li", { text: `${q.text} (${q.round}. tur)` })))));
  }
}

// ---------------------------------------------------------------- tab: answers

async function tabAnswers(body, d) {
  const slug = d.status.slug;
  const round = d.questionnaires.includes(2) ? 2 : 1;
  const q = await guarded(() => api("GET", `/api/clients/${slug}/questionnaire/${round}`));
  if (!q) return;
  const draft = (state.drafts[slug] ||= { answers: {}, extras: {}, later: new Set(), freeText: "" });

  const qs = q.questions.map((item) => {
    const ta = h("textarea", { id: `a-${item.id}`, rows: 2 });
    ta.value = draft.answers[item.id] || "";
    ta.addEventListener("input", () => (draft.answers[item.id] = ta.value));
    return h("div", { class: "q" },
      h("label", { for: `a-${item.id}` }, item.text, item.required && h("span", { class: "req", text: "gerekli" }),
        (item.example || item.hint) && h("span", { class: "field-help", text: [item.example && `Örnek: ${item.example}`, item.hint].filter(Boolean).join(" · ") })),
      item.choices && h("span", { class: "field-help", text: `Seçenekler: ${item.choices.join(" / ")}` }),
      ta,
    );
  });
  const extras = q.extras.map((text, i) => {
    const ta = h("textarea", { id: `x-${i}`, rows: 2 });
    ta.value = draft.extras[i] || "";
    ta.addEventListener("input", () => (draft.extras[i] = ta.value));
    return h("div", { class: "q" }, h("label", { for: `x-${i}` }, text, ta));
  });
  const later = q.later.map((l) => {
    const cb = h("input", { type: "checkbox", value: l.id, checked: draft.later.has(l.id) });
    cb.addEventListener("change", () => (cb.checked ? draft.later.add(l.id) : draft.later.delete(l.id)));
    return h("label", { class: "choice" }, cb, l.text);
  });
  const free = h("textarea", { id: "free", rows: 6, placeholder: "Müşteri cevapları e-postayla yazdıysa buraya olduğu gibi yapıştırın." });
  free.value = draft.freeText;
  free.addEventListener("input", () => (draft.freeText = free.value));

  body.append(
    h("section", { class: "panel" },
      h("h2", { text: `${round}. tur cevapları` }),
      h("p", { class: "muted small", text: "Boş bıraktıklarınız atlanır. Müşteri 'please suggest' dediyse aynen yazın, agent sizin yerinize seçer ve özetinde belirtir." }),
      ...qs,
      extras.length > 0 ? h("h3", { text: "Sektöre özel", style: "margin-top:1rem" }) : null, ...extras,
      later.length > 0 ? h("fieldset", { style: "margin-top:1rem" }, h("legend", { text: "İleride ilgilenebilecekleri" }), ...later) : null,
    ),
    h("section", { class: "panel" },
      h("label", { for: "free" }, "Serbest metin", free),
    ),
    uploadPanel(slug, d.inbox),
    h("section", { class: "panel row" },
      h("button", { class: "btn btn-primary", type: "button", onclick: () => runAgent(slug, "answers", {
        answers: draft.answers,
        extras: q.extras.map((question, i) => ({ question, answer: draft.extras[i] || "" })),
        later: [...draft.later],
        freeText: draft.freeText,
      }) }, "Cevapları agent'a işlet"),
      h("span", { class: "muted small", text: "Agent sadece fabrika araçlarını kullanır; dosya düzenleyemez, komut çalıştıramaz, yayın yapamaz." }),
    ),
  );
}

function uploadPanel(slug, inbox) {
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
  return h("section", { class: "panel" }, h("h2", { text: "Dosyalar" }), h("p", { class: "muted small", text: "PNG, JPG, WebP, AVIF ya da SVG. Dosya içeriği kontrol edilir; zararlı SVG reddedilir." }), drop, list);
}

// ---------------------------------------------------------------- tab: agent

function tabAgent(body, d) {
  const slug = d.status.slug;
  const missing = d.status.config.missing.map((m) => m.path);
  const request = h("textarea", { id: "revise", rows: 4, placeholder: "ör. Hero başlığını kısalt, hizmetlere 'Gelinlik temizliği'ni ekle, tonu daha samimi yap." });
  body.append(
    h("section", { class: "panel stack" },
      h("h2", { text: "Tasarım ve metinler" }),
      h("p", { class: "muted", text: "Agent tasarım sistemini seçer (renk, font, bölüm varyantları) ve her dil için bütün metinleri yazar. Sadece kayıtlı bilgileri kullanır; fiyat, ödül ya da yorum uydurmaz." }),
      missing.length ? h("p", { class: "small" }, h("strong", { text: "Eksik alanlar: " }), missing.join(", ")) : null,
      h("div", { class: "row" }, h("button", { class: "btn btn-primary", type: "button", onclick: () => runAgent(slug, "design-content", {}) }, "Tasarım ve metinleri oluştur")),
    ),
    h("section", { class: "panel stack" },
      h("h2", { text: "Değişiklik iste" }),
      h("label", { for: "revise" }, "Agent'a talimat", request),
      h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: () => request.value.trim() ? runAgent(slug, "revise", { request: request.value.trim() }) : toast("Önce talimatı yazın.", true) }, "Değişikliği uygulat")),
    ),
  );
  if (d.unmapped.length) {
    body.append(h("section", { class: "panel" }, h("h2", { text: "Hiçbir alana uymayan cevaplar" }),
      h("p", { class: "muted small", text: "Bunlar sitede çıkmaz. Kapsam dışıysa ayrı teklif konusu." }),
      h("ul", {}, ...d.unmapped.map((u) => h("li", { text: `${u.question}: ${u.answer}${u.note ? ` (${u.note})` : ""}` })))));
  }
  body.append(contentReview(d));
}

function contentReview(d) {
  const section = h("section", { class: "panel content-view stack" }, h("h2", { text: "Metinleri gözden geçir (içerik onayından önce)" }));
  if (d.design) {
    const p = d.design.palette || {};
    section.append(h("p", { class: "small" }, h("strong", { text: "Tasarım: " }), `${d.design.style || ""} · ${d.design.fonts?.heading || ""} / ${d.design.fonts?.body || ""}`),
      h("div", { class: "row" }, ...Object.entries(p).map(([k, v]) => h("span", { class: "row small" }, h("span", { style: `display:inline-block;width:1.4rem;height:1.4rem;border-radius:4px;border:1px solid var(--rule);background:${/^#[0-9a-f]{6}$/i.test(v) ? v : "#fff"}` }), `${k} ${v}`))));
  }
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
  return section;
}

// ---------------------------------------------------------------- tab: build

function tabBuild(body, d) {
  const slug = d.status.slug;
  const b = d.status.lastBuild;
  body.append(
    h("section", { class: "panel stack" },
      h("h2", { text: "Build ve kalite kontrolü" }),
      h("p", { class: "muted", text: b ? `Son build: ${new Date(b.at).toLocaleString("tr-TR")} · ${b.passed ? "geçti" : "kontroller geçmedi"}` : "Henüz build alınmadı." }),
      h("div", { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", onclick: () => runTask(slug, "build", {}) }, "Build al"),
        h("button", { class: "btn", type: "button", onclick: () => runAgent(slug, "fix-build", {}) }, "Agent build alsın ve hataları düzeltsin"),
        h("button", { class: "btn", type: "button", disabled: !d.distReady, onclick: async () => { const r = await guarded(() => api("POST", `/api/clients/${slug}/preview`)); if (r) window.open(r.url, "_blank", "noopener"); } }, "Önizlemeyi aç"),
      ),
    ),
  );
  if (d.qualityReport) body.append(qualityTable(d.qualityReport));
  body.append(h("section", { class: "panel" }, h("h2", { text: "Görsel kontrol listesi (onaydan önce)" }),
    h("ul", {}, ...[
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
  const rows = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Check") && !l.startsWith("| ---"))
    .map((l) => l.slice(2, -2).split(" | "));
  const cls = { PASS: "ok", FAIL: "bad", WARN: "warn", SKIP: "skip" };
  const names = { PASS: "geçti", FAIL: "kaldı", WARN: "uyarı", SKIP: "atlandı" };
  return h("section", { class: "panel" }, h("h2", { text: "Kalite raporu" }),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Kontrol" }), h("th", { text: "Sonuç" }), h("th", { text: "Ayrıntı" }))),
      h("tbody", {}, ...rows.map(([name, result, detail]) => h("tr", {}, h("td", { text: name }), h("td", {}, h("span", { class: `badge ${cls[result] || "skip"}`, text: names[result] || result })), h("td", { text: (detail || "").replace(/\\\|/g, "|") }))))));
}

// ---------------------------------------------------------------- tab: approvals and publish

function tabPublish(body, d) {
  const slug = d.status.slug;
  const dry = h("input", { type: "checkbox", id: "dry" });
  const deploy = (target) => {
    if (target === "production" && !dry.checked && !confirm(`${slug} canlıya alınacak. Emin misiniz?`)) return;
    runTask(slug, "deploy", { target, dryRun: dry.checked });
  };
  const ld = d.lastDeploy;
  body.append(
    h("section", { class: "panel stack" },
      h("h2", { text: "Onaylar" }),
      h("p", { class: "muted small", text: "Onaylar güvenlik için sadece terminalden verilir (agent veremez). Komutu kopyalayıp WSL terminalinde factory klasöründe çalıştırın, sorulduğunda slug'ı yazın. Her değişiklik onayları sıfırlar." }),
      h("ul", { class: "approvals" }, ...d.approvals.map((a) =>
        h("li", {},
          h("strong", { text: APPROVAL_NAMES[a.kind] }),
          h("span", { class: `badge ${a.valid ? "ok" : "skip"}`, text: a.valid ? "verildi" : "yok" }),
          h("span", { class: "cmd" }, h("code", { text: a.command }), copyButton(a.command)),
        ))),
      h("button", { class: "btn btn-small", type: "button", onclick: render }, "Durumu yenile"),
    ),
    h("section", { class: "panel stack" },
      h("h2", { text: "Yayın" }),
      h("p", { class: "muted small", text: "Önizleme: içerik ve görsel onayı gerekir; çıkan linki müşteriye gönderin. Production: ayrıca yayın onayı gerekir." }),
      h("label", { class: "choice", for: "dry" }, dry, "Deneme (hiçbir şey yüklemeden kontrol et)"),
      h("div", { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", onclick: () => deploy("preview") }, "Önizleme yayınla"),
        h("button", { class: "btn btn-danger", type: "button", onclick: () => deploy("production") }, "Canlıya al"),
      ),
      ld && h("p", { class: "small" }, `Son yayın: ${ld.target} · ${new Date(ld.at).toLocaleString("tr-TR")} `, ld.url && h("a", { href: ld.url, target: "_blank", rel: "noopener", text: ld.url })),
    ),
  );
}

// ---------------------------------------------------------------- jobs

async function runAgent(slug, kind, payload) {
  const job = await guarded(() => api("POST", `/api/clients/${slug}/agent/${kind}`, payload));
  if (job) { toast("Agent çalışıyor. Sağdaki kayıttan takip edin."); showJob(job, true); }
}

async function runTask(slug, kind, payload) {
  const job = await guarded(() => api("POST", `/api/clients/${slug}/${kind}`, payload));
  if (job) showJob(job, true);
}

const STATUS_TEXT = { running: "çalışıyor…", succeeded: "tamamlandı", failed: "başarısız", cancelled: "iptal edildi" };

function showJob(job, poll) {
  state.job = job;
  state.logSince = 0;
  $("#log").replaceChildren();
  appendLog(job);
  if (poll) schedulePoll();
}

function appendLog(job) {
  $("#log-title").textContent = `${job.title} · ${job.slug}`;
  $("#log-status").textContent = `${STATUS_TEXT[job.status] || job.status} · ${new Date(job.startedAt).toLocaleTimeString("tr-TR")}`;
  $("#log-cancel").hidden = job.status !== "running" || job.kind === "build" || job.kind === "deploy";
  const running = $("#running");
  running.hidden = job.status !== "running";
  running.textContent = job.status === "running" ? `${job.title} çalışıyor (${job.slug})` : "";
  const log = $("#log");
  for (const line of job.log) log.append(h("li", { class: line.kind, text: line.kind === "tool" ? `→ ${line.text}` : line.text }));
  state.logSince = job.logTotal ?? state.logSince + job.log.length;
  // Scroll only the log pane, never the page the operator is reading.
  const pane = log.closest(".logpane");
  if (pane) pane.scrollTop = pane.scrollHeight;
}

function schedulePoll() {
  clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(async () => {
    const j = state.job;
    if (!j) return;
    const next = await guarded(() => api("GET", `/api/jobs/${j.id}?since=${state.logSince}`));
    if (!next) return;
    state.job = next;
    appendLog(next);
    if (next.status === "running") schedulePoll();
    else {
      toast(next.status === "succeeded" ? `${next.title}: tamamlandı.` : `${next.title}: ${STATUS_TEXT[next.status]}.`, next.status !== "succeeded");
      render();
    }
  }, POLL_MS);
}

$("#log-cancel").addEventListener("click", async () => {
  if (state.job && confirm("Çalışan agent işi durdurulsun mu? O ana kadar kaydedilenler kalır.")) await guarded(() => api("POST", `/api/jobs/${state.job.id}/cancel`));
});

// Resume a job that was running before a page reload.
(async () => {
  const m = await guarded(() => api("GET", "/api/meta"));
  if (m?.running) showJob(m.running, true);
  render();
})();
