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
    tools.writeSiteFileTool(f, { slug: SLUG, path: "brand/brand.json", content: JSON.stringify({ ...BRAND, animations: [...BRAND.animations, { id: "lid-twist", idea: "Jar lid twists open on hover", trigger: "hover" }] }) });
    r = await tools.buildSite(f, { slug: SLUG });
    expect(r.checks.find((c) => c.name.startsWith("Brand identity"))?.detail).toMatch(/lid-twist/);

    writeGoodSite(f);
    tools.writeSiteFileTool(f, { slug: SLUG, path: "index.html", content: page("Home", '<h1 class="jar-fill">x</h1><div data-anim="brine-bubbles"></div><script src="https://evil.example/x.js"></script><script>fetch("https://x.example")</script><a href="/nope/">x</a>') });
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
