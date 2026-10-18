// Business tracking: price, payment, due date, costs and profit for one client.
import { api, fmtTokens, guarded, h, PACKAGE_NAMES, toast } from "./core.js";
import { loadClients } from "./router.js";

export const PAYMENT_LABELS = { none: "Teklif verilmedi", quoted: "Teklif verildi", deposit: "Kapora alındı", paid: "Ödendi" };

const MARKET_CURRENCY = { TR: "TRY", GB: "GBP", US: "USD" };

export const CURRENCY_SIGNS = { TRY: "₺", GBP: "£", EUR: "€", USD: "$" };

export const money = (n, cur) => `${CURRENCY_SIGNS[cur] || ""}${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;

/** One line for a client card: price, payment and delivery date (red when late and unpaid). */
export function businessLine(b) {
  if (!b) return null;
  const parts = [];
  if (b.price != null) parts.push(`${CURRENCY_SIGNS[b.currency] || ""}${Number(b.price).toLocaleString("tr-TR")}`);
  parts.push(PAYMENT_LABELS[b.payment] || b.payment);
  let late = false;
  if (b.deadline) {
    const due = new Date(`${b.deadline}T23:59:59`);
    late = due < new Date() && b.payment !== "paid";
    parts.push(`Teslim ${due.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`);
  }
  return h("span", { class: `biz ${late ? "late" : ""} pay-${b.payment}`, text: parts.join(" · ") });
}

/** Price − own costs − agent cost, with what is missing for the calculation. */
export function profitLine(p) {
  if (!p) return null;
  const agent = p.agentCost !== null ? money(p.agentCost, p.currency) : `$${p.agentUsd.toFixed(2)}`;
  if (p.price === null) return h("p", { class: "profit muted small", text: `Agent maliyeti şimdiye kadar ${agent} (${p.jobs} işlem). Fiyat girilince kâr hesaplanır.` });
  if (p.agentCost === null) return h("p", { class: "profit muted small", text: `Agent maliyeti $${p.agentUsd.toFixed(2)}. Kâr için Ayarlar → Kâr Hesabı'ndan 1 USD = ? ${p.currency} kurunu giriniz.` });
  return h("p", { class: `profit ${p.profit < 0 ? "loss" : ""}` },
    h("span", { class: "muted small", text: `${money(p.price, p.currency)} fiyat − ${money(p.extraCosts, p.currency)} gider − ${agent} agent = ` }),
    h("strong", { text: `${money(p.profit, p.currency)} kâr` }));
}

export function businessForm(d) {
  const slug = d.status.slug;
  const b = d.businessTracking || { price: null, currency: MARKET_CURRENCY[d.country] || "EUR", payment: "none", deadline: null, note: "" };
  const price = h("input", { id: "biz-price", type: "number", min: 0, step: "50", value: b.price ?? "" });
  const currency = h("select", { id: "biz-cur" }, ...Object.entries(CURRENCY_SIGNS).map(([k, v]) => h("option", { value: k, selected: k === b.currency }, `${v} ${k}`)));
  const payment = h("select", { id: "biz-pay" }, ...Object.entries(PAYMENT_LABELS).map(([k, v]) => h("option", { value: k, selected: k === b.payment }, v)));
  const deadline = h("input", { id: "biz-date", type: "date", value: b.deadline || "" });
  const due = h("input", { id: "biz-due", type: "date", value: b.paymentDue || "" });
  const note = h("textarea", { id: "biz-note", rows: 2, maxlength: 2000 });
  note.value = b.note || "";
  const tags = h("input", { id: "biz-tags", placeholder: "ör. abim, acil, Ankara", value: (b.tags || []).join(", ") });
  const bmode = h("select", { id: "biz-mode" }, h("option", { value: "" }, "Varsayılan paket"), ...Object.entries(PACKAGE_NAMES).map(([k, v]) => h("option", { value: k, selected: b.budgetMode === k }, v)));
  // Eren's own costs for this client (same currency as the price): domain, stock photos, a form plan…
  const costRows = h("div", { class: "cost-rows" });
  const addCost = (c = { label: "", amount: "" }) => {
    const row = h("div", { class: "cost-row" },
      h("input", { type: "text", placeholder: "Gider (ör. alan adı)", value: c.label, maxlength: 60, "aria-label": "Gider adı" }),
      h("input", { type: "number", min: 0, step: "any", placeholder: "Tutar", value: c.amount, "aria-label": "Tutar" }),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Gideri sil", onclick: () => row.remove() }, "✕"));
    costRows.append(row);
  };
  (b.costs || []).forEach((c) => addCost(c));
  const form = h("form", { class: "card biz-form", onsubmit: async (e) => {
    e.preventDefault();
    const r = await guarded(() => api("PUT", `/api/clients/${slug}/business`, {
      price: price.value === "" ? null : Number(price.value), currency: currency.value, payment: payment.value, deadline: deadline.value || null, paymentDue: due.value || null, note: note.value,
      tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
      budgetMode: bmode.value,
      costs: [...costRows.children].map((r) => { const [l, a] = r.querySelectorAll("input"); return { label: l.value.trim(), amount: Number(a.value || 0) }; }).filter((c) => c.label && c.amount > 0),
    }));
    if (r) { toast("İş bilgileri kaydedildi."); loadClients(); }
  } },
    h("div", { class: "biz-grid" },
      h("label", { for: "biz-price" }, "Fiyat", h("div", { class: "row nowrap" }, price, currency)),
      h("label", { for: "biz-pay" }, "Ödeme", payment),
      h("label", { for: "biz-date" }, "Teslim tarihi", deadline),
      h("label", { for: "biz-due" }, "Ödeme günü", due),
    ),
    h("label", { for: "biz-note" }, "Not", note),
    h("label", { for: "biz-tags" }, "Etiketler (virgülle)", tags),
    h("label", { for: "biz-mode" }, `Paket${d.budget ? ` (şimdiye kadar ${fmtTokens(d.budget.usage.tokens)} birim, ${d.budget.usage.jobs} işlem)` : ""}`, bmode),
    h("div", { class: "stack-sm" }, h("span", { class: "nc-label", text: "Giderler" }), costRows, h("button", { class: "btn btn-sm", type: "button", onclick: () => addCost() }, "+ Gider ekle")),
    profitLine(d.profit),
    h("div", {}, h("button", { class: "btn btn-primary", type: "submit" }, "Kaydet")),
  );
  return form;
}
