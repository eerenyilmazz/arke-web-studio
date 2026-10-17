// Sales tracking, concepts, proposal, versions and the information tabs.
import { approveDialog } from "./client.js";
import { api, APPROVAL_NAMES, copyButton, fmtTokens, guarded, h, isBusy, LANG_NAMES, MODE_TR, state, svg, time, toast } from "./core.js";
import { PAGE_TR } from "./edit.js";
import { inline } from "./feed.js";
import { deployProduction, jobStarted, loadClients, render, runAgent, runTask } from "./shell.js";

export const PAYMENT_LABELS = { none: "Teklif verilmedi", quoted: "Teklif verildi", deposit: "Kapora alındı", paid: "Ödendi" };
export const CURRENCY_SIGNS = { TRY: "₺", GBP: "£", EUR: "€", USD: "$" };

/** One line for a client card: price, payment and delivery date (red when late and unpaid). */
export function businessLine(b) {
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

export function businessForm(d) {
  const slug = d.status.slug;
  const b = d.businessTracking || { price: null, currency: d.country === "TR" ? "TRY" : "GBP", payment: "none", deadline: null, note: "" };
  const price = h("input", { id: "biz-price", type: "number", min: 0, step: "50", value: b.price ?? "" });
  const currency = h("select", { id: "biz-cur" }, ...Object.entries(CURRENCY_SIGNS).map(([k, v]) => h("option", { value: k, selected: k === b.currency }, `${v} ${k}`)));
  const payment = h("select", { id: "biz-pay" }, ...Object.entries(PAYMENT_LABELS).map(([k, v]) => h("option", { value: k, selected: k === b.payment }, v)));
  const deadline = h("input", { id: "biz-date", type: "date", value: b.deadline || "" });
  const note = h("textarea", { id: "biz-note", rows: 2, maxlength: 2000 });
  note.value = b.note || "";
  const tags = h("input", { id: "biz-tags", placeholder: "ör. abim, acil, Ankara", value: (b.tags || []).join(", ") });
  const bmode = h("select", { id: "biz-mode" }, h("option", { value: "" }, "Varsayılan paket"), ...Object.entries(MODE_TR).map(([k, v]) => h("option", { value: k, selected: b.budgetMode === k }, v)));
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
    h("label", { for: "biz-mode" }, `Paket${d.budget ? ` (şimdiye kadar ${fmtTokens(d.budget.usage.tokens)} birim, ${d.budget.usage.jobs} işlem)` : ""}`, bmode),
    h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")),
  );
  return form;
}

/** Three brand proposals from the agent, shown as cards; choosing one builds the site with it. */
export function conceptsCard(d) {
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


// ---------------------------------------------------------------- Teklif (proposal), printable

export const FEATURE_TR = [
  "Markaya özel tasarım: logo kullanımı ya da yeni logo, renkler, yazı tipleri ve imza hareketi",
  "Telefon, tablet ve bilgisayarda düzgün görünüm; açık ve koyu tema",
  "Hızlı açılan, güvenli, reklam ve takip kodu içermeyen site",
  "Arama motorları için temel ayarlar (başlıklar, açıklamalar, harita kaydı bilgisi, site haritası)",
  "WhatsApp ve telefonla tek dokunuşla iletişim",
  "Yayına alma ve SSL (https)",
];

export async function tabProposal(body, d) {
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
export function quickEditCard(d) {
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
export function versionsCard(d) {
  const slug = d.status.slug;
  const list = h("ul", { class: "versions" }, h("li", { class: "muted small", text: "Yükleniyor…" }));
  const card = h("details", { class: "card advanced", open: false }, h("summary", { text: "Sürüm Geçmişi" }),
    h("p", { class: "muted small", text: "Her işlemden önce ve sonra site kaydedilir. Bir sürüme dönüldüğünde metinler, görseller ve site kodu o hâline gelir; onayın yeniden verilmesi gerekir." }), list);
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
        if (!confirm(`Site "${v.message}" sonrasındaki hâline döndürülecek. Sonraki değişiklikler kaybolmaz, listede kalır. Devam edilsin mi?`)) return;
        const res = await guarded(() => api("POST", `/api/clients/${slug}/versions/restore`, { id: v.id }));
        if (res) { toast("Geri alındı. Siteyi yeniden oluşturup bak."); render(); }
      } }, "Bu Sürüme Dön"),
    )));
  });
  return card;
}

// ---------------------------------------------------------------- tab: information

/** What the agent knows: the texts on the site, the answers and files, and the optional questionnaire. */
export async function tabInfo(body, d) {
  const section = (title, sub) => {
    const el = h("section", { class: "info-section" }, h("div", { class: "info-head" }, h("h2", { text: title }), sub && h("p", { class: "muted small", text: sub })));
    body.append(el);
    return el;
  };
  section("İş Takibi", "Teklif, ödeme ve teslim tarihi. Yalnızca panelde tutulur; siteye ve asistana iletilmez.").append(businessForm(d));
  if (d.status.openQuestions.length) {
    const miss = section("Eksik Bilgiler", "Yanıtları Düzenleme sekmesindeki bilgi alanına yapıştırınız.");
    miss.append(h("ul", { class: "missing" }, ...d.status.openQuestions.map((q) => h("li", { title: q.text, text: MISSING_TR[q.id] || q.text }))));
  }
  tabContent(section("Sitedeki Metinler", "Değiştirmek için Düzenleme → Metin formunu kullanınız."), d);
  section("Logo ve Görseller", "Yüklenen dosyalar siteye eklenir; logoyu seçmek için \"Logo olarak kullan\"ı kullanınız.").append(uploadCard(d.status.slug, d.inbox, d.assets, d.logo));
  const pub = section("Onay ve Yayın", "Onay kodu yalnızca paneli başlattığınız terminalde görünür.");
  tabPublish(pub, d);
  tabBuild(pub, d);
  const more = h("details", { class: "card advanced" }, h("summary", { text: "Müşteriye soru formu göndermek ya da formu soru soru girmek (isteğe bağlı)" }));
  body.append(more);
  tabQuestions(more, d, { compact: true });
  await tabAnswers(more, d, { compact: true });
}

// ---------------------------------------------------------------- tab: questions

export function tabQuestions(body, d, { compact = false } = {}) {
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

export async function tabAnswers(body, d, { compact = false } = {}) {
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

export function uploadCard(slug, inbox, assets = [], logo = null) {
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

export function tabContent(body, d) {
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

export function tabBuild(body, d) {
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
export const MISSING_TR = {
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
export const CHECK_NAMES = [
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

export function qualityTable(md) {
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

export function tabPublish(body, d) {
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
