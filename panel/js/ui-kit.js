// Small shared controls: a switch, option cards (radio as cards) and the editor's sticky action bar.
import { h, isBusy } from "./core.js";

/** A checkbox drawn as a switch; the input stays a real checkbox (role=switch) for keyboards and screen readers. */
export function switchInput({ id, checked = false, disabled = false, label }) {
  const input = h("input", { type: "checkbox", role: "switch", id, checked, disabled, class: "switch-input", "aria-label": label || null });
  return { input, el: h("span", { class: "switch" }, input, h("span", { class: "switch-track", "aria-hidden": "true" })) };
}

/**
 * Radio buttons drawn as cards with a title and one line of explanation. `options`: {value, label, desc?, badge?,
 * disabled?}. Returns the element and a value() reader; onChange gets the new value.
 */
export function optionCards({ name, options, value, onChange, label, columns = 2, idPrefix = name }) {
  let current = value;
  const group = h("div", { class: `opt-cards cols-${columns}`, role: "radiogroup", "aria-label": label || null });
  for (const o of options) {
    const input = h("input", {
      type: "radio",
      name,
      value: o.value,
      id: `${idPrefix}-${o.value || "default"}`,
      checked: o.value === current,
      disabled: o.disabled,
      class: "sr-only",
    });
    input.addEventListener("change", () => {
      current = o.value;
      onChange?.(current);
    });
    group.append(
      h(
        "label",
        { class: `opt-card${o.disabled ? " is-disabled" : ""}`, for: input.id },
        input,
        h("span", { class: "opt-dot", "aria-hidden": "true" }),
        h(
          "span",
          { class: "opt-text" },
          h("span", { class: "opt-title" }, h("span", { text: o.label }), o.badge ? h("span", { class: "opt-badge", text: o.badge }) : null),
          o.desc ? h("span", { class: "opt-desc", text: o.desc }) : null,
        ),
      ),
    );
  }
  return { el: group, value: () => current };
}

/**
 * The bar under an editor: how many changes there are (or what blocks saving) on the left, "Vazgeç" and the apply
 * button on the right. set(count, problem) updates both; apply stays off while nothing changed or something is wrong.
 */
export function actionBar({ applyLabel, onApply, onReset, extra = null }) {
  const status = h("span", { class: "qe-status", role: "status", "aria-live": "polite", text: "Değişiklik yok" });
  const reset = h("button", { class: "btn btn-ghost", type: "button", disabled: true, onclick: () => onReset?.() }, "Vazgeç");
  const apply = h("button", { class: "btn btn-primary", type: "button", disabled: true }, applyLabel);
  apply.addEventListener("click", () => onApply(apply));
  const set = (count, problem = "") => {
    status.textContent = problem || (count ? `${count} değişiklik` : "Değişiklik yok");
    status.classList.toggle("is-problem", Boolean(problem));
    status.classList.toggle("is-dirty", Boolean(count) && !problem);
    reset.disabled = !count;
    apply.disabled = isBusy() || !count || Boolean(problem);
  };
  const el = h("footer", { class: "qe-foot" }, status, h("div", { class: "qe-actions" }, extra, onReset ? reset : null, apply));
  return { el, set, apply };
}
