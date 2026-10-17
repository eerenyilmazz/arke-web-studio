// Archived clients: see them, bring one back, or delete it for good.
import { api, ask, guarded, h, time, toast } from "./core.js";
import { loadClients, render } from "./shell.js";

export async function renderArchive() {
  const data = await guarded(() => api("GET", "/api/archive"));
  const list = data?.archived || [];
  const head = h("div", { class: "dash-head" },
    h("div", {}, h("h1", { text: "Arşiv" }),
      h("p", { class: "muted", text: "Arşivlenen müşteriler burada durur: dosyaları, sürümleri ve onayları silinmez. Geri getirebilir ya da kalıcı olarak silebilirsiniz. Cloudflare'deki yayın arşivden etkilenmez; önce Yayından kaldır'ı kullanın." })));
  if (!list.length) return h("section", { class: "dash" }, head, h("div", { class: "card" }, h("p", { class: "muted", text: "Arşivde müşteri yok." })));
  return h("section", { class: "dash" }, head,
    h("div", { class: "archive-list" }, ...list.map((a) => h("article", { class: "card archive-item" },
      h("div", { class: "archive-main" },
        h("strong", { text: a.name }),
        h("span", { class: "muted small", text: [a.slug, a.industry, `arşivlendi ${time(a.archivedAt)}`].filter(Boolean).join(" · ") }),
        a.slugTaken ? h("span", { class: "badge warn", text: `"${a.slug}" adında yeni bir müşteri var; geri getirmeden önce onu arşivleyin` }) : null),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", disabled: a.slugTaken, onclick: async () => {
          if (!(await ask({ title: "Geri getir", body: `"${a.name}" müşteri listesine geri döner; dosyaları ve sürümleri olduğu gibi gelir.`, confirm: "Geri getir" }))) return;
          const r = await guarded(() => api("POST", `/api/archive/${a.id}/restore`));
          if (r) { toast(`${a.name} geri getirildi.`); await loadClients(); location.hash = `#/c/${r.slug}`; }
        } }, "Geri getir"),
        h("button", { class: "btn btn-danger", type: "button", onclick: async () => {
          const yes = await ask({ title: "Kalıcı olarak sil", body: `"${a.name}" ve bütün sürüm geçmişi, yüklenen dosyaları kalıcı olarak silinecek. Bu işlem geri alınamaz.\n\nCloudflare'deki yayın silinmez; yayındaysa önce kaldırın.`, confirm: "Kalıcı sil", danger: true, typeToConfirm: a.slug });
          if (!yes) return;
          const r = await guarded(() => api("DELETE", `/api/archive/${a.id}`, { confirm: a.slug }));
          if (r) { toast(`${a.name} kalıcı olarak silindi.`); render(); }
        } }, "Kalıcı sil")),
    ))));
}
