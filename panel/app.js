// Site Factory panel. Plain browser JS, ES modules, no build step.
// All text from the server (client data included) is inserted with textContent, never innerHTML.
// This file only wires the page together; the screens live in ./js/.
import { $, api, state, STATUS_POLL_MS } from "./js/core.js";
import { rememberedLang, setLang } from "./js/i18n.js";
import { fmtDuration } from "./js/jobs.js";
import { refreshStatus, render, renderSidebar } from "./js/router.js";

// ---------------------------------------------------------------- theme and status

$("#theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("sf-theme", next);
  } catch {
    /* private window: theme just isn't remembered */
  }
});

setInterval(refreshStatus, STATUS_POLL_MS);

$("#search").addEventListener("input", (e) => {
  state.search = e.target.value.toLowerCase();
  renderSidebar();
});

window.addEventListener("hashchange", () => {
  state.libEdit = null;
  render();
});

setInterval(() => {
  const p = $("#job-progress");
  if (!p) return;
  const secs = (Date.now() - Date.parse(p.dataset.started)) / 1000;
  const typical = Number(p.dataset.typical) || 0;
  const el = $("#job-elapsed");
  if (el) el.textContent = `Geçen süre ${fmtDuration(secs)}`;
  const bar = $("#job-bar");
  // Never shows 100% before the job really ends; slows down past the usual time instead.
  if (bar && typical) bar.style.width = `${Math.min(95, (secs / typical) * 85)}%`;
}, 1000);

/** Asked once, on a click that starts a job (browsers only allow it after a user action). */

// ---------------------------------------------------------------- start

(async () => {
  // Language first, so the first screen is drawn in it: this browser's last choice, then the saved setting.
  setLang(rememberedLang());
  const settings = await api("GET", "/api/settings").catch(() => null);
  if (settings?.panelLanguage) setLang(settings.panelLanguage);
  await refreshStatus();
  render();
})();
