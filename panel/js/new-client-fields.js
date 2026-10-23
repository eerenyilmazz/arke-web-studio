// The fields of the new-client form, one builder each. Every builder returns its element(s) and readers; the form
// (new-client.js) arranges them into steps and draws the summary from the readers.
import { addonsEditor } from "./addons.js";
import { api, h, ICON, ignoreOptional, LANG_NAMES, PACKAGE_NAMES, svg } from "./core.js";
import { locale } from "./i18n.js";
import { rankedDesigns } from "./library.js";
import { optionCards } from "./ui-kit.js";

export const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/avif,image/svg+xml";
const MAX_PHOTOS = 20;
const SHOWN_PHOTOS = 8;
export const MARKET_CURRENCY = { TR: "TRY", GB: "GBP", IE: "EUR", DE: "EUR", NL: "EUR", US: "USD" };
export const SIGNS = { TRY: "₺", GBP: "£", EUR: "€", USD: "$" };
export const LABEL_HOSTING = { managed: "Bizim Cloudflare hesabımız", client: "Müşterinin kendi hesabı" };

/** A labelled field with its hint under the box, so boxes side by side stay level. */
export const field = (id, label, input, hint) =>
  h(
    "label",
    { for: id, class: "nc-input" },
    h("span", { class: "nc-input-label", text: label }),
    input,
    hint ? h("span", { class: "help help-after", text: hint }) : null,
  );

/** A titled group of fields inside a step. */
export const group = (title, note, ...children) =>
  h(
    "fieldset",
    { class: "nc-group" },
    h("legend", { text: title }),
    note ? h("p", { class: "nc-group-note", text: note }) : null,
    h("div", { class: "nc-group-body" }, ...children),
  );

// ---------------------------------------------------------------- step 1

/**
 * The kind of site: Tanıtım today; E-ticaret, Randevu and Restoran-Kafe are listed as "yakında" until their factory
 * parts are ready. Read from the server, so a kind becomes selectable without a panel change.
 */
export function productField() {
  const box = h("div", { class: "kind-seg", role: "radiogroup", "aria-label": "Site türü" });
  const summary = h("p", { class: "muted small kind-summary-line", "aria-live": "polite" });
  let chosen = "showcase";
  const names = { showcase: "Tanıtım sitesi" };
  const summaries = {};
  const showSummary = () => (summary.textContent = summaries[chosen] || "");
  const draw = (products) => {
    box.replaceChildren(
      ...products.map((p) => {
        names[p.id] = p.name;
        summaries[p.id] = p.summary;
        const soon = p.status !== "active";
        const input = h("input", {
          type: "radio",
          name: "nc-kind",
          value: p.id,
          checked: p.id === chosen,
          disabled: soon,
          id: `nc-kind-${p.id}`,
          class: "sr-only",
        });
        input.addEventListener("change", () => {
          chosen = p.id;
          showSummary();
        });
        return h(
          "label",
          { class: `kind-opt${soon ? " is-soon" : ""}`, for: input.id, title: p.summary || null },
          input,
          h("span", { text: p.name }),
          soon ? h("span", { class: "kind-soon", text: "yakında" }) : null,
        );
      }),
    );
    showSummary();
  };
  draw([{ id: "showcase", name: "Tanıtım sitesi", summary: "", status: "active" }]);
  api("GET", "/api/products")
    .then((r) => draw(r.products))
    .catch(() => {
      /* the showcase choice stays; the others appear when the panel is up to date */
    });
  return { el: h("div", { class: "nc-kind" }, box, summary), value: () => chosen, label: () => names[chosen] || chosen };
}

/** Common sectors, one click each; the typed text is what counts (English names give the best research). */
const SECTOR_SUGGESTIONS = ["hair salon", "barber shop", "dentist", "bakery", "cafe", "restaurant", "law firm", "accountant", "plumber", "beauty salon"];

export function sectorSuggestions(input) {
  return h(
    "div",
    { class: "nc-suggest", "aria-label": "Örnek sektörler" },
    ...SECTOR_SUGGESTIONS.map((s) =>
      h(
        "button",
        {
          type: "button",
          class: "nc-suggest-chip",
          "data-no-i18n": "",
          onclick: () => {
            input.value = s;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          },
        },
        s,
      ),
    ),
  );
}

/** Country and site language: the main language is Turkish in Turkey, English elsewhere; one extra may be added. */
export function marketFields() {
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

export function hostingField(onChange) {
  return optionCards({
    name: "hosting",
    idPrefix: "nc-hosting",
    label: "Barındırma",
    value: "managed",
    onChange,
    options: [
      { value: "managed", label: LABEL_HOSTING.managed, desc: "Siz yayınlarsınız; alan adı ve hesap sizde." },
      { value: "client", label: LABEL_HOSTING.client, desc: "Müşterinin Cloudflare hesabına yayınlanır; erişimi müşteri verir." },
    ],
  });
}

/** The library design picker, shown only when the library has designs; best fit for the typed sector first. */
export function libraryField(industry) {
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
  const el = group(
    "Başlangıç tasarımı",
    "Kütüphanedeki bir tasarımdan başlanır. Sabit alanlar (ad, telefon, e-posta…) panel tarafından doldurulur; agent yalnızca kalan metinleri ve markayı uyarlar.",
    field("nc-design", "Tasarım (isteğe bağlı)", select),
  );
  el.hidden = true;
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

// ---------------------------------------------------------------- step 2

/** What each package means for this client's jobs (src/panel/budget.ts PROFILES), in one line each. */
const PACKAGE_HINTS = {
  "": "Ayarlar'daki varsayılan paket.",
  economy: "Hızlı model, araştırma yok. En az kaynak.",
  balanced: "Tasarımda en güçlü model ve araştırma.",
  premium: "Her işte en güçlü model; en çok kaynak.",
};

/** The client's package, chosen before the first job so that job already runs with it. */
export function packageField(onChange) {
  const options = [["", "Varsayılan"], ...Object.entries(PACKAGE_NAMES)].map(([value, label]) => ({ value, label, desc: PACKAGE_HINTS[value] }));
  const cards = optionCards({ name: "nc-package", idPrefix: "nc-package", label: "Paket", value: "", columns: 4, options, onChange });
  return { el: cards.el, value: cards.value, label: () => options.find((o) => o.value === cards.value())?.label || "" };
}

/** Step 2's fields: the site price, a delivery date and the extras with their prices (currency from the market). */
export function pricingFields(country, lang, currency) {
  const price = h("input", { id: "nc-price", type: "number", min: 0, step: "50", placeholder: "18000", inputmode: "numeric" });
  const sign = h("span", { class: "nc-affix", "aria-hidden": "true" });
  const priceBox = h("div", { class: "nc-money" }, sign, price);
  const deadline = h("input", { id: "nc-deadline", type: "date" });
  let extras = addonsEditor([], { prices: true, skip: ["language"], idPrefix: "nc-ad", currencySign: SIGNS[currency()] });
  const extrasBox = h("div", { class: "nc-addons" }, extras.el);
  const langPrice = h("input", { id: "nc-lang-price", type: "number", min: 0, step: "any", placeholder: "Fiyat", "aria-label": "İkinci dil fiyatı" });
  const langRow = h(
    "div",
    { class: "addon-row nc-lang-row" },
    h("span", { class: "check" }, h("span", {}, h("strong", { text: "İkinci dil" }), h("span", { class: "help", text: "" }))),
    h("span", { class: "row nowrap addon-price" }, langPrice, h("span", { class: "muted lang-sign" })),
  );
  const showLangRow = () => {
    langRow.hidden = !lang.value;
    langRow.querySelector(".lang-sign").textContent = SIGNS[currency()];
    langRow.querySelector(".help").textContent = lang.value ? `${LANG_NAMES[lang.value]} (1. adımda seçildi)` : "";
    sign.textContent = SIGNS[currency()];
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
  const money = (n) => `${SIGNS[currency()]}${Number(n).toLocaleString(locale())}`;
  return { price, priceBox, deadline, langRow, extrasBox, soldExtras, total, showLangRow, money };
}

// ---------------------------------------------------------------- step 3

const thumb = (file) => {
  const url = URL.createObjectURL(file);
  const img = h("img", { src: url, alt: "" });
  img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
  return img;
};

/** Drag-and-drop onto `zone` calls `take` with the image files. */
const droppable = (zone, take) => {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("over");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    take([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });
};

/**
 * Step 3: the client's logo and photos, chosen before the client exists and uploaded right after it is created. The
 * lines under each box say what the agent does with or without them, so nothing is decided silently.
 */
export function mediaPicker(onChange) {
  let logo = null;
  let photos = [];
  const logoInput = h("input", { type: "file", accept: IMAGE_TYPES, id: "nc-logo", class: "sr-only" });
  const photoInput = h("input", { type: "file", accept: IMAGE_TYPES, multiple: true, id: "nc-photos", class: "sr-only" });
  const logoZone = h("div", { class: "nc-drop nc-drop-logo" });
  const photoZone = h("div", { class: "nc-drop nc-drop-photos" });
  const logoNote = h("p", { class: "small" });
  const photoNote = h("p", { class: "small" });
  const empty = (forId, title, sub) =>
    h("label", { for: forId, class: "nc-drop-empty" }, svg(ICON.upload, 22, 1.7), h("strong", { text: title }), h("span", { class: "muted small", text: sub }));
  const draw = () => {
    logoZone.replaceChildren(
      logo
        ? h(
            "div",
            { class: "nc-logo-chosen" },
            h("div", { class: "nc-logo-paper" }, thumb(logo)),
            h("span", { class: "nc-media-name", text: logo.name, "data-no-i18n": "" }),
            h(
              "div",
              { class: "row" },
              h("label", { for: "nc-logo", class: "btn btn-sm" }, "Değiştir"),
              h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => ((logo = null), (logoInput.value = ""), draw()) }, "Kaldır"),
            ),
          )
        : empty("nc-logo", "Logo seç", "Sürükleyin ya da tıklayın"),
    );
    logoNote.className = `small ${logo ? "ok-text" : "muted"}`;
    logoNote.textContent = logo ? "Marka bu logodan çıkarılır: renkler, biçim ve imza hareketi." : "Logo yok: agent işletme adıyla bir yazı logosu tasarlar.";
    photoZone.replaceChildren(
      photos.length
        ? h(
            "div",
            { class: "nc-photo-grid" },
            ...photos.slice(0, SHOWN_PHOTOS).map((f) => h("div", { class: "nc-photo" }, thumb(f))),
            photos.length > SHOWN_PHOTOS ? h("div", { class: "nc-photo nc-photo-more", text: `+${photos.length - SHOWN_PHOTOS}` }) : null,
            h(
              "label",
              { for: "nc-photos", class: "nc-photo nc-photo-add", title: "Fotoğraf ekle" },
              svg(ICON.plus, 18, 2),
              h("span", { class: "sr-only", text: "Fotoğraf ekle" }),
            ),
          )
        : empty("nc-photos", "Fotoğraf seç", `Birden çok seçebilirsiniz (en fazla ${MAX_PHOTOS})`),
    );
    photoNote.className = `small ${photos.length ? "ok-text" : "muted"}`;
    photoNote.textContent = photos.length ? `${photos.length} fotoğraf sitede kullanılır.` : "Fotoğraf yok: fotoğraf uydurulmaz; çizim ve şekiller kullanılır.";
    clearPhotos.hidden = !photos.length;
    onChange();
  };
  const setLogo = (f) => {
    logo = f || null;
    draw();
  };
  const addPhotos = (files) => {
    photos = [...photos, ...files].slice(0, MAX_PHOTOS);
    draw();
  };
  logoInput.addEventListener("change", () => setLogo(logoInput.files[0]));
  photoInput.addEventListener("change", () => {
    addPhotos([...photoInput.files]);
    photoInput.value = "";
  });
  droppable(logoZone, (files) => files[0] && setLogo(files[0]));
  droppable(photoZone, addPhotos);
  const clearPhotos = h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => ((photos = []), draw()) }, "Fotoğrafları kaldır");
  const el = h(
    "div",
    { class: "nc-media" },
    group("Logo", null, logoInput, logoZone, logoNote),
    group("Fotoğraflar", null, photoInput, photoZone, h("div", { class: "nc-media-foot" }, photoNote, clearPhotos)),
  );
  draw();
  return { el, logo: () => logo, photos: () => photos };
}

// ---------------------------------------------------------------- step 4

/** Rough checks of what a pasted text already contains, shown as a list so the operator sees gaps before starting. */
const FOUND = [
  ["Telefon", /(\+?\d[\d\s().-]{7,}\d)/],
  ["E-posta", /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ["Adres", /\b(cad|sok|mah|street|road|st\.|rd\.|avenue|lane|no[:.]?\s*\d|\d{4,5}\s|[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2})/i],
  ["Çalışma saatleri", /\b\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}\b|\b(pazartesi|hafta içi|mon|weekdays|open)\b/i],
  ["Fiyat", /(₺|£|€|\$|\bTL\b|\bGBP\b|\bEUR\b)\s?\d|\d\s?(₺|£|€|TL)/i],
  ["Hizmetler", /(^|\n)\s*[-•*]\s*\S|hizmet|services?/i],
];

export function infoFound(textarea) {
  const list = h("ul", { class: "nc-found", "aria-label": "Metinde görünenler" });
  const count = h("span", { class: "muted small" });
  const draw = () => {
    const text = textarea.value;
    list.replaceChildren(
      ...FOUND.map(([label, re]) => {
        const ok = re.test(text);
        return h("li", { class: ok ? "ok" : "" }, h("span", { class: "nc-found-mark", "aria-hidden": "true" }, ok ? svg(ICON.check, 12, 3) : null), label);
      }),
    );
    count.textContent = `${text.trim().length.toLocaleString(locale())} karakter`;
  };
  textarea.addEventListener("input", draw);
  draw();
  return {
    el: h("div", { class: "nc-found-box" }, h("div", { class: "nc-found-head" }, h("span", { class: "qe-label", text: "Metinde görünenler" }), count), list),
    draw,
  };
}
