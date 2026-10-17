// Client page: header, status strip, preview, Düzenleme tab and approval dialog.
import { tabBrand } from "./brand.js";
import { $, api, avatar, copyButton, fmtTokens, guarded, h, ICON, ignoreOptional, isBusy, LANG_NAMES, OLD_TABS, PACKAGE_TR, state, stepIndex, STEPS, svg, TABS, time, toast } from "./core.js";
import { editForm } from "./edit.js";
import { drawFeed, } from "./feed.js";
import { infoGuide, renderHome } from "./home.js";
import { qualityTable, tabInfo, tabProposal, versionsCard } from "./info.js";
import { rankedDesigns } from "./library.js";
import { archiveClient, deployProduction, openPreview, render, runAgent, runTask, setStatus, startPolling } from "./shell.js";

// ---------------------------------------------------------------- client page

export async function renderClient(view, slug, tab) {
  const d = await guarded(() => api("GET", `/api/clients/${slug}`));
  if (!d) { view.replaceChildren(renderHome()); return; }
  state.detail = d;
  if (d.running) { state.running = d.running; setStatus(d.running); }
  const stage = d.status.stage;
  const name = d.business.name || slug;
  tab = OLD_TABS[tab] || tab;
  if (!TABS.some(([id]) => id === tab)) tab = "duzenle";

  const menu = h("details", { class: "menu" },
    h("summary", { class: "icon-btn", "aria-label": "Diğer işlemler" }, svg(ICON.more, 20, 3)),
    h("div", { class: "menu-items" },
      h("button", { type: "button", disabled: isBusy(), onclick: () => runTask(slug, "build", {}) }, "Siteyi yeniden oluştur"),
      h("button", { type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "fix-build", {}) }, "Hataları otomatik düzelt"),
      d.template === "custom" ? h("button", { type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "concepts", {}) }, "3 tasarım önerisi hazırla") : null,
      d.template === "custom" && d.locales.length > 1 ? h("button", { type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "translate", {}) }, "Diğer dilleri güncelle") : null,
      h("button", { type: "button", class: "danger", onclick: () => archiveClient(slug, stage) }, "Müşteriyi arşivle"),
    ),
  );
  const usage = d.budget ? `${PACKAGE_TR[d.budget.mode] || ""} paket${d.budget.usage.tokens ? ` · kaynak kullanımı ${fmtTokens(d.budget.usage.tokens)}` : ""}` : "";

  const body = h("div", { class: "tab-body" });
  view.replaceChildren(
    h("div", { class: "client-head", "data-enter": "0" },
      h("div", { class: "client-id" },
        avatar(slug, name, true),
        h("div", {},
          h("h1", { text: name }),
          h("div", { class: "facts" },
            h("span", { text: d.business.industry || "" }),
            h("span", { text: d.locales.map((l) => LANG_NAMES[l] || l).join(", ") }),
            h("span", { text: d.hosting === "client" ? "Müşteri hesabı" : "Ajans hesabı" }),
            d.domain && h("span", { text: d.domain }),
            usage && h("span", { text: usage }),
          ),
        ),
      ),
      h("div", { class: "row" },
        // Windows "Animation effects" off = reduced motion: the sites calm their animations, which looks like a bug.
        matchMedia("(prefers-reduced-motion: reduce)").matches ? h("span", { class: "badge warn", title: "Windows Ayarlar → Erişilebilirlik → Görsel efektler → Animasyon efektleri: Açık", text: "Bu bilgisayarda animasyonlar kapalı" }) : null,
        menu,
      ),
    ),
    statusStrip(d),
    logoBanner(d) || "",
    paymentBanner(d) || "",
    upgradeBanner(d) || "",
    h("div", { class: tab === "marka" || tab === "teklif" ? "work wide" : "work" },
      tab === "marka" || tab === "teklif" ? null : previewPane(d),
      h("section", { class: "work-panel", "data-enter": "2" },
        h("nav", { class: "seg-tabs", "aria-label": "Bölümler" }, ...TABS.map(([id, label]) => h("a", { href: `#/c/${slug}/${id}`, "aria-current": id === tab ? "page" : null, text: label }))),
        body,
      ),
    ),
  );

  if (tab === "marka") await tabBrand(body, d);
  else if (tab === "teklif") await tabProposal(body, d);
  else if (tab === "bilgiler") await tabInfo(body, d);
  else await tabWork(body, d);

  if (isBusy() && state.running.slug === slug) startPolling();
}

/**
 * One line under the client's name: where the site is (four steps) and the one thing to do now. Replaces the
 * large cards; the long forms (pasting information) live in the Düzenleme tab.
 */
export function statusStrip(d) {
  const slug = d.status.slug;
  const step = stepIndex(d.status.stage);
  const a = nextAction(d);
  return h("section", { class: "strip", "aria-label": "Durum", "data-enter": "1" },
    h("ol", { class: "strip-steps", "aria-label": `Adım ${step + 1} / ${STEPS.length}: ${STEPS[step].label}` },
      ...STEPS.map((s, i) => h("li", { class: i < step ? "done" : i === step ? "now" : "", "aria-current": i === step ? "step" : null },
        h("span", { class: "dot", text: i < step ? "✓" : String(i + 1) }), h("span", { class: "label", text: s.label })))),
    h("div", { class: "strip-next" }, h("p", { text: a.text }), ...a.actions.filter(Boolean)),
  );
  void slug;
}

/** The next step in one sentence, with at most three buttons. */
export function nextAction(d) {
  const slug = d.status.slug;
  const stage = d.status.stage;
  const busy = isBusy();
  const working = busy && state.running.slug === slug;
  const btn = (label, onclick, cls = "btn", disabled = false) => h("button", { class: cls, type: "button", disabled, onclick }, label);
  const revise = () => { location.hash = `#/c/${slug}/duzenle`; setTimeout(() => $("#composer")?.focus(), 120); };
  if (working) return { text: "İşlem sürüyor. Tamamlandığında bildirim alacaksınız.", actions: [] };
  const PREPARE = ["collecting-answers", "design", "content", "awaiting-content-approval", "build", "awaiting-visual-approval"];
  if (PREPARE.includes(stage)) {
    const approved = (k) => d.approvals.find((x) => x.kind === k)?.valid;
    if (d.distReady && !(approved("content") && approved("visual"))) {
      return { text: "Siteyi inceleyip onaylayınız.", actions: [btn("Onayla", () => approveDialog(d, "site"), "btn btn-ok", busy), btn("Revizyon Talep Et", revise)] };
    }
    return { text: "Müşteri bilgilerini girip siteyi oluşturunuz.", actions: [btn("Bilgileri Gir", () => { location.hash = `#/c/${slug}/duzenle`; setTimeout(() => $("#prep-text")?.focus(), 120); }, "btn btn-primary")] };
  }
  const preview = d.lastDeploy && d.lastDeploy.target === "preview" && d.lastDeploy.hash === d.status.contentHash ? d.lastDeploy : null;
  if (stage === "awaiting-production-approval") {
    if (!preview) return { text: "Önizleme bağlantısını oluşturup müşteriye iletiniz.", actions: [btn("Önizleme Oluştur", () => runTask(slug, "deploy", { target: "preview", dryRun: false }), "btn btn-primary", busy)] };
    return { text: "Müşteri onayı bekleniyor.", actions: [preview.url && copyButton(preview.url, "Bağlantıyı Kopyala"), btn("Müşteri Onayladı", () => approveDialog(d, "production"), "btn btn-ok", busy)] };
  }
  if (stage === "ready-to-deploy") return { text: d.domain ? `Site ${d.domain} adresinde yayına alınacak.` : "Site yayına alınmaya hazır.", actions: [btn("Yayına Al", () => deployProduction(slug, false), "btn btn-primary", busy)] };
  return { text: "Site yayında.", actions: [btn("Revizyon Talep Et", revise)] };
}

/** The site itself, always next to the work: phone or desktop, versions and checks underneath. */
export function previewPane(d) {
  const slug = d.status.slug;
  const pane = h("section", { class: "preview-pane", "aria-label": "Canlı önizleme", "data-enter": "2" });
  if (!d.distReady) {
    pane.append(h("div", { class: "preview-empty" },
      h("p", { class: "title", text: "Henüz önizleme yok" }),
      h("p", { class: "muted small", text: "Site oluşturulduğunda burada görünecek." })));
    return pane;
  }
  const device = state.device || (window.innerWidth < 700 ? "phone" : "desktop");
  const screen = h("div", { class: `pv-screen ${device}` }, h("p", { class: "muted small", text: "Yükleniyor…" }));
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Görünüm" }, ...[["phone", "Telefon"], ["desktop", "Masaüstü"]].map(([k, l]) =>
    h("button", { type: "button", "aria-pressed": String(device === k), onclick: () => { state.device = k; pane.replaceWith(previewPane(d)); } }, l)));
  const checks = d.status.lastBuild;
  pane.append(
    h("div", { class: "pv-bar" }, h("strong", { text: "Canlı Önizleme" }), seg, h("button", { class: "btn btn-sm", type: "button", onclick: () => openPreview(slug) }, "Yeni Sekmede Aç")),
    screen,
    h("div", { class: "pv-foot" },
      h("span", { class: `badge ${checks?.passed ? "ok" : "warn"}`, text: checks ? (checks.passed ? "Kontroller geçti" : "Kontrollerde sorun var") : "Kontrol yok" }),
      h("span", { class: "muted small", text: checks ? `Son oluşturma ${time(checks.at)}` : "" })),
    d.qualityReport ? h("details", { class: "pv-more" }, h("summary", { text: "Kontrol ayrıntıları" }), qualityTable(d.qualityReport)) : null,
    versionsCard(d),
  );
  api("POST", `/api/clients/${slug}/preview`).then((r) => {
    const frame = h("iframe", { src: r.url, title: device === "phone" ? "Telefon görünümü" : "Masaüstü görünümü", tabindex: "-1" });
    screen.replaceChildren(frame);
    // The desktop page is laid out at 1280px and scaled to the pane, like a thumbnail of the real thing.
    if (device === "desktop") {
      const fit = () => { const w = screen.clientWidth; if (w) frame.style.transform = `scale(${w / 1280})`; screen.style.height = `${Math.round((w / 1280) * 820)}px`; };
      new ResizeObserver(fit).observe(screen);
      fit();
    }
  }).catch(() => screen.replaceChildren(h("p", { class: "err", text: "Önizleme açılamadı." })));
  return pane;
}

/** Düzenleme: the information box until the site exists, quick forms, then free requests (Özel Talep). */
export async function tabWork(body, d) {
  const slug = d.status.slug;
  const PREPARE = ["collecting-answers", "design", "content", "build"];
  const approvedSite = ["content", "visual"].every((k) => d.approvals.find((x) => x.kind === k)?.valid);
  if (!d.distReady || (PREPARE.includes(d.status.stage) && !approvedSite && !d.distReady)) body.append(prepareCard(d));
  if (d.distReady) {
    const forms = [["colors", "Renk Paleti"], ["pages", "Sayfalar"], ["services", "Hizmetler ve Fiyatlar"], ["text", "Metin"], ["contact", "İletişim Bilgileri"], ["form", "İletişim Formu"], ["files", "Logo ve Görseller"]];
    const open = state.editForm?.[slug] || null;
    const holder = h("div", { class: "edit-holder" });
    const chips = h("div", { class: "quick-chips", role: "group", "aria-label": "Hızlı düzenleme" }, ...forms.map(([id, label]) =>
      h("button", { type: "button", class: "qchip", "aria-pressed": String(open === id), onclick: async () => {
        state.editForm = { ...(state.editForm || {}), [slug]: open === id ? null : id };
        const next = h("div", { class: "tab-body" });
        await tabWork(next, d);
        body.replaceWith(next);
      } }, label)));
    body.append(h("section", { class: "card quick" }, h("div", { class: "card-head" }, h("h3", { text: "Hızlı Düzenleme" }), h("span", { class: "muted small", text: "Talimat yazmanıza gerek yoktur" })), chips, holder));
    if (open) holder.append(await editForm(open, d));
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
  composer.addEventListener("input", () => { state.composer[slug] = composer.value; composer.style.height = "auto"; composer.style.height = `${composer.scrollHeight}px`; });
  if (hadFocus) queueMicrotask(() => composer.focus());
  const send = async () => {
    const text = composer.value.trim();
    if (!text) { composer.focus(); return; }
    if (await runAgent(slug, "revise", { request: text })) { state.composer[slug] = ""; composer.value = ""; }
  };
  composer.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  return h("section", { class: "card request" },
    h("div", { class: "card-head" }, h("h3", { text: "Özel Talep" }), h("span", { class: "muted small", text: "Formlarda bulunmayan değişiklikler için" })),
    h("div", { class: "feed-wrap" }, feed),
    h("form", { class: "composer", onsubmit: (e) => { e.preventDefault(); send(); } },
      h("label", { for: "composer", class: "sr-only" }, "Talep"),
      h("div", { class: "box" }, composer, h("button", { class: "send", type: "submit", "aria-label": "Gönder (Ctrl+Enter)", disabled: busy }, svg(ICON.send, 18, 2.4)))),
  );
}

/** Older sites can move to the newest template (animated, sector motif). Shown only when they are behind. */
export function upgradeBanner(d) {
  if (!d.template || !d.latestTemplate || d.template === d.latestTemplate) return null;
  const slug = d.status.slug;
  return h("section", { class: "upgrade-banner", "aria-label": "Yeni şablon" },
    h("p", {}, h("strong", { text: "Serbest tasarım hazır. " }), h("span", { text: `Bu site hazır şablonla yapılmış (${d.template}). Serbest tasarımda agent markaya özel kimlik, logo ve animasyonlarla siteyi baştan yazar; bilgiler aynı kalır, onaylar sıfırlanır.` })),
    h("button", { class: "btn", type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "upgrade-template", {}) }, "Serbest tasarıma geç"),
  );
}

/** Paste what you know, press one button; the agent does answers, design, text and build. */
export function prepareCard(d) {
  const slug = d.status.slug;
  const busy = isBusy();
  const working = busy && state.running.slug === slug;
  const draft = (state.drafts[slug] ||= { answers: {}, extras: {}, later: new Set(), freeText: "" });
  const ranBefore = d.history.some((j) => j.kind === "autopilot");
  const box = h("textarea", { id: "prep-text", class: "field big-paste", rows: 8, maxlength: 20000, disabled: working,
    placeholder: ranBefore
      ? "Sorulan eksik bilgileri ya da yeni bilgileri yazınız, ardından \"Siteyi Oluştur\"a tekrar basınız."
      : "Müşteriye ait bilgileri yapıştırınız: faaliyet alanı, hizmetler, fiyatlar, iletişim, renk tercihleri… Sıra ve biçim önemli değildir." });
  box.value = draft.freeText || "";
  box.addEventListener("input", () => (draft.freeText = box.value));

  const fileCount = h("span", { class: "small muted", text: d.inbox.length ? `${d.inbox.length} dosya eklendi` : "" });
  const fileInput = h("input", { type: "file", multiple: true, accept: "image/png,image/jpeg,image/webp,image/avif,image/svg+xml", id: "prep-files", class: "sr-only" });
  fileInput.addEventListener("change", async () => {
    let total = d.inbox.length;
    for (const file of fileInput.files) {
      const res = await guarded(() => api("PUT", `/api/clients/${slug}/inbox/${encodeURIComponent(file.name)}`, file, true));
      if (res) total = res.inbox.length;
    }
    fileCount.textContent = `${total} dosya eklendi`;
  });

  // Eren's rule: research and questions before design. Unticked = the agent decides open design choices itself.
  const askFirst = h("input", { type: "checkbox", id: "prep-ask", checked: draft.askFirst !== false, disabled: working, onchange: (e) => (draft.askFirst = e.target.checked) });
  // Optional starting point from the design library (custom sites); used once, on this run.
  const startFrom = h("select", { id: "prep-lib", disabled: working }, h("option", { value: "" }, "Başlangıç tasarımı: yeni tasarım"));
  if (d.template === "custom") api("GET", "/api/library").then(({ designs }) => { for (const x of rankedDesigns(designs, slug, d.business.industry)) startFrom.append(h("option", { value: x.id }, `${x.score > 0 ? "★ Önerilen: " : "Kütüphaneden: "}${x.name}${x.sector ? ` · ${x.sector}` : ""}`)); if (d.startDesign) startFrom.value = d.startDesign; }).catch(ignoreOptional);
  const go = async () => {
    const ok = await runAgent(slug, "autopilot", { freeText: draft.freeText || "", askFirst: askFirst.checked, ...(startFrom.value ? { libraryId: startFrom.value } : {}) });
    if (ok) draft.freeText = "";
  };
  return h("section", { class: "card prep", "aria-label": "Siteyi oluştur" },
    h("div", { class: "card-head" }, h("h3", { text: working ? "Site oluşturuluyor" : ranBefore ? "Bilgileri Tamamla" : "Müşteri Bilgileri ve Site Oluşturma" })),
    h("p", { class: "muted small", text: working
      ? "Bilgiler kaydediliyor, tasarım hazırlanıyor ve sayfalar oluşturuluyor. İşlem birkaç dakika sürer; ilerlemeyi aşağıdan takip edebilirsiniz."
      : "Bilgileri yapıştırınız, varsa logo ve görselleri ekleyiniz. Eksik bilgi olursa size sorulur." }),
    h("label", { for: "prep-text", class: "sr-only" }, "Müşteri bilgileri"),
    box,
    working ? null : infoGuide(box, (v) => (draft.freeText = v)),
    working || d.template !== "custom" ? null : h("label", { for: "prep-lib", class: "small row nowrap" }, startFrom),
    working ? null : h("label", { for: "prep-ask", class: "check small" }, askFirst, " Önce araştırma yapılsın ve sorular bana iletilsin (önerilir). Kapalıysa açık tasarım kararları otomatik verilir; bilgi yine uydurulmaz."),
    h("div", { class: "row" },
      h("button", { class: "btn btn-primary", type: "button", disabled: busy, onclick: go }, ranBefore ? "Devam Et" : "Siteyi Oluştur"),
      h("label", { for: "prep-files", class: "btn", style: working ? "pointer-events:none;opacity:.5" : "" }, "Logo ve Görsel Ekle"), fileInput,
      fileCount,
      h("a", { href: `#/c/${slug}/bilgiler`, class: "small", style: "margin-inline-start:auto" }, "Müşteriye soru formu gönder"),
    ),
  );
}


// ---------------------------------------------------------------- approval from the panel

/** Folded terminal alternative under an approval button. */
export function terminalFold(command) {
  return h("details", { class: "small term-fold" }, h("summary", { text: "Terminalden onaylamak istersen" }), h("div", { class: "cmd" }, h("code", { text: command }), copyButton(command)));
}

/**
 * Asks for the one-time code printed in the panel's terminal and approves exactly what is on screen:
 * the content and build fingerprints go with the request, so a change in the meantime approves nothing.
 */
export function approveDialog(d, kind) {
  const slug = d.status.slug;
  const what = kind === "site" ? "Siteyi onayla (metin + görünüm)" : "Yayın onayı";
  const code = h("input", { id: "approve-code", inputmode: "numeric", autocomplete: "off", maxlength: 6, pattern: "[0-9]{6}", placeholder: "6 haneli kod", class: "code-input" });
  const err = h("p", { class: "err", role: "alert" });
  const dialog = h("dialog", { class: "approve-dialog", "aria-labelledby": "approve-title" });
  const close = () => { dialog.close(); dialog.remove(); };
  const submit = async (e) => {
    e.preventDefault();
    err.textContent = "";
    const res = await fetch(`/api/clients/${slug}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, code: code.value, pins: { hash: d.status.contentHash, distHash: d.status.lastBuild?.distHash ?? null } }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { err.textContent = data.error || "Onay verilemedi."; code.select(); return; }
    close();
    toast(kind === "site" ? "Site onaylandı." : "Yayın onayı verildi.");
    render();
  };
  dialog.append(h("form", { method: "dialog", onsubmit: submit },
    h("h2", { id: "approve-title", text: what }),
    h("p", { class: "muted small", text: `${d.business.name || slug}: şu an ekranda gördüğün hâli onaylanır. Kod, paneli başlattığın terminalde "Onay kodu" satırında yazıyor.` }),
    h("label", { for: "approve-code" }, "Onay kodu", code),
    err,
    h("div", { class: "row" },
      h("button", { class: "btn btn-ok", type: "submit" }, "Onayla"),
      h("button", { class: "btn", type: "button", onclick: close }, "Vazgeç"),
    ),
  ));
  document.body.append(dialog);
  dialog.showModal();
  code.focus();
}

/** The logo changed after the brand was made, or it is another client's logo: say so before any design job. */
export function logoBanner(d) {
  const slug = d.status.slug;
  if (d.sharedLogo) {
    return h("div", { class: "notice-bar bad", role: "alert" },
      h("p", {}, h("strong", { text: "Logo başka bir müşteriye ait. " }), h("span", { text: `Bu müşterinin logosu "${d.sharedLogo.name}" müşterisinin logosuyla aynı dosya. Tasarım işleri bu yüzden durdurulur.` })),
      h("a", { class: "btn btn-sm", href: `#/c/${slug}/bilgiler` }, "Logoyu değiştir"));
  }
  if (d.brandStale && d.template === "custom") {
    return h("div", { class: "notice-bar warn" },
      h("p", {}, h("strong", { text: "Logo değişti, marka eski logoya göre. " }), h("span", { text: "Renkler, slogan ve imza hareketi önceki logodan geliyor. Yeni logoya göre yenileyiniz; bilgiler ve fiyatlar aynı kalır." })),
      h("button", { class: "btn btn-sm btn-primary", type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "redesign", {}) }, "Markayı yeni logoya göre yenile"));
  }
  return null;
}

/** Payment day passed and not paid: shown on the client page, with the unpublish action at hand. */
export function paymentBanner(d) {
  const b = d.businessTracking;
  const today = new Date().toISOString().slice(0, 10);
  if (!b?.paymentDue || b.paymentDue >= today || b.payment === "paid") return null;
  return h("div", { class: "notice-bar bad" },
    h("p", {}, h("strong", { text: "Ödeme gecikti. " }), h("span", { text: `Ödeme günü ${new Date(`${b.paymentDue}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} idi; durum: ödenmedi.` })),
    h("a", { class: "btn btn-sm", href: `#/c/${d.status.slug}/bilgiler` }, "İş Takibi ve Yayın"));
}
