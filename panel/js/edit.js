// Hızlı Düzenleme: what the site shows today (colours, pages, services, texts, contact, form, images), one row each.
// A row opens its editor in the same card; every editor ends in the same action bar (changes, Vazgeç, apply) and sends
// the same requests as before, so the server side is unchanged.
import { PALETTE_TR } from "./brand.js";
import { api, ask, h, ICON, isBusy, svg } from "./core.js";
import { editorShell, PAGE_TR, submitEdit } from "./edit-core.js";
import { t } from "./i18n.js";
import { contactEditor, formEditor, PROVIDERS, textEditor } from "./edit-forms.js";
import { runAgent } from "./jobs.js";
import { mediaEditor } from "./media.js";
import { actionBar, switchInput } from "./ui-kit.js";

const PAGE_DESC = {
  home: "Sitenin girişi; her zaman açık.",
  about: "İşletmenin hikâyesi, ekibi ve farkı.",
  services: "Hizmetler ve fiyatlar ayrıntılı listelenir.",
  gallery: "Fotoğraflar; fotoğraf yoksa eklenmez.",
  contact: "Adres, harita, saatler ve iletişim butonları.",
};
export { PAGE_TR, submitEdit };
const MAX_SERVICES = 12; // src/panel/api/edit.ts MAX_SERVICES

// ---------------------------------------------------------------- the overview

export const QUICK_EDITS = [
  { id: "colors", title: "Renk Paleti", icon: ICON.palette },
  { id: "pages", title: "Sayfalar", icon: ICON.pages },
  { id: "services", title: "Hizmetler ve Fiyatlar", icon: ICON.list },
  { id: "text", title: "Metin", icon: ICON.type },
  { id: "contact", title: "İletişim Bilgileri", icon: ICON.phone },
  { id: "form", title: "İletişim Formu", icon: ICON.inbox },
  { id: "files", title: "Logo ve Görseller", icon: ICON.image },
];

/** The colours as name → #rrggbb: the brand file for custom sites, the config palette for template sites. */
async function paletteOf(d) {
  const raw =
    d.template === "custom" ? ((await api("GET", `/api/clients/${d.status.slug}/brand`).catch(() => null))?.brand?.palette ?? {}) : (d.design?.palette ?? {});
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v))));
}

const servicesOf = (d) => d.content?.[d.defaultLocale]?.services || [];
const imageCount = (d) => (d.assets?.length || 0) + (d.inbox?.length || 0);

/** One line under each row: the real value the site shows now, so the list reads like the site's inventory. */
function summaryOf(id, d, palette) {
  const slug = d.status.slug;
  const sum = (...parts) => h("span", { class: "qe-sum" }, ...parts.filter(Boolean).map((p) => (p instanceof Node ? p : h("span", { text: p }))));
  switch (id) {
    case "colors": {
      const list = Object.entries(palette);
      return list.length
        ? sum(h("span", { class: "qe-swatches", "aria-hidden": "true" }, ...list.slice(0, 6).map(([, hex]) => swatchDot(hex))), `${list.length} renk`)
        : sum("Renk paleti henüz yok");
    }
    case "pages":
      // Names are translated one by one: the list itself is not a text the translator knows.
      return d.pages.length
        ? sum(h("span", { class: "qe-clip", "data-no-i18n": "", text: d.pages.map((p) => (PAGE_TR[p] ? t(PAGE_TR[p]) : p)).join(", ") }))
        : sum("Sayfa yok");
    case "services": {
      const list = servicesOf(d);
      const priced = list.filter((x) => x.price).length;
      return sum(list.length ? `${list.length} hizmet` : "Hizmet listesi boş", priced ? `${priced} tanesi fiyatlı` : null);
    }
    case "text":
      return sum("Başlıklar, paragraflar, butonlar ve arama açıklamaları");
    case "contact": {
      const c = d.contact || {};
      const known = [c.phone, c.email].filter(Boolean);
      return known.length ? sum(...known.map((v) => h("span", { class: "qe-clip", text: v, "data-no-i18n": "" }))) : sum("Telefon ve e-posta eksik");
    }
    case "form": {
      const f = d.status.contactForm;
      return f ? sum(h("span", { class: "pill-ok", text: "Bağlı" }), PROVIDERS.find((p) => p.test.test(f.action))?.name || "Form servisi") : sum("Kurulmadı");
    }
    default: {
      const n = imageCount(d);
      return sum(
        d.logo ? h("img", { class: "qe-logo", src: `/api/clients/${slug}/assets/${encodeURIComponent(d.logo.replace(/^assets\//, ""))}`, alt: "" }) : null,
        d.logo ? "Logo var" : "Logo yok",
        n ? `${n} görsel` : null,
      );
    }
  }
}

export function swatchDot(hex) {
  const dot = h("span", { class: "qe-dot" });
  dot.style.background = hex;
  return dot;
}

/** The Hızlı Düzenleme card: the list of rows, or the open editor with a way back. */
export async function quickEditCard(d, open, setOpen) {
  const card = h("section", { class: "card quick qe" });
  if (open) {
    card.classList.add("is-open");
    card.append(await editForm(open, d, () => setOpen(null)));
    return card;
  }
  const palette = await paletteOf(d);
  card.append(
    h("div", { class: "card-head" }, h("h3", { text: "Hızlı Düzenleme" }), h("span", { class: "muted small", text: "Talimat yazmanıza gerek yoktur" })),
    h(
      "ul",
      { class: "qe-list", role: "list" },
      ...QUICK_EDITS.map((q) =>
        h(
          "li",
          {},
          h(
            "button",
            { type: "button", class: "qe-row", "data-edit": q.id, onclick: () => setOpen(q.id) },
            h("span", { class: "qe-ico" }, svg(q.icon, 18, 1.8)),
            h("span", { class: "qe-main" }, h("span", { class: "qe-title", text: q.title }), summaryOf(q.id, d, palette)),
            h("span", { class: "qe-go" }, svg(ICON.chevronRight, 16, 2)),
          ),
        ),
      ),
    ),
  );
  return card;
}

/** One editor, chosen in the overview. */
export async function editForm(id, d, back = () => undefined) {
  switch (id) {
    case "colors":
      return colorsEditor(d, back);
    case "pages":
      return pagesEditor(d, back);
    case "services":
      return servicesEditor(d, back);
    case "text":
      return textEditor(d, back);
    case "contact":
      return contactEditor(d, back);
    case "form":
      return formEditor(d, back);
    default:
      return editorShell({
        title: "Logo ve Görseller",
        note: "Logo ve fotoğrafları buraya yükleyin. Logo seçimi sizdedir; agent yalnızca seçtiğiniz dosyayı logo olarak kullanır.",
        back,
        body: mediaEditor(d.status.slug, d.inbox, d.assets, d.logo, { bare: true }),
      });
  }
}

// ---------------------------------------------------------------- colours

/** WCAG relative luminance and contrast ratio, for the readability check next to the pickers. */
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const AA_TEXT = 4.5;
const AA_LARGE = 3;
/**
 * Which colour is the page ground, which the text and which the brand colour. Names decide when they say it (background,
 * text, primary…); otherwise the lightest colour is the ground, the one that reads best on it is the text, and the most
 * saturated of the rest is the brand colour.
 */
function paletteRoles(pal) {
  const keys = Object.keys(pal);
  if (keys.length < 2) return {};
  const bgKey = pick(pal, ["background", "bg", "paper", "surface", "base"]) || [...keys].sort((a, b) => luminance(pal[b]) - luminance(pal[a]))[0];
  const textKey =
    pick(pal, ["text", "ink", "foreground", "body"]) ||
    keys.filter((k) => k !== bgKey).sort((a, b) => contrast(pal[b], pal[bgKey]) - contrast(pal[a], pal[bgKey]))[0];
  const rest = keys.filter((k) => k !== bgKey && k !== textKey);
  const mainKey = pick(pal, ["primary", "accent", "brand"]) || [...rest].sort((a, b) => saturation(pal[b]) - saturation(pal[a]))[0] || textKey;
  return { bgKey, textKey, mainKey };
}
const saturation = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return Math.max(r, g, b) - Math.min(r, g, b);
};
const pick = (pal, names) => names.map((n) => Object.keys(pal).find((k) => k.toLowerCase().includes(n))).find(Boolean);

async function colorsEditor(d, back) {
  const slug = d.status.slug;
  const original = await paletteOf(d);
  const value = { ...original };
  const names = Object.keys(original);
  const { bgKey, textKey, mainKey } = paletteRoles(original);
  const preview = h(
    "div",
    { class: "sw-preview", "aria-hidden": "true" },
    h("strong", { text: "Başlık böyle görünür" }),
    h("p", { text: "Paragraf metni bu renkte okunur." }),
    h("span", { class: "sw-btn", text: "Buton" }),
  );
  const checks = h("ul", { class: "sw-checks" });
  const bar = actionBar({
    applyLabel: "Renkleri Uygula",
    onApply: (btn) => submitEdit(slug, "colors", { colors: { ...value } }, btn),
    onReset: () => {
      for (const n of names) setColour(n, original[n]);
    },
  });
  const cards = {};
  const refresh = () => {
    const bg = value[bgKey] || "#ffffff";
    const ink = value[textKey] || "#111111";
    const main = value[mainKey] || ink;
    preview.style.background = bg;
    preview.style.color = ink;
    const btn = preview.querySelector(".sw-btn");
    btn.style.background = main;
    btn.style.color = contrast(main, "#ffffff") >= contrast(main, "#000000") ? "#ffffff" : "#000000";
    const rows = [
      textKey && bgKey ? ["Yazı / zemin", contrast(ink, bg), AA_TEXT] : null,
      mainKey && bgKey && mainKey !== textKey ? [`${PALETTE_TR[mainKey] || mainKey} / zemin`, contrast(main, bg), AA_LARGE] : null,
    ].filter(Boolean);
    checks.replaceChildren(
      ...rows.map(([label, r, need]) =>
        h(
          "li",
          { class: r >= need ? "ok" : "bad" },
          h("span", { text: label }),
          h("span", { class: "sw-ratio", text: `${r.toFixed(1)}:1` }),
          h("span", { class: "sw-verdict", text: r >= need ? "Okunur" : "Zor okunur" }),
        ),
      ),
    );
    const changed = names.filter((n) => value[n].toLowerCase() !== original[n].toLowerCase()).length;
    const weak = rows.some(([, r, need]) => r < need);
    bar.set(changed, "");
    if (changed && weak) bar.el.querySelector(".qe-status").textContent = `${changed} değişiklik · okunurluk düşük`;
  };
  const setColour = (n, hex) => {
    value[n] = hex.toLowerCase();
    const c = cards[n];
    c.picker.value = value[n];
    c.code.value = value[n].toUpperCase();
    c.chip.style.background = value[n];
    c.code.removeAttribute("aria-invalid");
    c.reset.hidden = value[n] === original[n].toLowerCase();
    c.el.classList.toggle("changed", !c.reset.hidden);
    refresh();
  };
  const grid = h("div", { class: "sw-grid" });
  for (const n of names) {
    const picker = h("input", { type: "color", id: `col-${n}`, value: original[n].toLowerCase(), class: "sw-native" });
    const chip = h("label", { class: "sw-chip", for: picker.id, title: "Renk seç" }, picker);
    const code = h("input", {
      type: "text",
      class: "sw-code",
      maxlength: 7,
      spellcheck: "false",
      "aria-label": `${PALETTE_TR[n] || n} kodu`,
      "data-no-i18n": "",
    });
    const reset = h(
      "button",
      { type: "button", class: "icon-btn sw-reset", "aria-label": "Eski renge dön", title: "Eski renge dön", hidden: true },
      svg(ICON.undo, 15, 2),
    );
    const el = h(
      "div",
      { class: "sw-card" },
      chip,
      h("div", { class: "sw-meta" }, h("span", { class: "sw-label", text: PALETTE_TR[n] || n.replace(/[-_]/g, " ") }), code),
      reset,
    );
    cards[n] = { picker, chip, code, reset, el };
    picker.addEventListener("input", () => setColour(n, picker.value));
    code.addEventListener("input", () => {
      const v = code.value.trim().startsWith("#") ? code.value.trim() : `#${code.value.trim()}`;
      if (/^#[0-9a-f]{6}$/i.test(v)) setColour(n, v);
      else code.setAttribute("aria-invalid", "true");
    });
    code.addEventListener("blur", () => (code.value = value[n].toUpperCase()));
    reset.addEventListener("click", () => setColour(n, original[n]));
    grid.append(el);
  }
  for (const n of names) setColour(n, original[n]);
  const body = names.length
    ? h("div", { class: "stack" }, grid, h("div", { class: "sw-side" }, preview, h("div", {}, h("p", { class: "qe-label", text: "Okunurluk" }), checks)))
    : h("p", { class: "qe-empty", text: "Renk paleti henüz oluşturulmadı. Site hazırlanınca burada düzenlenir." });
  return editorShell({
    title: "Renk Paleti",
    note: "Renge tıklayın ya da kodunu yazın. Önizleme ve okunurluk anında güncellenir; uygulayınca sitenin her yerinde değişir.",
    back,
    body,
    bar: names.length ? bar.el : null,
  });
}

// ---------------------------------------------------------------- pages

function pagesEditor(d, back) {
  const slug = d.status.slug;
  const busy = isBusy();
  const custom = d.template === "custom";
  // Standard pages first, then any page this site has beyond them (kept unless switched off).
  const ids = [...Object.keys(PAGE_TR), ...d.pages.filter((p) => !(p in PAGE_TR))];
  const diff = h("p", { class: "qe-diff small", "aria-live": "polite" });
  const bar = actionBar({
    applyLabel: "Sayfaları Uygula",
    onApply: (btn) => submitEdit(slug, "pages", { pages: rows.filter((r) => r.input.checked || r.pid === "home").map((r) => r.pid) }, btn),
    onReset: () => {
      for (const r of rows) r.input.checked = d.pages.includes(r.pid) || r.pid === "home";
      refresh();
    },
  });
  const rows = ids.map((pid) => {
    const sw = switchInput({ id: `pg-${pid}`, checked: d.pages.includes(pid) || pid === "home", disabled: pid === "home", label: PAGE_TR[pid] || pid });
    sw.input.addEventListener("change", () => refresh());
    const el = h(
      "li",
      { class: "pg-row" },
      h(
        "label",
        { for: sw.input.id, class: "pg-text" },
        h("span", { class: "pg-name" }, h("span", { text: PAGE_TR[pid] || pid, "data-no-i18n": pid in PAGE_TR ? null : "" }), h("span", { class: "pg-tag" })),
        h("span", { class: "muted small", text: PAGE_DESC[pid] || "Bu siteye özel ek sayfa." }),
      ),
      sw.el,
    );
    return { pid, input: sw.input, el };
  });
  const refresh = () => {
    const add = [];
    const remove = [];
    for (const r of rows) {
      const was = d.pages.includes(r.pid) || r.pid === "home";
      const tag = r.el.querySelector(".pg-tag");
      tag.textContent = r.input.checked === was ? "" : r.input.checked ? "eklenecek" : "kaldırılacak";
      tag.className = `pg-tag ${r.input.checked === was ? "" : r.input.checked ? "is-add" : "is-remove"}`;
      if (r.input.checked !== was) (r.input.checked ? add : remove).push(PAGE_TR[r.pid] || r.pid);
    }
    diff.textContent =
      add.length || remove.length ? "Kaldırılan sayfa menüden de çıkar. Eklenen sayfa marka kimliğine uygun tasarlanır; bilgi eksikse size sorulur." : "";
    bar.set(add.length + remove.length);
  };
  refresh();
  const body = h(
    "div",
    { class: "stack" },
    h("ul", { class: "pg-list", role: "list" }, ...rows.map((r) => r.el)),
    diff,
    custom ? h("div", { class: "qe-more" }, h("p", { class: "qe-label", text: "Yeni içerik" }), extraPageForm(slug, busy), blogForm(slug, busy)) : null,
  );
  return editorShell({ title: "Sayfalar", note: "Açık sayfalar sitede ve menüde yer alır.", back, body, bar: bar.el });
}

/** A page outside the five standard ones (Randevu, SSS, Kampanyalar…): designed by the agent in the site's brand. */
function extraPageForm(slug, busy) {
  const name = h("input", { type: "text", id: "xp-name", maxlength: 40, placeholder: "ör. Sıkça Sorulan Sorular" });
  const purpose = h("textarea", {
    id: "xp-purpose",
    rows: 3,
    maxlength: 1200,
    placeholder: "Sayfada ne olacak? Bildiğiniz bilgileri yazınız (ör. 6 soru-cevap: randevu, ödeme, iptal…). Bilgi yoksa agent size sorar, uydurmaz.",
  });
  const btn = h("button", { class: "btn btn-sm", type: "button", disabled: busy }, "Sayfayı Ekle");
  btn.onclick = async () => {
    if (name.value.trim().length < 2) {
      name.focus();
      return;
    }
    if (
      !(await ask({
        title: "Yeni sayfa ekle",
        body: `"${name.value.trim()}" sayfası sitenin tasarımıyla eklenecek ve menüye konacak. Önceki hâl Sürümler'de kalır.`,
        confirm: "Ekle",
      }))
    )
      return;
    runAgent(slug, "add-page", { name: name.value.trim(), purpose: purpose.value.trim() });
  };
  return h(
    "details",
    { class: "qe-fold" },
    h("summary", {}, h("span", { text: "Ek sayfa ekle" }), h("span", { class: "muted small", text: "SSS, kampanyalar, randevu…" })),
    h("div", { class: "stack-sm" }, h("label", { for: "xp-name" }, "Sayfa adı", name), h("label", { for: "xp-purpose" }, "İçerik", purpose), h("div", {}, btn)),
  );
}

/** One blog post: the agent writes it in the site's design and keeps a blog index; facts only. */
function blogForm(slug, busy) {
  const title = h("input", { type: "text", id: "bl-title", maxlength: 100, placeholder: "ör. Sakal bakımı: evde 5 kolay adım" });
  const notes = h("textarea", {
    id: "bl-notes",
    rows: 3,
    maxlength: 2000,
    placeholder: "İsteğe bağlı: anlatılmasını istediğiniz noktalar, müşterinin önerileri, kampanya bilgisi…",
  });
  const btn = h("button", { class: "btn btn-sm", type: "button", disabled: busy }, "Yazıyı Hazırla");
  btn.onclick = async () => {
    if (title.value.trim().length < 4) {
      title.focus();
      return;
    }
    if (
      !(await ask({
        title: "Blog yazısı",
        body: `"${title.value.trim()}" yazısı sitenin tasarımıyla yazılacak; blog sayfası ve menü bağlantısı eklenecek. Rakam, ödül ya da yorum uydurulmaz. Önceki hâl Sürümler'de kalır.`,
        confirm: "Hazırla",
      }))
    )
      return;
    runAgent(slug, "blog-post", { title: title.value.trim(), notes: notes.value.trim() });
  };
  return h(
    "details",
    { class: "qe-fold" },
    h("summary", {}, h("span", { text: "Blog yazısı yaz" }), h("span", { class: "muted small", text: "Blog sayfası yoksa eklenir" })),
    h(
      "div",
      { class: "stack-sm" },
      h("label", { for: "bl-title" }, "Konu / başlık", title),
      h("label", { for: "bl-notes" }, "Notlar", notes),
      h("div", {}, btn),
    ),
  );
}

// ---------------------------------------------------------------- services

const normService = (x) => ({ title: (x.title || "").trim(), price: (x.price || "").trim(), description: (x.description || "").trim() });

function servicesEditor(d, back) {
  const slug = d.status.slug;
  const original = servicesOf(d).map(normService);
  const list = h("ol", { class: "svc-list" });
  const count = h("span", { class: "muted small" });
  const addBtn = h("button", { class: "btn btn-sm", type: "button" }, svg(ICON.plus, 15, 2), "Hizmet Ekle");
  const read = () =>
    [...list.children].map((li) => {
      const [t, p] = li.querySelectorAll("input");
      return normService({ title: t.value, price: p.value, description: li.querySelector("textarea").value });
    });
  const bar = actionBar({
    applyLabel: "Hizmetleri Uygula",
    onApply: (btn) => submitEdit(slug, "services", { services: read().filter((x) => x.title) }, btn),
    onReset: () => {
      list.replaceChildren();
      (original.length ? original : [undefined]).forEach((x) => addRow(x));
      refresh();
    },
  });
  const refresh = () => {
    const items = read();
    let blank = false;
    [...list.children].forEach((li, i) => {
      const x = items[i];
      const bad = !x.title && Boolean(x.price || x.description);
      blank ||= bad;
      li.querySelector("input").setAttribute("aria-invalid", String(bad));
      li.querySelector(".svc-no").textContent = String(i + 1);
      li.querySelector(".svc-up").disabled = i === 0;
      li.querySelector(".svc-down").disabled = i === items.length - 1;
    });
    const kept = items.filter((x) => x.title);
    count.textContent = `${kept.length} / ${MAX_SERVICES} hizmet`;
    addBtn.disabled = items.length >= MAX_SERVICES;
    const changed = blank || JSON.stringify(kept) !== JSON.stringify(original);
    const problem = blank ? "Adı boş bir satır var" : kept.length === 0 ? "En az bir hizmet gerekli" : "";
    bar.set(changed ? Math.max(1, diffCount(kept, original)) : 0, changed ? problem : "");
  };
  const move = (li, dir) => {
    const to = dir < 0 ? li.previousElementSibling : li.nextElementSibling?.nextElementSibling;
    if (dir < 0 && !to) return;
    list.insertBefore(li, to || null);
    refresh();
    li.querySelector(dir < 0 ? ".svc-up" : ".svc-down").focus();
  };
  let dragging = null;
  const addRow = (x = { title: "", price: "", description: "" }) => {
    const desc = h("textarea", { rows: 2, maxlength: 300, placeholder: "Kısa açıklama (isteğe bağlı)", "aria-label": "Açıklama" });
    desc.value = x.description || "";
    const li = h(
      "li",
      { class: "svc-item", draggable: "true" },
      h(
        "div",
        { class: "svc-order" },
        h("span", { class: "svc-grip", "aria-hidden": "true" }, svg(ICON.grip, 16, 2.4)),
        h("span", { class: "svc-no", "aria-hidden": "true" }),
      ),
      h(
        "div",
        { class: "svc-fields" },
        h(
          "div",
          { class: "svc-line" },
          h("input", { type: "text", placeholder: "Hizmet adı", value: x.title || "", maxlength: 60, "aria-label": "Hizmet adı", class: "svc-title" }),
          h("input", { type: "text", placeholder: "Fiyat (ör. 400 TL)", value: x.price || "", maxlength: 40, "aria-label": "Fiyat", class: "svc-price" }),
        ),
        desc,
      ),
      h(
        "div",
        { class: "svc-tools" },
        h(
          "button",
          { class: "icon-btn svc-up", type: "button", "aria-label": "Yukarı taşı", title: "Yukarı taşı", onclick: () => move(li, -1) },
          svg(ICON.up, 15, 2),
        ),
        h(
          "button",
          { class: "icon-btn svc-down", type: "button", "aria-label": "Aşağı taşı", title: "Aşağı taşı", onclick: () => move(li, 1) },
          svg(ICON.down, 15, 2),
        ),
        h(
          "button",
          {
            class: "icon-btn svc-del",
            type: "button",
            "aria-label": "Satırı sil",
            title: "Satırı sil",
            onclick: () => {
              li.remove();
              if (!list.children.length) addRow();
              refresh();
            },
          },
          svg(ICON.trash, 15, 2),
        ),
      ),
    );
    li.addEventListener("input", refresh);
    li.addEventListener("dragstart", (e) => {
      if (e.target.closest("input, textarea")) return e.preventDefault();
      dragging = li;
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      dragging = null;
      refresh();
    });
    li.addEventListener("dragover", (e) => {
      if (!dragging || dragging === li) return;
      e.preventDefault();
      const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
      list.insertBefore(dragging, after ? li.nextElementSibling : li);
    });
    list.append(li);
    return li;
  };
  addBtn.addEventListener("click", () => {
    addRow().querySelector("input").focus();
    refresh();
  });
  (original.length ? original : [undefined]).forEach((x) => addRow(x));
  refresh();
  return editorShell({
    title: "Hizmetler ve Fiyatlar",
    note: "Sitede bu sırayla gösterilir. Sürükleyerek ya da oklarla sıralayın; fiyatı boş bırakılan hizmet fiyatsız görünür.",
    back,
    body: h("div", { class: "stack-sm" }, h("div", { class: "qe-toolbar" }, count, addBtn), list),
    bar: bar.el,
  });
}

/** How many rows differ (added, removed, edited or moved), for the counter in the bar. */
function diffCount(a, b) {
  let n = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) n++;
  return n;
}
