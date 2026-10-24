// The new-client form and the what-to-paste guide.
import { addonLabel } from "./addons.js";
import { api, ask, guarded, h, ICON, LANG_NAMES, svg, toast } from "./core.js";
import { locale } from "./i18n.js";
import { runAgent } from "./jobs.js";
import {
  field,
  group,
  hostingField,
  infoFound,
  LABEL_HOSTING,
  libraryField,
  MARKET_CURRENCY,
  marketFields,
  mediaPicker,
  packageField,
  pricingFields,
  productField,
  sectorSuggestions,
} from "./new-client-fields.js";

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

/** The last step: everything chosen so far in groups (each with a way back to its step), what is missing, the two buttons. */
function reviewStep(box, f, submit, go) {
  const { name, industry, country, lang, pkg, library, media, info, hosting, pricing, deadline, kind } = f;
  const logo = media.logo();
  const photos = media.photos();
  const text = info.value.trim();
  const sold = pricing.soldExtras();
  const total = pricing.total();
  const groups = [
    [
      "İşletme",
      0,
      [
        ["Site türü", kind.label()],
        ["İşletme", `${name.value.trim()} (${industry.value.trim()})`, true],
        // The option texts are already in the panel language.
        ["Ülke ve dil", `${country.selectedOptions[0]?.textContent}, ${lang.selectedOptions[0]?.textContent}`, true],
        ["Barındırma", LABEL_HOSTING[hosting.value()]],
        ...(library.select.value ? [["Başlangıç tasarımı", library.label()]] : []),
      ],
    ],
    [
      "Paket ve fiyat",
      1,
      [
        ["Paket", pkg.label()],
        [
          "Ek seçenekler",
          sold.length
            ? sold.map((a) => `${addonLabel(a.id)}${a.value ? ` (${LANG_NAMES[a.value]})` : ""}${a.price ? ` ${pricing.money(a.price)}` : ""}`).join(", ")
            : "Yok (tek tema, WhatsApp ve randevu düğmesi yok)",
        ],
        ["Fiyat", total === null ? "Girilmedi (sonra İş Takibi'nde)" : `Toplam ${pricing.money(total)}`],
        [
          "Teslim",
          deadline.value ? new Date(`${deadline.value}T12:00`).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }) : "Girilmedi",
        ],
      ],
    ],
    [
      "Logo ve fotoğraflar",
      2,
      [
        ["Logo", logo ? logo.name : "Yok: agent işletme adıyla bir yazı logosu tasarlar", Boolean(logo)],
        ["Fotoğraflar", photos.length ? `${photos.length} fotoğraf` : "Yok: fotoğraf uydurulmaz, çizim kullanılır"],
      ],
    ],
    ["Bilgiler", 3, [["Müşteri bilgileri", text ? `${text.length.toLocaleString(locale())} karakter` : "Yok"]]],
  ];
  const warnings = [
    !logo && text ? "Logo yok. Logo sonra gelirse markayı yeniden tasarlamak ayrı bir iş olur." : null,
    !text ? "Bilgi yok: site şimdi başlatılamaz. Müşteri kaydedilir; bilgi gelince Düzenleme'den başlatırsınız." : null,
  ].filter(Boolean);
  box.replaceChildren(
    ...groups.map(([title, step, rows]) =>
      h(
        "section",
        { class: "nc-review-group" },
        h("header", {}, h("h3", { text: title }), h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => go(step) }, "Düzenle")),
        h("dl", { class: "nc-summary-list" }, ...rows.flatMap(([k, v, raw]) => [h("dt", { text: k }), h("dd", { text: v, "data-no-i18n": raw ? "" : null })])),
      ),
    ),
    ...warnings.map((w) => h("p", { class: "notice small", text: w })),
    h(
      "div",
      { class: "nc-final" },
      h(
        "button",
        { class: "btn btn-primary btn-lg", type: "button", id: "nc-start", disabled: !text, onclick: () => submit(true) },
        "Kaydet ve siteyi yapmaya başla",
      ),
      h("button", { class: "btn", type: "button", id: "nc-save", onclick: () => submit(false) }, "Kaydet, siteyi sonra başlat"),
    ),
    h("p", { class: "help", text: "Kaynak sadece 'siteyi yapmaya başla' ile harcanır. Kaydetmek ücretsizdir." }),
  );
}

/** The five steps: title, one line under it, the fields, which inputs must be valid, and the line in the left column. */
function wizardSteps(f) {
  const { name, slug, industry, info, country, lang, kind, hosting, pkg, library, pricing, deadline, media, found, totalLine } = f;
  const { price } = pricing;
  return [
    {
      title: "İşletme",
      desc: "Kim için, hangi pazarda ve nereye yayınlanacak.",
      el: h(
        "div",
        { class: "nc-groups" },
        group("Site türü", null, kind.el),
        group(
          "İşletme",
          null,
          h(
            "div",
            { class: "two" },
            field("nc-name", "İşletme adı", name),
            field("nc-slug", "Kısa ad", slug, "Klasör ve adres için; otomatik dolar, sonradan değişmez."),
          ),
          field("nc-industry", "Sektör", industry, "İngilizce kısa ad en iyi sonucu verir."),
          sectorSuggestions(industry),
        ),
        group(
          "Pazar ve dil",
          "Para birimi ve kişisel veri kuralları ülkeye göre seçilir.",
          h("div", { class: "two" }, field("nc-country", "Ülke", country), field("nc-lang", "Site dili", lang)),
        ),
        group("Barındırma", null, hosting.el),
        library.el,
      ),
      fields: [name, slug, industry],
      sub: () => (name.value.trim() ? [name.value.trim(), industry.value.trim()].filter(Boolean).join(", ") : "Ad ve sektör"),
    },
    {
      title: "Paket ve fiyat",
      desc: "Agent'ın kaynak paketi, teklif fiyatı ve müşterinin istediği ek seçenekler.",
      el: h(
        "div",
        { class: "nc-groups" },
        group("Paket", "Her işte kullanılacak modeli ve kaynak sınırını belirler.", pkg.el),
        group(
          "Fiyat ve teslim",
          "İsteğe bağlı; teklif ve iş takibinde kullanılır.",
          h("div", { class: "two" }, field("nc-price", "Site fiyatı", pricing.priceBox), field("nc-deadline", "Teslim tarihi", deadline)),
        ),
        group(
          "Ek seçenekler",
          "Müşteri ne istediyse işaretleyin ve fiyatını yazın; agent sadece bunları yapar, teklifte ayrı satır olur.",
          pricing.langRow,
          pricing.extrasBox,
          totalLine,
        ),
      ),
      fields: [price],
      sub: () => {
        const t = pricing.total();
        return `${pkg.label()}, ${t === null ? "fiyat yok" : pricing.money(t)}`;
      },
    },
    {
      title: "Logo ve fotoğraflar",
      desc: "İsteğe bağlı. PNG, JPG, WebP, AVIF ya da SVG; yükleme müşteri kaydedilince yapılır.",
      el: media.el,
      fields: [],
      sub: () => [media.logo() ? "Logo var" : "Logo yok", media.photos().length ? `${media.photos().length} fotoğraf` : null].filter(Boolean).join(", "),
    },
    {
      title: "Bilgiler",
      desc: "Müşterinin e-postasını, WhatsApp mesajını ya da kendi notlarınızı yapıştırın. Eksik bilgi olursa agent size sorar; uydurmaz.",
      el: h(
        "div",
        { class: "nc-info-step" },
        h("label", { for: "nc-info", class: "sr-only" }, "Müşteriden gelen bilgiler"),
        info,
        found.el,
        infoGuide(info, () => found.draw()),
      ),
      fields: [],
      sub: () => (info.value.trim() ? `${info.value.trim().length.toLocaleString(locale())} karakter` : "Boş"),
    },
    {
      title: "Özet ve başlat",
      desc: "Kontrol edin. Kaydetmek ücretsizdir; kaynak yalnızca siteyi başlattığınızda harcanır.",
      el: h("div", { class: "nc-review" }),
      fields: [],
      sub: () => (info.value.trim() && name.value.trim() ? "Başlamaya hazır" : "Eksikler var"),
    },
  ];
}

/** Saves the client, its business record and media; starts the first job when asked and the logo is in place. */
async function saveClient(f, start) {
  const { name, slug, industry, info, country, lang, kind, hosting, pkg, library, pricing, deadline, media, currency } = f;
  const { price } = pricing;
  const res = await guarded(() =>
    api("POST", "/api/clients", {
      businessName: name.value.trim(),
      slug: slug.value.trim(),
      industry: industry.value.trim(),
      hostingModel: hosting.value(),
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
      addons: pricing.soldExtras(),
      budgetMode: pkg.value(),
      product: kind.value(),
    }),
  );
  const mediaOk = await uploadMedia(res.slug, media.logo(), media.photos());
  toast("Müşteri kaydedildi.");
  location.hash = `#/musteri/${res.slug}/duzenle`;
  // Without the right logo no design job starts; the client page shows what to fix.
  if (!start || !mediaOk) return;
  await runAgent(res.slug, "create-site", { freeText: info.value.trim(), ...(library.select.value ? { libraryId: library.select.value } : {}) });
}

/**
 * New client, step by step: business, package and price, logo and photos, information, then a summary. Nothing is
 * saved and no resources are used until the last step, where the operator sees everything and decides whether the site
 * starts now or later. The left column shows the steps with what each holds so far, and what starting still needs.
 */
export function renderNew() {
  const name = h("input", { type: "text", id: "nc-name", required: true, maxlength: 80, autocomplete: "off", placeholder: "ör. Mavi Kapı Fırın" });
  const slug = h("input", { type: "text", id: "nc-slug", required: true, maxlength: 40, pattern: "[a-z0-9][a-z0-9\\-]{1,38}[a-z0-9]", spellcheck: "false" });
  let slugTouched = false;
  name.addEventListener("input", () => {
    if (!slugTouched) slug.value = slugify(name.value);
  });
  slug.addEventListener("input", () => (slugTouched = true));
  const industry = h("input", { type: "text", id: "nc-industry", required: true, maxlength: 60, placeholder: "ör. hair salon, family law solicitor" });
  const info = h("textarea", {
    id: "nc-info",
    rows: 14,
    class: "field",
    maxlength: 20000,
    placeholder: "Ör: Erkek kuaförü, Mono. Saç kesimi 500 TL, sakal 300 TL. Ankara Sincan, 0534 985 63 19. Siyah-beyaz renkler.",
  });
  let refresh = () => undefined;
  const { country, lang } = marketFields();
  const kind = productField();
  const hosting = hostingField(() => refresh());
  const pkg = packageField(() => refresh());
  const library = libraryField(industry);
  const currency = () => MARKET_CURRENCY[country.value] || "EUR";
  const pricing = pricingFields(country, lang, currency);
  const { deadline } = pricing;
  const media = mediaPicker(() => refresh());
  const found = infoFound(info);
  const totalLine = h("p", { class: "nc-total", "aria-live": "polite" });

  const f = { name, slug, industry, info, country, lang, kind, hosting, pkg, library, pricing, deadline, media, found, totalLine, currency };
  const steps = wizardSteps(f);

  let current = 0;
  let reached = 0;
  const rail = h("ol", { class: "nc-rail", "aria-label": "Adımlar" });
  const ready = h("ul", { class: "nc-ready" });
  const head = h("header", { class: "nc-panel-head" });
  const body = h("div", { class: "nc-panel-body" });
  const back = h("button", { class: "btn btn-ghost", type: "button", onclick: () => go(current - 1) }, svg(ICON.chevronLeft, 16, 2), "Geri");
  const next = h("button", { class: "btn btn-primary", type: "button", id: "nc-next", onclick: () => go(current + 1) });
  const valid = (i) => steps[i].fields.every((x) => x.checkValidity());
  const go = (i) => {
    if (i < 0 || i >= steps.length) return;
    // Forward only through valid steps; back is always allowed.
    for (let k = current; k < i; k++) {
      if (!valid(k)) {
        current = k;
        draw();
        steps[k].fields.find((x) => !x.checkValidity())?.reportValidity();
        return;
      }
    }
    current = i;
    reached = Math.max(reached, i);
    draw();
    panel.scrollIntoView({ block: "nearest" });
  };
  refresh = () => {
    rail.querySelectorAll(".nc-rail-sub").forEach((el, i) => (el.textContent = steps[i].sub()));
    const t = pricing.total();
    totalLine.replaceChildren(h("span", { text: "Teklif toplamı" }), h("strong", { text: t === null ? "Fiyat girilmedi" : pricing.money(t) }));
    const needs = [
      [Boolean(name.value.trim() && industry.value.trim()), "İşletme adı ve sektör"],
      [Boolean(info.value.trim()), "Müşteri bilgileri"],
      [Boolean(media.logo()), "Logo (isteğe bağlı)"],
    ];
    ready.replaceChildren(
      ...needs.map(([ok, label]) =>
        h("li", { class: ok ? "ok" : "" }, h("span", { class: "nc-found-mark", "aria-hidden": "true" }, ok ? svg(ICON.check, 12, 3) : null), label),
      ),
    );
  };
  const draw = () => {
    if (current === 4) reviewStep(steps[4].el, { name, industry, country, lang, pkg, library, media, info, hosting, pricing, deadline, kind }, submit, go);
    rail.replaceChildren(
      ...steps.map((s, i) =>
        h(
          "li",
          { class: i === current ? "is-current" : i < current || i <= reached ? "is-done" : "" },
          h(
            "button",
            { type: "button", onclick: () => go(i), "aria-current": i === current ? "step" : null },
            h("span", { class: "nc-rail-no", "aria-hidden": "true" }, i < current ? svg(ICON.check, 12, 3) : String(i + 1)),
            h(
              "span",
              { class: "nc-rail-text" },
              h("span", { class: "nc-rail-title", text: s.title }),
              h("span", { class: "nc-rail-sub", "data-no-i18n": i === 0 && name.value.trim() ? "" : null }),
            ),
          ),
        ),
      ),
    );
    head.replaceChildren(
      h("span", { class: "nc-count", text: `Adım ${current + 1} / ${steps.length}` }),
      h("h2", { class: "nc-title", text: steps[current].title }),
      h("p", { class: "muted small", text: steps[current].desc }),
    );
    body.replaceChildren(steps[current].el);
    back.hidden = current === 0;
    next.hidden = current === steps.length - 1;
    next.replaceChildren(h("span", { text: current < steps.length - 1 ? `Devam: ${steps[current + 1].title}` : "" }), svg(ICON.chevronRight, 16, 2));
    refresh();
  };

  const submit = (start) => saveClient(f, start);

  const panel = h("section", { class: "card nc-panel" }, head, body, h("footer", { class: "nc-foot" }, back, next));
  const form = h(
    "form",
    { class: "new-client nc-wizard", onsubmit: (e) => e.preventDefault(), oninput: () => refresh(), onchange: () => refresh() },
    h(
      "header",
      { class: "nc-head" },
      h("h1", { text: "Yeni Müşteri" }),
      h("p", { class: "muted", text: "Adım adım doldurun; her şey netleşince son adımda siteyi başlatın. O ana kadar hiç kaynak harcanmaz." }),
    ),
    h(
      "div",
      { class: "nc-layout" },
      h("aside", { class: "nc-side" }, rail, h("div", { class: "nc-ready-box" }, h("p", { class: "qe-label", text: "Siteyi başlatmak için" }), ready)),
      panel,
    ),
  );
  pricing.showLangRow();
  draw();
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
