import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../src/config.js";
import { isExcluded, searchKnowledge } from "../src/lib/knowledge.js";
import { clientPaths } from "../src/lib/paths.js";
import { checkImages, checkLegal } from "../src/lib/seo.js";
import * as tools from "../src/tools.js";
import { tempFactory } from "./helpers.js";

function dist(pages: Record<string, string>, files: Record<string, Buffer> = {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "arke-market-"));
  for (const [rel, html] of Object.entries({ ...pages })) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), html);
  }
  for (const [rel, data] of Object.entries(files)) writeFileSync(path.join(dir, rel), data);
  return dir;
}

describe("markets", () => {
  it("creates clients in other markets with English as the main language and the local currency", async () => {
    const f = tempFactory();
    await tools.createClient(f, { slug: "dublin-cuts", businessName: "Dublin Cuts", industry: "barber", hostingModel: "managed", country: "IE" });
    const cfg = JSON.parse(readFileSync(clientPaths(f.clientsRoot, "dublin-cuts").config, "utf8"));
    expect(cfg.i18n.defaultLocale).toBe("en");
    expect(cfg.business).toMatchObject({ country: "IE", currency: "EUR", timezone: "Europe/Dublin" });
    await tools.createClient(f, { slug: "mono-erkek", businessName: "Mono", industry: "barber", hostingModel: "managed", country: "TR" });
    expect(JSON.parse(readFileSync(clientPaths(f.clientsRoot, "mono-erkek").config, "utf8")).i18n.defaultLocale).toBe("tr");
  });

  it("warns when a form has no privacy link, and about a missing Impressum in Germany", () => {
    const form = '<html><body><form action="x"></form></body></html>';
    expect(checkLegal(dist({ "index.html": form }), "TR")).toMatchObject({ status: "warn", detail: expect.stringContaining("KVKK") });
    expect(checkLegal(dist({ "index.html": form.replace("</form>", '</form><a href="/gizlilik/">KVKK</a>') }), "TR").status).toBe("pass");
    expect(checkLegal(dist({ "index.html": "<html><body>hi</body></html>" }), "GB").status).toBe("pass");
    expect(checkLegal(dist({ "index.html": "<html><body>hi</body></html>" }), "DE")).toMatchObject({
      status: "warn",
      detail: expect.stringContaining("Impressum"),
    });
  });

  it("warns about heavy images and images without a size", () => {
    const d = dist(
      { "index.html": '<img src="/a.jpg" alt="a"><img src="/b.jpg" alt="b" width="10" height="10">' },
      { "a.jpg": Buffer.alloc(700 * 1024), "b.jpg": Buffer.alloc(10) },
    );
    const r = checkImages(d);
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("a.jpg is 700 KB");
    expect(r.detail).toContain("1 <img> without width/height");
  });

  it("leaves native-app and tooling pages of the skills out of the design search", () => {
    expect(isExcluded(".claude/skills/impeccable/reference/ios.md")).toBe(true);
    expect(isExcluded(".claude/skills/impeccable/reference/typeset.md")).toBe(false);
    expect(searchKnowledge(FACTORY_ROOT, "iOS SwiftUI navigation bar", 8).some((h) => h.source.includes("/ios.md"))).toBe(false);
    expect(searchKnowledge(FACTORY_ROOT, "KVKK aydinlatma metni form", 3)[0]!.source).toBe("rules/privacy.md");
  });
});

describe("market-specific quality notes", () => {
  it("asks for a company number only in the UK and Ireland, and skips the name check on 404 and the motion demo", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const os = await import("node:os");
    const pathMod = await import("node:path");
    const { checkInputs, checkOutput } = await import("../src/lib/quality.js");
    const tools = await import("../src/tools.js");
    const { clientPaths } = await import("../src/lib/paths.js");
    const { readDraftConfig } = await import("../src/lib/client.js");
    const { COMPLETE_CONTENT, COMPLETE_PATCH, tempFactory } = await import("./helpers.js");
    const f = tempFactory();
    const configFor = async (country: "TR" | "GB" | "IE" | "US") => {
      const slug = `q-${country.toLowerCase()}`;
      await tools.createClient(f, { slug, businessName: "Gul Kafe", industry: "cafe", hostingModel: "managed", country });
      tools.updateClientConfig(f, { slug, patch: COMPLETE_PATCH });
      return { root: clientPaths(f.clientsRoot, slug).root, config: readDraftConfig(clientPaths(f.clientsRoot, slug)) as never };
    };
    const legal = async (country: "TR" | "GB" | "IE" | "US") => {
      const { root, config } = await configFor(country);
      return checkInputs(
        root,
        { ...(config as object), legal: { ...(config as { legal: object }).legal, companyNumber: null } } as never,
        {
          en: { gallery: [], testimonials: [], faq: [], ...COMPLETE_CONTENT },
        } as never,
      ).find((r) => r.name === "Legal details");
    };
    const base = { business: { name: "Gul Kafe" } };
    expect(await legal("TR")).toBeUndefined();
    expect(await legal("US")).toBeUndefined();
    expect((await legal("GB"))?.detail).toMatch(/UK limited companies/);
    expect((await legal("IE"))?.detail).toMatch(/CRO/);

    const dist = mkdtempSync(pathMod.join(os.tmpdir(), "arke-dist-"));
    const page = (title: string, body: string) =>
      `<!doctype html><html lang="tr"><head><title>${title}</title><meta name="description" content="x"></head><body>${body}</body></html>`;
    writeFileSync(pathMod.join(dist, "index.html"), page("Gul Kafe", "Gul Kafe"));
    writeFileSync(pathMod.join(dist, "404.html"), page("Bulunamadı", "Sayfa yok"));
    mkdirSync(pathMod.join(dist, "brand"));
    writeFileSync(pathMod.join(dist, "brand", "signature.html"), page("İmza", "demo"));
    const all = JSON.stringify(checkOutput(dist, base as never));
    expect(all).not.toMatch(/business name not found/);
  });
});

describe("design and language rules (1.21.0)", () => {
  it("no section quota, meaningful labels only, legacy template rules kept out of design searches", async () => {
    const { readFileSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const os = await import("node:os");
    const pathMod = await import("node:path");
    const { FACTORY_ROOT } = await import("../src/config.js");
    const { designDepth } = await import("../src/lib/custom-site.js");
    const { isExcluded, searchKnowledge } = await import("../src/lib/knowledge.js");
    const rules = ["custom-site.md", "custom/brand.md", "custom/build.md"].map((f) => readFileSync(pathMod.join(FACTORY_ROOT, "rules", f), "utf8")).join("\n");
    expect(rules).toMatch(/Never a label above every heading/);
    expect(rules).toMatch(/No minimum number of sections/);
    expect(rules).toMatch(/never write a `<locale>\/` page in a design job/);

    const dist = mkdtempSync(pathMod.join(os.tmpdir(), "arke-depth-"));
    writeFileSync(
      pathMod.join(dist, "index.html"),
      '<main><section class="hero"><svg class="sig-x"></svg><img src="/brand/logo.svg"></section><section><svg></svg></section></main>',
    );
    const depth = designDepth(dist, ":root{--wrap: 80rem}", { signature: { id: "sig-x" } } as never);
    expect(depth.status).toBe("pass"); // two sections are fine now

    expect(isExcluded("rules/legacy-templates.md")).toBe(true);
    const hits = searchKnowledge(FACTORY_ROOT, "standard words menu button opening hours Turkish English", 5);
    expect(hits.some((h) => h.source === "rules/markets.md")).toBe(true);
  });
});
