// Home dashboard, new-client form and the what-to-paste guide.
import { api, avatar, guarded, h, ICON, isBusy, LANG_NAMES, plainOf, state, stepIndex, STEPS, svg, toast } from "./core.js";
import { businessLine } from "./info.js";
import { rankedDesigns } from "./library.js";
import { render, runAgent } from "./shell.js";

// ---------------------------------------------------------------- home and new client

/** Home: who needs what, at a glance. One card per client with its next step. */
export function renderHome() {
  if (!state.clients.length) {
    return h("section", { class: "empty" },
      h("h1", { text: "İlk müşteriyi ekleyin" }),
      h("p", { class: "muted", text: "Adını ve sektörünü yaz, bildiklerini yapıştır; agent markayı tasarlar ve siteyi hazırlar." }),
      h("p", { style: "margin-top:1.2rem" }, h("a", { class: "btn btn-primary btn-lg", href: "#/new" }, "Yeni Müşteri")),
    );
  }
  const running = isBusy() ? state.running.slug : null;
  const bucket = (c) => (c.slug === running ? "agent" : plainOf(c.stage).tone);
  const COUNTS = [["you", "Onay Bekleyen", "İşleminizi bekliyor"], ["agent", "İşlem Sürüyor", "Şu an hazırlanıyor"], ["client", "Bilgi Bekleyen", "Müşteriden bilgi bekleniyor"], ["done", "Yayında", "Canlı siteler"]];
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
      h("div", { class: "top" }, avatar(c.slug, c.name || c.slug, false, b === "agent"), h("span", { class: `pill tone-${b}`, text: b === "agent" ? "İşlem sürüyor" : plainOf(c.stage).text })),
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
      h("div", {}, h("h1", { text: "Müşteriler" }), h("p", { class: "muted", text: "İşlem bekleyen müşteriler üstte listelenir." })),
      h("a", { class: "btn btn-primary btn-lg", href: "#/new" }, svg(ICON.plus, 18, 2.4), "Yeni Müşteri"),
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
export function nextHint(c, tone) {
  if (tone === "agent") return "Tamamlandığında bildirim alacaksınız";
  switch (c.stage) {
    case "collecting-answers": return "Müşteri bilgilerini giriniz";
    case "design": case "content": case "build": return "Siteyi oluşturunuz";
    case "awaiting-content-approval": case "awaiting-visual-approval": return "Siteyi inceleyip onaylayınız";
    case "awaiting-production-approval": return "Önizlemeyi müşteriye iletiniz";
    case "ready-to-deploy": return "Yayına alınız";
    case "live": return "Revizyon için talep oluşturunuz";
    default: return "Açınız";
  }
}

export function slugify(name) {
  return name.toLowerCase().replace(/ı/g, "i").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function renderNew() {
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
  // Optional start design from the library; best fit for the typed sector first.
  const startDesign = h("select", { id: "nc-design" }, h("option", { value: "" }, "Yeni tasarım (kütüphane kullanma)"));
  let libDesigns = [];
  const fillDesigns = () => {
    const keep = startDesign.value;
    startDesign.replaceChildren(h("option", { value: "" }, "Yeni tasarım (kütüphane kullanma)"),
      ...rankedDesigns(libDesigns, "", industry.value).map((x) => h("option", { value: x.id }, `${x.score > 0 ? "★ " : ""}${x.name}${x.sector ? ` · ${x.sector}` : ""}`)));
    startDesign.value = keep;
  };
  api("GET", "/api/library").then(({ designs }) => { libDesigns = designs; fillDesigns(); designRow.hidden = designs.length === 0; }).catch(() => {});
  industry.addEventListener("change", fillDesigns);
  const designRow = h("label", { for: "nc-design", hidden: true }, "Başlangıç tasarımı (isteğe bağlı)",
    h("span", { class: "help", text: "Kütüphanedeki bir tasarımdan başlanır. Sabit alanlar (ad, telefon, e-posta…) panel tarafından doldurulur; agent yalnızca kalan metinleri ve markayı uyarlar." }), startDesign);

  const form = h("form", { class: "card stack", style: "max-width:40rem", onsubmit: async (e) => {
    e.preventDefault();
    const hosting = form.querySelector("input[name=hosting]:checked")?.value;
    const res = await guarded(() => api("POST", "/api/clients", { businessName: name.value.trim(), slug: slug.value.trim(), industry: industry.value.trim(), hostingModel: hosting, country: country.value, extraLocale: lang.value || undefined, ...(startDesign.value ? { startDesign: startDesign.value } : {}) }));
    if (!res) return;
    toast("Müşteri oluşturuldu.");
    const text = info.value.trim();
    location.hash = `#/c/${res.slug}/sohbet`;
    if (!text) return;
    await runAgent(res.slug, "autopilot", { freeText: text, ...(startDesign.value ? { libraryId: startDesign.value } : {}) });
  } },
    h("h1", { text: "Yeni Müşteri" }),
    h("p", { class: "muted", text: "Adını ve sektörünü yaz. Bildiklerini alttaki kutuya yapıştırırsan site hemen hazırlanmaya başlar." }),
    h("label", { for: "nc-name" }, "İşletme adı", name),
    h("label", { for: "nc-slug" }, "Kısa ad (slug)", h("span", { class: "help", text: "Klasör ve web adresi için kullanılır, sonradan değişmez. Otomatik doldurulur." }), slug),
    h("label", { for: "nc-industry" }, "Sektör", h("span", { class: "help", text: "İngilizce kısa ad en iyi sonucu verir: barber shop, pickle shop, dentist. Tasarım ve sektör soruları buna göre seçilir." }), industry),
    h("fieldset", {}, h("legend", { text: "Barındırma" }),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "hosting", value: "managed", checked: true }), "Bizim Cloudflare hesabımız"),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "hosting", value: "client" }), "Müşterinin kendi hesabı"),
    ),
    h("div", { class: "two" }, h("label", { for: "nc-country" }, "Ülke", country), h("label", { for: "nc-lang" }, "Site dili", lang)),
    designRow,
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
export const INFO_GROUPS = [
  { title: "İşletme", need: true, items: ["İşletmenin tam adı (sitede nasıl görünecekse)", "Ne iş yapıyor, hangi şehir/bölgede", "Hedef müşteri: kimler, nereden (ör. Manchester'da aileler)"] },
  { title: "Hizmetler", need: true, items: ["3–8 ana hizmet, her biri bir satır", "Fiyat varsa: \"kadın kesim £35\", \"£120'den başlayan\"", "Öne çıkan bilgiler: \"15 yıllık\", \"aynı gün servis\" (sadece gerçekse)"] },
  { title: "İletişim", need: true, items: ["E-posta ve telefon", "Adres ve çalışma saatleri", "WhatsApp numarası (buton istenirse)", "Online randevu linki, Google Maps linki, sosyal medya"] },
  { title: "Hikâye ve his", need: true, items: ["Nasıl başladılar, farkları ne (2–3 cümle)", "Sitenin havası: resmi, samimi, premium, enerjik…", "Çalışma şekli: ilk görüşme → teklif → iş → teslim"] },
  { title: "Görünüm", need: false, items: ["Logo ve fotoğraflar: 'Logo / fotoğraf ekle' ile yükle", "Marka renkleri (ör. lacivert + altın) ya da sevdikleri/sevmedikleri siteler"] },
  { title: "Ek bilgiler", need: false, items: ["Müşteri yorumları (ad + yorum, izinli)", "Sık sorulan sorular", "Şirket bilgileri: unvan, şirket no, kayıtlı adres", "Alan adı varsa adı ve kimin yönettiği"] },
];

export const INFO_TEMPLATE = [
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
export function infoGuide(textarea, onChange) {
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
