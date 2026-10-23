// Analysis: every client in one table (business, money, work, the built site), with filters, sorting, totals and
// a CSV download. Read-only: it reads /api/analytics and changes nothing.
import { addonLabel } from "./addons.js";
import { CURRENCY_SIGNS, PAYMENT_LABELS } from "./business.js";
import { api, guarded, h, LANG_NAMES, PACKAGE_NAMES, plainOf } from "./core.js";
import { locale } from "./i18n.js";

const PREF_KEY = "arke-analiz";
const PRODUCT_NAMES = { showcase: "Tanıtım", ecommerce: "E-ticaret", booking: "Randevu", restaurant: "Restoran-Kafe" };
const COUNTRY_NAMES = { GB: "İngiltere", TR: "Türkiye", IE: "İrlanda", US: "ABD", DE: "Almanya", NL: "Hollanda" };
/** Over this, a page (HTML + shared CSS/JS) or an image is marked heavy. */
const HEAVY_PAGE_BYTES = 500_000;
const HEAVY_IMAGE_BYTES = 400_000;
/** Shown where a figure cannot be worked out yet. */
const NONE = "—";

const num = (n, digits = 0) => Number(n).toLocaleString(locale(), { maximumFractionDigits: digits });
const money = (n, cur) => (n === null || n === undefined ? "" : `${CURRENCY_SIGNS[cur] || ""}${num(n)}`);
const kb = (bytes) => (bytes >= 1_000_000 ? `${num(bytes / 1_000_000, 1)} MB` : `${num(Math.round(bytes / 1000))} KB`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "");
const packageOf = (r) => PACKAGE_NAMES[r.packageMode] || "Varsayılan";
const checksText = (c) => (c ? `${c.pass} geçti · ${c.warn} uyarı · ${c.fail} hata` : "");

/**
 * Columns: what the cell shows, the value it sorts by and the CSV value. `num` aligns right; `group` starts a new
 * column group (a thin line before it).
 */
const COLUMNS = [
  { id: "name", label: "Müşteri", sort: (r) => r.name.toLocaleLowerCase(), cell: (r) => h("a", { href: `#/musteri/${r.slug}`, text: r.name }) },
  {
    id: "stage",
    label: "Durum",
    sort: (r) => r.stage,
    cell: (r) => h("span", { class: `pill tone-${plainOf(r.stage).tone}`, text: plainOf(r.stage).text }),
    csv: (r) => plainOf(r.stage).text,
  },
  { id: "product", label: "Tür", sort: (r) => r.product, cell: (r) => PRODUCT_NAMES[r.product] || r.product },
  { id: "industry", label: "Sektör", sort: (r) => r.industry, cell: (r) => r.industry },
  { id: "country", label: "Ülke", sort: (r) => r.country || "", cell: (r) => COUNTRY_NAMES[r.country] || r.country || "" },
  { id: "locales", label: "Diller", sort: (r) => r.locales.length, cell: (r) => r.locales.map((l) => LANG_NAMES[l] || l).join(", ") },
  { id: "package", label: "Paket", group: true, sort: packageOf, cell: packageOf },
  { id: "addons", label: "Ekstralar", sort: (r) => r.addons.length, cell: (r) => r.addons.map(addonLabel).join(", ") },
  { id: "price", label: "Fiyat", num: true, sort: (r) => r.price ?? -1, cell: (r) => money(r.price, r.currency), csv: (r) => r.price ?? "" },
  {
    id: "payment",
    label: "Ödeme",
    sort: (r) => r.payment,
    cell: (r) => h("span", { class: r.latePayment ? "late" : "", text: PAYMENT_LABELS[r.payment] || r.payment }),
    csv: (r) => PAYMENT_LABELS[r.payment] || r.payment,
  },
  {
    id: "deadline",
    label: "Teslim",
    sort: (r) => r.deadline || "9999",
    cell: (r) => h("span", { class: r.lateDelivery ? "late" : "", text: r.deadline ? day(r.deadline) : "" }),
    csv: (r) => r.deadline || "",
  },
  { id: "costs", label: "Gider", num: true, sort: (r) => r.extraCosts, cell: (r) => money(r.extraCosts, r.currency), csv: (r) => r.extraCosts },
  {
    id: "agent",
    label: "Agent",
    num: true,
    sort: (r) => r.agentUsd,
    cell: (r) => (r.agentCost !== null ? money(r.agentCost, r.currency) : `$${num(r.agentUsd, 2)}`),
    csv: (r) => r.agentUsd,
  },
  {
    id: "profit",
    label: "Kâr",
    num: true,
    sort: (r) => r.profit ?? -1e12,
    cell: (r) => h("strong", { class: r.profit < 0 ? "loss" : "", text: money(r.profit, r.currency) }),
    csv: (r) => r.profit ?? "",
  },
  {
    id: "jobs",
    label: "İş",
    group: true,
    num: true,
    sort: (r) => r.jobs.total,
    cell: (r) => (r.jobs.failed ? `${r.jobs.total} (${r.jobs.failed} başarısız)` : String(r.jobs.total)),
    csv: (r) => r.jobs.total,
  },
  {
    id: "minutes",
    label: "Agent süresi",
    num: true,
    sort: (r) => r.jobs.minutes,
    cell: (r) => (r.jobs.total ? `${num(r.jobs.minutes)} dk` : ""),
    csv: (r) => r.jobs.minutes,
  },
  { id: "lastJob", label: "Son iş", sort: (r) => r.jobs.lastAt || "", cell: (r) => day(r.jobs.lastAt), csv: (r) => r.jobs.lastAt || "" },
  {
    id: "daysToLive",
    label: "Yayına kadar",
    num: true,
    sort: (r) => r.daysToLive ?? 1e9,
    cell: (r) => (r.daysToLive === null ? "" : `${r.daysToLive} gün`),
    csv: (r) => r.daysToLive ?? "",
  },
  {
    id: "checks",
    label: "Kontroller",
    group: true,
    sort: (r) => (r.checks ? r.checks.fail * 1000 + r.checks.warn : -1),
    cell: (r) => h("span", { class: r.checks?.fail ? "late" : "", text: checksText(r.checks) }),
    csv: (r) => checksText(r.checks),
  },
  {
    id: "pages",
    label: "Sayfa",
    num: true,
    sort: (r) => r.site?.pages ?? -1,
    cell: (r) => (r.site ? String(r.site.pages) : ""),
    csv: (r) => r.site?.pages ?? "",
  },
  {
    id: "pageBytes",
    label: "Sayfa ağırlığı",
    num: true,
    sort: (r) => r.site?.pageBytes ?? -1,
    cell: (r) => (r.site ? h("span", { class: r.site.pageBytes > HEAVY_PAGE_BYTES ? "late" : "", text: kb(r.site.pageBytes) }) : ""),
    csv: (r) => r.site?.pageBytes ?? "",
  },
  {
    id: "images",
    label: "Görseller",
    num: true,
    sort: (r) => r.site?.imageBytes ?? -1,
    cell: (r) => (r.site ? `${r.site.images} · ${kb(r.site.imageBytes)}` : ""),
    csv: (r) => r.site?.imageBytes ?? "",
  },
  {
    id: "largest",
    label: "En büyük görsel",
    num: true,
    sort: (r) => r.site?.largestImage?.bytes ?? -1,
    cell: (r) =>
      r.site?.largestImage
        ? h("span", {
            class: r.site.largestImage.bytes > HEAVY_IMAGE_BYTES ? "late" : "",
            title: r.site.largestImage.file,
            text: kb(r.site.largestImage.bytes),
          })
        : "",
    csv: (r) => r.site?.largestImage?.bytes ?? "",
  },
  {
    id: "deploy",
    label: "Yayın",
    sort: (r) => r.lastDeploy?.at || "",
    cell: (r) => (r.lastDeploy ? `${r.lastDeploy.target === "production" ? "Canlı" : "Önizleme"} · ${day(r.lastDeploy.at)}` : ""),
    csv: (r) => r.lastDeploy?.at || "",
  },
];

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
  } catch {
    return {};
  }
}
function savePrefs(p) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* private window: filters are not remembered */
  }
}

const FILTERS = [
  { id: "stage", label: "Durum", of: (r) => r.stage, name: (v) => plainOf(v).text },
  { id: "product", label: "Tür", of: (r) => r.product, name: (v) => PRODUCT_NAMES[v] || v },
  { id: "country", label: "Ülke", of: (r) => r.country || "", name: (v) => COUNTRY_NAMES[v] || v },
  { id: "package", label: "Paket", of: (r) => r.packageMode, name: (v) => PACKAGE_NAMES[v] || "Varsayılan" },
  { id: "payment", label: "Ödeme", of: (r) => r.payment, name: (v) => PAYMENT_LABELS[v] || v },
  { id: "industry", label: "Sektör", of: (r) => r.industry, name: (v) => v },
  { id: "tag", label: "Etiket", of: (r) => r.tags, name: (v) => v },
];

function matches(r, f) {
  const q = (f.q || "").trim().toLocaleLowerCase();
  if (q && ![r.name, r.slug, r.industry, ...r.tags].some((t) => t.toLocaleLowerCase().includes(q))) return false;
  for (const flt of FILTERS) {
    const want = f[flt.id];
    if (!want) continue;
    const v = flt.of(r);
    if (Array.isArray(v) ? !v.includes(want) : v !== want) return false;
  }
  if (f.late && !r.lateDelivery && !r.latePayment) return false;
  if (f.broken && !(r.checks?.fail > 0) && !(r.lastBuild && !r.lastBuild.passed)) return false;
  return true;
}

/** Sums per currency: price, costs, agent and profit never mix currencies. */
function totalsByCurrency(rows) {
  const t = new Map();
  for (const r of rows) {
    // Profit and agent cost only from rows where they are known (no price, or no USD rate set = unknown).
    const x = t.get(r.currency) || { price: 0, costs: 0, agent: 0, profit: 0, n: 0, known: 0 };
    x.price += r.price ?? 0;
    x.costs += r.extraCosts;
    x.agent += r.agentCost ?? 0;
    if (r.profit !== null) {
      x.profit += r.profit;
      x.known++;
    }
    x.n++;
    t.set(r.currency, x);
  }
  return [...t.entries()];
}

function summary(rows) {
  const live = rows.filter((r) => r.stage === "live").length;
  const toLive = rows.map((r) => r.daysToLive).filter((d) => d !== null);
  const agentUsd = rows.reduce((s, r) => s + r.agentUsd, 0);
  const jobs = rows.reduce((s, r) => s + r.jobs.total, 0);
  const failed = rows.reduce((s, r) => s + r.jobs.failed, 0);
  const item = (value, label, cls = "") => h("div", { class: `kpi ${cls}` }, h("strong", { text: value }), h("span", { text: label }));
  return h(
    "div",
    { class: "kpis" },
    item(String(rows.length), "Müşteri"),
    item(String(live), "Yayında"),
    ...totalsByCurrency(rows).map(([cur, x]) => item(money(x.price, cur), `Ciro (${cur})`)),
    ...totalsByCurrency(rows).map(([cur, x]) =>
      item(x.known ? money(x.profit, cur) : NONE, x.known < x.n ? `Kâr (${cur}, ${x.known}/${x.n} müşteri)` : `Kâr (${cur})`, x.profit < 0 ? "loss" : ""),
    ),
    item(`$${num(agentUsd, 2)}`, "Agent maliyeti"),
    item(jobs ? `%${num((failed / jobs) * 100)}` : NONE, "Başarısız iş"),
    item(toLive.length ? `${num(toLive.reduce((a, b) => a + b, 0) / toLive.length, 1)} gün` : NONE, "Ort. yayına kadar"),
    item(String(rows.filter((r) => r.lateDelivery).length), "Geciken teslim", rows.some((r) => r.lateDelivery) ? "warn" : ""),
    item(String(rows.filter((r) => r.latePayment).length), "Geciken ödeme", rows.some((r) => r.latePayment) ? "warn" : ""),
  );
}

/** A column's CSV value: its own, else the text the cell shows. */
function csvCell(c, r) {
  if (c.csv) return c.csv(r);
  const v = c.cell(r);
  return v instanceof Node ? v.textContent : v;
}

function csvOf(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["slug", "currency", ...COLUMNS.map((c) => c.label)];
  const lines = rows.map((r) => [r.slug, r.currency, ...COLUMNS.map((c) => csvCell(c, r))].map(esc).join(","));
  return `﻿${[head.map(esc).join(","), ...lines].join("\n")}\n`; // BOM so Excel reads Turkish letters
}

function download(rows) {
  const url = URL.createObjectURL(new Blob([csvOf(rows)], { type: "text/csv;charset=utf-8" }));
  const a = h("a", { href: url, download: `arke-web-studio-analiz-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function renderAnalytics() {
  const data = await guarded(() => api("GET", "/api/analytics"));
  const all = data?.rows || [];
  const prefs = { sort: "stage", dir: 1, ...readPrefs() };
  const holder = h("div", { class: "analytics-body" });

  const draw = () => {
    savePrefs(prefs);
    const col = COLUMNS.find((c) => c.id === prefs.sort) || COLUMNS[0];
    const rows = all
      .filter((r) => matches(r, prefs))
      .sort((a, b) => {
        const x = col.sort(a);
        const y = col.sort(b);
        return (x < y ? -1 : x > y ? 1 : 0) * prefs.dir;
      });
    const th = (c) =>
      h(
        "th",
        {
          class: [c.num ? "num" : "", c.group ? "group" : ""].join(" ").trim() || null,
          "aria-sort": c.id === prefs.sort ? (prefs.dir > 0 ? "ascending" : "descending") : null,
          scope: "col",
        },
        h(
          "button",
          {
            type: "button",
            onclick: () => {
              prefs.dir = prefs.sort === c.id ? -prefs.dir : 1;
              prefs.sort = c.id;
              draw();
            },
          },
          c.label,
        ),
      );
    const td = (c, r) => h("td", { class: [c.num ? "num" : "", c.group ? "group" : ""].join(" ").trim() || null }, c.cell(r));
    const totals = totalsByCurrency(rows);
    const foot = totals.map(([cur, x]) =>
      h(
        "tr",
        {},
        ...COLUMNS.map((c, i) => {
          const v = { price: money(x.price, cur), costs: money(x.costs, cur), agent: money(x.agent, cur), profit: x.known ? money(x.profit, cur) : NONE }[c.id];
          if (i === 0) return h("th", { scope: "row", text: `Toplam (${cur}, ${x.n})` });
          return h("td", { class: [c.num ? "num" : "", c.group ? "group" : ""].join(" ").trim() || null, text: v || "" });
        }),
      ),
    );
    holder.replaceChildren(
      summary(rows),
      rows.length
        ? h(
            "div",
            { class: "table-wrap" },
            h(
              "table",
              { class: "data-table" },
              h("thead", {}, h("tr", {}, ...COLUMNS.map(th))),
              h("tbody", {}, ...rows.map((r) => h("tr", {}, ...COLUMNS.map((c) => td(c, r))))),
              h("tfoot", {}, ...foot),
            ),
          )
        : h("p", { class: "muted", text: all.length ? "Bu filtrede müşteri yok." : "Henüz müşteri yok." }),
      h("p", {
        class: "muted small",
        text: "Sayfa ağırlığı: ortalama sayfa + sitenin ortak CSS ve JS dosyaları (görseller hariç). Lighthouse puanı ölçülmez.",
      }),
    );
    csvBtn.onclick = () => download(rows);
  };

  const select = (f) => {
    const values = [...new Set(all.flatMap((r) => [f.of(r)].flat()))].filter((v) => v !== undefined).sort();
    const el = h(
      "select",
      { id: `an-${f.id}`, "aria-label": f.label },
      h("option", { value: "", text: `${f.label}: hepsi` }),
      ...values.map((v) => h("option", { value: v, text: f.name(v), selected: prefs[f.id] === v })),
    );
    el.addEventListener("change", () => {
      prefs[f.id] = el.value;
      draw();
    });
    return el;
  };
  const check = (id, label) => {
    const box = h("input", { type: "checkbox", id: `an-${id}`, checked: Boolean(prefs[id]) });
    box.addEventListener("change", () => {
      prefs[id] = box.checked;
      draw();
    });
    return h("label", { class: "check", for: `an-${id}` }, box, label);
  };
  const search = h("input", { type: "search", id: "an-q", placeholder: "Ara: ad, sektör, etiket", value: prefs.q || "", "aria-label": "Ara" });
  search.addEventListener("input", () => {
    prefs.q = search.value;
    draw();
  });
  const csvBtn = h("button", { type: "button", class: "btn btn-sm", id: "an-csv" }, "CSV indir");
  const clear = h("button", {
    type: "button",
    class: "btn btn-sm",
    text: "Filtreleri temizle",
    onclick: () => {
      for (const k of ["q", "late", "broken", ...FILTERS.map((f) => f.id)]) delete prefs[k];
      savePrefs(prefs);
      renderAnalytics().then((el) => document.querySelector(".analytics")?.replaceWith(el));
    },
  });

  draw();
  return h(
    "section",
    { class: "analytics" },
    h(
      "div",
      { class: "dash-head" },
      h(
        "div",
        {},
        h("h1", { text: "Analiz" }),
        h("p", { class: "muted", text: "Müşteri, para, iş ve site verileri. Sıralamak için sütun başlığına tıklayın." }),
      ),
      csvBtn,
    ),
    h("div", { class: "filters" }, search, ...FILTERS.map(select), check("late", "Gecikenler"), check("broken", "Kontrol hatası olanlar"), clear),
    holder,
  );
}
