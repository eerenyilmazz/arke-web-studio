// Design library, fixed places and library controls.
import { $, api, guarded, h, isBusy, state, toast } from "./core.js";
import { inline } from "./feed.js";
import { render, runAgent } from "./shell.js";

// ---------------------------------------------------------------- design library

/** Words of a text, lowercased, Turkish letters folded (for library search and suggestions). */
export function words(text) {
  return String(text || "").toLowerCase().replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c]).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
}
/** How well a saved design fits a client: shared words in sector (counts double), tags, name and concept. */
export function libraryScore(design, industry) {
  const want = new Set(words(industry));
  if (!want.size) return 0;
  let score = 0;
  for (const w of words(design.sector)) if (want.has(w)) score += 2;
  for (const w of words([design.name, ...(design.tags || []), design.concept].join(" "))) if (want.has(w)) score += 1;
  return score;
}
/** Library designs for a client, best fit first, with "önerilen" on those that match its sector. */
export function rankedDesigns(designs, slug, industry) {
  return designs.filter((x) => x.sourceSlug !== slug).map((x) => ({ ...x, score: libraryScore(x, industry) })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function swatchRow(palette) {
  return h("div", { class: "swatches" }, ...Object.entries(palette || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v))).slice(0, 6).map(([n, v]) => h("span", { title: `${n} ${v}`, style: `background:${v}` })));
}

/** Saved designs, grouped by sector. A design starts a new site faster and keeps the quality of a good one. */
export async function renderLibrary() {
  if (state.libEdit) {
    const editor = await slotEditor(state.libEdit);
    if (editor) return editor;
    state.libEdit = null;
  }
  const data = await guarded(() => api("GET", "/api/library"));
  const designs = data?.designs || [];
  const head = h("div", { class: "dash-head" },
    h("div", {}, h("h1", { text: "Tasarım kütüphanesi" }),
      h("p", { class: "muted", text: "Beğendiğin siteleri buraya kaydet; yeni müşteride 'Başlangıç tasarımı' olarak seç. Agent düzeni ve hareketleri korur, renkleri, logoyu, metinleri ve imza hareketini yeni müşteriye göre yeniden yapar." })));
  if (!designs.length) {
    return h("section", { class: "dash" }, head, h("div", { class: "card stack" },
      h("p", { text: "Kütüphane boş." }),
      h("p", { class: "muted small", text: "Bir müşterinin Marka sekmesinde 'Kütüphaneye kaydet' ile ilk tasarımı ekle." })));
  }
  const q = (state.libQuery || "").trim();
  const shown = q ? designs.filter((d) => { const ws = new Set(words([d.name, d.sector, ...(d.tags || []), d.concept].join(" "))); return words(q).every((w) => [...ws].some((x) => x.startsWith(w))); }) : designs;
  const search = h("input", { type: "search", id: "lib-q", placeholder: "Ara: berber, koyu, premium…", value: q, class: "lib-search" });
  search.addEventListener("input", () => { state.libQuery = search.value; clearTimeout(search._t); search._t = setTimeout(async () => { $("#view").replaceChildren(await renderLibrary()); const el = $("#lib-q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); });
  const sectors = [...new Set(shown.map((d) => d.sector || "Diğer"))];
  return h("section", { class: "dash" }, head,
    h("label", { for: "lib-q", class: "sr-only" }, "Kütüphanede ara"), search,
    shown.length === 0 ? h("p", { class: "muted", text: "Bu aramaya uyan tasarım yok." }) : null,
    ...sectors.map((sec) => h("div", { class: "group" },
      h("h2", { class: "group-title", text: sec }),
      h("div", { class: "lib-cards" }, ...shown.filter((d) => (d.sector || "Diğer") === sec).map((d) => h("article", { class: "card lib-card" },
        d.hasPreview ? h("img", { class: "lib-shot", src: `/api/library/${d.id}/preview.png`, alt: `${d.name} önizleme`, loading: "lazy" }) : null,
        h("strong", { text: d.name }),
        swatchRow(d.palette),
        d.fonts && h("p", { class: "small muted", text: [d.fonts.heading, d.fonts.body].filter(Boolean).join(" / ") }),
        d.concept && h("p", { class: "small", text: d.concept.length > 180 ? `${d.concept.slice(0, 180)}…` : d.concept }),
        d.tags.length > 0 && h("div", { class: "chips" }, ...d.tags.map((t) => h("span", { class: "chip", text: t }))),
        h("p", { class: "small muted" }, "Kaynak: ", h("a", { href: `#/c/${d.sourceSlug}/marka`, text: d.sourceSlug }), ` · ${new Date(d.createdAt).toLocaleDateString("tr-TR")}`),
        h("p", { class: "small muted", text: d.slots?.length ? `${d.slots.length} sabit alan` : "Sabit alan tanımlı değil" }),
        h("button", { class: "btn btn-sm", type: "button", onclick: async () => { state.libEdit = d.id; render(); } }, "Sabit alanları yönet"),
        h("button", { class: "btn btn-sm danger", type: "button", onclick: async () => {
          if (!confirm(`"${d.name}" kütüphaneden silinsin mi? Kaynak müşterinin sitesi etkilenmez.`)) return;
          if (await guarded(() => api("DELETE", `/api/library/${d.id}`))) render();
        } }, "Kütüphaneden sil"),
      )))),
    ));
}

/**
 * Fixed places of a saved design: texts in the design that stand for a client fact. When the design is used,
 * the panel puts the new client's value there itself; the agent only adapts the rest.
 */
export async function slotEditor(id) {
  const data = await guarded(() => api("GET", `/api/library/${id}`));
  if (!data) return null;
  const { design, fields } = data;
  let counts = data.counts;
  const rows = h("div", { class: "stack slot-rows" });
  const fieldSelect = (value) => h("select", { "aria-label": "Alan" }, ...Object.entries(fields).map(([k, v]) => h("option", { value: k, selected: k === value }, v)));
  const addRow = (slot, count) => {
    const text = h("input", { type: "text", value: slot?.text || "", maxlength: 300, placeholder: "Tasarımda geçen metin (ör. 0534 985 63 19)", "aria-label": "Tasarımdaki metin" });
    const field = fieldSelect(slot?.field || "name");
    const found = h("span", { class: `badge ${count === 0 ? "warn" : count ? "ok" : ""}`, text: count === undefined ? "yeni" : count === 0 ? "bulunamadı" : `${count} yerde` });
    const row = h("div", { class: "slot-row" }, text, h("span", { class: "muted", "aria-hidden": "true", text: "→" }), field, found,
      h("button", { class: "btn btn-sm", type: "button", "aria-label": "Satırı sil", onclick: () => row.remove() }, "Sil"));
    rows.append(row);
  };
  design.slots.forEach((x, i) => addRow(x, counts[i]));
  const name = h("input", { type: "text", id: "slot-name", value: design.name, maxlength: 60 });
  const tags = h("input", { type: "text", id: "slot-tags", value: design.tags.join(", "), maxlength: 120 });
  const save = async () => {
    const slots = [...rows.querySelectorAll(".slot-row")].map((r) => ({ text: r.querySelector("input").value.trim(), field: r.querySelector("select").value })).filter((x) => x.text);
    const r = await guarded(() => api("PUT", `/api/library/${id}`, { name: name.value.trim(), tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean), slots }));
    if (!r) return;
    counts = r.counts;
    const missing = counts.filter((c) => c === 0).length;
    toast(missing ? `Kaydedildi. ${missing} metin tasarımda bulunamadı; yazımı kontrol ediniz.` : "Sabit alanlar kaydedildi.");
    $("#view").replaceChildren(await renderLibrary());
  };
  return h("section", { class: "dash" },
    h("div", { class: "dash-head" }, h("div", {},
      h("h1", { text: `Sabit alanlar: ${design.name}` }),
      h("p", { class: "muted", text: "Tasarımda müşteriye özel olan metinleri ve karşılık gelen alanı belirleyiniz. Bu tasarım yeni bir müşteride kullanıldığında bu metinler panel tarafından o müşterinin bilgisiyle değiştirilir (agent kullanılmaz). Müşterinin bu bilgisi henüz yoksa metin agent'a bırakılır ve derleme, metin değişene kadar başarısız olur." }))),
    h("div", { class: "card stack" },
      h("div", { class: "two" }, h("label", { for: "slot-name" }, "Tasarım adı", name), h("label", { for: "slot-tags" }, "Etiketler", tags)),
      h("h3", { text: "Metin → alan" }),
      h("p", { class: "small muted", text: "Aynı bilgi sitede farklı yazılmışsa (ör. '+905349856319' ve '0534 985 63 19') her yazılışı ayrı satır olarak ekleyiniz. Büyük-küçük harf önemlidir." }),
      rows,
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => addRow(null, undefined) }, "+ Satır ekle"),
        h("button", { class: "btn", style: "margin-inline-start:auto", type: "button", onclick: async () => { state.libEdit = null; render(); } }, "Kütüphaneye dön"),
        h("button", { class: "btn btn-primary", type: "button", onclick: save }, "Kaydet"))));
}

/** Library controls on a custom site: save this design, or start over from a saved one. */
export function libraryControls(slug, hasSite) {
  const box = h("div", { class: "card stack lib-controls" }, h("h3", { text: "Tasarım kütüphanesi" }));
  const name = h("input", { id: "lib-name", placeholder: "ör. Teknik koyu, kod pencereli", maxlength: 60 });
  const tags = h("input", { id: "lib-tags", placeholder: "Etiketler: koyu, teknik, premium", maxlength: 120 });
  if (hasSite) {
    box.append(h("form", { class: "row", onsubmit: async (e) => {
      e.preventDefault();
      if (!name.value.trim()) { name.focus(); return; }
      const r = await guarded(() => api("POST", `/api/clients/${slug}/library`, { name: name.value.trim(), tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean) }));
      if (r) { toast(`"${r.name}" kütüphaneye kaydedildi. Müşterinin adı, telefonu ve adresi yeni sitelere taşınmaz.`); name.value = ""; tags.value = ""; }
    } }, h("label", { for: "lib-name", class: "sr-only" }, "Tasarım adı"), name, h("label", { for: "lib-tags", class: "sr-only" }, "Etiketler"), tags, h("button", { class: "btn", type: "submit" }, "Kütüphaneye kaydet")));
  }
  const pick = h("select", { id: "lib-pick" }, h("option", { value: "" }, "Kütüphaneden tasarım seç…"));
  api("GET", "/api/library").then(({ designs }) => {
    const industry = state.detail?.business?.industry || "";
    for (const d of rankedDesigns(designs, slug, industry)) pick.append(h("option", { value: d.id }, `${d.score > 0 ? "★ " : ""}${d.name}${d.sector ? ` · ${d.sector}` : ""}`));
  }).catch(() => {});
  box.append(h("div", { class: "row" }, h("label", { for: "lib-pick", class: "sr-only" }, "Kütüphane tasarımı"), pick,
    h("button", { class: "btn", type: "button", disabled: isBusy(), onclick: () => {
      if (!pick.value) { pick.focus(); return; }
      if (confirm("Mevcut sayfalar kütüphane tasarımıyla değişecek (önceki hâl Sürümler'de kalır). Agent tasarımı bu müşteriye uyarlayacak. Devam?")) runAgent(slug, "from-library", { id: pick.value });
    } }, "Bu tasarımla yeniden kur")));
  return box;
}
