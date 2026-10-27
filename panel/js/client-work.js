// Client page, Düzenleme tab: preparing the site, requests, and the banners above them.
import { locale } from "./i18n.js";
import { planCard, planWaiting } from "./design-plan.js";
import { $, api, guarded, h, ICON, ignoreOptional, isBusy, state, svg } from "./core.js";
import { quickEditCard } from "./edit.js";
import { drawFeed } from "./feed.js";
import { runAgent } from "./jobs.js";
import { rankedDesigns } from "./library.js";
import { infoGuide } from "./new-client.js";

/** Düzenleme: the information box until the site exists, quick forms, then free requests (Özel Talep). */
export async function tabWork(body, d) {
  const slug = d.status.slug;
  const PREPARE = ["collecting-answers", "design", "content", "build"];
  const approvedSite = ["content", "visual"].every((k) => d.approvals.find((x) => x.kind === k)?.valid);
  // While a plan waits, its card is the only next step (the information form would start the design again).
  if (planWaiting(d)) body.append(planCard(d));
  else if (!d.distReady || (PREPARE.includes(d.status.stage) && !approvedSite && !d.distReady)) body.append(prepareCard(d));
  if (d.distReady) {
    // The open editor is kept per client, so a redraw (a job finishing, a tab switch) opens it again.
    const setOpen = async (id) => {
      state.editForm = { ...(state.editForm || {}), [slug]: id };
      const next = h("div", { class: "tab-body" });
      await tabWork(next, d);
      body.replaceWith(next);
      const target = next.querySelector(id ? ".qe-head h3" : `.qe-row[data-edit="${body.dataset.lastEdit || ""}"]`);
      target?.focus({ preventScroll: true });
      next.querySelector(".qe")?.scrollIntoView({ block: "nearest" });
    };
    body.dataset.lastEdit = state.editForm?.[slug] || "";
    body.append(await quickEditCard(d, state.editForm?.[slug] || null, setOpen));
  }
  body.append(requestCard(d));
}

/** Free requests to the assistant and the record of past work (the former chat), kept below the forms. */
export function requestCard(d) {
  const slug = d.status.slug;
  const feed = h("div", { class: "feed", id: "feed" });
  drawFeed(feed, d);
  const busy = isBusy();
  const composer = h("textarea", { id: "composer", rows: 2, placeholder: "Talebinizi yazınız (ör. menüye mantı ekleyiniz, başlığı kısaltınız)." });
  const hadFocus = document.activeElement?.id === "composer";
  composer.value = state.composer[slug] || "";
  composer.addEventListener("input", () => {
    state.composer[slug] = composer.value;
    composer.style.height = "auto";
    composer.style.height = `${composer.scrollHeight}px`;
  });
  if (hadFocus) queueMicrotask(() => composer.focus());
  const send = async () => {
    const text = composer.value.trim();
    if (!text) {
      composer.focus();
      return;
    }
    // Cleared before the job starts: starting it redraws the page, and the new box is filled from state.
    // If the job does not start, the text comes back so nothing typed is lost.
    state.composer[slug] = "";
    composer.value = "";
    if (!(await runAgent(slug, "revise", { request: text }))) {
      state.composer[slug] = text;
      const box = $("#composer");
      if (box) box.value = text;
    }
  };
  composer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  });
  return h(
    "section",
    { class: "card request" },
    h("div", { class: "card-head" }, h("h3", { text: "Özel Talep" }), h("span", { class: "muted small", text: "Formlarda bulunmayan değişiklikler için" })),
    h("div", { class: "feed-wrap" }, feed),
    h(
      "form",
      {
        class: "composer",
        onsubmit: (e) => {
          e.preventDefault();
          send();
        },
      },
      h("label", { for: "composer", class: "sr-only" }, "Talep"),
      h(
        "div",
        { class: "box" },
        composer,
        h("button", { class: "send", type: "submit", "aria-label": "Gönder (Ctrl+Enter)", disabled: busy }, svg(ICON.send, 18, 2.4)),
      ),
    ),
  );
}

/** Older sites can move to the newest template (animated, sector motif). Shown only when they are behind. */
export function upgradeBanner(d) {
  if (!d.template || !d.latestTemplate || d.template === d.latestTemplate) return null;
  const slug = d.status.slug;
  return h(
    "section",
    { class: "upgrade-banner", "aria-label": "Yeni şablon" },
    h(
      "p",
      {},
      h("strong", { text: "Serbest tasarım hazır. " }),
      h("span", {
        text: `Bu site hazır şablonla yapılmış (${d.template}). Serbest tasarımda agent markaya özel kimlik, logo ve animasyonlarla siteyi baştan yazar; bilgiler aynı kalır, onaylar sıfırlanır.`,
      }),
    ),
    h("button", { class: "btn", type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "upgrade-template", {}) }, "Serbest tasarıma geç"),
  );
}

/** Paste what you know, press one button; the agent does answers, design, text and build. */
export function prepareCard(d) {
  const slug = d.status.slug;
  const busy = isBusy();
  const working = busy && state.running.slug === slug;
  const draft = (state.drafts[slug] ||= { answers: {}, extras: {}, later: new Set(), freeText: "" });
  const ranBefore = d.history.some((j) => j.kind === "create-site");
  const box = h("textarea", {
    id: "prep-text",
    class: "field big-paste",
    rows: 8,
    maxlength: 20000,
    disabled: working,
    placeholder: ranBefore
      ? 'Sorulan eksik bilgileri ya da yeni bilgileri yazınız, ardından "Siteyi Oluştur"a tekrar basınız.'
      : "Müşteriye ait bilgileri yapıştırınız: faaliyet alanı, hizmetler, fiyatlar, iletişim, renk tercihleri… Sıra ve biçim önemli değildir.",
  });
  box.value = draft.freeText || "";
  box.addEventListener("input", () => (draft.freeText = box.value));

  const fileCount = h("span", { class: "small muted", text: d.inbox.length ? `${d.inbox.length} dosya eklendi` : "" });
  const fileInput = h("input", {
    type: "file",
    multiple: true,
    accept: "image/png,image/jpeg,image/webp,image/avif,image/svg+xml",
    id: "prep-files",
    class: "sr-only",
  });
  fileInput.addEventListener("change", async () => {
    let total = d.inbox.length;
    for (const file of fileInput.files) {
      const res = await guarded(() => api("PUT", `/api/clients/${slug}/inbox/${encodeURIComponent(file.name)}`, file, true));
      if (res) total = res.inbox.length;
    }
    fileCount.textContent = `${total} dosya eklendi`;
  });

  // The operator's rule: research and questions before design. Unticked = the agent decides open design choices itself.
  const askFirst = h("input", {
    type: "checkbox",
    id: "prep-ask",
    checked: draft.askFirst !== false,
    disabled: working,
    onchange: (e) => (draft.askFirst = e.target.checked),
  });
  // "Research first" only reaches the web when web research is on in Settings; say so instead of failing silently.
  const researchOff = h("p", { class: "small warn-text", hidden: true });
  if (!working)
    api("GET", "/api/settings")
      .then((st) => {
        if (st.webResearch) return;
        researchOff.replaceChildren(
          "İnternet araştırması Ayarlar'da kapalı: agent internette arama yapmaz, yalnızca verdiğiniz bilgilerle çalışır ve eksikleri sorar. ",
          h("a", { href: "#/ayarlar" }, "Ayarlar'da aç"),
        );
        researchOff.hidden = false;
      })
      .catch(ignoreOptional);
  // Optional starting point from the design library (custom sites); used once, on this run.
  const startFrom = h("select", { id: "prep-lib", disabled: working }, h("option", { value: "" }, "Başlangıç tasarımı: yeni tasarım"));
  if (d.template === "custom")
    api("GET", "/api/library")
      .then(({ designs }) => {
        for (const x of rankedDesigns(designs, slug, d.business.industry))
          startFrom.append(h("option", { value: x.id }, `${x.score > 0 ? "★ Önerilen: " : "Kütüphaneden: "}${x.name}${x.sector ? ` · ${x.sector}` : ""}`));
        if (d.startDesign) startFrom.value = d.startDesign;
      })
      .catch(ignoreOptional);
  const go = async () => {
    const ok = await runAgent(slug, "create-site", {
      freeText: draft.freeText || "",
      askFirst: askFirst.checked,
      ...(startFrom.value ? { libraryId: startFrom.value } : {}),
    });
    if (ok) draft.freeText = "";
  };
  return h(
    "section",
    { class: "card prep", "aria-label": "Siteyi oluştur" },
    h(
      "div",
      { class: "card-head" },
      h("h3", { text: working ? "Site oluşturuluyor" : ranBefore ? "Bilgileri Tamamla" : "Müşteri Bilgileri ve Site Oluşturma" }),
    ),
    h("p", {
      class: "muted small",
      text: working
        ? "Bilgiler kaydediliyor, tasarım hazırlanıyor ve sayfalar oluşturuluyor. İşlem birkaç dakika sürer; ilerlemeyi aşağıdan takip edebilirsiniz."
        : "Bilgileri yapıştırınız, varsa logo ve görselleri ekleyiniz. Eksik bilgi olursa size sorulur.",
    }),
    // While the job runs, the card only says what is happening: no box to type into, no buttons.
    working ? null : h("label", { for: "prep-text", class: "sr-only" }, "Müşteri bilgileri"),
    working ? null : box,
    working ? null : infoGuide(box, (v) => (draft.freeText = v)),
    working || d.template !== "custom" ? null : h("label", { for: "prep-lib", class: "small row nowrap" }, startFrom),
    working
      ? null
      : h(
          "label",
          { for: "prep-ask", class: "check small" },
          askFirst,
          " Önce araştırma yapılsın ve sorular bana iletilsin (önerilir). Kapalıysa açık tasarım kararları otomatik verilir; bilgi yine uydurulmaz.",
        ),
    working ? null : researchOff,
    working
      ? null
      : h(
          "div",
          { class: "row" },
          h("button", { class: "btn btn-primary", type: "button", disabled: busy, onclick: go }, ranBefore ? "Devam Et" : "Siteyi Oluştur"),
          h("label", { for: "prep-files", class: "btn", style: working ? "pointer-events:none;opacity:.5" : "" }, "Logo ve Görsel Ekle"),
          fileInput,
          fileCount,
          h("a", { href: `#/musteri/${slug}/bilgiler`, class: "small", style: "margin-inline-start:auto" }, "Müşteriye soru formu gönder"),
        ),
  );
}

/** The logo changed after the brand was made, or it is another client's logo: say so before any design job. */
export function logoBanner(d) {
  const slug = d.status.slug;
  if (d.sharedLogo) {
    return h(
      "div",
      { class: "notice-bar bad", role: "alert" },
      h(
        "p",
        {},
        h("strong", { text: "Logo başka bir müşteriye ait. " }),
        h("span", { text: `Bu müşterinin logosu "${d.sharedLogo.name}" müşterisinin logosuyla aynı dosya. Tasarım işleri bu yüzden durdurulur.` }),
      ),
      h("a", { class: "btn btn-sm", href: `#/musteri/${slug}/bilgiler` }, "Logoyu değiştir"),
    );
  }
  if (d.brandStale && d.template === "custom") {
    return h(
      "div",
      { class: "notice-bar warn" },
      h(
        "p",
        {},
        h("strong", { text: "Logo değişti, marka eski logoya göre. " }),
        h("span", { text: "Renkler, slogan ve imza hareketi önceki logodan geliyor. Yeni logoya göre yenileyiniz; bilgiler ve fiyatlar aynı kalır." }),
      ),
      h(
        "button",
        { class: "btn btn-sm btn-primary", type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "redesign", {}) },
        "Markayı yeni logoya göre yenile",
      ),
    );
  }
  return null;
}

/** Payment day passed and not paid: shown on the client page, with the unpublish action at hand. */
export function paymentBanner(d) {
  const b = d.businessTracking;
  const today = new Date().toISOString().slice(0, 10);
  if (!b?.paymentDue || b.paymentDue >= today || b.payment === "paid") return null;
  return h(
    "div",
    { class: "notice-bar bad" },
    h(
      "p",
      {},
      h("strong", { text: "Ödeme gecikti. " }),
      h("span", {
        text: `Ödeme günü ${new Date(`${b.paymentDue}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "long" })} idi; durum: ödenmedi.`,
      }),
    ),
    h("a", { class: "btn btn-sm", href: `#/musteri/${d.status.slug}/bilgiler` }, "İş Takibi ve Yayın"),
  );
}
