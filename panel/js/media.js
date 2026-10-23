// The client's logo and images: a logo slot, a grid of images with their state, and an upload tile. Used in
// Hızlı Düzenleme (Logo ve Görseller) and in Müşteri Bilgileri (Görseller). The operator picks the logo, never the agent.
import { api, ask, guarded, h, ICON, isBusy, svg, toast } from "./core.js";

const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/svg+xml";
const fileUrl = (slug, from, name) => `/api/clients/${slug}/${from}/${encodeURIComponent(name)}`;
const kb = (bytes) => `${Math.max(1, Math.ceil(bytes / 1024))} KB`;

/** Logo slot, image grid and upload. `bare` leaves out the card frame (the quick-edit editor has its own). */
export function mediaEditor(slug, inbox, assets = [], logo = null, { bare = false } = {}) {
  let current = { inbox, assets, logo };
  const logoSlot = h("div", { class: "media-logo" });
  const grid = h("ul", { class: "media-grid", role: "list" });
  const input = h("input", { type: "file", multiple: true, accept: ACCEPT, id: "files", class: "sr-only" });

  const rowsOf = () => [
    ...current.assets.map((f) => ({ ...f, from: "assets", state: "Sitede" })),
    ...current.inbox
      .filter((f) => !current.assets.some((a) => a.name === f.name || a.name.endsWith(`-${f.name}`)))
      .map((f) => ({ ...f, from: "inbox", state: "Bekliyor" })),
  ];

  const drawLogo = () => {
    const name = current.logo?.replace(/^assets\//, "");
    logoSlot.replaceChildren(
      h(
        "div",
        { class: `media-logo-frame${name ? "" : " is-empty"}` },
        name ? h("img", { src: fileUrl(slug, "assets", name), alt: "Müşteri logosu" }) : h("span", { class: "muted small", text: "Logo yok" }),
      ),
      h(
        "div",
        { class: "media-logo-text" },
        h("strong", { text: name ? "Müşteri logosu" : "Logo seçilmedi" }),
        h("span", {
          class: "muted small",
          text: name
            ? "Marka bu logoya göre. Logo değişirse Marka Kimliği'nden markayı yeniden tasarlayın."
            : "Agent işletme adıyla bir yazı logosu çizer. Bir görselin üzerindeki 'Logo olarak kullan' ile seçin.",
        }),
        name
          ? h("div", {}, h("button", { class: "btn btn-sm btn-ghost", type: "button", disabled: isBusy(), onclick: () => removeLogo() }, "Logoyu kaldır"))
          : null,
      ),
    );
  };

  const tile = (f) => {
    const isLogo = current.logo === `assets/${f.name}`;
    return h(
      "li",
      { class: `media-tile${isLogo ? " is-logo" : ""}` },
      h(
        "div",
        { class: "media-thumb" },
        h("img", { src: fileUrl(slug, f.from, f.name), alt: "", loading: "lazy" }),
        h("span", { class: `media-state ${f.from === "assets" ? "is-live" : "is-wait"}`, text: isLogo ? "Logo" : f.state }),
      ),
      h(
        "div",
        { class: "media-meta" },
        h("span", { class: "media-name", text: f.name, title: f.name, "data-no-i18n": "" }),
        h("span", { class: "muted small", text: kb(f.bytes) }),
      ),
      h(
        "div",
        { class: "media-actions" },
        isLogo ? null : h("button", { class: "btn btn-sm", type: "button", disabled: isBusy(), onclick: () => useAsLogo(f) }, "Logo olarak kullan"),
        isLogo
          ? null
          : h(
              "button",
              { class: "icon-btn", type: "button", disabled: isBusy(), "aria-label": `${f.name} dosyasını sil`, title: "Sil", onclick: () => removeFile(f) },
              svg(ICON.trash, 15, 2),
            ),
      ),
    );
  };

  const draw = () => {
    drawLogo();
    grid.replaceChildren(
      ...rowsOf().map(tile),
      h(
        "li",
        { class: "media-tile media-add" },
        h(
          "label",
          { for: "files", class: "media-drop" },
          svg(ICON.upload, 20, 1.8),
          h("strong", { text: "Görsel yükle" }),
          h("span", { class: "muted small", text: "Sürükleyin ya da seçin" }),
        ),
      ),
    );
  };

  const useAsLogo = async (f) => {
    let r;
    try {
      r = await api("POST", `/api/clients/${slug}/logo`, { name: f.name, from: f.from });
    } catch (e) {
      if (e.data?.code !== "shared-logo") {
        toast(e.message, true);
        return;
      }
      const go = await ask({
        title: "Bu logo başka bir müşteride",
        image: fileUrl(slug, f.from, f.name),
        body: `${e.message}\n\nBilerek aynı logoyu kullanıyorsanız devam edebilirsiniz.`,
        confirm: "Yine de kullan",
        danger: true,
      });
      if (!go) return;
      r = await guarded(() => api("POST", `/api/clients/${slug}/logo`, { name: f.name, from: f.from, force: true }));
    }
    if (!r) return;
    current = {
      ...current,
      logo: r.logo,
      assets: current.assets.some((a) => a.name === r.logo.slice(7)) ? current.assets : [...current.assets, { name: r.logo.slice(7), bytes: f.bytes }],
    };
    draw();
    toast("Logo kaydedildi. Marka eski logoya göre; Marka Kimliği sekmesinden 'Marka Kimliğiyle Yeniden Tasarla' ile yeni logoya göre yenileyiniz.");
  };
  const removeLogo = async () => {
    const sure = await ask({
      title: "Logo kaldırılsın mı?",
      body: "Bu dosya artık logo olarak kullanılmaz; bir sonraki tasarım işinde agent işletme adıyla bir yazı logosu çizer. Dosya silinmez, görseller arasında kalır.",
      confirm: "Logoyu kaldır",
    });
    if (!sure) return;
    const r = await guarded(() => api("DELETE", `/api/clients/${slug}/logo`));
    if (!r) return;
    current = { ...current, logo: null };
    draw();
    toast("Logo kaldırıldı. Markayı yazı logosuyla yenilemek için Marka Kimliği → 'Marka Kimliğiyle Yeniden Tasarla'.");
  };
  const removeFile = async (f) => {
    const sure = await ask({ title: "Dosya silinsin mi?", body: `${f.name} silinecek.`, confirm: "Sil", danger: true });
    if (!sure) return;
    const r = await guarded(() => api("DELETE", fileUrl(slug, f.from, f.name)));
    if (!r) return;
    current = { ...current, inbox: r.inbox, assets: r.assets };
    draw();
    toast("Dosya silindi.");
  };
  const upload = async (files) => {
    let ok = 0;
    for (const file of files) {
      const res = await guarded(() => api("PUT", `/api/clients/${slug}/inbox/${encodeURIComponent(file.name)}`, file, true));
      if (res) {
        ok++;
        current = { ...current, inbox: res.inbox };
        draw();
      }
    }
    // Only report what really arrived; failures already showed their own error.
    if (ok) toast(`${ok} dosya yüklendi. Logoysa üzerindeki "Logo olarak kullan"a basın.`);
  };
  input.addEventListener("change", () => upload([...input.files]));
  const zone = h("div", { class: "media-zone" }, logoSlot, grid, input);
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("over");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    upload([...e.dataTransfer.files]);
  });
  draw();
  const note = h("p", { class: "muted small", text: "PNG, JPG, WebP, AVIF ya da SVG. Dosya içeriği kontrol edilir; zararlı SVG reddedilir." });
  if (bare) return h("div", { class: "stack-sm" }, zone, note);
  return h("section", { class: "card media-card" }, h("h2", { text: "Dosyalar" }), note, zone);
}

/** The card form, as Müşteri Bilgileri uses it. */
export const uploadCard = (slug, inbox, assets, logo) => mediaEditor(slug, inbox, assets, logo);
