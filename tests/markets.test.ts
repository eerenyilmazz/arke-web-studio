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
  const dir = mkdtempSync(path.join(os.tmpdir(), "sf-market-"));
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
    expect(checkLegal(dist({ "index.html": "<html><body>hi</body></html>" }), "DE")).toMatchObject({ status: "warn", detail: expect.stringContaining("Impressum") });
  });

  it("warns about heavy images and images without a size", () => {
    const d = dist({ "index.html": '<img src="/a.jpg" alt="a"><img src="/b.jpg" alt="b" width="10" height="10">' }, { "a.jpg": Buffer.alloc(700 * 1024), "b.jpg": Buffer.alloc(10) });
    const r = checkImages(d);
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("a.jpg is 700 KB");
    expect(r.detail).toContain("1 <img> without width/height");
  });

  it("leaves native-app and tooling pages of the skills out of the design search", () => {
    expect(isExcluded(".claude/skills/impeccable/reference/ios.md")).toBe(true);
    expect(isExcluded(".claude/skills/impeccable/reference/typeset.md")).toBe(false);
    expect(searchKnowledge(FACTORY_ROOT, "iOS SwiftUI navigation bar", 8).some((h) => h.source.includes("/ios.md"))).toBe(false);
    expect(searchKnowledge(FACTORY_ROOT, "KVKK aydinlatma metni form", 3)[0]!.source).toBe("rules/markets.md");
  });
});
