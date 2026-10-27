// Approvals from the panel: the dialog that asks for the terminal code, and the terminal alternative.
import { copyButton, h, toast } from "./core.js";
import { render } from "./router.js";

// ---------------------------------------------------------------- approval from the panel

/** Folded terminal alternative under an approval button. */
export function terminalFold(command) {
  return h(
    "details",
    { class: "small term-fold" },
    h("summary", { text: "Terminalden onaylamak istersen" }),
    h("div", { class: "cmd" }, h("code", { text: command }), copyButton(command)),
  );
}

/**
 * Asks for the one-time code printed in the panel's terminal and approves exactly what is on screen:
 * the content and build fingerprints go with the request, so a change in the meantime approves nothing.
 */
export function approveDialog(d, kind) {
  const slug = d.status.slug;
  const what = kind === "site" ? "Siteyi onayla (metin + görünüm)" : "Yayın onayı";
  const code = h("input", {
    id: "approve-code",
    inputmode: "numeric",
    autocomplete: "off",
    maxlength: 6,
    pattern: "[0-9]{6}",
    placeholder: "6 haneli kod",
    class: "code-input",
  });
  const err = h("p", { class: "err", role: "alert" });
  const dialog = h("dialog", { class: "approve-dialog", "aria-labelledby": "approve-title" });
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  const submit = async (e) => {
    e.preventDefault();
    err.textContent = "";
    const res = await fetch(`/api/clients/${slug}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, code: code.value, pins: { hash: d.status.contentHash, distHash: d.status.lastBuild?.distHash ?? null } }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      err.textContent = data.error || "Onay verilemedi.";
      code.select();
      return;
    }
    close();
    toast(kind === "site" ? "Site onaylandı." : "Yayın onayı verildi.");
    render();
  };
  dialog.append(
    h(
      "form",
      { method: "dialog", onsubmit: submit },
      h("h2", { id: "approve-title", text: what }),
      h("p", {
        class: "muted small",
        text: `${d.business.name || slug}: şu an ekranda gördüğün hâli onaylanır. Kod, paneli başlattığın terminalde "Onay kodu" satırında yazıyor.`,
      }),
      h("label", { for: "approve-code" }, "Onay kodu", code),
      err,
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn btn-ok", type: "submit" }, "Onayla"),
        h("button", { class: "btn", type: "button", onclick: close }, "Vazgeç"),
      ),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
  code.focus();
}
