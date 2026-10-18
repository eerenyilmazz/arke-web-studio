// Starting agent and factory jobs, their progress, polling and the finished-job notifications.
import { $, api, ask, guarded, h, ignoreOptional, POLL_MS, state, toast } from "./core.js";
import { appendLiveLines, STATUS_BADGE } from "./feed.js";
import { render, route, setStatus } from "./router.js";

// ---------------------------------------------------------------- job progress and notifications

export const PHASE_LABELS = {
  reading: "Bilgileri okuyor",
  saving: "Bilgileri kaydediyor",
  design: "Tasarımı araştırıyor",
  brand: "Markayı tasarlıyor",
  pages: "Sayfaları yazıyor",
  checking: "Kontrol ediyor",
};

export const PHASE_ORDER = ["reading", "saving", "design", "brand", "pages", "checking"];

export function fmtDuration(secs) {
  const m = Math.floor(secs / 60),
    s = Math.floor(secs % 60);
  return m ? `${m} dk ${s.toString().padStart(2, "0")} sn` : `${s} sn`;
}

/** Where a running agent job is: plain stages, elapsed time and a rough estimate from earlier runs. */
export function jobProgress(job) {
  const typical = (state.typical || {})[job.kind];
  const now = PHASE_ORDER.indexOf(job.phase);
  const el = h(
    "div",
    { class: "progress", id: "job-progress", "data-started": job.startedAt, "data-typical": typical || "" },
    h("ol", { class: "phases" }, ...PHASE_ORDER.map((p, i) => h("li", { class: i < now ? "done" : i === now ? "now" : "" }, PHASE_LABELS[p]))),
    h(
      "p",
      { class: "small muted" },
      h("span", { id: "job-elapsed", text: `Geçen süre ${fmtDuration((Date.now() - Date.parse(job.startedAt)) / 1000)}` }),
      job.filesWritten ? ` · ${job.filesWritten} dosya yazıldı` : "",
      job.skillsUsed?.length ? ` · skill: ${job.skillsUsed.join(", ")}` : "",
      typical ? ` · genelde ${fmtDuration(typical)} sürer` : "",
    ),
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
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch {
    /* no audio */
  }
}

/** A finished job: sound, a system notification when the panel is in the background, and the tab title. */
export function announceFinished(job) {
  const ok = job.status === "succeeded";
  const name = state.clients.find((c) => c.slug === job.slug)?.name || job.slug;
  chime(ok);
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification(ok ? `${name}: hazır` : `${name}: tamamlanamadı`, {
      body: `${job.title} ${ok ? "bitti. Panelde sonucu gör." : "başarısız oldu."}`,
      tag: job.id,
    });
  }
  if (document.hidden) {
    const original = "Site Factory";
    document.title = ok ? `✓ ${name} hazır · ${original}` : `✕ ${name} · ${original}`;
    const reset = () => {
      document.title = original;
      document.removeEventListener("visibilitychange", reset);
    };
    document.addEventListener("visibilitychange", reset);
  }
}

/** Jobs that design with the client's logo: worth one look at the logo before paying for them. */
const LOGO_JOBS = new Set(["create-site", "redesign", "from-library", "choose-concept", "brand-board", "concepts", "upgrade-template", "design-content"]);

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
      const go = await ask({
        title: "Logo başka bir müşteriye ait",
        body: `${e.message}\n\nBilerek aynı logoyu kullanıyorsanız devam edebilirsiniz.`,
        confirm: "Yine de devam et",
        danger: true,
      });
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
  if (r.slug === job.slug && r.tab !== "duzenle") location.hash = `#/musteri/${job.slug}/duzenle`; // the job feed is on Düzenleme
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
    if (!j || j.status !== "running") {
      state.pollTimer = null;
      return;
    }
    const next = await api("GET", `/api/jobs/${j.id}?since=${state.logSince}`).catch(() => null);
    if (!next) {
      startPolling();
      return;
    }
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
    toast(
      next.status === "succeeded" ? `${next.title}: tamamlandı.` : `${next.title}: ${STATUS_BADGE[next.status]?.[1] || next.status}.`,
      next.status !== "succeeded",
    );
    render();
  }, POLL_MS);
}
