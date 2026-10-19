// Home dashboard: one card per client with its next step, earnings and overdue payments.
import { locale } from "./i18n.js";
import { businessLine, CURRENCY_SIGNS } from "./business.js";
import { api, avatar, h, isBusy, plainOf, state, stepIndex, STEPS } from "./core.js";
import { render } from "./router.js";

// ---------------------------------------------------------------- home and new client

/** Home: who needs what, at a glance. One card per client with its next step. */
export function renderHome() {
  if (!state.clients.length) {
    return h(
      "section",
      { class: "empty" },
      h("h1", { text: "İlk müşteriyi ekleyin" }),
      h("p", { class: "muted", text: "Adını ve sektörünü yaz, bildiklerini yapıştır; agent markayı tasarlar ve siteyi hazırlar." }),
      h("p", { style: "margin-top:1.2rem" }, h("a", { class: "btn btn-primary btn-lg", href: "#/yeni" }, "Yeni Müşteri")),
    );
  }
  const running = isBusy() ? state.running.slug : null;
  const bucket = (c) => (c.slug === running ? "agent" : plainOf(c.stage).tone);
  const COUNTS = [
    ["you", "Onay Bekleyen", "İşleminizi bekliyor"],
    ["agent", "İşlem Sürüyor", "Şu an hazırlanıyor"],
    ["client", "Bilgi Bekleyen", "Müşteriden bilgi bekleniyor"],
    ["done", "Yayında", "Canlı siteler"],
  ];
  const order = { agent: 0, you: 1, bad: 2, client: 3, done: 4 };
  // Grouping and filters (kept per browser): by step, by sector or by Eren's own tags.
  const pref = (() => {
    try {
      return JSON.parse(localStorage.getItem("sf-dash") || "{}");
    } catch {
      return {};
    }
  })();
  const groupBy = pref.groupBy || "step";
  const filter = pref.filter || "";
  const save = (p) => {
    try {
      localStorage.setItem("sf-dash", JSON.stringify({ groupBy, filter, ...p }));
    } catch {
      /* private mode */
    }
    render();
  };
  const sectorOf = (c) => (c.industry || "Diğer").toLowerCase();
  const tagsOf = (c) => (c.business?.tags || []).map((t) => t.toLowerCase());
  const filters = [...new Set([...state.clients.map(sectorOf), ...state.clients.flatMap(tagsOf)])].sort();
  const visible = state.clients.filter((c) => !filter || sectorOf(c) === filter || tagsOf(c).includes(filter));
  const sorted = [...visible].sort((a, b) => order[bucket(a)] - order[bucket(b)]);
  const keyOf = (c) => (groupBy === "sector" ? sectorOf(c) : groupBy === "tag" ? tagsOf(c)[0] || "etiketsiz" : null);
  const groups = groupBy === "step" ? [[null, sorted]] : [...new Set(sorted.map(keyOf))].sort().map((k) => [k, sorted.filter((c) => keyOf(c) === k)]);
  const card = (c) => {
    const b = bucket(c);
    const step = stepIndex(c.stage);
    return h(
      "a",
      { class: `client-card tone-${b}`, href: `#/musteri/${c.slug}` },
      h(
        "div",
        { class: "top" },
        avatar(c.slug, c.name || c.slug, false, b === "agent"),
        h("span", { class: `pill tone-${b}`, text: b === "agent" ? "İşlem sürüyor" : plainOf(c.stage).text }),
      ),
      h("strong", { class: "name", text: c.name || c.slug }),
      h("span", { class: "sub", text: [c.industry, ...(c.business?.tags || [])].filter(Boolean).join(" · ") }),
      h(
        "div",
        { class: "mini-steps", "aria-label": `Adım ${step + 1} / ${STEPS.length}: ${STEPS[step].label}` },
        ...STEPS.map((s, i) => h("span", { class: i < step ? "done" : i === step ? "now" : "" })),
      ),
      h("span", { class: "next", text: nextHint(c, b) }),
      businessLine(c.business),
    );
  };
  const toolbar = h(
    "div",
    { class: "dash-tools" },
    h(
      "div",
      { class: "seg", role: "group", "aria-label": "Gruplama" },
      ...[
        ["step", "Duruma göre"],
        ["sector", "Sektöre göre"],
        ["tag", "Etikete göre"],
      ].map(([k, l]) => h("button", { type: "button", "aria-pressed": String(groupBy === k), onclick: () => save({ groupBy: k }) }, l)),
    ),
    filters.length > 1 &&
      h(
        "div",
        { class: "chips", role: "group", "aria-label": "Filtre" },
        h("button", { type: "button", class: "chip", "aria-pressed": String(!filter), onclick: () => save({ filter: "" }) }, "Hepsi"),
        ...filters.map((f) => h("button", { type: "button", class: "chip", "aria-pressed": String(filter === f), onclick: () => save({ filter: f }) }, f)),
      ),
  );
  return h(
    "section",
    { class: "dash" },
    h(
      "div",
      { class: "dash-head" },
      // One "Yeni Müşteri" for the whole panel: the one at the top of the rail.
      h("div", {}, h("h1", { text: "Müşteriler" }), h("p", { class: "muted", text: "İşlem bekleyen müşteriler üstte listelenir." })),
    ),
    h(
      "div",
      { class: "counts" },
      ...COUNTS.map(([key, label, sub]) => {
        const n = state.clients.filter((c) => bucket(c) === key).length;
        return h(
          "div",
          { class: `count tone-${key}` },
          h("strong", { text: String(n) }),
          h("span", { class: "label", text: label }),
          h("span", { class: "sub", text: sub }),
        );
      }),
    ),
    overdueCard(),
    profitSummaryCard(),
    toolbar,
    ...groups.map(([k, list]) =>
      h(
        "div",
        { class: "group" },
        k && h("h2", { class: "group-title", text: `${k} (${list.length})` }),
        h("div", { class: "client-cards" }, tableHead(), ...list.map(card)),
      ),
    ),
    visible.length === 0 && h("p", { class: "muted", text: "Bu filtrede müşteri yok." }),
  );
}

/** Column names over the client rows (each row also carries its own text, so this is for the eye only). */
function tableHead() {
  return h(
    "div",
    { class: "client-table-head", "aria-hidden": "true" },
    ...["Müşteri", "Durum", "Sektör", "İlerleme", "Sıradaki adım", "Ücret"].map((t) => h("span", { text: t })),
  );
}

/** One-line next step shown on a client card. */
export function nextHint(c, tone) {
  if (tone === "agent") return "Tamamlandığında bildirim alacaksınız";
  switch (c.stage) {
    case "collecting-answers":
      return "Müşteri bilgilerini giriniz";
    case "design":
    case "content":
    case "build":
      return "Siteyi oluşturunuz";
    case "awaiting-content-approval":
    case "awaiting-visual-approval":
      return "Siteyi inceleyip onaylayınız";
    case "awaiting-production-approval":
      return "Önizlemeyi müşteriye iletiniz";
    case "ready-to-deploy":
      return "Yayına alınız";
    case "live":
      return "Revizyon için talep oluşturunuz";
    default:
      return "Açınız";
  }
}

const fmtMoney = (n, cur) => `${CURRENCY_SIGNS[cur] || ""}${Number(n).toLocaleString(locale(), { maximumFractionDigits: 0 })}`;

/** Price, own costs, agent cost and profit across clients, per currency (folded; loads after the page). */
function profitSummaryCard() {
  const body = h("div", { class: "profit-body" }, h("p", { class: "muted small", text: "Hesaplanıyor…" }));
  const box = h(
    "details",
    { class: "card profit-card" },
    h("summary", {}, h("strong", { text: "Kazanç" }), h("span", { class: "muted small", text: " fiyat − gider − agent maliyeti" })),
    body,
  );
  api("GET", "/api/profit")
    .then((r) => {
      const cur = Object.entries(r.totals);
      const rows = r.clients.filter((c) => c.price !== null || c.agentUsd > 0).sort((a, b) => (b.profit ?? -1e12) - (a.profit ?? -1e12));
      body.replaceChildren(
        cur.length
          ? h(
              "div",
              { class: "profit-totals" },
              ...cur.map(([c, t]) =>
                h(
                  "div",
                  { class: "count" },
                  h("strong", { text: fmtMoney(t.profit, c) }),
                  h("span", { class: "label", text: `Toplam kâr (${c})` }),
                  h("span", {
                    class: "sub",
                    text: `${fmtMoney(t.price, c)} fiyat · ${fmtMoney(t.extraCosts, c)} gider · ${fmtMoney(t.agentCost, c)} agent${t.missingRate ? " · kur eksik" : ""}`,
                  }),
                ),
              ),
            )
          : h("p", { class: "muted small", text: "Henüz fiyatı girilmiş müşteri yok (Müşteri Bilgileri → İş Takibi)." }),
        h("p", { class: "muted small", text: `Bu ay agent maliyeti: $${r.monthAgentUsd.toFixed(2)}` }),
        rows.length
          ? h(
              "div",
              { style: "overflow-x:auto" },
              h(
                "table",
                { class: "profit-table" },
                h("thead", {}, h("tr", {}, ...["Müşteri", "Fiyat", "Gider", "Agent", "Kâr"].map((t) => h("th", { text: t })))),
                h(
                  "tbody",
                  {},
                  ...rows.map((c) =>
                    h(
                      "tr",
                      {},
                      h("td", {}, h("a", { href: `#/musteri/${c.slug}/bilgiler`, text: c.name })),
                      h("td", { text: c.price === null ? "—" : fmtMoney(c.price, c.currency) }),
                      h("td", { text: c.extraCosts ? fmtMoney(c.extraCosts, c.currency) : "—" }),
                      h("td", { text: c.agentCost === null ? `$${c.agentUsd.toFixed(2)}` : fmtMoney(c.agentCost, c.currency) }),
                      h("td", { class: c.profit !== null && c.profit < 0 ? "loss" : "", text: c.profit === null ? "—" : fmtMoney(c.profit, c.currency) }),
                    ),
                  ),
                ),
              ),
            )
          : null,
      );
    })
    .catch(() => body.replaceChildren(h("p", { class: "muted small", text: "Kazanç bilgisi okunamadı." })));
  return box;
}

/** Clients whose payment day has passed and who have not paid: a reminder, with a way to the client. */
function overdueCard() {
  const today = new Date().toISOString().slice(0, 10);
  const late = state.clients.filter((c) => c.business?.paymentDue && c.business.paymentDue < today && c.business.payment !== "paid");
  if (!late.length) return null;
  return h(
    "section",
    { class: "notice-bar bad overdue", role: "alert" },
    h(
      "p",
      {},
      h("strong", { text: `Ödemesi geciken ${late.length} müşteri. ` }),
      ...late
        .map((c, i) => [
          i ? ", " : "",
          h("a", {
            href: `#/musteri/${c.slug}/bilgiler`,
            text: `${c.name || c.slug} (${new Date(`${c.business.paymentDue}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "short" })})`,
          }),
        ])
        .flat(),
    ),
    h("span", { class: "muted small", text: "Müşteri Bilgileri'nden hatırlatabilir ya da Yayın → Yayından kaldır ile siteyi kapatabilirsiniz." }),
  );
}
