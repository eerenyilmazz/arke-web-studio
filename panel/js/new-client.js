// The new-client form and the what-to-paste guide.
import { api, ask, guarded, h, ignoreOptional, LANG_NAMES, PACKAGE_NAMES, toast } from "./core.js";
import { addonLabel, addonsEditor } from "./addons.js";
import { locale } from "./i18n.js";
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

const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/avif,image/svg+xml";
const MAX_PHOTOS = 20;

/**
 * Step 2 of the form: the client's logo and photos, chosen before the client exists and uploaded right after it is
 * created. The status lines say what the agent does with or without them, so nothing is decided silently.
 */
function mediaPicker(onChange) {
  let logo = null;
  let photos = [];
  const logoInput = h("input", { type: "file", accept: IMAGE_TYPES, id: "nc-logo", class: "sr-only" });
  const photoInput = h("input", { type: "file", accept: IMAGE_TYPES, multiple: true, id: "nc-photos", class: "sr-only" });
  const logoBox = h("div", { class: "nc-media-row" });
  const photoBox = h("div", { class: "nc-media-row" });
  const thumb = (file) => {
    const url = URL.createObjectURL(file);
    const img = h("img", { src: url, alt: "" });
    img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    return img;
  };
  const draw = () => {
    logoBox.replaceChildren(
      logo
        ? h(
            "div",
            { class: "nc-media-chosen" },
            thumb(logo),
            h("span", { class: "nc-media-name", text: logo.name, "data-no-i18n": "" }),
            h("button", { class: "btn btn-sm", type: "button", onclick: () => ((logo = null), (logoInput.value = ""), draw()) }, "Kaldır"),
          )
        : h("label", { for: "nc-logo", class: "btn btn-sm" }, "Logo seç"),
      h("p", {
        class: `small ${logo ? "ok-text" : "muted"}`,
        text: logo ? "Marka bu logodan çıkarılır: renkler, biçim ve imza hareketi." : "Logo yok: agent işletme adıyla bir yazı logosu tasarlar.",
      }),
    );
    photoBox.replaceChildren(
      photos.length
        ? h(
            "div",
            { class: "nc-media-chosen" },
            h("div", { class: "nc-media-thumbs" }, ...photos.slice(0, 6).map(thumb)),
            h("span", { class: "nc-media-name", text: `${photos.length} fotoğraf` }),
            h("button", { class: "btn btn-sm", type: "button", onclick: () => ((photos = []), (photoInput.value = ""), draw()) }, "Kaldır"),
          )
        : h("label", { for: "nc-photos", class: "btn btn-sm" }, "Fotoğraf seç"),
      h("p", {
        class: `small ${photos.length ? "ok-text" : "muted"}`,
        text: photos.length ? "Fotoğraflar sitede kullanılır." : "Fotoğraf yok: fotoğraf uydurulmaz; çizim ve şekiller kullanılır.",
      }),
    );
    onChange();
  };
  logoInput.addEventListener("change", () => {
    logo = logoInput.files[0] || null;
    draw();
  });
  photoInput.addEventListener("change", () => {
    photos = [...photoInput.files].slice(0, MAX_PHOTOS);
    draw();
  });
  const el = h(
    "section",
    { class: "card stack nc-media" },
    h("p", { class: "help", text: "İsteğe bağlı. PNG, JPG, WebP, AVIF ya da SVG." }),
    h("div", { class: "nc-field" }, h("span", { class: "nc-label", text: "Logo" }), logoInput, logoBox),
    h("div", { class: "nc-field" }, h("span", { class: "nc-label", text: "Fotoğraflar" }), photoInput, photoBox),
  );
  draw();
  return { el, logo: () => logo, photos: () => photos, focusLogo: () => logoInput.click() };
}

/** Uploads the chosen files into the new client's inbox and sets the logo. False when the logo could not be set. */
async function uploadMedia(slug, logo, photos) {
  for (const file of [logo, ...photos].filter(Boolean)) {
    await guarded(() => api("PUT", `/api/clients/${slug}/inbox/${encodeURIComponent(file.name)}`, file, true));
  }
  if (!logo) return true;
  try {
    await api("POST", `/api/clients/${slug}/logo`, { name: logo.name, from: "inbox" });
    return true;
  } catch (e) {
    if (e.data?.code !== "shared-logo") {
      toast(e.message, true);
      return false;
    }
    const sure = await ask({
      title: "Bu logo başka bir müşteride",
      body: `${e.message}\n\nBilerek aynı logoyu kullanıyorsanız devam edebilirsiniz.`,
      confirm: "Doğru, devam et",
    });
    if (!sure) return false;
    return Boolean(await guarded(() => api("POST", `/api/clients/${slug}/logo`, { name: logo.name, from: "inbox", force: true })));
  }
}

/** What each package means for this client's jobs (src/panel/budget.ts PROFILES), in one line each. */
const PACKAGE_HINTS = {
  "": "Ayarlar'daki varsayılan paket kullanılır.",
  economy: "En az kaynak: hızlı model, internet araştırması yok, ekran görüntülerine bakılmaz.",
  balanced: "Tasarımda en güçlü model ve araştırma; tasarım skill'lerinde sadece arama yapılır.",
  premium: "Her işte en güçlü model; tasarım skill'leri tamamen yüklenir, en çok kaynak harcanır.",
};

/** The client's package, chosen before the first job so that job already runs with it. */
function packageField() {
  const select = h(
    "select",
    { id: "nc-package" },
    h("option", { value: "" }, "Varsayılan (Ayarlar)"),
    ...Object.entries(PACKAGE_NAMES).map(([k, v]) => h("option", { value: k }, v)),
  );
  const hint = h("span", { class: "help", text: PACKAGE_HINTS[""] });
  select.addEventListener("change", () => (hint.textContent = PACKAGE_HINTS[select.value] ?? ""));
  return { select, el: h("label", { for: "nc-package" }, "Paket", hint, select) };
}

/** Country and site language: the main language is Turkish in Turkey, English elsewhere; one extra may be added. */
function marketFields() {
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
  return { country, lang };
}

const MARKET_CURRENCY = { TR: "TRY", GB: "GBP", IE: "EUR", DE: "EUR", NL: "EUR", US: "USD" };
const SIGNS = { TRY: "₺", GBP: "£", EUR: "€", USD: "$" };
const LABEL_HOSTING = { managed: "Bizim Cloudflare hesabımız", client: "Müşterinin kendi hesabı" };

/** The library design picker, shown only when the library has designs; best fit for the typed sector first. */
function libraryField(industry) {
  const select = h("select", { id: "nc-design" }, h("option", { value: "" }, "Yeni tasarım (kütüphane kullanma)"));
  let designs = [];
  const fill = () => {
    const keep = select.value;
    select.replaceChildren(
      h("option", { value: "" }, "Yeni tasarım (kütüphane kullanma)"),
      ...rankedDesigns(designs, "", industry.value).map((x) =>
        h("option", { value: x.id }, `${x.score > 0 ? "★ " : ""}${x.name}${x.sector ? ` · ${x.sector}` : ""}`),
      ),
    );
    select.value = keep;
  };
  const el = h(
    "label",
    { for: "nc-design", hidden: true },
    "Başlangıç tasarımı (isteğe bağlı)",
    h("span", {
      class: "help",
      text: "Kütüphanedeki bir tasarımdan başlanır. Sabit alanlar (ad, telefon, e-posta…) panel tarafından doldurulur; agent yalnızca kalan metinleri ve markayı uyarlar.",
    }),
    select,
  );
  api("GET", "/api/library")
    .then((r) => {
      designs = r.designs;
      fill();
      el.hidden = designs.length === 0;
    })
    .catch(ignoreOptional);
  industry.addEventListener("change", fill);
  return { select, el, label: () => select.selectedOptions[0]?.textContent || "" };
}

/** Step 2's fields: the site price, a delivery date and the extras with their prices (currency from the market). */
function pricingFields(country, lang, currency) {
  const price = h("input", { id: "nc-price", type: "number", min: 0, step: "50", placeholder: "ör. 18000" });
  const deadline = h("input", { id: "nc-deadline", type: "date" });
  let extras = addonsEditor([], { prices: true, skip: ["language"], idPrefix: "nc-ad", currencySign: SIGNS[currency()] });
  const extrasBox = h("div", {}, extras.el);
  const langPrice = h("input", { id: "nc-lang-price", type: "number", min: 0, step: "any", placeholder: "Fiyat", "aria-label": "İkinci dil fiyatı" });
  const langRow = h(
    "div",
    { class: "addon-row" },
    h("span", { class: "check" }, h("span", {}, h("strong", { text: "İkinci dil" }), h("span", { class: "help", text: "" }))),
    h("span", { class: "row nowrap addon-price" }, langPrice, h("span", { class: "muted lang-sign" })),
  );
  const showLangRow = () => {
    langRow.hidden = !lang.value;
    langRow.querySelector(".lang-sign").textContent = SIGNS[currency()];
    langRow.querySelector(".help").textContent = lang.value ? `${LANG_NAMES[lang.value]} (1. adımda seçildi)` : "";
  };
  lang.addEventListener("change", showLangRow);
  country.addEventListener("change", () => {
    // The currency follows the market; the extras keep their ticks.
    const chosen = extras.value();
    extras = addonsEditor(chosen, { prices: true, skip: ["language"], idPrefix: "nc-ad", currencySign: SIGNS[currency()] });
    extrasBox.replaceChildren(extras.el);
    showLangRow();
  });
  const soldExtras = () => [
    ...(lang.value ? [{ id: "language", price: langPrice.value === "" ? null : Number(langPrice.value), value: lang.value }] : []),
    ...extras.value(),
  ];
  const total = () => (price.value === "" ? null : Number(price.value) + soldExtras().reduce((t, a) => t + (a.price || 0), 0));
  return { price, deadline, langRow, extrasBox, soldExtras, total, showLangRow };
}

/** The last step: everything chosen so far, what is missing and what each button does. */
function reviewStep(box, f, submit) {
  const { name, industry, country, lang, pkg, library, media, info, hosting, soldExtras, total, money, deadline } = f;
  const logo = media.logo();
  const photos = media.photos();
  const text = info.value.trim();
  const sold = soldExtras();
  const rows = [
    ["İşletme", `${name.value.trim()} · ${industry.value.trim()}`],
    ["Ülke ve dil", `${country.selectedOptions[0]?.textContent} · ${lang.selectedOptions[0]?.textContent}`],
    ["Barındırma", LABEL_HOSTING[hosting()]],
    ["Paket", pkg.select.selectedOptions[0]?.textContent],
    [
      "Ek seçenekler",
      sold.length
        ? sold.map((a) => `${addonLabel(a.id)}${a.value ? ` (${LANG_NAMES[a.value]})` : ""}${a.price ? ` ${money(a.price)}` : ""}`).join(", ")
        : "Yok (tek tema, WhatsApp ve randevu düğmesi yok)",
    ],
    ["Fiyat", total() === null ? "Girilmedi (sonra İş Takibi'nde)" : `Toplam ${money(total())}`],
    ["Teslim", deadline.value || "Girilmedi"],
    ["Logo", logo ? logo.name : "Yok: agent işletme adıyla bir yazı logosu tasarlar"],
    ["Fotoğraflar", photos.length ? `${photos.length} fotoğraf` : "Yok: fotoğraf uydurulmaz, çizim kullanılır"],
    ["Bilgiler", text ? `${text.length} karakter` : "Yok"],
    ...(library.select.value ? [["Başlangıç tasarımı", library.label()]] : []),
  ];
  const warnings = [
    !logo && text ? "Logo yok. Logo sonra gelirse markayı yeniden tasarlamak ayrı bir iş olur." : null,
    !text ? "Bilgi yok: site şimdi başlatılamaz. Müşteri kaydedilir; bilgi gelince Düzenleme'den başlatırsınız." : null,
  ].filter(Boolean);
  box.replaceChildren(
    h(
      "dl",
      { class: "nc-summary-list" },
      ...rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v, "data-no-i18n": k === "İşletme" ? "" : null })]),
    ),
    ...warnings.map((w) => h("p", { class: "notice small", text: w })),
    h(
      "div",
      { class: "row nc-final" },
      h("button", { class: "btn", type: "button", id: "nc-save", onclick: () => submit(false) }, "Kaydet, siteyi sonra başlat"),
      h(
        "button",
        { class: "btn btn-primary btn-lg", type: "button", id: "nc-start", disabled: !text, onclick: () => submit(true) },
        "Kaydet ve siteyi yapmaya başla",
      ),
    ),
    h("p", { class: "help", text: "Kaynak sadece 'siteyi yapmaya başla' ile harcanır. Kaydetmek ücretsizdir." }),
  );
}

/**
 * New client, step by step: business, package and price, logo and photos, information, then a summary. Nothing is
 * saved and no resources are used until the last step, where Eren sees everything and decides whether the site
 * starts now or later.
 */
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
  const { country, lang } = marketFields();
  const pkg = packageField();
  const library = libraryField(industry);
  const hostingChoice = h(
    "div",
    { class: "seg-choice", role: "radiogroup", "aria-label": "Barındırma" },
    ...Object.entries(LABEL_HOSTING).map(([v, l]) =>
      h("label", {}, h("input", { type: "radio", name: "hosting", value: v, checked: v === "managed" }), h("span", { text: l })),
    ),
  );
  const hosting = () => hostingChoice.querySelector("input:checked")?.value || "managed";
  const currency = () => MARKET_CURRENCY[country.value] || "EUR";
  const pricing = pricingFields(country, lang, currency);
  const { price, deadline } = pricing;
  const soldExtras = pricing.soldExtras;
  const total = pricing.total;
  const money = (n) => `${SIGNS[currency()]}${Number(n).toLocaleString(locale())}`;
  // The summary is drawn on the last step, so the picker needs no change hook here.
  const media = mediaPicker(() => undefined);

  const steps = [
    {
      title: "İşletme",
      el: h(
        "div",
        { class: "stack" },
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
        library.el,
      ),
      fields: [name, slug, industry],
    },
    {
      title: "Paket ve fiyat",
      el: h(
        "div",
        { class: "stack" },
        pkg.el,
        h(
          "div",
          { class: "two" },
          h("label", { for: "nc-price" }, "Site fiyatı (isteğe bağlı)", price),
          h("label", { for: "nc-deadline" }, "Teslim tarihi (isteğe bağlı)", deadline),
        ),
        h(
          "div",
          { class: "nc-field" },
          h("span", { class: "nc-label", text: "Ek seçenekler" }),
          h("span", { class: "help", text: "Müşteri ne istediyse işaretleyin ve fiyatını yazın; agent sadece bunları yapar, teklifte ayrı satır olur." }),
          pricing.langRow,
          pricing.extrasBox,
        ),
      ),
      fields: [price],
    },
    { title: "Logo ve fotoğraflar", el: media.el, fields: [] },
    {
      title: "Bilgiler",
      el: h(
        "div",
        { class: "stack" },
        h("label", { for: "nc-info" }, "Müşteriden gelen bilgiler"),
        h("p", {
          class: "help",
          text: "Müşterinin e-postasını, WhatsApp mesajını ya da kendi notlarını yapıştırın. Eksik bilgi olursa agent size sorar; uydurmaz.",
        }),
        info,
        infoGuide(info),
      ),
      fields: [],
    },
    { title: "Özet ve başlat", el: h("div", { class: "stack nc-review" }), fields: [] },
  ];

  const drawReview = () =>
    reviewStep(steps[4].el, { name, industry, country, lang, pkg, library, media, info, hosting, soldExtras, total, money, deadline }, submit);
  let current = 0;
  const stepper = h("ol", { class: "nc-steps", "aria-label": "Adımlar" });
  const body = h("section", { class: "card stack nc-step" });
  const back = h("button", { class: "btn", type: "button", onclick: () => go(current - 1) }, "Geri");
  const next = h("button", { class: "btn btn-primary", type: "button", id: "nc-next", onclick: () => go(current + 1) }, "İleri");
  const valid = (i) => steps[i].fields.every((f) => f.checkValidity());
  const go = (i) => {
    if (i < 0 || i >= steps.length) return;
    // Forward only through valid steps; back is always allowed.
    for (let k = current; k < i; k++) {
      if (!valid(k)) {
        current = k;
        draw();
        steps[k].fields.find((f) => !f.checkValidity())?.reportValidity();
        return;
      }
    }
    current = i;
    draw();
  };
  const draw = () => {
    if (current === 4) drawReview();
    stepper.replaceChildren(
      ...steps.map((s, i) =>
        h(
          "li",
          { class: i === current ? "is-current" : i < current ? "is-done" : "" },
          h(
            "button",
            { type: "button", onclick: () => go(i), "aria-current": i === current ? "step" : null },
            h("span", { class: "nc-step-no", text: String(i + 1) }),
            s.title,
          ),
        ),
      ),
    );
    body.replaceChildren(h("h2", { class: "nc-title", text: `${current + 1}. ${steps[current].title}` }), steps[current].el);
    back.hidden = current === 0;
    next.hidden = current === steps.length - 1;
  };

  const submit = async (start) => {
    const res = await guarded(() =>
      api("POST", "/api/clients", {
        businessName: name.value.trim(),
        slug: slug.value.trim(),
        industry: industry.value.trim(),
        hostingModel: hosting(),
        country: country.value,
        extraLocale: lang.value || undefined,
        ...(library.select.value ? { startDesign: library.select.value } : {}),
      }),
    );
    if (!res) return;
    await guarded(() =>
      api("PUT", `/api/clients/${res.slug}/business`, {
        price: price.value === "" ? null : Number(price.value),
        currency: currency(),
        deadline: deadline.value || null,
        payment: price.value === "" ? "none" : "quoted",
        addons: soldExtras(),
        budgetMode: pkg.select.value,
      }),
    );
    const mediaOk = await uploadMedia(res.slug, media.logo(), media.photos());
    toast("Müşteri kaydedildi.");
    location.hash = `#/musteri/${res.slug}/duzenle`;
    // Without the right logo no design job starts; the client page shows what to fix.
    if (!start || !mediaOk) return;
    await runAgent(res.slug, "create-site", { freeText: info.value.trim(), ...(library.select.value ? { libraryId: library.select.value } : {}) });
  };

  pricing.showLangRow();
  draw();
  return h(
    "form",
    { class: "new-client nc-wizard", onsubmit: (e) => e.preventDefault() },
    h(
      "header",
      { class: "nc-head" },
      h("h1", { text: "Yeni Müşteri" }),
      h("p", { class: "muted", text: "Adım adım doldurun; her şey netleşince son adımda siteyi başlatın. O ana kadar hiç kaynak harcanmaz." }),
    ),
    stepper,
    body,
    h("footer", { class: "nc-foot" }, back, next),
  );
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
    items: ["Logo ve fotoğraflar: soldaki 2. adımda seç", "Marka renkleri (ör. lacivert + altın) ya da sevdikleri/sevmedikleri siteler"],
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
