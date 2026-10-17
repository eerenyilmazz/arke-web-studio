// Düzenle forms (colours, pages, services, text, contact, form, files).
import { PALETTE_TR } from "./brand.js";
import { api, guarded, h, isBusy, toast } from "./core.js";
import { quickEditCard, uploadCard } from "./info.js";
import { jobStarted } from "./shell.js";

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
      return card("Sayfalar", "Kaldırılan sayfa menüden de çıkarılır. Eklenen sayfa marka kimliğine uygun tasarlanır; bilgi eksikse size sorulur.", h("div", { class: "page-checks" }, ...boxes.map((b) => b.el)), btn);
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
    case "text": {
      const page = h("select", { id: "tx-page" }, ...d.pages.map((pg) => h("option", { value: pg }, PAGE_TR[pg] || pg)));
      const oldT = h("textarea", { id: "tx-old", rows: 2, placeholder: "Sitedeki metni kopyalayıp yapıştırınız", maxlength: 2000 });
      const newT = h("textarea", { id: "tx-new", rows: 2, placeholder: "Yeni metni yazınız", maxlength: 2000 });
      const btn = h("button", { class: "btn btn-primary", type: "button", disabled: busy }, "Metni Değiştir");
      btn.onclick = () => submitEdit(slug, "text", { page: page.value, oldText: oldT.value, newText: newT.value }, btn);
      return card("Metin", null, h("label", { for: "tx-page" }, "Sayfa", page), h("label", { for: "tx-old" }, "Mevcut metin", oldT), h("label", { for: "tx-new" }, "Yeni metin", newT), btn);
    }
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
