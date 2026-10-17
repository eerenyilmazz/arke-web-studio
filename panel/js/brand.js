// Brand board (Marka Kimliği).
import { api, guarded, h, isBusy, svg, toast } from "./core.js";
import { inline } from "./feed.js";
import { conceptsCard } from "./info.js";
import { libraryControls } from "./library.js";
import { runAgent } from "./shell.js";

// ---------------------------------------------------------------- brand board (Marka Atölyesi)

export const PALETTE_TR = { primary: "Ana renk", secondary: "İkincil", accent: "Vurgu", background: "Zemin", text: "Yazı" };
export const BOARD_MISSING_TR = [
  [/^tagline/, "Slogan"],
  [/^signature:/, "İmza hareketi (adı ve fikri)"],
  [/signature\.html/, "İmza hareketinin canlı demosu"],
  [/^typeSample/, "Tipografi örneği"],
];
export const FONT_NAME = /^[A-Za-z0-9 ]{2,60}$/;
export const HEX6 = /^#[0-9a-f]{6}$/i;

/** Relative luminance, to pick readable text on a brand colour. */
export function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Dark or light text, whichever has the higher contrast on this colour. */
export function inkOn(hex) {
  const l = luminance(hex);
  const dark = (l + 0.05) / (luminance("#151719") + 0.05);
  const light = (luminance("#F4F3EF") + 0.05) / (l + 0.05);
  return dark >= light ? "#151719" : "#F4F3EF";
}

/** Loads the brand's Google Fonts into the panel (names are checked: letters, digits and spaces only). */
export function loadBoardFonts(names) {
  const families = [...new Set(names.filter((n) => typeof n === "string" && FONT_NAME.test(n)))];
  if (!families.length) return;
  const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700`).join("&")}&display=swap`;
  if (document.querySelector(`link[data-board-fonts="${CSS.escape(href)}"]`)) return;
  document.head.append(h("link", { rel: "stylesheet", href, "data-board-fonts": href }));
}
export const fontStack = (name, fallback) => (typeof name === "string" && FONT_NAME.test(name) ? `"${name}", ${fallback}` : fallback);

/**
 * The signature demo, written by the agent, runs in a sandboxed frame: scripts yes, same origin no (it cannot
 * read the panel, its cookie or its API), and a CSP that blocks every network request except Google Fonts.
 */
export function signatureFrame(html, title) {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:">`;
  const doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${csp}`) : `${csp}${html}`;
  return h("iframe", { class: "sig-frame", title, sandbox: "allow-scripts", referrerpolicy: "no-referrer", srcdoc: doc });
}

export function boardLabel(text) {
  return h("span", { class: "board-label", text });
}

export async function tabBrand(body, d) {
  const slug = d.status.slug;
  body.replaceChildren(h("p", { class: "muted", text: "Marka kartı yükleniyor…" }));
  const b = await guarded(() => api("GET", `/api/clients/${slug}/brand`));
  if (!b) return;
  const custom = b.source === "custom";
  if (custom && !b.brand) {
    body.replaceChildren(h("section", { class: "card stack" },
      h("h2", { text: "Marka henüz tasarlanmadı" }),
      h("p", { class: "muted", text: "Agent siteyi hazırlarken önce markayı tasarlar: logo, renkler, yazı tipleri, slogan ve bu işletmeye özel imza hareketi. Sonra burada müşteriye gösterebileceğin marka kartı çıkar." }),
      h("p", { class: "muted small", text: "Seçenek görmek istersen 'Site ve yayın' sekmesinde 3 tasarım önerisi hazırlatabilirsin." })));
    return;
  }
  const brand = b.brand || {};
  const palette = custom
    ? Object.entries(brand.palette || {}).filter(([, v]) => HEX6.test(String(v))).map(([name, hex]) => ({ name: name.replace(/[-_]/g, " "), hex: hex.toUpperCase() }))
    : Object.entries(b.palette || {}).filter(([, v]) => HEX6.test(String(v))).map(([k, hex]) => ({ name: PALETTE_TR[k] || k, hex: hex.toUpperCase() }));
  const fonts = (custom ? brand.fonts : b.fonts) || {};
  const mono = custom && FONT_NAME.test(brand.monoFont || "") ? brand.monoFont : null;
  loadBoardFonts([fonts.heading, fonts.body, mono]);
  const heading = fontStack(fonts.heading, "Geist, sans-serif");
  const bodyFont = fontStack(fonts.body, "Geist, sans-serif");
  const monoFont = fontStack(mono, '"Geist Mono", ui-monospace, monospace');
  const main = palette[0]?.hex || "#F58255";
  // The client's own logo wins over a drawn one; both are shown as images (nothing in them can run).
  const logoUri = b.clientLogo || (b.logoSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(b.logoSvg)}` : null);
  const missing = custom ? b.missing.map((m) => BOARD_MISSING_TR.find(([re]) => re.test(m))?.[1] || "Marka temeli") : [];
  const signature = brand.signature && typeof brand.signature === "object" ? brand.signature : null;
  const others = (Array.isArray(brand.animations) ? brand.animations : []).filter((a) => a && a.id !== signature?.id);
  const TRIGGER_TR = { load: "açılışta", scroll: "kaydırınca", hover: "üstüne gelince", pointer: "fareyle", click: "tıklayınca" };

  const hero = h("article", { class: "board-card board-hero", style: `background:${main};color:${inkOn(main)}` },
    boardLabel(custom ? "Marka" : "Şablon marka"),
    logoUri
      ? h("div", { class: "hero-logo" }, h("img", { src: logoUri, alt: `${b.name} logosu` }))
      : h("div", { class: "hero-word", style: `font-family:${heading}`, text: b.name }),
    h("p", { class: "hero-tag", style: `font-family:${heading}`, text: brand.tagline || (custom ? "Slogan henüz yok." : b.industry) }),
  );

  const concept = h("article", { class: "board-card board-concept" },
    boardLabel("Konsept"),
    h("p", { class: "concept-text", style: `font-family:${heading}`, text: brand.concept || (custom ? "Konsept henüz yazılmadı." : "Şablon sitelerde marka konsepti yok; renkler ve yazı tipleri şablondan gelir.") }),
    h("ul", { class: "swatch-list" }, ...palette.map((p) => h("li", {},
      h("span", { class: "chip", style: `background:${p.hex}` }),
      h("span", { class: "sw-name", text: p.name }),
      h("button", { type: "button", class: "sw-hex", title: "Kopyala", onclick: () => navigator.clipboard?.writeText(p.hex).then(() => toast(`${p.hex} kopyalandı`)) }, p.hex),
    ))),
  );

  const sig = h("article", { class: "board-card board-sig" },
    boardLabel("İmza hareketi"),
    h("h3", { class: "sig-name", style: `font-family:${heading}`, text: signature?.name || (custom ? "Henüz seçilmedi" : "Şablonda yok") }),
    custom && b.signatureHtml
      ? signatureFrame(b.signatureHtml, `${b.name} imza hareketi`)
      : h("div", { class: "sig-empty", text: custom ? "Canlı demo henüz yok." : "Serbest tasarıma geçince agent bu işletmeye özel bir imza hareketi tasarlar." }),
    signature?.idea && h("p", { class: "small", text: signature.idea }),
    custom && h("p", { class: "board-note", text: "Hareket azaltma açık olan ziyaretçiler sakin hâlini görür." }),
  );

  const download = logoUri && h("a", { class: "btn board-btn", href: logoUri, download: `${slug}-logo${b.clientLogo ? "" : ".svg"}` }, b.clientLogo ? "Logoyu indir" : "Logoyu indir (SVG)");
  const type = h("article", { class: "board-card board-type" },
    boardLabel("Tipografi"),
    h("div", { class: "type-head" },
      h("span", { class: "type-aa", style: `font-family:${heading}`, text: "Aa" }),
      h("div", {}, h("strong", { text: fonts.heading || "—" }), h("span", { class: "muted small", text: fonts.body && fonts.body !== fonts.heading ? `Metin: ${fonts.body}` : "Başlık ve metin" }))),
    h("p", { class: "type-sample", style: `font-family:${heading}`, text: brand.typeSample || brand.tagline || b.name }),
    h("p", { class: "type-body", style: `font-family:${bodyFont}`, text: brand.voice || "Metinler sade, kısa ve işletmenin kendi sesiyle yazılır." }),
    h("p", { class: "type-mono", style: `font-family:${monoFont}`, text: palette.map((p) => p.hex).join("  ") }),
    logoUri && h("div", { class: "logo-dark" }, h("img", { src: logoUri, alt: "" }), h("span", { class: "board-note", text: "Koyu zeminde" })),
    download,
  );

  const anims = others.length > 0 && h("article", { class: "board-card board-anims" },
    boardLabel("Diğer imza animasyonları"),
    h("ul", {}, ...others.map((a) => h("li", {}, h("span", { class: "trigger", text: TRIGGER_TR[a.trigger] || a.trigger || "" }), h("span", { text: a.idea || a.id })))),
  );

  const board = h("section", { class: "board", "aria-label": `${b.name} marka kartı` },
    h("header", { class: "board-top" },
      h("div", {}, h("span", { class: "board-kicker", text: "Marka Atölyesi" }), h("h2", { text: b.name })),
      h("span", { class: "board-meta", text: [b.industry, Array.isArray(brand.personality) ? brand.personality.join(" · ") : ""].filter(Boolean).join("  /  ") })),
    h("div", { class: "board-grid" }, hero, concept, sig, type, anims),
    h("footer", { class: "board-foot" },
      h("span", { text: custom ? "Serbest tasarım" : "Şablon" }),
      h("span", { text: fonts.heading ? `${fonts.heading}${fonts.body && fonts.body !== fonts.heading ? ` + ${fonts.body}` : ""}` : "" }),
      h("span", { text: `${palette.length} renk` })),
  );

  const busy = isBusy();
  const actions = h("div", { class: "row board-actions" },
    h("button", { class: "btn", type: "button", onclick: () => window.print() }, "Yazdır / PDF"),
    custom && missing.length > 0 && h("button", { class: "btn", type: "button", disabled: busy, onclick: () => runAgent(slug, "brand-board", {}) }, "Marka kartını tamamlat"),
    custom && h("button", { class: "btn btn-primary", type: "button", disabled: busy, title: "Bilgiler ve metinler aynı kalır; sayfalar markanın imza tasarımıyla baştan yazılır.", onclick: () => {
      if (confirm("Site markanın imza tasarımıyla baştan yazılacak (bilgiler ve fiyatlar aynı kalır; önceki hâl Sürümler'de durur). Devam?")) runAgent(slug, "redesign", {});
    } }, "Marka Kimliğiyle Yeniden Tasarla"),
  );
  const notice = custom && missing.length > 0
    ? h("p", { class: "notice small", text: `Eksik: ${[...new Set(missing)].join(", ")}. Agent mevcut markayı bozmadan tamamlar.` })
    : !custom ? h("p", { class: "muted small", text: "Bu site şablonla yapıldı: kartta şablonun renkleri ve yazı tipleri var. Özel logo, slogan ve imza hareketi için 'Serbest tasarıma geç'." }) : null;
  const logoNote = custom && !b.clientLogo
    ? h("p", { class: "muted small" }, "Bu logo sistem tarafından tasarlandı. Müşterinin kendi logosu varsa ", h("a", { href: `#/c/${slug}/bilgiler`, text: "Müşteri Bilgileri" }), " sekmesinden yükleyip \"Logo olarak kullan\"ı seçiniz, ardından \"Marka Kimliğiyle Yeniden Tasarla\"yı kullanınız.")
    : null;
  body.replaceChildren(h("div", { class: "stack" }, h("div", { class: "row", style: "justify-content:space-between;align-items:center" }, h("p", { class: "muted small", text: "Müşteriye sunmak için ekran görüntüsü alabilir ya da PDF olarak kaydedebilirsiniz." }), actions), notice, logoNote, board,
    custom ? libraryControls(slug, Boolean(b.brand)) : null,
    custom ? conceptsCard(d) : null));
}
