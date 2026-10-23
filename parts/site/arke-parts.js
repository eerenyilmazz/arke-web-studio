/* Arke Web Studio ready-made part: the site side of the catalogue and the inbox forms (js/arke-parts.js).
   Factory-owned: replaced by the factory at every build; the agent places the markup and never edits this file.

   Catalogue:  <div data-arke-catalog [data-category="slug"] [data-limit="6"]>
                 <button data-arke-filter="">All</button> <button data-arke-filter="slug">…</button>   (optional)
                 <template data-arke-item> …elements with data-field="name|description|price|image|category|duration"… </template>
                 <p data-arke-empty hidden>…</p>
               </div>
   Form:       <form data-arke-inquiry [data-sent="…"] [data-error="…"]> name, contact, [subject], [message] fields,
               a submit button and <p data-arke-status role="status"></p> </form>                                   */
(() => {
  "use strict";
  const lang = document.documentElement.lang || "tr";
  const tr = lang.startsWith("tr");
  const DEFAULTS = {
    sent: tr ? "Mesajınız alındı. En kısa sürede dönüş yapacağız." : "Thank you, your message has been received.",
    error: tr ? "Gönderilemedi. Lütfen tekrar deneyin ya da bizi arayın." : "Could not send. Please try again or call us.",
    sending: tr ? "Gönderiliyor…" : "Sending…",
    minutes: tr ? "dk" : "min",
  };

  function money(minor, currency) {
    if (minor == null) return "";
    try {
      return new Intl.NumberFormat(lang, { style: "currency", currency }).format(minor / 100);
    } catch {
      return `${(minor / 100).toFixed(2)} ${currency}`;
    }
  }

  function fill(node, item, categories) {
    for (const el of node.querySelectorAll("[data-field]")) {
      const f = el.getAttribute("data-field");
      if (f === "image") {
        if (item.image) {
          el.setAttribute("src", item.image);
          if (!el.getAttribute("alt")) el.setAttribute("alt", item.name);
          el.setAttribute("loading", "lazy");
        } else el.remove();
      } else if (f === "price") {
        el.textContent = money(item.price, item.currency);
        if (item.price == null) el.hidden = true;
      } else if (f === "duration") {
        el.textContent = item.duration ? `${item.duration} ${DEFAULTS.minutes}` : "";
        if (!item.duration) el.hidden = true;
      } else if (f === "category") {
        el.textContent = categories.get(item.category) ?? "";
      } else if (f === "name" || f === "description") {
        el.textContent = item[f] ?? "";
      }
    }
    const root = node.firstElementChild;
    if (root && item.category) root.setAttribute("data-category", item.category);
  }

  let catalogue = null;
  const loadCatalogue = () => {
    catalogue ??= fetch("/api/catalog", { headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    return catalogue;
  };

  async function renderCatalogue(box) {
    const tpl = box.querySelector("template[data-arke-item]");
    const empty = box.querySelector("[data-arke-empty]");
    if (!tpl) return;
    const list = document.createElement("div");
    list.className = tpl.getAttribute("data-list-class") || "arke-items";
    tpl.after(list);
    let data;
    try {
      data = await loadCatalogue();
    } catch {
      if (empty) empty.hidden = false;
      return;
    }
    const names = new Map(data.categories.map((c) => [c.slug, c.name]));
    const only = box.getAttribute("data-category");
    const max = Number(box.getAttribute("data-limit")) || Infinity;
    const items = data.items.filter((i) => !only || i.category === only).slice(0, max);
    for (const item of items) {
      const node = tpl.content.cloneNode(true);
      fill(node, item, names);
      list.append(node);
    }
    if (empty) empty.hidden = items.length > 0;
    const filters = box.querySelectorAll("[data-arke-filter]");
    for (const b of filters) {
      b.setAttribute("aria-pressed", b.getAttribute("data-arke-filter") === "" ? "true" : "false");
      b.addEventListener("click", () => {
        const want = b.getAttribute("data-arke-filter");
        for (const o of filters) o.setAttribute("aria-pressed", o === b ? "true" : "false");
        for (const card of list.children) card.hidden = Boolean(want) && card.getAttribute("data-category") !== want;
      });
    }
  }

  function wireForm(form) {
    const status = form.querySelector("[data-arke-status]");
    const trap = document.createElement("input");
    trap.type = "text";
    trap.name = "website";
    trap.tabIndex = -1;
    trap.autocomplete = "off";
    trap.setAttribute("aria-hidden", "true");
    trap.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0";
    form.append(trap);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const button = form.querySelector('[type="submit"]');
      const body = Object.fromEntries(new FormData(form));
      body.page = location.pathname;
      if (button) button.disabled = true;
      if (status) status.textContent = DEFAULTS.sending;
      try {
        const r = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(String(r.status));
        form.reset();
        if (status) status.textContent = form.getAttribute("data-sent") || DEFAULTS.sent;
        form.setAttribute("data-state", "sent");
      } catch {
        if (status) status.textContent = form.getAttribute("data-error") || DEFAULTS.error;
        form.setAttribute("data-state", "error");
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  const start = () => {
    for (const box of document.querySelectorAll("[data-arke-catalog]")) renderCatalogue(box);
    for (const form of document.querySelectorAll("form[data-arke-inquiry]")) wireForm(form);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
