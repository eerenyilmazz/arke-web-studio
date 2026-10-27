// Documents for the client after the work: the work report and the monthly report, in the client's language.
import { docLocale, locale, translateDoc } from "./i18n.js";
import { api, fmtTokens, guarded, h, printDoc, state } from "./core.js";

/** Documents go out in the client's language: Turkish for a Turkish site, English otherwise (the operator can switch). */
export function docLangOf(d) {
  const chosen = state.docLang?.[d.status.slug];
  if (chosen) return chosen;
  const main = d.defaultLocale || (d.country === "TR" ? "tr" : "en");
  return String(main).startsWith("tr") ? "tr" : "en";
}

/** Jobs a client report never lists: builds (each change already rebuilds) and jobs that did not finish. */
const NOT_FOR_CLIENT = new Set(["build"]);

export function reportable(records) {
  return records.filter((r) => r.status === "succeeded" && !NOT_FOR_CLIENT.has(r.kind));
}

/**
 * The agent's summary is written for the operator: markdown, sometimes long. The client's copy gets its first
 * paragraph as plain text (the operator can still edit it before printing).
 */
export function clientText(text, max = 300) {
  const first =
    String(text || "")
      .replace(/\r/g, "")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find(Boolean) || "";
  const plain = first
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|[.,;:!?]|$)/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/gm, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

const KIND_LABEL = {
  "create-site": "Site hazırlama",
  redesign: "Markayla yeniden tasarım",
  "brand-board": "Marka kartı",
  concepts: "Tasarım önerileri",
  "choose-concept": "Seçilen tasarımla kurulum",
  "from-library": "Kütüphaneden tasarım",
  "upgrade-template": "Serbest tasarıma geçiş",
  revise: "Değişiklik isteği",
  "fix-build": "Hata düzeltme",
  answers: "Bilgilerin işlenmesi",
  translate: "Çeviri",
  "add-page": "Yeni sayfa",
  build: "Siteyi oluşturma",
  deploy: "Yayın",
  unpublish: "Yayından kaldırma",
  rollback: "Önceki sürüme dönüş",
  "blog-post": "Blog yazısı",
  "portal-comments": "Müşteri yorumları",
  "quick-edit": "İletişim bilgileri",
};

/**
 * What the client asked for and what was done, from the job history: date, request, result, and for the operator the
 * resources used. Editable before printing; "Kaynak" columns can be hidden for the client's copy.
 */
export function workReport(d, docLang = docLangOf(d)) {
  const slug = d.status.slug;
  const dl = docLocale(docLang);
  const records = reportable([...(d.history || [])]).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const showCost = h("input", { type: "checkbox", id: "wr-cost" });
  const totalTokens = records.reduce((n, r) => n + (r.tokens || 0), 0);
  const label = (r) => (r.kind.startsWith("edit-") ? "Düzenleme" : KIND_LABEL[r.kind] || r.title);
  const sheet = h(
    "article",
    { class: "proposal report hide-cost" },
    h(
      "header",
      { class: "p-head" },
      h(
        "div",
        {},
        h("span", { class: "p-kicker", text: "İş raporu" }),
        h("h1", { text: d.business.name || slug }),
        h("p", {
          class: "p-meta",
          text: records.length
            ? `${new Date(records[0].startedAt).toLocaleDateString(dl)} – ${new Date(records[records.length - 1].endedAt).toLocaleDateString(dl)} · ${records.length} iş`
            : "Henüz tamamlanmış iş yok.",
        }),
      ),
    ),
    records.length
      ? h(
          "table",
          { class: "report-table" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", { class: "no-print", text: "Rapora" }),
              h("th", { text: "Tarih" }),
              h("th", { text: "İstenen" }),
              h("th", { text: "Yapılan" }),
              h("th", { class: "cost", text: "Kaynak" }),
            ),
          ),
          h(
            "tbody",
            {},
            ...records.map((r) => {
              // Unticked rows (an internal test, a job the client did not ask for) stay out of the printed copy.
              const keep = h("input", { type: "checkbox", checked: true, "aria-label": "Rapora dahil" });
              const row = h(
                "tr",
                {},
                h("td", { class: "no-print" }, keep),
                h("td", { text: new Date(r.endedAt).toLocaleDateString(dl, { day: "numeric", month: "short" }) }),
                h(
                  "td",
                  {},
                  h("strong", { text: label(r) }),
                  r.request ? h("div", { class: "small", contenteditable: "true", "data-doc-data": "", text: clientText(r.request, 240) }) : null,
                ),
                h("td", { contenteditable: "true", "data-doc-data": "", text: clientText(r.summary || r.title || "", 600) }),
                h("td", {
                  class: "cost small",
                  text: r.tokens ? `${fmtTokens(r.tokens)}${r.provider === "codex" ? " · Codex" : ""}${r.model ? ` · ${r.model}` : ""}` : "—",
                }),
              );
              keep.addEventListener("change", () => row.classList.toggle("excluded", !keep.checked));
              return row;
            }),
          ),
        )
      : null,
    h(
      "section",
      { class: "cost" },
      h("h2", { text: "Kaynak" }),
      h("p", { text: `${records.length} iş, toplam ${fmtTokens(totalTokens)} birim${d.profit ? ` · agent maliyeti $${d.profit.agentUsd.toFixed(2)}` : ""}` }),
    ),
    h("p", { class: "p-hint", text: "Metinlere tıklayıp düzeltebilirsiniz (kaydedilmez), sonra PDF olarak kaydedin." }),
  );
  translateDoc(sheet, docLang);
  showCost.addEventListener("change", () => sheet.classList.toggle("hide-cost", !showCost.checked));
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "row", style: "justify-content:space-between;align-items:center" },
      h("label", { class: "check", for: "wr-cost" }, showCost, " Kaynak kullanımını göster (sadece kendi kopyanız için)"),
      h("button", { class: "btn btn-primary", type: "button", onclick: () => printDoc(sheet, { title: `${slug} is raporu` }) }, "Yazdır / PDF"),
    ),
    sheet,
  );
}

/**
 * Monthly maintenance report for the client: the site is up (checked now), how fast it answered, what was done
 * this month, and the health of the last build. Printable; visitor numbers are not included (no analytics read).
 */
export async function monthlyReport(d, docLang = docLangOf(d)) {
  const dl = docLocale(docLang);
  const slug = d.status.slug;
  const now = new Date();
  const monthSel = h(
    "select",
    { id: "mr-month", "aria-label": "Ay" },
    ...[0, 1, 2].map((back) => {
      const m = new Date(now.getFullYear(), now.getMonth() - back, 1);
      return h(
        "option",
        { value: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}` },
        m.toLocaleDateString(locale(), { month: "long", year: "numeric" }),
      );
    }),
  );
  const holder = h("div", { class: "stack" });
  const health = await guarded(() => api("GET", `/api/clients/${slug}/health`));
  const draw = () => {
    const month = monthSel.value;
    const monthName = new Date(`${month}-15T12:00:00`).toLocaleDateString(dl, { month: "long", year: "numeric" });
    const done = reportable(d.history || []).filter((r) => r.endedAt.slice(0, 7) === month);
    const live = health?.live || [];
    const prod = live.find((l) => l.target === "production");
    const label = (r) => (r.kind.startsWith("edit-") ? "Düzenleme" : KIND_LABEL[r.kind] || r.title);
    const sheet = h(
      "article",
      { class: "proposal report monthly" },
      h(
        "header",
        { class: "p-head" },
        h(
          "div",
          {},
          h("span", { class: "p-kicker", text: "Aylık bakım raporu" }),
          h("h1", { text: d.business.name || slug }),
          h("p", {
            class: "p-meta",
            text: `${monthName} · hazırlanma ${now.toLocaleDateString(dl, { day: "numeric", month: "long", year: "numeric" })}`,
          }),
        ),
      ),
      h(
        "section",
        {},
        h("h2", { text: "Site durumu" }),
        live.length
          ? h(
              "table",
              { class: "p-kv" },
              ...live.map((l) =>
                h(
                  "tr",
                  {},
                  h("th", { text: l.target === "production" ? "Canlı site" : "Önizleme" }),
                  h(
                    "td",
                    {},
                    h("span", { class: `dot ${l.ok ? "ok" : "bad"}`, "aria-hidden": "true" }),
                    l.ok ? `Açık · ${l.ms} ms · HTTPS` : `Erişilemiyor${l.status ? ` (HTTP ${l.status})` : ""}${l.error ? ` · ${l.error}` : ""}`,
                    h("div", { class: "small muted", text: l.url }),
                  ),
                ),
              ),
            )
          : h("p", { text: "Site henüz yayında değil." }),
        prod && !prod.ok ? h("p", { class: "p-alert", text: "Canlı site şu an açılmıyor; kontrol ediliyor." }) : null,
      ),
      h(
        "section",
        {},
        h("h2", { text: "Bu ay yapılanlar" }),
        done.length
          ? h(
              "ul",
              {},
              ...done.map((r) =>
                h(
                  "li",
                  {},
                  h("strong", { text: `${new Date(r.endedAt).toLocaleDateString(dl, { day: "numeric", month: "short" })} · ${label(r)}: ` }),
                  h("span", { contenteditable: "true", "data-doc-data": "", text: clientText(r.summary || r.request || r.title || "", 260) }),
                ),
              ),
            )
          : h("p", { text: "Bu ay değişiklik yapılmadı; site olduğu gibi yayında." }),
      ),
      health
        ? h(
            "section",
            {},
            h("h2", { text: "Teknik kontrol" }),
            h(
              "table",
              { class: "p-kv" },
              h("tr", {}, h("th", { text: "Sayfalar" }), h("td", { text: `${health.pages} sayfa, toplam ${health.totalKb} KB` })),
              h(
                "tr",
                {},
                h("th", { text: "Görseller" }),
                h("td", { text: `${health.images} görsel${health.heaviestKb ? `, en büyüğü ${health.heaviestKb} KB` : ""}` }),
              ),
              h(
                "tr",
                {},
                h("th", { text: "Son kontrol" }),
                h("td", {
                  text: health.checks.at
                    ? `${new Date(health.checks.at).toLocaleDateString(dl)} · ${health.checks.pass} geçti, ${health.checks.warn} uyarı, ${health.checks.fail} hata`
                    : "Henüz kontrol yok",
                }),
              ),
            ),
            health.checks.warnings.length
              ? h(
                  "details",
                  { class: "p-hint-list" },
                  h("summary", { text: "Uyarılar (sizin için)" }),
                  h("ul", {}, ...health.checks.warnings.map((w) => h("li", { class: "small", text: w }))),
                )
              : null,
          )
        : null,
      h(
        "section",
        {},
        h("h2", { text: "Notlar" }),
        h("p", {
          contenteditable: "true",
          text: "Gelecek ay için önerilerimiz: güncel fotoğraflar, yeni bir blog yazısı ve Google İşletme Profili'nin güncellenmesi.",
        }),
      ),
      h("p", { class: "p-hint", text: "Ziyaretçi sayıları bu raporda yok (Cloudflare analitiği okunmuyor). Notlara tıklayıp düzeltebilirsiniz." }),
    );
    translateDoc(sheet, docLang);
    holder.replaceChildren(
      h(
        "div",
        { class: "row", style: "justify-content:space-between;align-items:center" },
        h("label", { for: "mr-month" }, "Ay ", monthSel),
        h("button", { class: "btn btn-primary", type: "button", onclick: () => printDoc(sheet, { title: `${slug} aylik rapor ${month}` }) }, "Yazdır / PDF"),
      ),
      sheet,
    );
  };
  monthSel.addEventListener("change", draw);
  draw();
  return holder;
}
