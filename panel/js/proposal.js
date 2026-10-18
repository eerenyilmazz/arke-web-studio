// Documents for the client: design concepts, the proposal, the work report and the monthly report.
import { CURRENCY_SIGNS } from "./business.js";
import { api, ask, fmtTokens, guarded, h, isBusy, LANG_NAMES, printDoc, state } from "./core.js";
import { PAGE_TR } from "./edit.js";
import { runAgent } from "./jobs.js";

/** Three brand proposals from the agent, shown as cards; choosing one builds the site with it. */
export function conceptsCard(d) {
  const slug = d.status.slug;
  const busy = isBusy();
  const body = h("div", { class: "concepts" }, h("p", { class: "muted small", text: "Yükleniyor…" }));
  const card = h(
    "section",
    { class: "card stack" },
    h(
      "div",
      { class: "row", style: "justify-content:space-between" },
      h("h2", { text: "Tasarım önerileri" }),
      h("button", { class: "btn btn-sm", type: "button", disabled: busy, onclick: () => runAgent(slug, "concepts", {}) }, "3 yeni öneri hazırlat"),
    ),
    h("p", {
      class: "muted small",
      text: "Agent bu müşteri için üç farklı marka yönü çizer (logo, renkler, yazı tipleri, animasyon fikirleri). Müşteriye ekran görüntüsüyle gösterip seçtir; seçince site o tasarımla kurulur.",
    }),
    body,
  );
  api("GET", `/api/clients/${slug}/concepts`)
    .then(({ options }) => {
      if (!options.length) {
        body.replaceChildren(h("p", { class: "muted small", text: "Henüz öneri yok." }));
        return;
      }
      body.replaceChildren(
        ...options.map((o) => {
          const b = o.brand || {};
          const colours = Object.entries(b.palette || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v)));
          // The logo is shown as an image (data URI): nothing in it can run in the panel.
          const logo = o.logoSvg
            ? h("img", {
                class: "concept-logo",
                alt: `Öneri ${o.id.toUpperCase()} logosu`,
                src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(o.logoSvg)}`,
              })
            : null;
          return h(
            "article",
            { class: "concept" },
            h(
              "div",
              { class: "concept-head" },
              h("span", { class: "letter", text: o.id.toUpperCase() }),
              h("strong", { text: b.name || `Öneri ${o.id.toUpperCase()}` }),
            ),
            logo,
            h("div", { class: "swatches" }, ...colours.map(([n, v]) => h("span", { title: `${n} ${v}`, style: `background:${v}` }))),
            b.fonts && h("p", { class: "small", text: `${b.fonts.heading || ""} / ${b.fonts.body || ""}` }),
            b.concept && h("p", { class: "small", text: b.concept }),
            Array.isArray(b.animations) && h("ul", { class: "small anims" }, ...b.animations.map((a) => h("li", { text: a.idea || a.id }))),
            o.problems.length ? h("p", { class: "err small", text: `Eksik: ${o.problems.join("; ")}` }) : null,
            h(
              "button",
              {
                class: "btn btn-primary",
                type: "button",
                disabled: busy || o.problems.length > 0,
                onclick: async () => {
                  if (
                    await ask({
                      title: `Öneri ${o.id.toUpperCase()} ile siteyi kur`,
                      body: "Mevcut sayfalar bu öneriye göre yeniden yazılır. Önceki hâl Sürümler'de kalır.",
                      confirm: "Siteyi kur",
                    })
                  )
                    runAgent(slug, "choose-concept", { option: o.id });
                },
              },
              "Bunu seç ve siteyi kur",
            ),
          );
        }),
      );
    })
    .catch(() => body.replaceChildren(h("p", { class: "err", text: "Öneriler okunamadı." })));
  return card;
}

// ---------------------------------------------------------------- Teklif (proposal), printable

export const FEATURE_TR = [
  "Markaya özel tasarım: logo kullanımı ya da yeni logo, renkler, yazı tipleri ve imza hareketi",
  "Telefon, tablet ve bilgisayarda düzgün görünüm; açık ve koyu tema",
  "Hızlı açılan, güvenli, reklam ve takip kodu içermeyen site",
  "Arama motorları için temel ayarlar (başlıklar, açıklamalar, harita kaydı bilgisi, site haritası)",
  "WhatsApp ve telefonla tek dokunuşla iletişim",
  "Yayına alma ve SSL (https)",
];

/** Teklif tab: the proposal, or the work report ("ne istendi, ne yapıldı"), both printable. */
export async function tabProposal(body, d) {
  const which = state.docView?.[d.status.slug] || "teklif";
  const switcher = h(
    "div",
    { class: "seg doc-switch", role: "group", "aria-label": "Belge" },
    ...[
      ["teklif", "Teklif"],
      ["rapor", "İş Raporu"],
      ["aylik", "Aylık Rapor"],
    ].map(([k, l]) =>
      h(
        "button",
        {
          type: "button",
          "aria-pressed": String(which === k),
          onclick: () => {
            state.docView = { ...(state.docView || {}), [d.status.slug]: k };
            tabProposal(body, d);
          },
        },
        l,
      ),
    ),
  );
  if (which === "rapor") {
    body.replaceChildren(h("div", { class: "stack" }, switcher, workReport(d)));
    return;
  }
  if (which === "aylik") {
    body.replaceChildren(h("div", { class: "stack" }, switcher, await monthlyReport(d)));
    return;
  }
  await proposalSheet(body, d, switcher);
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
  "quick-edit": "İletişim bilgileri",
};

/**
 * What the client asked for and what was done, from the job history: date, request, result, and for Eren the
 * resources used. Editable before printing; "Kaynak" columns can be hidden for the client's copy.
 */
export function workReport(d) {
  const slug = d.status.slug;
  const records = [...(d.history || [])].filter((r) => r.status === "succeeded" && r.kind !== "build").sort((a, b) => a.startedAt.localeCompare(b.startedAt));
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
            ? `${new Date(records[0].startedAt).toLocaleDateString("tr-TR")} – ${new Date(records[records.length - 1].endedAt).toLocaleDateString("tr-TR")} · ${records.length} iş`
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
            h("tr", {}, h("th", { text: "Tarih" }), h("th", { text: "İstenen" }), h("th", { text: "Yapılan" }), h("th", { class: "cost", text: "Kaynak" })),
          ),
          h(
            "tbody",
            {},
            ...records.map((r) =>
              h(
                "tr",
                {},
                h("td", { text: new Date(r.endedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) }),
                h(
                  "td",
                  {},
                  h("strong", { text: label(r) }),
                  r.request
                    ? h("div", { class: "small", contenteditable: "true", text: r.request.length > 240 ? `${r.request.slice(0, 240)}…` : r.request })
                    : null,
                ),
                h("td", { contenteditable: "true", text: (r.summary || r.title || "").slice(0, 600) }),
                h("td", {
                  class: "cost small",
                  text: r.tokens ? `${fmtTokens(r.tokens)}${r.provider === "codex" ? " · Codex" : ""}${r.model ? ` · ${r.model}` : ""}` : "—",
                }),
              ),
            ),
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
async function monthlyReport(d) {
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
        m.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
      );
    }),
  );
  const holder = h("div", { class: "stack" });
  const health = await guarded(() => api("GET", `/api/clients/${slug}/health`));
  const draw = () => {
    const month = monthSel.value;
    const monthName = monthSel.selectedOptions[0].textContent;
    const done = (d.history || []).filter((r) => r.status === "succeeded" && r.kind !== "build" && r.endedAt.slice(0, 7) === month);
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
          h("p", { class: "p-meta", text: `${monthName} · hazırlanma ${now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}` }),
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
                  h("strong", { text: `${new Date(r.endedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} · ${label(r)}: ` }),
                  (r.summary || r.request || r.title || "").slice(0, 260),
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
                    ? `${new Date(health.checks.at).toLocaleDateString("tr-TR")} · ${health.checks.pass} geçti, ${health.checks.warn} uyarı, ${health.checks.fail} hata`
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

async function proposalSheet(body, d, switcher) {
  const slug = d.status.slug;
  const [settings, brand] = await Promise.all([
    api("GET", "/api/settings").catch(() => ({ sender: {} })),
    api("GET", `/api/clients/${slug}/brand`).catch(() => null),
  ]);
  const s = settings.sender || {};
  const b = d.businessTracking || {};
  const today = new Date();
  const no = `T-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}-${slug.slice(0, 6).toUpperCase()}`;
  const price = b.price != null ? `${CURRENCY_SIGNS[b.currency] || ""}${Number(b.price).toLocaleString("tr-TR")}` : "Belirtilecek";
  const palette = Object.entries(brand?.brand?.palette || d.design?.palette || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v)));
  const logo = brand?.clientLogo || (brand?.logoSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brand.logoSvg)}` : null);
  // Editable on screen before printing (not saved): Eren adjusts wording per client.
  const editable = (tag, text, cls = "") => h(tag, { class: cls, contenteditable: "true", spellcheck: "true", text });
  const sheet = h(
    "article",
    { class: "proposal" },
    h(
      "header",
      { class: "p-head" },
      h(
        "div",
        {},
        h("span", { class: "p-kicker", text: "Web sitesi teklifi" }),
        h("h1", { text: d.business.name || slug }),
        h("p", { class: "p-meta", text: `${no} · ${today.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}` }),
      ),
      logo && h("img", { class: "p-logo", src: logo, alt: "" }),
    ),
    h(
      "section",
      {},
      h("h2", { text: "Kapsam" }),
      h("p", { text: `Sayfalar: ${(d.pages || []).map((p) => PAGE_TR[p] || p).join(", ") || "—"}` }),
      h("p", { text: `Diller: ${d.locales.map((l) => LANG_NAMES[l] || l).join(", ")}` }),
      h("ul", {}, ...FEATURE_TR.map((f) => editable("li", f))),
      d.domain ? h("p", { text: `Alan adı: ${d.domain}` }) : null,
    ),
    palette.length
      ? h(
          "section",
          {},
          h("h2", { text: "Marka" }),
          brand?.brand?.tagline ? h("p", { class: "p-tag", text: `“${brand.brand.tagline}”` }) : null,
          h(
            "div",
            { class: "p-swatches" },
            ...palette.slice(0, 6).map(([n, v]) => h("span", {}, h("i", { style: `background:${v}` }), `${n} ${v.toUpperCase()}`)),
          ),
        )
      : null,
    h(
      "section",
      { class: "p-price" },
      h("h2", { text: "Ücret ve teslim" }),
      h(
        "table",
        {},
        h("tr", {}, h("th", { text: "Toplam" }), h("td", { class: "p-big", text: price })),
        h(
          "tr",
          {},
          h("th", { text: "Teslim" }),
          h("td", {
            text: b.deadline
              ? new Date(`${b.deadline}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
              : "Onaydan sonra belirlenir",
          }),
        ),
        h("tr", {}, h("th", { text: "Ödeme" }), editable("td", "%50 başlangıçta, %50 yayına alırken.")),
        h(
          "tr",
          {},
          h("th", { text: "Barındırma" }),
          editable("td", d.hosting === "client" ? "Sizin hesabınızda (Cloudflare)." : "Bizim tarafımızdan; yıllık bakım ayrıca konuşulur."),
        ),
      ),
    ),
    h(
      "section",
      {},
      h("h2", { text: "Notlar" }),
      editable(
        "p",
        "Bu teklif 15 gün geçerlidir. Sitede yer alacak bilgiler ve fotoğraflar işletme tarafından sağlanır; uydurma bilgi ya da yorum kullanılmaz.",
      ),
    ),
    [s.name, s.email, s.phone, s.web].some(Boolean)
      ? h("footer", { class: "p-foot" }, [s.name, s.email, s.phone, s.web].filter(Boolean).join(" · "))
      : h("p", { class: "p-hint", text: "Gönderen bilgilerini Ayarlar → Teklif bölümünden ekleyiniz; PDF'in altında görünür." }),
  );
  body.replaceChildren(
    h(
      "div",
      { class: "stack" },
      switcher,
      h(
        "div",
        { class: "row", style: "justify-content:space-between;align-items:center" },
        h("p", {
          class: "muted small",
          text: "Fiyat ve teslim tarihi Bilgiler sekmesindeki iş bilgilerinden gelir. Metinlere tıklayıp düzeltebilirsin (kaydedilmez), sonra PDF olarak kaydet.",
        }),
        h("button", { class: "btn btn-primary", type: "button", onclick: () => printDoc(sheet, { title: `${slug} teklif` }) }, "Yazdır / PDF"),
      ),
      sheet,
    ),
  );
}
