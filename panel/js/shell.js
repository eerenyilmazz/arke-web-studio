// Status pill, routing, sidebar, job progress, notifications and job actions.
import { renderArchive } from "./archive.js";
import { renderClient } from "./client.js";
import { $, api, ask, avatar, guarded, h, ignoreOptional, isBusy, OLD_TABS, plainOf, POLL_MS, state, toast } from "./core.js";
import { appendLiveLines, STATUS_BADGE } from "./feed.js";
import { renderHome, renderNew } from "./home.js";
import { renderLibrary } from "./library.js";
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
  if (parts[0] === "new") return { view: "new" };
  if (parts[0] === "ayarlar") return { view: "settings" };
  if (parts[0] === "kutuphane") return { view: "library" };
  if (parts[0] === "arsiv") return { view: "archive" };
  if (parts[0] === "c" && parts[1]) return { view: "client", slug: parts[1], tab: OLD_TABS[parts[2]] || parts[2] || "sohbet" };
  return { view: "home" };
}

export async function render() {
  await loadClients();
  const r = route();
  const view = $("#view");
  for (const a of document.querySelectorAll(".main-nav a")) {
    const on = (a.dataset.nav === "home" && (r.view === "home" || r.view === "client" || r.view === "new")) || (a.dataset.nav === "library" && r.view === "library") || (a.dataset.nav === "archive" && r.view === "archive") || (a.dataset.nav === "settings" && r.view === "settings");
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
          h("a", { class: "client-link", href: `#/c/${c.slug}`, "aria-current": r.slug === c.slug ? "page" : null },
            avatar(c.slug, c.name || c.slug, false, isBusy() && state.running.slug === c.slug),
            h("span", { class: "meta" }, h("span", { class: "name", text: c.name || c.slug }), h("span", { class: "sub", text: isBusy() && state.running.slug === c.slug ? "İşlem sürüyor…" : plainOf(c.stage).text })),
          )),
      ];
    }),
  );
}

// ---------------------------------------------------------------- job progress and notifications

export const PHASE_LABELS = { reading: "Bilgileri okuyor", saving: "Bilgileri kaydediyor", design: "Tasarımı araştırıyor", brand: "Markayı tasarlıyor", pages: "Sayfaları yazıyor", checking: "Kontrol ediyor" };
export const PHASE_ORDER = ["reading", "saving", "design", "brand", "pages", "checking"];

export function fmtDuration(secs) {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return m ? `${m} dk ${s.toString().padStart(2, "0")} sn` : `${s} sn`;
}

/** Where a running agent job is: plain stages, elapsed time and a rough estimate from earlier runs. */
export function jobProgress(job) {
  const typical = (state.typical || {})[job.kind];
  const now = PHASE_ORDER.indexOf(job.phase);
  const el = h("div", { class: "progress", id: "job-progress", "data-started": job.startedAt, "data-typical": typical || "" },
    h("ol", { class: "phases" }, ...PHASE_ORDER.map((p, i) => h("li", { class: i < now ? "done" : i === now ? "now" : "" }, PHASE_LABELS[p]))),
    h("p", { class: "small muted" },
      h("span", { id: "job-elapsed", text: `Geçen süre ${fmtDuration((Date.now() - Date.parse(job.startedAt)) / 1000)}` }),
      job.filesWritten ? ` · ${job.filesWritten} dosya yazıldı` : "",
      job.skillsUsed?.length ? ` · skill: ${job.skillsUsed.join(", ")}` : "",
      typical ? ` · genelde ${fmtDuration(typical)} sürer` : ""),
    h("div", { class: "bar" }, h("span", { id: "job-bar" })),
  );
  return el;
}

/** Ticks the elapsed time and the bar once a second while a job runs. */

export function askNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(ignoreOptional);
}

export function chime(ok) {
  try {
    const ctx = new AudioContext();
    const notes = ok ? [660, 880] : [440, 330];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch { /* no audio */ }
}

/** A finished job: sound, a system notification when the panel is in the background, and the tab title. */
export function announceFinished(job) {
  const ok = job.status === "succeeded";
  const name = state.clients.find((c) => c.slug === job.slug)?.name || job.slug;
  chime(ok);
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification(ok ? `${name}: hazır` : `${name}: tamamlanamadı`, { body: `${job.title} ${ok ? "bitti. Panelde sonucu gör." : "başarısız oldu."}`, tag: job.id });
  }
  if (document.hidden) {
    const original = "Site Factory";
    document.title = ok ? `✓ ${name} hazır · ${original}` : `✕ ${name} · ${original}`;
    const reset = () => { document.title = original; document.removeEventListener("visibilitychange", reset); };
    document.addEventListener("visibilitychange", reset);
  }
}

// ---------------------------------------------------------------- actions

export async function openPreview(slug) {
  const r = await guarded(() => api("POST", `/api/clients/${slug}/preview`));
  if (r) window.open(r.url, "_blank", "noopener");
}

export async function deployProduction(slug, dryRun) {
  if (!dryRun) {
    // Publishing before any payment is Eren's call, but never by accident.
    const pay = state.detail?.status?.slug === slug ? state.detail.businessTracking?.payment : null;
    const unpaid = !pay || pay === "none" || pay === "quoted";
    const body = unpaid
      ? `${slug} gerçek adresinde yayına alınacak.\n\nDikkat: bu müşteriden henüz kapora ya da ödeme alınmadı (İş Takibi). Ödeme gelince yayına almak isteyebilirsiniz.`
      : `${slug} gerçek adresinde yayına alınacak. Ziyaretçiler bu hâli görür.`;
    if (!(await ask({ title: unpaid ? "Ödeme alınmadan canlıya al" : "Canlıya al", body, confirm: unpaid ? "Yine de canlıya al" : "Canlıya al", danger: true }))) return;
  }
  runTask(slug, "deploy", { target: "production", dryRun });
}

/** Takes the preview or the live site off Cloudflare; the live one needs the short name typed again. */
export async function unpublish(slug, target) {
  if (target === "production") {
    const yes = await ask({ title: "Canlı siteyi kaldır", body: "Canlı site Cloudflare'den kaldırılacak; ziyaretçiler siteye ulaşamaz.\n\nMüşterinin dosyaları ve sürümleri durur, istediğinizde yeniden yayınlayabilirsiniz.", confirm: "Kaldır", danger: true, typeToConfirm: slug });
    if (yes) runTask(slug, "unpublish", { target, confirm: slug });
    return;
  }
  if (await ask({ title: "Önizlemeyi kaldır", body: "Önizleme adresi kapatılacak; müşteriye gönderdiğiniz link çalışmaz.", confirm: "Kaldır", danger: true })) runTask(slug, "unpublish", { target });
}

export async function archiveClient(slug, stage) {
  const liveNote = stage === "live" ? "\n\nDikkat: site yayında. Arşivlemek siteyi kapatmaz; önce Müşteri Bilgileri → Yayın → Yayından kaldır." : "";
  const yes = await ask({ title: "Müşteriyi arşivle", body: `"${slug}" listeden kalkar ve Arşiv'e taşınır. Silinmez; Arşiv'den geri getirilebilir.${liveNote}`, confirm: "Arşivle", danger: true, typeToConfirm: slug });
  if (!yes) return;
  const r = await guarded(() => api("DELETE", `/api/clients/${slug}`, { confirm: slug }));
  if (r) { toast(`${slug} arşivlendi (${r.folder}).`); location.hash = "#/"; }
}

/** Jobs that design with the client's logo: worth one look at the logo before paying for them. */
const LOGO_JOBS = new Set(["autopilot", "redesign", "from-library", "choose-concept", "brand-board", "concepts", "upgrade-template", "design-content"]);

export async function runAgent(slug, kind, payload) {
  askNotifyPermission();
  const d = state.detail?.status?.slug === slug ? state.detail : null;
  if (LOGO_JOBS.has(kind) && d?.logo && !payload?.allowSharedLogo) {
    const ok = await ask({
      title: "Bu logoyla tasarlanacak",
      image: `/api/clients/${slug}/assets/${encodeURIComponent(d.logo.replace(/^assets\//, ""))}`,
      body: `${d.business?.name || slug} için doğru logo bu mu? Yanlışsa Müşteri Bilgileri → Logo ve Görseller'den değiştiriniz; yanlış logoyla yapılan tasarım boşa kaynak harcar.`,
      confirm: "Doğru, devam et",
    });
    if (!ok) return false;
  }
  let job;
  try {
    job = await api("POST", `/api/clients/${slug}/agent/${kind}`, payload);
  } catch (e) {
    if (e.data?.code === "shared-logo") {
      const go = await ask({ title: "Logo başka bir müşteriye ait", body: `${e.message}\n\nBilerek aynı logoyu kullanıyorsanız devam edebilirsiniz.`, confirm: "Yine de devam et", danger: true });
      if (go) return runAgent(slug, kind, { ...payload, allowSharedLogo: true });
      return false;
    }
    toast(e.message, true);
    return false;
  }
  if (!job) return false;
  toast("İşlem başlatıldı. Tamamlandığında bildirim alacaksınız.");
  await jobStarted(job);
  return true;
}

export async function runTask(slug, kind, payload) {
  const job = await guarded(() => api("POST", `/api/clients/${slug}/${kind}`, payload));
  if (job) await jobStarted(job);
}

export async function jobStarted(job) {
  state.running = job;
  setStatus(job);
  const r = route();
  if (r.slug === job.slug && r.tab !== "akis") location.hash = `#/c/${job.slug}/akis`;
  else await render();
}

export async function cancelJob(id) {
  if (!(await ask({ title: "İşi durdur", body: "Çalışan agent işi durdurulacak. O ana kadar kaydedilenler kalır.", confirm: "Durdur", danger: true }))) return;
  await guarded(() => api("POST", `/api/jobs/${id}/cancel`));
}

export function startPolling() {
  clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(async () => {
    const j = state.running;
    if (!j || j.status !== "running") { state.pollTimer = null; return; }
    const next = await api("GET", `/api/jobs/${j.id}?since=${state.logSince}`).catch(() => null);
    if (!next) { startPolling(); return; }
    const lines = $("#live-lines");
    if (lines && next.log.length) appendLiveLines(lines, next.log);
    state.logSince = next.logTotal;
    if (next.status === "running") {
      state.running = { ...next, log: [] };
      const old = $("#job-progress");
      if (old && (old.dataset.phase !== String(next.phase) || old.dataset.files !== String(next.filesWritten || 0))) {
        const fresh = jobProgress(next);
        fresh.dataset.phase = String(next.phase);
        fresh.dataset.files = String(next.filesWritten || 0);
        old.replaceWith(fresh);
      }
      startPolling();
      return;
    }
    announceFinished(next);
    state.running = null;
    state.pollTimer = null;
    setStatus(null);
    toast(next.status === "succeeded" ? `${next.title}: tamamlandı.` : `${next.title}: ${STATUS_BADGE[next.status]?.[1] || next.status}.`, next.status !== "succeeded");
    render();
  }, POLL_MS);
}
