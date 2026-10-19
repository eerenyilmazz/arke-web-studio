// Extras sold on top of the base site (src/panel/addons.ts): ticked per client, priced in Business Tracking,
// listed in the proposal, and passed to the agent as what to build.
import { h, LANG_NAMES } from "./core.js";

export const ADDONS = [
  { id: "language", label: "İkinci dil", hint: "Site iki dilde; diğer dil ayrı bir çeviri işiyle eklenir." },
  { id: "theme", label: "Koyu / açık tema", hint: "İki tema ve geçiş düğmesi. Seçilmezse site tek temayla yapılır." },
  { id: "blog", label: "Blog", hint: "Menüde blog sayfası; yazılar 'Blog yazısı' işiyle eklenir." },
  { id: "whatsapp", label: "WhatsApp butonu", hint: "Sabit WhatsApp düğmesi (numara gerekir)." },
  { id: "booking", label: "Online randevu", hint: "Her sayfada 'Online randevu' düğmesi (randevu linki gerekir)." },
];

export const addonLabel = (id) => ADDONS.find((a) => a.id === id)?.label ?? id;

/**
 * Checkboxes for the extras, with a price field each when `prices` is on. `skip` hides rows another control
 * decides (the new-client form picks the language with its own select). value() returns the list to save.
 */
export function addonsEditor(current = [], { prices = false, currencySign = "", mainLang = "en", skip = [], idPrefix = "ad" } = {}) {
  const chosen = new Map(current.map((a) => [a.id, a]));
  const rows = ADDONS.filter((a) => !skip.includes(a.id)).map((a) => {
    const had = chosen.get(a.id);
    const box = h("input", { type: "checkbox", id: `${idPrefix}-${a.id}`, checked: Boolean(had) });
    const price = prices
      ? h("input", {
          type: "number",
          min: 0,
          step: "any",
          id: `${idPrefix}-${a.id}-price`,
          value: had?.price ?? "",
          placeholder: "Fiyat",
          "aria-label": `${a.label} fiyatı`,
          disabled: !had,
        })
      : null;
    const lang =
      a.id === "language"
        ? h(
            "select",
            { id: `${idPrefix}-language-value`, "aria-label": "İkinci dil", disabled: !had },
            ...Object.entries(LANG_NAMES)
              .filter(([k]) => k !== mainLang)
              .map(([k, v]) => h("option", { value: k, selected: had?.value === k }, v)),
          )
        : null;
    box.addEventListener("change", () => {
      if (price) price.disabled = !box.checked;
      if (lang) lang.disabled = !box.checked;
    });
    const el = h(
      "div",
      { class: "addon-row" },
      h("label", { for: box.id, class: "check" }, box, h("span", {}, h("strong", { text: a.label }), h("span", { class: "help", text: a.hint }))),
      lang,
      price && h("span", { class: "row nowrap addon-price" }, price, currencySign && h("span", { class: "muted", text: currencySign })),
    );
    return { a, box, price, lang, el };
  });
  return {
    el: h("div", { class: "addons" }, ...rows.map((r) => r.el)),
    value: () =>
      rows
        .filter((r) => r.box.checked)
        .map((r) => ({
          id: r.a.id,
          price: r.price && r.price.value !== "" ? Number(r.price.value) : null,
          ...(r.lang ? { value: r.lang.value } : {}),
        })),
  };
}
