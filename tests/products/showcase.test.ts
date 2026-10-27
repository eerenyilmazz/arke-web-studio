import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../../src/config.js";
import { kindNote } from "../../src/panel/api/common.js";
import { PRODUCTS } from "../../src/products/registry.js";

const read = (rel: string) => readFileSync(path.join(FACTORY_ROOT, rel), "utf8");

describe("showcase kind: its own page rules", () => {
  it("names rules/products/showcase.md for a showcase client and nothing for a kind without its own file", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "arke-kind-"));
    expect(kindNote(dir)).toMatch(/rules\/products\/showcase\.md/); // no product.json: a showcase site
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "product.json"), JSON.stringify({ product: "ecommerce" }));
    expect(kindNote(dir)).toBeNull();
  });

  it("keeps the page rules in one place and points to them from the shared rules", () => {
    expect(PRODUCTS.showcase.rules).toContain("rules/products/showcase.md");
    const showcase = read("rules/products/showcase.md");
    for (const page of ["index.html", "about/index.html", "services/index.html", "gallery/index.html", "contact/index.html"]) expect(showcase).toContain(page);
    expect(showcase).toMatch(/only when `get_client_status` shows `contactForm`/);
    for (const file of ["AGENTS.md", "rules/custom-site.md", "rules/custom/build.md", "rules/local-seo.md"])
      expect(read(file), file).toContain("rules/products/");
    // The page list lives only in the kind's file now.
    expect(read("rules/custom/build.md")).not.toMatch(/services\/index\.html\s+gallery\/index\.html/);
  });

  it("keeps the plan states in plan.md, the prompt only points to them", () => {
    expect(read("rules/custom/plan.md")).toMatch(/### Plan states/);
  });
});
