// Design plan: the agent describes how it will design the site before building anything; the operator approves it
// (then the site is built to it) or asks for a new idea with notes.
import { signatureFrame } from "./brand.js";
import { api, guarded, h, isBusy, toast } from "./core.js";
import { runAgent } from "./jobs.js";

const TRIGGERS = { load: "Sayfa açılışında", scroll: "Kaydırırken", hover: "Üzerine gelindiğinde", pointer: "İmleç hareketiyle", focus: "Odaklanınca" };
const WAITING = new Set(["awaiting", "changed"]);

export const planWaiting = (d) => WAITING.has(d.status.designPlan?.state);

/** Text the agent wrote: shown as written, never run through the panel's translator. */
const data = (tag, text, attrs = {}) => h(tag, { ...attrs, "data-no-i18n": "", text });
const field = (label, ...content) => h("div", { class: "plan-field" }, h("h4", { text: label }), ...content);

/** The signature's storyboard drawn on one time axis: each beat a bar from its start for its duration. */
function timeline(sig) {
  const total = Math.max(sig.totalMs, ...sig.beats.map((b) => b.atMs + b.durationMs));
  return h(
    "div",
    { class: "plan-timeline", role: "img", "aria-label": `Zaman çizelgesi, toplam ${(total / 1000).toFixed(1)} sn` },
    ...sig.beats.map((b, i) =>
      h(
        "div",
        { class: "plan-beat" },
        h("span", { class: "plan-beat-no", text: String(i + 1) }),
        h(
          "div",
          { class: "plan-beat-track" },
          h("span", { class: "plan-beat-bar", style: `left:${(b.atMs / total) * 100}%;width:${Math.max(2, (b.durationMs / total) * 100)}%` }),
        ),
      ),
    ),
  );
}

function beatsTable(sig) {
  return h(
    "table",
    { class: "plan-beats" },
    h("thead", {}, h("tr", {}, ...["", "Başlangıç", "Süre", "Hareket", "Eğri"].map((t) => h("th", { scope: "col", text: t })))),
    h(
      "tbody",
      {},
      ...sig.beats.map((b, i) =>
        h(
          "tr",
          {},
          h("td", { text: String(i + 1) }),
          h("td", { class: "num", text: `${b.atMs} ms` }),
          h("td", { class: "num", text: `${b.durationMs} ms` }),
          data("td", b.what),
          data("td", b.easing),
        ),
      ),
    ),
  );
}

function planBody(plan, signatureHtml) {
  const sig = plan.signature;
  return h(
    "div",
    { class: "plan-body" },
    plan.differs && field("Önceki plandan farkı", data("p", plan.differs)),
    field("Konsept", data("p", plan.concept), h("p", { class: "muted small" }, "Kaynak: ", data("span", plan.source))),
    field("Ton", h("div", { class: "plan-chips" }, ...plan.tone.map((t) => data("span", t, { class: "chip" })))),
    field(
      "Renk paleti",
      h(
        "ul",
        { class: "plan-palette" },
        ...plan.palette.map((c) =>
          h(
            "li",
            {},
            h("span", { class: "plan-swatch", style: `background:${c.hex}`, "aria-hidden": "true" }),
            data("strong", c.name),
            h("code", { text: c.hex }),
            data("span", c.role, { class: "muted small" }),
          ),
        ),
      ),
    ),
    field(
      "Yazı tipleri",
      h(
        "p",
        {},
        "Başlık: ",
        data("strong", plan.fonts.heading),
        " · Metin: ",
        data("strong", plan.fonts.body),
        ...(plan.fonts.mono ? [" · Rakamlar: ", data("strong", plan.fonts.mono)] : []),
      ),
    ),
    field("Giriş alanı", data("p", plan.hero)),
    field(
      "Sayfalar ve bölümler",
      h(
        "ol",
        { class: "plan-pages" },
        ...plan.pages.map((p) =>
          h(
            "li",
            {},
            data("strong", p.name),
            h("ul", {}, ...p.sections.map((x) => h("li", {}, data("span", x.name), " · ", data("span", x.purpose, { class: "muted" })))),
          ),
        ),
      ),
    ),
    field(
      "İmza hareketi",
      data("p", sig.name, { class: "plan-sig-name" }),
      data("p", sig.idea),
      h(
        "p",
        { class: "muted small" },
        `${TRIGGERS[sig.trigger] || sig.trigger} · ${(sig.totalMs / 1000).toFixed(1)} sn · Hareket azaltma: `,
        data("span", sig.reducedMotion),
      ),
      timeline(sig),
      beatsTable(sig),
      signatureHtml
        ? signatureFrame(signatureHtml, "İmza hareketi önizlemesi")
        : h("p", { class: "muted small", text: "Canlı önizleme yazılmadı; hareket yukarıdaki plana göre kurulur." }),
    ),
    plan.animations?.length
      ? field(
          "Destek animasyonları",
          h(
            "ul",
            {},
            ...plan.animations.map((a) =>
              h("li", {}, data("strong", a.name), ` · ${TRIGGERS[a.trigger] || a.trigger}: `, data("span", a.what, { class: "muted" })),
            ),
          ),
        )
      : null,
  );
}

/** The plan card on the Düzenleme tab while a plan waits for the operator. */
export function planCard(d) {
  const slug = d.status.slug;
  const card = h(
    "section",
    { class: "card plan-card", id: "design-plan", "aria-labelledby": "plan-title" },
    h("p", { class: "muted", text: "Tasarım planı yükleniyor…" }),
  );
  guarded(() => api("GET", `/api/clients/${slug}/design-plan`)).then((r) => {
    if (!r?.plan) {
      card.replaceChildren(h("p", { class: "muted", text: "Tasarım planı okunamadı." }));
      return;
    }
    const notes = h("textarea", {
      id: "plan-notes",
      class: "field",
      rows: 3,
      maxlength: 2000,
      placeholder: "Neyin değişmesini istiyorsunuz? (isteğe bağlı) Örn. daha sade bir giriş alanı, farklı bir imza hareketi",
    });
    const newIdea = h(
      "div",
      { class: "plan-new", hidden: true },
      h("label", { for: "plan-notes", text: "Yeni fikir için notlarınız" }),
      notes,
      h(
        "div",
        { class: "row" },
        h(
          "button",
          { type: "button", class: "btn btn-primary", disabled: isBusy(), onclick: () => runAgent(slug, "new-plan", { notes: notes.value.trim() }) },
          "Yeni Plan Hazırlat",
        ),
      ),
    );
    const approve = async () => {
      const ok = await guarded(() => api("POST", `/api/clients/${slug}/design-plan/approve`, {}));
      if (!ok) return;
      toast("Tasarım planı onaylandı; site bu plana göre kuruluyor.");
      await runAgent(slug, "create-site", {});
    };
    card.replaceChildren(
      h(
        "div",
        { class: "card-head" },
        h("h3", { id: "plan-title", text: "Tasarım Planı" }),
        h("span", { class: "muted small", text: r.earlier ? `${r.earlier + 1}. plan` : "İlk plan" }),
      ),
      r.state === "changed"
        ? h("p", { class: "plan-warn", text: "Plan onaydan sonra değişti. İnceleyip yeniden onaylayınız." })
        : h("p", {
            class: "muted",
            text: "Site henüz kurulmadı. Plan onaylanınca agent siteyi bu plana göre kurar; onaylamazsanız yeni bir fikir hazırlatabilirsiniz.",
          }),
      planBody(r.plan, r.signatureHtml),
      h(
        "div",
        { class: "row plan-actions" },
        h("button", { type: "button", class: "btn btn-primary", id: "plan-approve", disabled: isBusy(), onclick: approve }, "Planı Onayla ve Siteyi Kur"),
        h(
          "button",
          {
            type: "button",
            class: "btn",
            id: "plan-new",
            disabled: isBusy(),
            onclick: () => {
              newIdea.hidden = false;
              notes.focus();
            },
          },
          "Yeni Fikir İste",
        ),
      ),
      newIdea,
    );
  });
  return card;
}
