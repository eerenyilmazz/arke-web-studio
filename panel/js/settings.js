// Settings page: sections, navigation and which cards each section shows (the cards live in settings-*.js).
import { api, copyButton, guarded, h, ICON, svg, toast } from "./core.js";
import { askNotifyPermission, chime } from "./jobs.js";
import { portalSettingsCard } from "./portal.js";
import { accountCard } from "./account.js";
import { profileCard } from "./profile.js";
import { teamCard, updateCard } from "./team-update.js";
import { agentsCard, budgetCard, profitSettingsCard, webResearchCard } from "./settings-usage.js";
import { backupCard, languageCard, senderCard } from "./settings-general.js";

// ---------------------------------------------------------------- settings: publishing setup

/** Settings: the person's own account first, then general, usage, publishing and backups. Secrets are never shown. */
export async function renderSettings() {
  const st = await guarded(() => api("GET", "/api/cloudflare"));
  const ok = (b) => h("span", { class: `badge ${b ? "ok" : "warn"}`, text: b ? "tamam" : "eksik" });
  const lines = 'export ARKE_CF_MANAGED_API_TOKEN="buraya-token"\nexport ARKE_CF_MANAGED_ACCOUNT_ID="buraya-hesap-kimligi"';
  const ready = st && st.managed.token && st.managed.accountId && st.wrangler;
  const group = (id, title, ...cards) =>
    h(
      "section",
      { class: "settings-group", id: `ayar-${id}`, "data-enter": "1" },
      h(
        "header",
        { class: "set-section-head" },
        h("h2", { class: "set-section-title", text: title }),
        h("p", { class: "muted small", text: SECTION_NOTES[id] }),
      ),
      ...cards.map((c) => asPanel(c, title)),
    );
  const nav = h(
    "nav",
    { class: "settings-nav", "aria-label": "Ayar bölümleri" },
    ...NAV.map(([heading, items]) =>
      h(
        "div",
        { class: "set-nav-group" },
        h("p", { class: "set-nav-heading", text: heading }),
        ...items.map(([id, label, icon]) =>
          h(
            "a",
            {
              href: `#ayar-${id}`,
              "data-tab": id,
              onclick: (e) => {
                e.preventDefault();
                showTab(id);
              },
            },
            svg(icon, 16, 1.8),
            h("span", { text: label }),
          ),
        ),
      ),
    ),
  );
  const account = st?.account;
  const cloudflare = h(
    "section",
    { class: "card stack" },
    h(
      "div",
      { class: "row", style: "justify-content:space-between" },
      h("h2", { text: "Yayın Hazırlığı" }),
      ready ? h("span", { class: "badge ok", text: "hazır" }) : h("span", { class: "badge warn", text: "kurulmadı" }),
    ),
    st &&
      h(
        "ul",
        { class: "checks" },
        h("li", {}, ok(Boolean(account?.configured)), " Cloudflare hesabı ", h("a", { href: "#ayar-hesap", text: "(Hesabım)" })),
        h("li", {}, ok(st.wrangler), " Yayın aracı (wrangler)"),
      ),
    h(
      "details",
      { class: "advanced" },
      h("summary", { text: "Gelişmiş: hesabı terminal ortam değişkeniyle vermek" }),
      h("p", { class: "muted small", text: "Eski kurulumlar için. Panelde kayıtlı bir hesap varsa o kullanılır." }),
      h("div", { class: "copybox" }, h("pre", { text: lines }), copyButton(lines)),
    ),
  );
  const approvalCode = h(
    "section",
    { class: "card stack" },
    h("h2", { text: "Onay Kodu" }),
    h("p", {
      class: "muted small",
      text: 'Onay sırasında istenen 6 haneli kod, paneli başlattığınız terminalde "Onay kodu" satırında yer alır. Her başlatmada değişir; 5 hatalı denemede onay kilitlenir (paneli yeniden başlatınız).',
    }),
  );
  const notifications = h(
    "section",
    { class: "card stack" },
    h("h2", { text: "Bildirimler" }),
    h("p", { class: "muted small", text: "Uzun işlemler tamamlandığında sesli uyarı verilir; panel arka plandaysa sistem bildirimi gönderilir." }),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        {
          class: "btn btn-sm",
          type: "button",
          onclick: () => {
            askNotifyPermission();
            toast("Tarayıcı izin isteyebilir; lütfen izin veriniz.");
          },
        },
        "Bildirimlere İzin Ver",
      ),
      h("button", { class: "btn btn-sm", type: "button", onclick: () => chime(true) }, "Sesi Dene"),
    ),
  );
  // One section at a time (the nav works as tabs); the last one opened is remembered in this browser.
  const showTab = (id) => {
    const groups = page.querySelectorAll(".settings-group");
    const known = [...groups].some((g) => g.id === `ayar-${id}`);
    const tab = known ? id : "hesap";
    for (const g of groups) g.hidden = g.id !== `ayar-${tab}`;
    for (const a of nav.querySelectorAll("a")) {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* private window: the first tab opens next time */
    }
  };
  const page = h(
    "div",
    { class: "settings-page" },
    h(
      "header",
      { class: "settings-head", "data-enter": "0" },
      h("h1", { text: "Ayarlar" }),
      h("p", { class: "muted", text: "Hesabınız, ekip, kaynak kullanımı ve sistem." }),
    ),
    h(
      "div",
      { class: "settings-layout" },
      h("aside", { class: "settings-side" }, nav),
      h(
        "div",
        { class: "settings" },
        group("hesap", "Hesabım", profileCard(), accountCard()),
        group("genel", "Genel", languageCard(), senderCard(), notifications, approvalCode),
        group("ekip", "Ekip", teamCard()),
        group("kullanim", "Kaynak Kullanımı", budgetCard(), agentsCard(), profitSettingsCard(), webResearchCard()),
        group("yayin", "Yayın", cloudflare, portalSettingsCard()),
        group("yedek", "Yedek", backupCard()),
        group("guncelleme", "Güncelleme", updateCard()),
      ),
    ),
  );
  // Links inside the page to another section (e.g. "(Hesabım)") open that tab.
  page.addEventListener("click", (e) => {
    const a = e.target.closest?.('a[href^="#ayar-"]');
    if (!a || nav.contains(a)) return;
    e.preventDefault();
    showTab(a.getAttribute("href").slice("#ayar-".length));
  });
  placeNav(nav, page);
  let first = "hesap";
  try {
    first = localStorage.getItem(TAB_KEY) || "hesap";
  } catch {
    /* private window */
  }
  showTab(first);
  return page;
}
const TAB_KEY = "arke-settings-tab";
const RAIL_QUERY = "(min-width: 861px)";

/**
 * On wide screens the section list sits in the main menu, under "Ayarlar", so there is one navigation column; on
 * phones (where the main menu is a single bar) it stays at the top of the page. The router removes it on leaving.
 */
function placeNav(nav, page) {
  const media = window.matchMedia(RAIL_QUERY);
  const place = () => {
    const anchor = document.querySelector('.main-nav a[data-nav="settings"]');
    // A list left by an earlier draw of the page goes.
    for (const other of document.querySelectorAll(".main-nav .settings-nav")) if (other !== nav) other.remove();
    if (media.matches && anchor) {
      nav.classList.add("in-rail");
      anchor.after(nav);
    } else {
      nav.classList.remove("in-rail");
      page.querySelector(".settings-side")?.append(nav);
    }
  };
  media.addEventListener("change", () => (page.isConnected ? place() : nav.remove()));
  // The page is put on screen by the router after this returns; wait for it (a few frames at most).
  const whenShown = (tries = 0) => {
    if (page.isConnected) place();
    else if (tries < 30) requestAnimationFrame(() => whenShown(tries + 1));
  };
  whenShown();
}

const NAV = [
  [
    "Kişisel",
    [
      ["hesap", "Hesabım", ICON.user],
      ["genel", "Genel", ICON.sliders],
    ],
  ],
  [
    "Çalışma",
    [
      ["ekip", "Ekip", ICON.users],
      ["kullanim", "Kaynak Kullanımı", ICON.gauge],
    ],
  ],
  [
    "Sistem",
    [
      ["yayin", "Yayın", ICON.cloud],
      ["yedek", "Yedek", ICON.archive],
      ["guncelleme", "Güncelleme", ICON.refresh],
    ],
  ],
];

const SECTION_NOTES = {
  hesap: "Adınız, panel diliniz ve yayın için kendi Cloudflare hesabınız.",
  genel: "Panel dili, teklif bilgileri, bildirimler ve onay kodu.",
  ekip: "Müşterileri ekip arkadaşlarınızla bir Git deposu üzerinden paylaşın.",
  kullanim: "Paket, aylık sınır, iş türüne göre agent seçimi, kâr hesabı ve internet araştırması.",
  yayin: "Yayın aracı ve müşteri portalı.",
  yedek: "Bütün müşterilerin, sürüm geçmişlerinin ve ayarların yedeği.",
  guncelleme: "Arke Web Studio sürümü ve güncellemeler.",
};

/** Is this element an action row (only buttons, perhaps a status line)? Those become the panel's footer. */
const isActions = (el) =>
  el.tagName === "DIV" &&
  el.children.length > 0 &&
  [...el.children].every((c) => c.matches("button, .btn, a.btn, label.btn, span, input[type=file]")) &&
  el.querySelector("button, .btn");

/**
 * Gives a settings card a header (title, note, badge), a body and a footer for its buttons, without changing what the
 * card does: its nodes are moved, never rebuilt. Cards that redraw themselves later are restructured again.
 */
function asPanel(card, sectionTitle) {
  card.classList.add("set-panel");
  const shape = () => {
    const items = [...card.children].flatMap((c) => (c.classList.contains("set-part") ? [...c.children] : [c]));
    const head = [];
    while (items.length && (items[0].tagName === "H2" || (items[0].matches(".row, div") && items[0].querySelector(":scope > h2")))) head.push(items.shift());
    while (head.length && items.length && items[0].matches("p.muted.small") && head.length < 3) head.push(items.shift());
    const foot = items.length > 1 && isActions(items.at(-1)) ? items.pop() : null;
    // A card named like its section ("Yedek" under "Yedek") keeps its title for screen readers only.
    const title = head.find((x) => x.tagName === "H2") || head[0]?.querySelector?.(":scope > h2");
    title?.classList.toggle("sr-only", title.textContent.trim() === sectionTitle);
    observer.disconnect();
    card.replaceChildren(
      ...(head.length ? [h("header", { class: "set-part set-head" }, ...head)] : []),
      ...(items.length ? [h("div", { class: "set-part set-body" }, ...items)] : []),
      ...(foot ? [h("footer", { class: "set-part set-foot" }, foot)] : []),
    );
    observer.observe(card, { childList: true });
  };
  const observer = new MutationObserver(() => shape());
  shape();
  return card;
}
