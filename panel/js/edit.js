// Düzenle forms (colours, pages, services, text, contact, form, files).
import { PALETTE_TR } from "./brand.js";
import { api, ask, guarded, h, isBusy, toast } from "./core.js";
import { quickEditCard, uploadCard } from "./info.js";
import { jobStarted, runAgent } from "./shell.js";

// ---------------------------------------------------------------- Düzenle: forms instead of chat

export const PAGE_TR = { home: "Ana sayfa", about: "Hakkımızda", services: "Hizmetler", gallery: "Galeri", contact: "İletişim" };

/** Runs one structured edit; the panel turns the form into an exact instruction (or saves it itself). */
export async function submitEdit(slug, type, payload, button) {
  button.disabled = true;
  const job = await guarded(() => api("POST", `/api/clients/${slug}/edit/${type}`, payload));
  button.disabled = false;
  if (job) { toast("Değişiklik başladı; bitince ses ve bildirim gelir."); await jobStarted(job); }
}

/** One quick-edit form, chosen with the chips in Düzenleme. Each sends a narrow, exact change. */
export async function editForm(id, d) {
  const slug = d.status.slug;
  const busy = isBusy();
  const custom = d.template === "custom";
  const card = (title, note, ...children) => h("div", { class: "edit-form", "data-enter": "0" }, h("h4", { text: title }), note && h("p", { class: "muted small", text: note }), ...children);
  switch (id) {
    case "colors": {
      const brand = custom ? await api("GET", `/api/clients/${slug}/brand`).catch(() => null) : null;
      const palette = custom ? (brand?.brand?.palette || {}) : (d.design?.palette || {});
      const pickers = Object.entries(palette).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v))).map(([name, hex]) => {
        const input = h("input", { type: "color", id: `col-${name}`, value: hex.toLowerCase() });
        const code = h("code", { text: hex.toUpperCase() });
        input.addEventListener("input", () => (code.textContent = input.value.toUpperCase()));
        return { name, input, el: h("label", { for: `col-${name}`, class: "colour-row" }, input, h("span", { text: PALETTE_TR[name] || name.replace(/[-_]/g, " ") }), code) };
      });
      const btn = h("button", { class: "btn btn-primary", type: "button", disabled: busy || !pickers.length }, "Renkleri Uygula");
      btn.onclick = () => submitEdit(slug, "colors", { colors: Object.fromEntries(pickers.map((p) => [p.name, p.input.value])) }, btn);
      return card("Renk Paleti", "Değiştirmek istediğiniz renge tıklayınız. Okunurluk korunur.", pickers.length ? h("div", { class: "stack-sm" }, ...pickers.map((p) => p.el)) : h("p", { class: "muted small", text: "Renk paleti henüz oluşturulmadı." }), btn);
    }
    case "pages": {
      const boxes = Object.entries(PAGE_TR).map(([pid, label]) => {
        const box = h("input", { type: "checkbox", id: `pg-${pid}`, value: pid, checked: d.pages.includes(pid), disabled: pid === "home" });
        return { pid, box, el: h("label", { for: `pg-${pid}`, class: "check" }, box, ` ${label}`) };
      });
      const btn = h("button", { class: "btn btn-primary", type: "button", disabled: busy }, "Sayfaları Uygula");
      btn.onclick = () => submitEdit(slug, "pages", { pages: boxes.filter((b) => b.box.checked || b.pid === "home").map((b) => b.pid) }, btn);
      const base = card("Sayfalar", "Kaldırılan sayfa menüden de çıkarılır. Eklenen sayfa marka kimliğine uygun tasarlanır; bilgi eksikse size sorulur.", h("div", { class: "page-checks" }, ...boxes.map((b) => b.el)), btn);
      if (custom) base.append(extraPageForm(slug, busy));
      return base;
    }
    case "services": {
      const current = (d.content?.[d.defaultLocale]?.services || []).map((x) => ({ ...x }));
      const rows = h("div", { class: "svc-rows" });
      const addRow = (x = { title: "", description: "", price: "" }) => {
        const row = h("div", { class: "svc-row" },
          h("input", { placeholder: "Hizmet", value: x.title || "", maxlength: 60, "aria-label": "Hizmet adı" }),
          h("input", { placeholder: "Fiyat (ör. 400 TL)", value: x.price || "", maxlength: 40, "aria-label": "Fiyat" }),
          h("input", { placeholder: "Kısa açıklama", value: x.description || "", maxlength: 300, "aria-label": "Açıklama" }),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Satırı sil", onclick: () => row.remove() }, "✕"));
        rows.append(row);
      };
      (current.length ? current : [undefined]).forEach((x) => addRow(x));
      const btn = h("button", { class: "btn btn-primary", type: "button", disabled: busy }, "Hizmetleri Uygula");
      btn.onclick = () => submitEdit(slug, "services", { services: [...rows.children].map((r) => { const [t, pr, ds] = r.querySelectorAll("input"); return { title: t.value, price: pr.value, description: ds.value }; }) }, btn);
      return card("Hizmetler ve Fiyatlar", "Liste sitede bu sırayla gösterilir.", rows, h("div", { class: "row" }, h("button", { class: "btn btn-sm", type: "button", onclick: () => addRow() }, "+ Satır Ekle"), btn));
    }
    case "text": return textEditor(d);
    case "contact": return h("div", { class: "edit-form", "data-enter": "0" }, quickEditCard(d));
    case "form": return h("div", { class: "edit-form", "data-enter": "0" }, formCard(d));
    default: return h("div", { class: "edit-form", "data-enter": "0" }, uploadCard(slug, d.inbox, d.assets, d.logo));
  }
}

/** Contact form: Eren pastes the endpoint of a free form service; only he can set it, the agent only uses it. */
export function formCard(d) {
  const slug = d.status.slug;
  const cur = d.status.contactForm || null;
  const action = h("input", { id: "fm-action", placeholder: "https://formspree.io/f/abcd1234", value: cur?.action || "", maxlength: 200 });
  const key = h("input", { id: "fm-key", placeholder: "Sadece Web3Forms: access key", value: cur?.accessKey || "", maxlength: 60 });
  const add = h("button", { class: "btn btn-primary", type: "button", disabled: isBusy() || !cur }, "Siteye formu ekle");
  add.onclick = () => submitEdit(slug, "form", {}, add);
  return h("form", { class: "card stack", onsubmit: async (e) => {
    e.preventDefault();
    const r = await guarded(() => api("PUT", `/api/clients/${slug}/form`, { action: action.value.trim(), accessKey: key.value.trim() }));
    if (r) { toast(r.form ? "Form adresi kaydedildi. Şimdi 'Siteye formu ekle'ye bas." : "Form adresi kaldırıldı."); add.disabled = !r.form; d.status.contactForm = r.form; }
  } },
    h("h3", { text: "İletişim formu" }),
    h("p", { class: "muted small" }, "Ücretsiz bir form servisi aç (ör. ", h("a", { href: "https://formspree.io", target: "_blank", rel: "noopener", text: "Formspree" }), "), formu müşterinin e-postasıyla oluştur, verdiği adresi buraya yapıştır. Mesajlar doğrudan müşteriye gider."),
    h("label", { for: "fm-action" }, "Form adresi", action),
    h("label", { for: "fm-key" }, "Erişim anahtarı (sadece Web3Forms)", key),
    h("div", { class: "row" }, h("button", { class: "btn", type: "submit" }, "Kaydet"), add));
}

// ---------------------------------------------------------------- extra pages (custom sites)

/** A page outside the five standard ones (Randevu, SSS, Kampanyalar…): designed by the agent in the site's brand. */
function extraPageForm(slug, busy) {
  const name = h("input", { type: "text", id: "xp-name", maxlength: 40, placeholder: "ör. Sıkça Sorulan Sorular" });
  const purpose = h("textarea", { id: "xp-purpose", rows: 3, maxlength: 1200, placeholder: "Sayfada ne olacak? Bildiğiniz bilgileri yazınız (ör. 6 soru-cevap: randevu, ödeme, iptal…). Bilgi yoksa agent size sorar, uydurmaz." });
  const btn = h("button", { class: "btn", type: "button", disabled: busy }, "Sayfayı Ekle");
  btn.onclick = async () => {
    if (name.value.trim().length < 2) { name.focus(); return; }
    if (!(await ask({ title: "Yeni sayfa ekle", body: `"${name.value.trim()}" sayfası sitenin tasarımıyla eklenecek ve menüye konacak. Önceki hâl Sürümler'de kalır.`, confirm: "Ekle" }))) return;
    runAgent(slug, "add-page", { name: name.value.trim(), purpose: purpose.value.trim() });
  };
  return h("div", { class: "extra-page stack-sm" },
    h("h5", { text: "Ek sayfa" }),
    h("label", { for: "xp-name" }, "Sayfa adı", name),
    h("label", { for: "xp-purpose" }, "İçerik", purpose),
    btn);
}

// ---------------------------------------------------------------- texts by id

const KIND_TR = { title: "Sekme başlığı", meta: "Arama açıklaması", alt: "Görsel açıklaması", h1: "Ana başlık", h2: "Başlık", h3: "Alt başlık", h4: "Alt başlık", h5: "Alt başlık", h6: "Alt başlık", p: "Paragraf", li: "Liste", a: "Bağlantı", button: "Buton", span: "Kısa metin", strong: "Vurgu", em: "Vurgu", small: "Küçük metin", label: "Form etiketi", figcaption: "Görsel yazısı", blockquote: "Alıntı", td: "Tablo", th: "Tablo başlığı", dt: "Terim", dd: "Açıklama", field: "Alan" };

/**
 * Every text of a page, each with its id (h1-1, p-3, meta-description…). Eren edits in place; the panel writes
 * the changes itself and rebuilds (no agent, no tokens). Only changed texts are sent.
 */
async function textEditor(d) {
  const slug = d.status.slug;
  const holder = h("div", { class: "edit-form text-editor", "data-enter": "0" });
  const load = async (page) => {
    const data = await guarded(() => api("GET", `/api/clients/${slug}/texts${page ? `?page=${encodeURIComponent(page)}` : ""}`));
    if (!data) return;
    const pageSel = data.pages.length ? h("select", { id: "tx-page", onchange: () => load(pageSel.value) }, ...data.pages.map((pg) => h("option", { value: pg, selected: pg === data.page }, PAGE_TR[pg] || pg))) : null;
    const search = h("input", { type: "search", id: "tx-q", placeholder: "Metinlerde ara…" });
    const rows = data.items.map((it) => {
      const area = h("textarea", { rows: it.text.length > 90 ? 3 : 1, maxlength: 4000, "aria-label": `${it.id} metni` });
      area.value = it.text;
      const row = h("div", { class: "tx-row" },
        h("div", { class: "tx-meta" }, h("code", { text: it.id }), h("span", { class: "muted small", text: KIND_TR[it.kind] || it.kind })),
        area);
      area.addEventListener("input", () => { row.classList.toggle("changed", area.value.trim() !== it.text.trim()); count(); });
      return { it, area, row };
    });
    const status = h("span", { class: "muted small" });
    const btn = h("button", { class: "btn btn-primary", type: "button", disabled: true }, "Değişiklikleri Uygula");
    const count = () => {
      const n = rows.filter((r) => r.area.value.trim() !== r.it.text.trim()).length;
      status.textContent = n ? `${n} metin değişti` : "";
      btn.disabled = isBusy() || n === 0;
    };
    search.addEventListener("input", () => {
      const q = search.value.toLocaleLowerCase("tr");
      for (const r of rows) r.row.hidden = Boolean(q) && !`${r.it.id} ${r.it.text}`.toLocaleLowerCase("tr").includes(q);
    });
    btn.onclick = () => submitEdit(slug, "text", {
      page: data.page,
      changes: rows.filter((r) => r.area.value.trim() !== r.it.text.trim()).map((r) => ({ id: r.it.id, oldText: r.it.text, newText: r.area.value })),
    }, btn);
    holder.replaceChildren(
      h("h4", { text: "Metinler" }),
      h("p", { class: "muted small", text: data.source === "site"
        ? `Sayfadaki bütün metinler, kimlikleriyle. Değiştirdikleriniz doğrudan yazılır, agent çalışmaz.${data.otherLocales?.length ? ` Diğer dillerdeki (${data.otherLocales.join(", ")}) karşılıkları değişmez.` : ""}`
        : "Sitenin bütün metin alanları, kimlikleriyle (ör. seo.home.description). Değiştirdikleriniz kaydedilir ve site yeniden oluşturulur." }),
      h("div", { class: "row tx-tools" }, pageSel && h("label", { for: "tx-page", class: "sr-only" }, "Sayfa"), pageSel, h("label", { for: "tx-q", class: "sr-only" }, "Ara"), search),
      rows.length ? h("div", { class: "tx-list" }, ...rows.map((r) => r.row)) : h("p", { class: "muted small", text: "Bu sayfada metin bulunamadı." }),
      h("div", { class: "row tx-foot" }, status,
        h("div", { class: "row" },
          data.otherLocales?.length ? h("button", { class: "btn", type: "button", disabled: isBusy(), onclick: async () => {
            if (await ask({ title: "Diğer dilleri güncelle", body: `${data.otherLocales.join(", ")} sayfaları, varsayılan dildeki son hâle göre yeniden çevrilir (daha ucuz modelle). Tasarım değişmez.`, confirm: "Güncelle" })) runAgent(slug, "translate", {});
          } }, "Diğer dilleri güncelle") : null,
          btn)));
  };
  holder.append(h("p", { class: "muted small", text: "Metinler yükleniyor…" }));
  load(null);
  return holder;
}
