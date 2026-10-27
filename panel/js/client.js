// Client page: header, tabs, status strip, next action and the preview (Düzenleme tab: client-work.js).
import { tabBrand } from "./brand.js";
import { planWaiting } from "./design-plan.js";
import { archiveClient, deployProduction, openPreview } from "./client-actions.js";
import {
  $,
  api,
  ask,
  avatar,
  copyButton,
  fmtTokens,
  guarded,
  h,
  ICON,
  isBusy,
  LANG_NAMES,
  OLD_TABS,
  PACKAGE_NAMES,
  state,
  stepIndex,
  STEPS,
  svg,
  TABS,
  time,
} from "./core.js";
import { renderHome } from "./home.js";
import { qualityTable, tabInfo, versionsCard } from "./info.js";
import { runAgent, runTask, startPolling } from "./jobs.js";
import { tabProposal } from "./proposal.js";
import { setStatus } from "./router.js";
import { logoBanner, paymentBanner, tabWork, upgradeBanner } from "./client-work.js";
import { approveDialog } from "./approval.js";

// ---------------------------------------------------------------- client page

export async function renderClient(view, slug, tab) {
  const d = await guarded(() => api("GET", `/api/clients/${slug}`));
  if (!d) {
    view.replaceChildren(renderHome());
    return;
  }
  state.detail = d;
  if (d.running) {
    state.running = d.running;
    setStatus(d.running);
  }
  const stage = d.status.stage;
  const name = d.business.name || slug;
  tab = OLD_TABS[tab] || tab;
  if (!TABS.some(([id]) => id === tab)) tab = "duzenle";

  const menu = h(
    "details",
    { class: "menu" },
    h("summary", { class: "icon-btn", "aria-label": "Diğer işlemler" }, svg(ICON.more, 20, 3)),
    h(
      "div",
      { class: "menu-items" },
      h("button", { type: "button", disabled: isBusy(), onclick: () => runTask(slug, "build", {}) }, "Siteyi yeniden oluştur"),
      h("button", { type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "fix-build", {}) }, "Hataları otomatik düzelt"),
      d.template === "custom" ? h("button", { type: "button", disabled: isBusy(), onclick: () => askConcepts(d) }, "3 tasarım önerisi hazırla") : null,
      d.template === "custom" && d.locales.length > 1
        ? h("button", { type: "button", disabled: isBusy(), onclick: () => runAgent(slug, "translate", {}) }, "Diğer dilleri güncelle")
        : null,
      h("button", { type: "button", class: "danger", onclick: () => archiveClient(slug, stage) }, "Müşteriyi arşivle"),
    ),
  );
  const usage = d.budget
    ? `${PACKAGE_NAMES[d.budget.mode] || ""} paket${d.budget.usage.tokens ? ` · kaynak kullanımı ${fmtTokens(d.budget.usage.tokens)}` : ""}`
    : "";

  const body = h("div", { class: "tab-body" });
  view.replaceChildren(
    h(
      "div",
      { class: "client-head", "data-enter": "0" },
      h(
        "div",
        { class: "client-id" },
        avatar(slug, name, true),
        h(
          "div",
          {},
          h("h1", { text: name }),
          h(
            "div",
            { class: "facts" },
            h("span", { text: d.business.industry || "" }),
            h("span", { text: d.locales.map((l) => LANG_NAMES[l] || l).join(", ") }),
            h("span", { text: d.hosting === "client" ? "Müşteri hesabı" : "Ajans hesabı" }),
            d.domain && h("span", { text: d.domain }),
            usage && h("span", { text: usage }),
          ),
        ),
      ),
      h(
        "div",
        { class: "row" },
        // Windows "Animation effects" off = reduced motion: the sites calm their animations, which looks like a bug.
        matchMedia("(prefers-reduced-motion: reduce)").matches
          ? h("span", {
              class: "badge warn",
              title: "Windows Ayarlar → Erişilebilirlik → Görsel efektler → Animasyon efektleri: Açık",
              text: "Bu bilgisayarda animasyonlar kapalı",
            })
          : null,
        menu,
      ),
    ),
    statusStrip(d),
    logoBanner(d) || "",
    paymentBanner(d) || "",
    upgradeBanner(d) || "",
    h(
      "div",
      { class: tab === "marka" || tab === "teklif" ? "work wide" : "work" },
      tab === "marka" || tab === "teklif" ? null : previewPane(d),
      h(
        "section",
        { class: "work-panel", "data-enter": "2" },
        h(
          "nav",
          { class: "seg-tabs", "aria-label": "Bölümler" },
          ...TABS.map(([id, label]) => h("a", { href: `#/musteri/${slug}/${id}`, "aria-current": id === tab ? "page" : null, text: label })),
        ),
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
/**
 * The step the operator sees. While nothing is built yet the site is still being made, even when the texts wait for
 * approval (custom sites approve the built site, not the texts); a running job on a new client is step 2 too.
 */
export function shownStep(d) {
  let step = stepIndex(d.status.stage);
  const built = Boolean(d.status.lastBuild?.passed);
  if (step === 2 && d.status.stage === "awaiting-content-approval" && !built) step = 1;
  if (step === 0 && isBusy() && state.running?.slug === d.status.slug) step = 1;
  return step;
}

/** Three proposals cost a full design job: asked first, and the dialog says when a plan is already approved. */
async function askConcepts(d) {
  const approved = d.status.designPlan?.state === "approved";
  const yes = await ask({
    title: "3 tasarım önerisi hazırlansın mı?",
    body: approved
      ? "Bu müşterinin onaylı bir tasarım planı var. Öneriler ayrı bir tasarım işidir ve kaynak harcar; birini seçerseniz site o öneriyle yeniden kurulur ve onaylı planın yerine geçer."
      : "Üç farklı marka önerisi hazırlanır; bu bir tasarım işidir ve kaynak harcar. Beğendiğinizi Marka Kimliği sekmesinden seçersiniz.",
    confirm: "Önerileri Hazırla",
  });
  if (yes) await runAgent(d.status.slug, "concepts", {});
}

export function statusStrip(d) {
  const step = shownStep(d);
  const a = nextAction(d);
  return h(
    "section",
    { class: "strip", "aria-label": "Durum", "data-enter": "1" },
    h(
      "ol",
      { class: "strip-steps", "aria-label": `Adım ${step + 1} / ${STEPS.length}: ${STEPS[step].label}` },
      ...STEPS.map((s, i) =>
        h(
          "li",
          { class: i < step ? "done" : i === step ? "now" : "", "aria-current": i === step ? "step" : null },
          h("span", { class: "dot", text: i < step ? "✓" : String(i + 1) }),
          h("span", { class: "label", text: s.label }),
        ),
      ),
    ),
    h("div", { class: "strip-next" }, h("p", { text: a.text }), ...a.actions.filter(Boolean)),
  );
}

/** The next step in one sentence, with at most three buttons. */
export function nextAction(d) {
  const slug = d.status.slug;
  const stage = d.status.stage;
  const busy = isBusy();
  const working = busy && state.running.slug === slug;
  const btn = (label, onclick, cls = "btn", disabled = false) => h("button", { class: cls, type: "button", disabled, onclick }, label);
  const revise = () => {
    location.hash = `#/musteri/${slug}/duzenle`;
    setTimeout(() => $("#composer")?.focus(), 120);
  };
  if (working) return { text: "İşlem sürüyor. Tamamlandığında bildirim alacaksınız.", actions: [] };
  // A new design waits for the operator's decision on its plan before anything is built.
  if (planWaiting(d))
    return {
      text: "Tasarım planını inceleyip onaylayınız.",
      actions: [
        btn(
          "Planı İncele",
          () => {
            location.hash = `#/musteri/${slug}/duzenle`;
            setTimeout(() => $("#design-plan")?.scrollIntoView({ block: "start" }), 150);
          },
          "btn btn-primary",
        ),
      ],
    };
  const PREPARE = ["collecting-answers", "design", "content", "awaiting-content-approval", "build", "awaiting-visual-approval"];
  if (PREPARE.includes(stage)) {
    const approved = (k) => d.approvals.find((x) => x.kind === k)?.valid;
    if (d.distReady && !(approved("content") && approved("visual"))) {
      return {
        text: "Siteyi inceleyip onaylayınız.",
        actions: [btn("Onayla", () => approveDialog(d, "site"), "btn btn-ok", busy), btn("Revizyon Talep Et", revise)],
      };
    }
    return {
      text: "Müşteri bilgilerini girip siteyi oluşturunuz.",
      actions: [
        btn(
          "Bilgileri Gir",
          () => {
            location.hash = `#/musteri/${slug}/duzenle`;
            setTimeout(() => $("#prep-text")?.focus(), 120);
          },
          "btn btn-primary",
        ),
      ],
    };
  }
  const preview = d.lastDeploy && d.lastDeploy.target === "preview" && d.lastDeploy.hash === d.status.contentHash ? d.lastDeploy : null;
  if (stage === "awaiting-production-approval") {
    if (!preview)
      return {
        text: "Önizleme bağlantısını oluşturup müşteriye iletiniz.",
        actions: [btn("Önizleme Oluştur", () => runTask(slug, "deploy", { target: "preview", dryRun: false }), "btn btn-primary", busy)],
      };
    return {
      text: "Müşteri onayı bekleniyor.",
      actions: [
        preview.url && copyButton(preview.url, "Bağlantıyı Kopyala"),
        btn("Müşteri Onayladı", () => approveDialog(d, "production"), "btn btn-ok", busy),
      ],
    };
  }
  if (stage === "ready-to-deploy")
    return {
      text: d.domain ? `Site ${d.domain} adresinde yayına alınacak.` : "Site yayına alınmaya hazır.",
      actions: [btn("Yayına Al", () => deployProduction(slug, false), "btn btn-primary", busy)],
    };
  return { text: "Site yayında.", actions: [btn("Revizyon Talep Et", revise)] };
}

/** The site itself, always next to the work: phone or desktop, versions and checks underneath. */
export function previewPane(d) {
  const slug = d.status.slug;
  const pane = h("section", { class: "preview-pane", "aria-label": "Canlı önizleme", "data-enter": "2" });
  if (!d.distReady) {
    pane.append(
      h(
        "div",
        { class: "preview-empty" },
        h("p", { class: "title", text: "Henüz önizleme yok" }),
        h("p", { class: "muted small", text: "Site oluşturulduğunda burada görünecek." }),
      ),
    );
    return pane;
  }
  const device = state.device || (window.innerWidth < 700 ? "phone" : "desktop");
  const screen = h("div", { class: `pv-screen ${device}` }, h("p", { class: "muted small", text: "Yükleniyor…" }));
  const seg = h(
    "div",
    { class: "seg", role: "group", "aria-label": "Görünüm" },
    ...[
      ["phone", "Telefon"],
      ["desktop", "Masaüstü"],
    ].map(([k, l]) =>
      h(
        "button",
        {
          type: "button",
          "aria-pressed": String(device === k),
          onclick: () => {
            state.device = k;
            pane.replaceWith(previewPane(d));
          },
        },
        l,
      ),
    ),
  );
  const checks = d.status.lastBuild;
  pane.append(
    h(
      "div",
      { class: "pv-bar" },
      h("strong", { text: "Canlı Önizleme" }),
      seg,
      h("button", { class: "btn btn-sm", type: "button", onclick: () => openPreview(slug) }, "Yeni Sekmede Aç"),
    ),
    screen,
    h(
      "div",
      { class: "pv-foot" },
      h("span", {
        class: `badge ${checks?.passed ? "ok" : "warn"}`,
        text: checks ? (checks.passed ? "Kontroller geçti" : "Kontrollerde sorun var") : "Kontrol yok",
      }),
      h("span", { class: "muted small", text: checks ? `Son oluşturma ${time(checks.at)}` : "" }),
    ),
    d.qualityReport ? h("details", { class: "pv-more" }, h("summary", { text: "Kontrol ayrıntıları" }), qualityTable(d.qualityReport)) : null,
    versionsCard(d),
  );
  api("POST", `/api/clients/${slug}/preview`)
    .then((r) => {
      const frame = h("iframe", { src: r.url, title: device === "phone" ? "Telefon görünümü" : "Masaüstü görünümü", tabindex: "-1" });
      screen.replaceChildren(frame);
      // The desktop page is laid out at 1280px and scaled to the pane, like a thumbnail of the real thing.
      if (device === "desktop") {
        const fit = () => {
          const w = screen.clientWidth;
          if (w) frame.style.transform = `scale(${w / 1280})`;
          screen.style.height = `${Math.round((w / 1280) * 820)}px`;
        };
        new ResizeObserver(fit).observe(screen);
        fit();
      }
    })
    .catch(() => screen.replaceChildren(h("p", { class: "err", text: "Önizleme açılamadı." })));
  return pane;
}
