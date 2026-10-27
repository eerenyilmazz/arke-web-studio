// Teklif tab: the proposal sheet, with the work and monthly reports (reports.js) one click away.
import { docLocale, translateDoc } from "./i18n.js";
import { addonLabel } from "./addons.js";
import { CURRENCY_SIGNS } from "./business.js";
import { api, h, LANG_NAMES, nameLang, printDoc, state } from "./core.js";
import { PAGE_TR } from "./edit.js";
import { docLangOf, monthlyReport, workReport } from "./reports.js";

// ---------------------------------------------------------------- Teklif (proposal), printable

export const FEATURE_TR = [
  "Markaya özel tasarım: logo kullanımı ya da yeni logo, renkler, yazı tipleri ve imza hareketi",
  "Telefon, tablet ve bilgisayarda düzgün görünüm; açık ve koyu tema",
  "Hızlı açılan, güvenli, reklam ve takip kodu içermeyen site",
  "Arama motorları için temel ayarlar (başlıklar, açıklamalar, harita kaydı bilgisi, site haritası)",
  "WhatsApp ve telefonla tek dokunuşla iletişim",
  "Yayına alma ve SSL (https)",
];

/**
 * The base scope for this client. With extras recorded, the two lines extras can take away follow them
 * (one theme without the theme extra; phone-only contact without WhatsApp); without a record, the old list.
 */
export function featuresFor(addons) {
  if (!addons) return FEATURE_TR;
  const has = (id) => addons.some((a) => a.id === id);
  return FEATURE_TR.map((f, i) =>
    i === 1 && !has("theme")
      ? "Telefon, tablet ve bilgisayarda düzgün görünüm"
      : i === 4 && !has("whatsapp")
        ? "Telefon ve e-postayla tek dokunuşla iletişim"
        : f,
  );
}

/** Teklif tab: the proposal, or the work report ("ne istendi, ne yapıldı"), both printable. */
export async function tabProposal(body, d) {
  const which = state.docView?.[d.status.slug] || "teklif";
  const switcher = h(
    "div",
    { class: "seg doc-switch", role: "group", "aria-label": "Belge" },
    ...[
      ["teklif", "Teklif"],
      ["rapor", "İş Raporu"],
      ["aylik", "Aylık Rapor"],
    ].map(([k, l]) =>
      h(
        "button",
        {
          type: "button",
          "aria-pressed": String(which === k),
          onclick: () => {
            state.docView = { ...(state.docView || {}), [d.status.slug]: k };
            tabProposal(body, d);
          },
        },
        l,
      ),
    ),
  );
  const docLang = docLangOf(d);
  const langSwitch = h(
    "div",
    { class: "seg doc-switch", role: "group", "aria-label": "Belgenin dili" },
    ...[
      ["tr", "Türkçe"],
      ["en", "English"],
    ].map(([k, l]) =>
      h(
        "button",
        {
          type: "button",
          "aria-pressed": String(docLang === k),
          onclick: () => {
            state.docLang = { ...(state.docLang || {}), [d.status.slug]: k };
            tabProposal(body, d);
          },
        },
        l,
      ),
    ),
  );
  const top = h("div", { class: "row", style: "justify-content:space-between;align-items:center;flex-wrap:wrap" }, switcher, langSwitch);
  if (which === "rapor") {
    body.replaceChildren(h("div", { class: "stack" }, top, workReport(d, docLang)));
    return;
  }
  if (which === "aylik") {
    body.replaceChildren(h("div", { class: "stack" }, top, await monthlyReport(d, docLang)));
    return;
  }
  await proposalSheet(body, d, top, docLang);
}

async function proposalSheet(body, d, switcher, docLang = docLangOf(d)) {
  const slug = d.status.slug;
  const dl = docLocale(docLang);
  const [settings, brand] = await Promise.all([
    api("GET", "/api/settings").catch(() => ({ sender: {} })),
    api("GET", `/api/clients/${slug}/brand`).catch(() => null),
  ]);
  // The sender falls back to the profile name until the proposal's own fields are filled in.
  const s = { ...(settings.sender || {}) };
  if (!s.name) s.name = settings.profile?.studio || settings.profile?.name || "";
  const b = d.businessTracking || {};
  const today = new Date();
  const no = `T-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-${slug.slice(0, 6).toUpperCase()}`;
  const fmt = (n) => `${CURRENCY_SIGNS[b.currency] || ""}${Number(n).toLocaleString(dl)}`;
  const extras = b.addons || [];
  const extrasSum = extras.reduce((t, a) => t + (a.price || 0), 0);
  const price = b.price != null ? fmt(b.price + extrasSum) : "Belirtilecek";
  const extraName = (a) => (a.id === "language" && a.value ? `${addonLabel(a.id)} (${LANG_NAMES[a.value] || a.value})` : addonLabel(a.id));
  const palette = Object.entries(brand?.brand?.palette || d.design?.palette || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v)));
  const logo = brand?.clientLogo || (brand?.logoSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brand.logoSvg)}` : null);
  // Editable on screen before printing (not saved): The operator adjusts wording per client.
  const editable = (tag, text, cls = "") => h(tag, { class: cls, contenteditable: "true", spellcheck: "true", text });
  const sheet = h(
    "article",
    { class: "proposal" },
    h(
      "header",
      { class: "p-head" },
      h(
        "div",
        {},
        h("span", { class: "p-kicker", text: "Web sitesi teklifi" }),
        h("h1", { text: d.business.name || slug }),
        h("p", { class: "p-meta", text: `${no} · ${today.toLocaleDateString(dl, { day: "numeric", month: "long", year: "numeric" })}` }),
      ),
      logo && h("img", { class: "p-logo", src: logo, alt: "" }),
    ),
    h(
      "section",
      {},
      h("h2", { text: "Kapsam" }),
      h("p", { text: `Sayfalar: ${(d.pages || []).map((p) => PAGE_TR[p] || p).join(", ") || "—"}` }),
      h("p", { text: `Diller: ${d.locales.map((l) => LANG_NAMES[l] || l).join(", ")}` }),
      h("ul", {}, ...featuresFor(b.addons).map((f) => editable("li", f))),
      extras.length ? h("h3", { text: "Ek seçenekler" }) : null,
      extras.length ? h("ul", {}, ...extras.map((a) => editable("li", extraName(a)))) : null,
      d.domain ? h("p", { text: `Alan adı: ${d.domain}` }) : null,
    ),
    palette.length
      ? h(
          "section",
          {},
          h("h2", { text: "Marka" }),
          brand?.brand?.tagline ? h("p", { class: "p-tag", text: `“${brand.brand.tagline}”` }) : null,
          h(
            "div",
            { class: "p-swatches" },
            ...palette
              .slice(0, 6)
              .map(([n, v]) => h("span", { ...nameLang(n), "data-doc-data": "" }, h("i", { style: `background:${v}` }), `${n} ${v.toUpperCase()}`)),
          ),
        )
      : null,
    h(
      "section",
      { class: "p-price" },
      h("h2", { text: "Ücret ve teslim" }),
      h(
        "table",
        {},
        // With priced extras the total is broken down: the site, each extra, then the total.
        ...(b.price != null && extrasSum > 0
          ? [
              h("tr", {}, h("th", { text: "Site" }), h("td", { text: fmt(b.price) })),
              ...extras.filter((a) => a.price).map((a) => h("tr", {}, h("th", { text: extraName(a) }), h("td", { text: fmt(a.price) }))),
            ]
          : []),
        h("tr", {}, h("th", { text: "Toplam" }), h("td", { class: "p-big", text: price })),
        h(
          "tr",
          {},
          h("th", { text: "Teslim" }),
          h("td", {
            text: b.deadline
              ? new Date(`${b.deadline}T12:00:00`).toLocaleDateString(dl, { day: "numeric", month: "long", year: "numeric" })
              : "Onaydan sonra belirlenir",
          }),
        ),
        h("tr", {}, h("th", { text: "Ödeme" }), editable("td", "%50 başlangıçta, %50 yayına alırken.")),
        h(
          "tr",
          {},
          h("th", { text: "Barındırma" }),
          editable("td", d.hosting === "client" ? "Sizin hesabınızda (Cloudflare)." : "Bizim tarafımızdan; yıllık bakım ayrıca konuşulur."),
        ),
      ),
    ),
    h(
      "section",
      {},
      h("h2", { text: "Notlar" }),
      editable(
        "p",
        "Bu teklif 15 gün geçerlidir. Sitede yer alacak bilgiler ve fotoğraflar işletme tarafından sağlanır; uydurma bilgi ya da yorum kullanılmaz.",
      ),
    ),
    [s.name, s.email, s.phone, s.web].some(Boolean)
      ? h("footer", { class: "p-foot" }, [s.name, s.email, s.phone, s.web].filter(Boolean).join(" · "))
      : h("p", { class: "p-hint", text: "Gönderen bilgilerini Ayarlar → Teklif bölümünden ekleyiniz; PDF'in altında görünür." }),
  );
  translateDoc(sheet, docLang);
  body.replaceChildren(
    h(
      "div",
      { class: "stack" },
      switcher,
      h(
        "div",
        { class: "row", style: "justify-content:space-between;align-items:center" },
        h("p", {
          class: "muted small",
          text: "Fiyat ve teslim tarihi Bilgiler sekmesindeki iş bilgilerinden gelir. Metinlere tıklayıp düzeltebilirsin (kaydedilmez), sonra PDF olarak kaydet.",
        }),
        h("button", { class: "btn btn-primary", type: "button", onclick: () => printDoc(sheet, { title: `${slug} teklif` }) }, "Yazdır / PDF"),
      ),
      sheet,
    ),
  );
}
