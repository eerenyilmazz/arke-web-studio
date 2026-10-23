// What every quick-edit editor shares: page names, the request that runs an edit, and the editor frame.
import { api, guarded, h, ICON, svg, toast } from "./core.js";
import { jobStarted } from "./jobs.js";

export const PAGE_TR = { home: "Ana sayfa", about: "Hakkımızda", services: "Hizmetler", gallery: "Galeri", contact: "İletişim" };

/** Runs one structured edit; the panel turns the form into an exact instruction (or saves it itself). */
export async function submitEdit(slug, type, payload, button) {
  button.disabled = true;
  const job = await guarded(() => api("POST", `/api/clients/${slug}/edit/${type}`, payload));
  button.disabled = false;
  if (job) {
    toast("Değişiklik başladı; bitince ses ve bildirim gelir.");
    await jobStarted(job);
  }
}

/** The frame every editor shares: back link, title and note, the body, and the action bar. */
export function editorShell({ title, note, back, body, bar }) {
  return h(
    "div",
    { class: "qe-editor edit-form" },
    h(
      "header",
      { class: "qe-head" },
      h("button", { type: "button", class: "qe-back", onclick: back }, svg(ICON.chevronLeft, 16, 2), h("span", { text: "Hızlı Düzenleme" })),
      h("h3", { text: title, tabindex: "-1" }),
      note ? h("p", { class: "muted small", text: note }) : null,
    ),
    h("div", { class: "qe-body" }, body),
    bar || null,
  );
}
