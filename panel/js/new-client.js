// The new-client form and the what-to-paste guide.
import { api, ask, guarded, h, ignoreOptional, LANG_NAMES, PACKAGE_NAMES, toast } from "./core.js";
import { addonsEditor } from "./addons.js";
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
    h("h2", { class: "nc-title", text: "2. Logo ve fotoğraflar" }),
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
  // Extras the client asked for: the agent builds exactly these (the second language comes from "Site dili").
  const extras = addonsEditor([], { skip: ["language"], idPrefix: "nc-ad" });
  const MARKET_CURRENCY = { TR: "TRY", GB: "GBP", IE: "EUR", DE: "EUR", NL: "EUR", US: "USD" };
  const soldExtras = () => [...(lang.value ? [{ id: "language", price: null, value: lang.value }] : []), ...extras.value()];
  // What pressing the button will do, kept up to date as the form is filled.
  const summary = h("p", { class: "small muted nc-summary", role: "status" });
  let media = null;
  const showSummary = () => {
    if (!media) return; // the picker draws once while it is being built
    const parts = [];
    const l = media.logo();
    const n = media.photos().length;
    if (l) parts.push("logo yüklenir");
    if (n) parts.push(`${n} fotoğraf yüklenir`);
    parts.push(info.value.trim() ? "site hemen hazırlanmaya başlar" : "site bilgi gelince hazırlanır");
    summary.textContent = `Oluşturunca: ${parts.join(", ")}.`;
  };
  media = mediaPicker(() => showSummary());
  info.addEventListener("input", showSummary);
  showSummary();
  const form = h(
    "form",
    {
      class: "new-client",
      onsubmit: async (e) => {
        e.preventDefault();
        const text = info.value.trim();
        const logo = media.logo();
        const photos = media.photos();
        // Decided here, before any resources are spent: a design made without the logo has to be redone later.
        if (text && !logo) {
          const go = await ask({
            title: "Logo yüklenmedi",
            body: `Agent işletme adıyla bir yazı logosu tasarlar ve markayı ona göre kurar. Logo sonra gelirse markayı yeniden tasarlamak ayrı bir iş olur.${photos.length ? "" : "\n\nFotoğraf da yok: fotoğraf uydurulmaz, çizim ve şekiller kullanılır."}`,
            confirm: "Yazı logosuyla başla",
            cancel: "Önce logo ekleyeceğim",
          });
          if (!go) {
            media.focusLogo();
            return;
          }
        }
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
        // Recorded before any job, so the very first design already follows what was sold (prices come later).
        await guarded(() =>
          api("PUT", `/api/clients/${res.slug}/business`, {
            currency: MARKET_CURRENCY[country.value] || "EUR",
            addons: soldExtras(),
            budgetMode: pkg.select.value,
          }),
        );
        const mediaOk = await uploadMedia(res.slug, logo, photos);
        toast("Müşteri oluşturuldu.");
        location.hash = `#/musteri/${res.slug}/duzenle`;
        // Without the right logo no design job starts; the client page shows what to fix.
        if (!text || !mediaOk) return;
        await runAgent(res.slug, "create-site", { freeText: text, ...(startDesign.value ? { libraryId: startDesign.value } : {}) });
      },
    },
    h(
      "header",
      { class: "nc-head" },
      h("h1", { text: "Yeni Müşteri" }),
      h("p", {
        class: "muted",
        text: "Üç adım: işletmeyi tanımlayın, varsa logo ve fotoğrafları seçin, müşteriden gelen bilgileri yapıştırın. Bilgi yapıştırırsanız site hemen hazırlanmaya başlar.",
      }),
    ),
    h(
      "div",
      { class: "nc-col" },
      h(
        "section",
        { class: "card stack nc-business" },
        h("h2", { class: "nc-title", text: "1. İşletme" }),
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
        pkg.el,
        h(
          "div",
          { class: "nc-field" },
          h("span", { class: "nc-label", text: "Ek seçenekler" }),
          h("span", { class: "help", text: "Müşteri ne istediyse işaretleyin; agent sadece bunları yapar. Fiyatları sonra İş Takibi'nde girersiniz." }),
          extras.el,
        ),
        designRow,
      ),
    ),
    h(
      "div",
      { class: "nc-col" },
      media.el,
      h(
        "section",
        { class: "card stack nc-info" },
        h("h2", { class: "nc-title", text: "3. Müşteriden gelen bilgiler" }),
        h("label", { for: "nc-info", class: "sr-only" }, "Elindeki bilgiler"),
        h("p", { class: "help", text: "İsteğe bağlı. Doldurursanız site hemen hazırlanmaya başlar; eksik bilgi olursa size sorulur." }),
        info,
        infoGuide(info),
      ),
    ),
    h("footer", { class: "nc-foot" }, summary, h("button", { class: "btn btn-primary btn-lg", type: "submit" }, "Müşteriyi oluştur")),
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
