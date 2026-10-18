// Routing, the status pill and the client list in the sidebar.
import { renderArchive } from "./archive.js";
import { renderClient } from "./client.js";
import { $, api, avatar, guarded, h, isBusy, OLD_TABS, plainOf, state } from "./core.js";
import { renderHome } from "./home.js";
import { announceFinished } from "./jobs.js";
import { renderLibrary } from "./library.js";
import { renderNew } from "./new-client.js";
import { renderSettings } from "./settings.js";

export function setStatus(job) {
  const pill = $("#agent-status");
  pill.className = job ? "status-pill busy" : "status-pill idle";
  // The mark's signature motion ("Katlar oturur") loops while the agent works.
  document.body.classList.toggle("agent-busy", Boolean(job));
  pill.querySelector(".label").textContent = job ? `${job.title} · ${job.slug}` : "Sistem hazır";
}

export async function refreshStatus() {
  const m = await api("GET", "/api/meta").catch(() => null);
  if (!m) return;
  state.typical = m.typicalSeconds || {};
  const before = state.running?.id;
  // Finished while the panel was on another page (no job polling): still announce it.
  if (before && !m.running && !state.pollTimer) {
    const done = await api("GET", `/api/jobs/${before}`).catch(() => null);
    if (done && done.status !== "running") announceFinished(done);
  }
  if (m.running) state.running = { ...m.running, log: [] };
  else if (!state.pollTimer) state.running = null;
  setStatus(m.running);
  renderSidebar();
  if (m.running && m.running.id !== before && route().slug === m.running.slug) render();
}

// ---------------------------------------------------------------- routing

export function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  // Old addresses ("#/new", "#/c/<slug>") from bookmarks and earlier versions still open the same pages.
  if (parts[0] === "yeni" || parts[0] === "new") return { view: "new" };
  if (parts[0] === "ayarlar") return { view: "settings" };
  if (parts[0] === "kutuphane") return { view: "library" };
  if (parts[0] === "arsiv") return { view: "archive" };
  if ((parts[0] === "musteri" || parts[0] === "c") && parts[1]) return { view: "client", slug: parts[1], tab: OLD_TABS[parts[2]] || parts[2] || "sohbet" };
  return { view: "home" };
}

export async function render() {
  await loadClients();
  const r = route();
  const view = $("#view");
  for (const a of document.querySelectorAll(".main-nav a")) {
    const on =
      (a.dataset.nav === "home" && (r.view === "home" || r.view === "client" || r.view === "new")) ||
      (a.dataset.nav === "library" && r.view === "library") ||
      (a.dataset.nav === "archive" && r.view === "archive") ||
      (a.dataset.nav === "settings" && r.view === "settings");
    a.toggleAttribute("aria-current", on);
    if (on) a.setAttribute("aria-current", "page");
  }
  // Entrance motion only when the page changes, not when the same page refreshes after a job.
  const key = `${r.view}/${r.slug || ""}/${r.tab || ""}`;
  view.classList.toggle("entering", key !== state.lastPage);
  state.lastPage = key;
  if (r.view === "new") view.replaceChildren(renderNew());
  else if (r.view === "settings") view.replaceChildren(await renderSettings());
  else if (r.view === "library") view.replaceChildren(await renderLibrary());
  else if (r.view === "archive") view.replaceChildren(await renderArchive());
  else if (r.view === "client") await renderClient(view, r.slug, r.tab);
  else view.replaceChildren(renderHome());
}

// ---------------------------------------------------------------- sidebar

export async function loadClients() {
  const data = await guarded(() => api("GET", "/api/clients"));
  if (data) state.clients = data.clients;
  renderSidebar();
}

export function groupOf(stage) {
  if (stage === "collecting-answers") return "Bilgi Bekleyen";
  if (stage === "live") return "Yayında";
  if (stage === "unreadable") return "Okunamadı";
  return "Onay Bekleyen";
}

export function renderSidebar() {
  const r = route();
  const nav = $("#clients");
  const list = state.clients.filter((c) => !state.search || c.slug.includes(state.search) || (c.name || "").toLowerCase().includes(state.search));
  if (!list.length) {
    nav.replaceChildren(h("p", { class: "empty-nav", text: state.clients.length ? "Eşleşen müşteri yok." : "Henüz müşteri yok." }));
    return;
  }
  nav.replaceChildren(
    ...["Onay Bekleyen", "Bilgi Bekleyen", "Yayında", "Okunamadı"].flatMap((g) => {
      const items = list.filter((c) => groupOf(c.stage) === g);
      if (!items.length) return [];
      return [
        h("p", { class: "group-title", text: g }),
        ...items.map((c) =>
          h(
            "a",
            { class: "client-link", href: `#/musteri/${c.slug}`, "aria-current": r.slug === c.slug ? "page" : null },
            avatar(c.slug, c.name || c.slug, false, isBusy() && state.running.slug === c.slug),
            h(
              "span",
              { class: "meta" },
              h("span", { class: "name", text: c.name || c.slug }),
              h("span", { class: "sub", text: isBusy() && state.running.slug === c.slug ? "İşlem sürüyor…" : plainOf(c.stage).text }),
            ),
          ),
        ),
      ];
    }),
  );
}
