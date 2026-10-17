import { describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../src/config.js";
import { chunkMarkdown, searchKnowledge, tokenize } from "../src/lib/knowledge.js";

describe("design knowledge search", () => {
  it("chunks markdown at headings and folds Turkish letters", () => {
    const chunks = chunkMarkdown("x.md", "# Top\n\nintro text that is long enough to keep around here.\n\n## Colour\n\nUse a dark palette with enough contrast for body text.\n\n## Contents\n\n- a\n- b\n- c and more words to pass the minimum");
    expect(chunks.map((c) => c.heading)).toEqual(["Top", "Top › Colour"]);
    expect(tokenize("Şeffaf Çizgi Işık")).toEqual(["seffaf", "cizgi", "isik"]);
  });

  it("finds the client-logo rule among rules and skills", () => {
    const hits = searchKnowledge(FACTORY_ROOT, "client logo own file", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.source).toBe("rules/custom-site.md");
    expect(hits[0]!.text.length).toBeLessThanOrEqual(1400);
  });
});
