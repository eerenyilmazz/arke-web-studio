// Quick-edit editors for texts, contact details and the contact form. Same requests as before; only the screens
// changed: grouped fields, live checks, a change counter and one action bar.
import { api, ask, guarded, h, ICON, isBusy, svg, toast } from "./core.js";
import { editorShell, PAGE_TR, submitEdit } from "./edit-core.js";
import { jobStarted, runAgent } from "./jobs.js";
import { actionBar } from "./ui-kit.js";

// ---------------------------------------------------------------- texts by id

const TEXT_KIND_TR = {
  title: "Sekme başlığı",
  meta: "Arama açıklaması",
  alt: "Görsel açıklaması",
  h1: "Ana başlık",
  h2: "Başlık",
  h3: "Alt başlık",
  h4: "Alt başlık",
  h5: "Alt başlık",
  h6: "Alt başlık",
  p: "Paragraf",
  li: "Liste",
  a: "Bağlantı",
  button: "Buton",
  span: "Kısa metin",
  strong: "Vurgu",
  em: "Vurgu",
  small: "Küçük metin",
  label: "Form etiketi",
  figcaption: "Görsel yazısı",
  blockquote: "Alıntı",
  td: "Tablo",
  th: "Tablo başlığı",
  dt: "Terim",
  dd: "Açıklama",
  field: "Alan",
};
/** Lengths search engines show in full; longer texts still save, the counter only warns. */
const TEXT_LIMITS = { title: 60, meta: 160 };

const grow = (area) => {
  area.style.height = "auto";
  area.style.height = `${area.scrollHeight + 2}px`;
};

/**
 * Every text of a page, each with its id (h1-1, p-3, meta-description…). The operator edits in place; the panel writes
 * the changes itself and rebuilds (no agent, no tokens). Only changed texts are sent.
 */
export async function textEditor(d, back) {
  const slug = d.status.slug;
  const holder = h(
    "div",
    { class: "qe-editor-slot" },
    editorShell({ title: "Metin", back, body: h("p", { class: "qe-empty", text: "Metinler yükleniyor…" }) }),
  );
  const load = async (page) => {
    const data = await guarded(() => api("GET", `/api/clients/${slug}/texts${page ? `?page=${encodeURIComponent(page)}` : ""}`));
    if (data) holder.replaceChildren(textBody(d, data, back, load));
  };
  load(null);
  return holder;
}

function textBody(d, data, back, load) {
  const slug = d.status.slug;
  const pageSel = data.pages.length
    ? h(
        "select",
        { id: "tx-page", onchange: () => load(pageSel.value) },
        ...data.pages.map((pg) => h("option", { value: pg, selected: pg === data.page }, PAGE_TR[pg] || pg)),
      )
    : null;
  const search = h("input", { type: "search", id: "tx-q", placeholder: "Metinlerde ara…" });
  const onlyChanged = h("input", { type: "checkbox", id: "tx-changed" });
  const shown = h("span", { class: "muted small tx-count" });
  const isChanged = (r) => r.area.value.trim() !== r.it.text.trim();
  const rows = data.items.map((it) => {
    const area = h("textarea", { rows: 1, maxlength: 4000, "aria-label": `${it.id} metni` });
    area.value = it.text;
    const limit = TEXT_LIMITS[it.kind];
    const counter = limit ? h("span", { class: "tx-counter" }) : null;
    const reset = h(
      "button",
      { type: "button", class: "icon-btn tx-reset", "aria-label": "Eski metne dön", title: "Eski metne dön", hidden: true },
      svg(ICON.undo, 14, 2),
    );
    const row = h(
      "div",
      { class: "tx-row" },
      h(
        "div",
        { class: "tx-meta" },
        h("span", { class: "tx-kind", text: TEXT_KIND_TR[it.kind] || it.kind }),
        h("code", { text: it.id }),
        h("span", { class: "tx-right" }, counter, reset),
      ),
      area,
    );
    const update = () => {
      const changed = area.value.trim() !== it.text.trim();
      row.classList.toggle("changed", changed);
      reset.hidden = !changed;
      if (counter) {
        counter.textContent = `${area.value.length} / ${limit}`;
        counter.classList.toggle("over", area.value.length > limit);
      }
    };
    area.addEventListener("input", () => {
      update();
      grow(area);
      count();
    });
    reset.addEventListener("click", () => {
      area.value = it.text;
      update();
      grow(area);
      count();
    });
    update();
    return { it, area, row };
  });
  const filter = () => {
    const q = search.value.toLocaleLowerCase("tr");
    let n = 0;
    for (const r of rows) {
      r.row.hidden = (Boolean(q) && !`${r.it.id} ${r.it.text} ${r.area.value}`.toLocaleLowerCase("tr").includes(q)) || (onlyChanged.checked && !isChanged(r));
      if (!r.row.hidden) n++;
    }
    shown.textContent = `${n} metin`;
  };
  const translate = data.otherLocales?.length
    ? h(
        "button",
        {
          class: "btn btn-ghost",
          type: "button",
          disabled: isBusy(),
          onclick: async () => {
            if (
              await ask({
                title: "Diğer dilleri güncelle",
                body: `${data.otherLocales.join(", ")} sayfaları, varsayılan dildeki son hâle göre yeniden çevrilir (daha ucuz modelle). Tasarım değişmez.`,
                confirm: "Güncelle",
              })
            )
              runAgent(slug, "translate", {});
          },
        },
        "Diğer dilleri güncelle",
      )
    : null;
  const bar = actionBar({
    applyLabel: "Değişiklikleri Uygula",
    extra: translate,
    onApply: (btn) =>
      submitEdit(
        slug,
        "text",
        { page: data.page, changes: rows.filter(isChanged).map((r) => ({ id: r.it.id, oldText: r.it.text, newText: r.area.value })) },
        btn,
      ),
    onReset: () => {
      for (const r of rows) {
        r.area.value = r.it.text;
        r.area.dispatchEvent(new Event("input"));
      }
    },
  });
  const count = () => {
    bar.set(rows.filter(isChanged).length);
    if (onlyChanged.checked) filter();
  };
  search.addEventListener("input", filter);
  onlyChanged.addEventListener("change", filter);
  filter();
  queueMicrotask(() => rows.forEach((r) => grow(r.area)));
  const note =
    data.source === "site"
      ? `Sayfadaki bütün metinler, kimlikleriyle. Değiştirdikleriniz doğrudan yazılır, agent çalışmaz.${data.otherLocales?.length ? ` Diğer dillerdeki (${data.otherLocales.join(", ")}) karşılıkları değişmez.` : ""}`
      : "Sitenin bütün metin alanları, kimlikleriyle (ör. seo.home.description). Değiştirdikleriniz kaydedilir ve site yeniden oluşturulur.";
  const body = h(
    "div",
    { class: "stack-sm" },
    h(
      "div",
      { class: "qe-toolbar tx-tools" },
      pageSel && h("label", { for: "tx-page", class: "sr-only" }, "Sayfa"),
      pageSel,
      h("label", { for: "tx-q", class: "sr-only" }, "Ara"),
      search,
      h("label", { for: "tx-changed", class: "check tx-only" }, onlyChanged, "Sadece değişenler"),
      shown,
    ),
    rows.length ? h("div", { class: "tx-list" }, ...rows.map((r) => r.row)) : h("p", { class: "qe-empty", text: "Bu sayfada metin bulunamadı." }),
  );
  return editorShell({ title: "Metin", note, back, body, bar: bar.el });
}

// ---------------------------------------------------------------- contact details

/** Phone, WhatsApp, e-mail, address and hours, fixed straight from the panel. */
export function contactEditor(d, back) {
  const slug = d.status.slug;
  const c = d.contact || {};
  const start = { phone: c.phone || "", whatsapp: d.whatsapp || "", email: c.email || "", address: c.address || "", hours: c.hours || "" };
  const inputs = {};
  const field = (id, label, help, attrs = {}, tag = "input") => {
    const input = h(tag, { id: `qe-${id}`, name: id, ...(tag === "input" ? { value: start[id] } : { rows: 2 }), ...attrs });
    if (tag === "textarea") input.value = start[id];
    inputs[id] = input;
    return h(
      "label",
      { for: input.id, class: "qe-field" },
      h("span", { class: "qe-field-label", text: label }),
      input,
      help ? h("span", { class: "help", text: help }) : null,
    );
  };
  const form = h(
    "form",
    {
      class: "stack",
      id: "contact-edit",
      novalidate: true,
      onsubmit: (e) => e.preventDefault(),
      oninput: () => refresh(),
    },
    h(
      "fieldset",
      { class: "qe-group" },
      h("legend", { text: "Telefon ve WhatsApp" }),
      h(
        "div",
        { class: "two" },
        field("phone", "Telefon", "0 ile yazabilirsiniz; ülke koduna çevrilir.", { type: "tel", autocomplete: "off", maxlength: 40 }),
        field("whatsapp", "WhatsApp", "Boş bırakılırsa WhatsApp butonu kalkar.", { type: "tel", autocomplete: "off", maxlength: 40 }),
      ),
    ),
    h(
      "fieldset",
      { class: "qe-group" },
      h("legend", { text: "E-posta ve adres" }),
      field("email", "E-posta", "Boş bırakılırsa mevcut adres kalır.", { type: "email", maxlength: 120 }),
      field("address", "Adres", null, { maxlength: 300 }, "textarea"),
      field("hours", "Çalışma saatleri", "Ör. Hafta içi 09:00–18:00, Cumartesi 10:00–14:00", { maxlength: 300 }),
    ),
  );
  const bar = actionBar({
    applyLabel: "Kaydet ve siteye uygula",
    onApply: async (btn) => {
      btn.disabled = true;
      const job = await guarded(() => api("POST", `/api/clients/${slug}/quick-edit`, Object.fromEntries(new FormData(form).entries())));
      btn.disabled = false;
      if (job) {
        toast("Kaydedildi; site güncelleniyor.");
        await jobStarted(job);
      }
    },
    onReset: () => {
      for (const [k, el] of Object.entries(inputs)) el.value = start[k];
      refresh();
    },
  });
  const refresh = () => {
    const changed = Object.entries(inputs).filter(([k, el]) => el.value.trim() !== start[k].trim());
    for (const [k, el] of Object.entries(inputs)) el.closest(".qe-field").classList.toggle("changed", el.value.trim() !== start[k].trim());
    const badEmail = inputs.email.value.trim() && !inputs.email.checkValidity();
    const badPhone = ["phone", "whatsapp"].find((k) => inputs[k].value.trim() && !/^[+()\d\s.-]{6,}$/.test(inputs[k].value.trim()));
    inputs.email.setAttribute("aria-invalid", String(Boolean(badEmail)));
    for (const k of ["phone", "whatsapp"]) inputs[k].setAttribute("aria-invalid", String(badPhone === k));
    bar.set(changed.length, badEmail ? "E-posta adresi geçersiz" : badPhone ? "Telefon numarası geçersiz" : "");
  };
  refresh();
  return editorShell({
    title: "İletişim Bilgileri",
    note: "Sitenin her yerinde (üst menü, alt bilgi, iletişim sayfası, butonlar) güncellenir.",
    back,
    body: form,
    bar: bar.el,
  });
}

// ---------------------------------------------------------------- contact form

/** Form services the factory accepts (src/lib/site/form.ts FORM_ACTION), with where to get the address. */
export const PROVIDERS = [
  { name: "Formspree", test: /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]{4,20}$/, url: "https://formspree.io", example: "https://formspree.io/f/abcd1234" },
  { name: "Getform", test: /^https:\/\/getform\.io\/f\/[A-Za-z0-9-]{4,40}$/, url: "https://getform.io", example: "https://getform.io/f/abcd-1234" },
  {
    name: "FormSubmit",
    test: /^https:\/\/formsubmit\.co\/[A-Za-z0-9@._+-]{4,80}$/,
    url: "https://formsubmit.co",
    example: "https://formsubmit.co/ornek@firma.com",
  },
  { name: "Web3Forms", test: /^https:\/\/api\.web3forms\.com\/submit$/, url: "https://web3forms.com", example: "https://api.web3forms.com/submit", key: true },
];
const WEB3FORMS_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The operator pastes the endpoint of a free form service; only they can set it, the agent only uses it. */
export function formEditor(d, back) {
  const slug = d.status.slug;
  let saved = d.status.contactForm || null;
  const action = h("input", {
    type: "text",
    id: "fm-action",
    placeholder: "https://formspree.io/f/abcd1234",
    value: saved?.action || "",
    maxlength: 200,
    spellcheck: "false",
  });
  const key = h("input", {
    type: "text",
    id: "fm-key",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    value: saved?.accessKey || "",
    maxlength: 60,
    spellcheck: "false",
  });
  const keyField = h("label", { for: "fm-key", class: "qe-field" }, h("span", { class: "qe-field-label", text: "Erişim anahtarı (access key)" }), key);
  const detected = h("p", { class: "fm-detected small", "aria-live": "polite" });
  const steps = h("ol", { class: "fm-steps" });
  const save = h("button", { class: "btn", type: "button" }, "Adresi Kaydet");
  const remove = h("button", { class: "btn btn-ghost", type: "button" }, "Adresi Kaldır");
  const add = h("button", { class: "btn btn-primary", type: "button" }, "Siteye formu ekle");
  const footStatus = h("span", { class: "qe-status", role: "status" });
  const provider = () => PROVIDERS.find((p) => p.test.test(action.value.trim()));
  const draw = () => {
    const p = provider();
    const typed = action.value.trim();
    keyField.hidden = !p?.key;
    detected.className = `fm-detected small ${typed && !p ? "is-problem" : p ? "is-ok" : ""}`;
    detected.textContent = !typed
      ? "Desteklenenler: Formspree, Getform, FormSubmit, Web3Forms."
      : p
        ? `${p.name} adresi tanındı.`
        : "Bu adres tanınmadı. Örnek: https://formspree.io/f/abcd1234";
    const keyOk = !p?.key || WEB3FORMS_KEY.test(key.value.trim());
    const same = saved && saved.action === typed && (saved.accessKey || "") === (p?.key ? key.value.trim() : "");
    save.disabled = !p || !keyOk || same;
    remove.hidden = !saved;
    add.disabled = isBusy() || !saved || !same;
    footStatus.textContent = !saved ? "Önce adresi kaydedin" : same ? "Adres kayıtlı" : "Değişikliği kaydedin";
    const state = [true, Boolean(saved), false];
    const labels = [
      ["Servisi açın", "Ücretsiz bir form servisinde, müşterinin e-postasıyla bir form oluşturun."],
      ["Adresi kaydedin", saved ? `Kayıtlı: ${saved.action}` : "Servisin verdiği adresi aşağıya yapıştırın."],
      ["Siteye ekleyin", "Form iletişim sayfasına sitenin tasarımıyla eklenir; mesajlar doğrudan müşteriye gider."],
    ];
    steps.replaceChildren(
      ...labels.map(([t, s], i) =>
        h(
          "li",
          { class: state[i] ? "done" : i === state.indexOf(false) ? "now" : "" },
          h("span", { class: "fm-mark", "aria-hidden": "true" }, state[i] ? svg(ICON.check, 13, 3) : String(i + 1)),
          h("span", {}, h("strong", { text: t }), h("span", { class: "muted small", text: s, "data-no-i18n": i === 1 && saved ? "" : null })),
        ),
      ),
    );
  };
  const put = async (body) => {
    const r = await guarded(() => api("PUT", `/api/clients/${slug}/form`, body));
    if (!r) return;
    saved = r.form;
    d.status.contactForm = r.form;
    if (!r.form) action.value = key.value = "";
    toast(r.form ? "Form adresi kaydedildi. Şimdi 'Siteye formu ekle'ye basın." : "Form adresi kaldırıldı.");
    draw();
  };
  save.addEventListener("click", () => put({ action: action.value.trim(), accessKey: key.value.trim() }));
  remove.addEventListener("click", () => put({ action: "", accessKey: "" }));
  add.addEventListener("click", () => submitEdit(slug, "form", {}, add));
  action.addEventListener("input", draw);
  key.addEventListener("input", draw);
  draw();
  const services = h(
    "p",
    { class: "muted small" },
    "Servisler: ",
    ...PROVIDERS.flatMap((p, i) => [i ? ", " : "", h("a", { href: p.url, target: "_blank", rel: "noopener", text: p.name, "data-no-i18n": "" })]),
    ".",
  );
  const body = h(
    "div",
    { class: "stack" },
    steps,
    h(
      "fieldset",
      { class: "qe-group" },
      h("legend", { text: "Form adresi" }),
      h("label", { for: "fm-action", class: "qe-field" }, h("span", { class: "qe-field-label", text: "Adres" }), action, detected),
      keyField,
      services,
      h("div", { class: "row" }, save, remove),
    ),
  );
  return editorShell({
    title: "İletişim Formu",
    note: "Sitede çalışan bir iletişim formu. Form adresini yalnızca siz girersiniz; agent sadece bu adresi kullanır.",
    back,
    body,
    bar: h("footer", { class: "qe-foot" }, footStatus, h("div", { class: "qe-actions" }, add)),
  });
}
