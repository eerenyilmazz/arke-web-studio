// The new-client form and the what-to-paste guide.
import { api, guarded, h, ignoreOptional, LANG_NAMES, toast } from "./core.js";
import { runAgent } from "./jobs.js";
import { rankedDesigns } from "./library.js";

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function renderNew() {
  const name = h("input", { type: "text", id: "nc-name", required: true, maxlength: 80, autocomplete: "off" });
  const slug = h("input", { type: "text", id: "nc-slug", required: true, maxlength: 40, pattern: "[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" });
  let slugTouched = false;
  name.addEventListener("input", () => {
    if (!slugTouched) slug.value = slugify(name.value);
  });
  slug.addEventListener("input", () => (slugTouched = true));
  const industry = h("input", { type: "text", id: "nc-industry", required: true, maxlength: 60, placeholder: "ör. hair salon, family law solicitor" });
  const info = h("textarea", {
    id: "nc-info",
    rows: 12,
    class: "field",
    maxlength: 20000,
    placeholder: "Ör: Erkek kuaförü, Mono. Saç kesimi 500 TL, sakal 300 TL. Ankara Sincan, 0534 985 63 19. Siyah-beyaz renkler.",
  });
  // Main language: Turkish in Turkey, English everywhere else (extra languages are chosen below).
  const MARKET_OPTIONS = [
    ["TR", "Türkiye (Türkçe, ₺)"],
    ["GB", "İngiltere (İngilizce, £)"],
    ["IE", "İrlanda (İngilizce, €)"],
    ["US", "ABD (İngilizce, $)"],
    ["DE", "Almanya (İngilizce, €)"],
    ["NL", "Hollanda (İngilizce, €)"],
  ];
  const MAIN = { TR: "tr" };
  const country = h("select", { id: "nc-country" }, ...MARKET_OPTIONS.map(([v, l]) => h("option", { value: v }, l)));
  const lang = h("select", { id: "nc-lang" });
  const fillLangs = () => {
    const main = MAIN[country.value] || "en";
    lang.replaceChildren(
      h("option", { value: "" }, `Sadece ${LANG_NAMES[main]}`),
      ...Object.entries(LANG_NAMES)
        .filter(([k]) => k !== main)
        .map(([k, v]) => h("option", { value: k }, `${LANG_NAMES[main]} + ${v}`)),
    );
  };
  country.addEventListener("change", fillLangs);
  fillLangs();
  // Optional start design from the library; best fit for the typed sector first.
  const startDesign = h("select", { id: "nc-design" }, h("option", { value: "" }, "Yeni tasarım (kütüphane kullanma)"));
  let libDesigns = [];
  const fillDesigns = () => {
    const keep = startDesign.value;
    startDesign.replaceChildren(
      h("option", { value: "" }, "Yeni tasarım (kütüphane kullanma)"),
      ...rankedDesigns(libDesigns, "", industry.value).map((x) =>
        h("option", { value: x.id }, `${x.score > 0 ? "★ " : ""}${x.name}${x.sector ? ` · ${x.sector}` : ""}`),
      ),
    );
    startDesign.value = keep;
  };
  api("GET", "/api/library")
    .then(({ designs }) => {
      libDesigns = designs;
      fillDesigns();
      designRow.hidden = designs.length === 0;
    })
    .catch(ignoreOptional);
  industry.addEventListener("change", fillDesigns);
  const designRow = h(
    "label",
    { for: "nc-design", hidden: true },
    "Başlangıç tasarımı (isteğe bağlı)",
    h("span", {
      class: "help",
      text: "Kütüphanedeki bir tasarımdan başlanır. Sabit alanlar (ad, telefon, e-posta…) panel tarafından doldurulur; agent yalnızca kalan metinleri ve markayı uyarlar.",
    }),
    startDesign,
  );

  // Two columns on wide screens: who the business is on the left, what the client sent on the right.
  const hostingChoice = h(
    "div",
    { class: "seg-choice", role: "radiogroup", "aria-label": "Barındırma" },
    h("label", {}, h("input", { type: "radio", name: "hosting", value: "managed", checked: true }), h("span", { text: "Bizim Cloudflare hesabımız" })),
    h("label", {}, h("input", { type: "radio", name: "hosting", value: "client" }), h("span", { text: "Müşterinin kendi hesabı" })),
  );
  const form = h(
    "form",
    {
      class: "new-client",
      onsubmit: async (e) => {
        e.preventDefault();
        const hosting = form.querySelector("input[name=hosting]:checked")?.value;
        const res = await guarded(() =>
          api("POST", "/api/clients", {
            businessName: name.value.trim(),
            slug: slug.value.trim(),
            industry: industry.value.trim(),
            hostingModel: hosting,
            country: country.value,
            extraLocale: lang.value || undefined,
            ...(startDesign.value ? { startDesign: startDesign.value } : {}),
          }),
        );
        if (!res) return;
        toast("Müşteri oluşturuldu.");
        const text = info.value.trim();
        location.hash = `#/musteri/${res.slug}/sohbet`;
        if (!text) return;
        await runAgent(res.slug, "create-site", { freeText: text, ...(startDesign.value ? { libraryId: startDesign.value } : {}) });
      },
    },
    h(
      "header",
      { class: "nc-head" },
      h("h1", { text: "Yeni Müşteri" }),
      h("p", { class: "muted", text: "Adını ve sektörünü yazınız. Elinizdeki bilgileri sağdaki kutuya yapıştırırsanız site hemen hazırlanmaya başlar." }),
    ),
    h(
      "section",
      { class: "card stack nc-business" },
      h("h2", { class: "nc-title", text: "İşletme" }),
      h(
        "div",
        { class: "two" },
        h("label", { for: "nc-name" }, "İşletme adı", name),
        h("label", { for: "nc-slug" }, "Kısa ad", h("span", { class: "help", text: "Klasör ve adres için; otomatik dolar, sonradan değişmez." }), slug),
      ),
      h(
        "label",
        { for: "nc-industry" },
        "Sektör",
        h("span", { class: "help", text: "İngilizce kısa ad en iyi sonucu verir: barber shop, pickle shop, dentist." }),
        industry,
      ),
      h("div", { class: "two" }, h("label", { for: "nc-country" }, "Ülke", country), h("label", { for: "nc-lang" }, "Site dili", lang)),
      h("div", { class: "nc-field" }, h("span", { class: "nc-label", text: "Barındırma" }), hostingChoice),
      designRow,
    ),
    h(
      "section",
      { class: "card stack nc-info" },
      h("h2", { class: "nc-title", text: "Müşteriden gelen bilgiler" }),
      h("label", { for: "nc-info", class: "sr-only" }, "Elindeki bilgiler"),
      h("p", { class: "help", text: "İsteğe bağlı. Doldurursanız site hemen hazırlanmaya başlar; eksik bilgi olursa size sorulur." }),
      info,
      infoGuide(info),
    ),
    h("footer", { class: "nc-foot" }, h("button", { class: "btn btn-primary btn-lg", type: "submit" }, "Müşteriyi oluştur")),
  );
  return form;
}

// ---------------------------------------------------------------- what to paste

/** What the agent can use from a pasted text. "need" = the site cannot be finished without it. */
export const INFO_GROUPS = [
  {
    title: "İşletme",
    need: true,
    items: [
      "İşletmenin tam adı (sitede nasıl görünecekse)",
      "Ne iş yapıyor, hangi şehir/bölgede",
      "Hedef müşteri: kimler, nereden (ör. Manchester'da aileler)",
    ],
  },
  {
    title: "Hizmetler",
    need: true,
    items: [
      "3–8 ana hizmet, her biri bir satır",
      'Fiyat varsa: "kadın kesim £35", "£120\'den başlayan"',
      'Öne çıkan bilgiler: "15 yıllık", "aynı gün servis" (sadece gerçekse)',
    ],
  },
  {
    title: "İletişim",
    need: true,
    items: ["E-posta ve telefon", "Adres ve çalışma saatleri", "WhatsApp numarası (buton istenirse)", "Online randevu linki, Google Maps linki, sosyal medya"],
  },
  {
    title: "Hikâye ve his",
    need: true,
    items: [
      "Nasıl başladılar, farkları ne (2–3 cümle)",
      "Sitenin havası: resmi, samimi, premium, enerjik…",
      "Çalışma şekli: ilk görüşme → teklif → iş → teslim",
    ],
  },
  {
    title: "Görünüm",
    need: false,
    items: ["Logo ve fotoğraflar: 'Logo / fotoğraf ekle' ile yükle", "Marka renkleri (ör. lacivert + altın) ya da sevdikleri/sevmedikleri siteler"],
  },
  {
    title: "Ek bilgiler",
    need: false,
    items: [
      "Müşteri yorumları (ad + yorum, izinli)",
      "Sık sorulan sorular",
      "Şirket bilgileri: unvan, şirket no, kayıtlı adres",
      "Alan adı varsa adı ve kimin yönettiği",
    ],
  },
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
  return h(
    "details",
    { class: "info-guide" },
    h("summary", { text: "Neler yazabilirim? (liste ve doldurulacak şablon)" }),
    h("p", {
      class: "small muted",
      text: "Sıra, dil ve biçim önemli değil; Türkçe yazabilirsin; agent site metinlerini sitenin dilinde yazar. ★ olanlar olmadan site bitmez: eksikse agent sana kısa sorularla sorar. Uydurma bilgi eklenmez.",
    }),
    h(
      "div",
      { class: "info-groups" },
      ...INFO_GROUPS.map((g) =>
        h("div", {}, h("p", { class: "info-title", text: `${g.need ? "★ " : ""}${g.title}` }), h("ul", {}, ...g.items.map((i) => h("li", { text: i })))),
      ),
    ),
    h("button", { class: "btn", type: "button", onclick: fill }, "Boş şablonu kutuya ekle"),
  );
}
