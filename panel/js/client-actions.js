// Actions on one client that need a confirmation: preview, publish, unpublish, archive.
import { api, ask, guarded, state, toast } from "./core.js";
import { runTask } from "./jobs.js";

// ---------------------------------------------------------------- actions

export async function openPreview(slug) {
  const r = await guarded(() => api("POST", `/api/clients/${slug}/preview`));
  if (r) window.open(r.url, "_blank", "noopener");
}

export async function deployProduction(slug, dryRun) {
  if (!dryRun) {
    // Publishing before any payment is the operator's call, but never by accident.
    const pay = state.detail?.status?.slug === slug ? state.detail.businessTracking?.payment : null;
    const unpaid = !pay || pay === "none" || pay === "quoted";
    const body = unpaid
      ? `${slug} gerçek adresinde yayına alınacak.\n\nDikkat: bu müşteriden henüz kapora ya da ödeme alınmadı (İş Takibi). Ödeme gelince yayına almak isteyebilirsiniz.`
      : `${slug} gerçek adresinde yayına alınacak. Ziyaretçiler bu hâli görür.`;
    if (
      !(await ask({ title: unpaid ? "Ödeme alınmadan canlıya al" : "Canlıya al", body, confirm: unpaid ? "Yine de canlıya al" : "Canlıya al", danger: true }))
    )
      return;
  }
  runTask(slug, "deploy", { target: "production", dryRun });
}

/** Takes the preview or the live site off Cloudflare; the live one needs the short name typed again. */
export async function unpublish(slug, target) {
  if (target === "production") {
    const yes = await ask({
      title: "Canlı siteyi kaldır",
      body: "Canlı site Cloudflare'den kaldırılacak; ziyaretçiler siteye ulaşamaz.\n\nMüşterinin dosyaları ve sürümleri durur, istediğinizde yeniden yayınlayabilirsiniz.",
      confirm: "Kaldır",
      danger: true,
      typeToConfirm: slug,
    });
    if (yes) runTask(slug, "unpublish", { target, confirm: slug });
    return;
  }
  if (await ask({ title: "Önizlemeyi kaldır", body: "Önizleme adresi kapatılacak; müşteriye gönderdiğiniz link çalışmaz.", confirm: "Kaldır", danger: true }))
    runTask(slug, "unpublish", { target });
}

export async function archiveClient(slug, stage) {
  const liveNote = stage === "live" ? "\n\nDikkat: site yayında. Arşivlemek siteyi kapatmaz; önce Müşteri Bilgileri → Yayın → Yayından kaldır." : "";
  const yes = await ask({
    title: "Müşteriyi arşivle",
    body: `"${slug}" listeden kalkar ve Arşiv'e taşınır. Silinmez; Arşiv'den geri getirilebilir.${liveNote}`,
    confirm: "Arşivle",
    danger: true,
    typeToConfirm: slug,
  });
  if (!yes) return;
  const r = await guarded(() => api("DELETE", `/api/clients/${slug}`, { confirm: slug }));
  if (r) {
    toast(`${slug} arşivlendi (${r.folder}).`);
    location.hash = "#/";
  }
}

/** The previous Cloudflare version back on the preview or live site; the live one asks for the slug. */
export async function rollbackSite(slug, target) {
  const live = target === "production";
  const yes = await ask({
    title: live ? "Canlı siteyi önceki sürüme döndür" : "Önizlemeyi önceki sürüme döndür",
    body: `${live ? "Canlı sitede" : "Önizlemede"} bir önceki yayın geri gelir (birkaç saniye sürer). Bilgisayarındaki dosyalar değişmez; düzelttikten sonra yeniden yayınlayabilirsin.`,
    confirm: "Önceki sürüme dön",
    danger: live,
    ...(live ? { typeToConfirm: slug } : {}),
  });
  if (yes) runTask(slug, "rollback", { target, ...(live ? { confirm: slug } : {}) });
}
