// Design concepts: three brand proposals from the agent as cards; choosing one builds the site with it.
import { api, ask, h, isBusy } from "./core.js";
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
