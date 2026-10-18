import { describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../src/config.js";
import { chunkMarkdown, searchKnowledge, tokenize } from "../src/lib/knowledge.js";
import { finalPrompt } from "../src/panel/prompts.js";

describe("design knowledge search", () => {
  it("chunks markdown at headings and folds Turkish letters", () => {
    const chunks = chunkMarkdown(
      "x.md",
      "# Top\n\nintro text that is long enough to keep around here.\n\n## Colour\n\nUse a dark palette with enough contrast for body text.\n\n## Contents\n\n- a\n- b\n- c and more words to pass the minimum",
    );
    expect(chunks.map((c) => c.heading)).toEqual(["Top", "Top › Colour"]);
    expect(tokenize("Şeffaf Çizgi Işık")).toEqual(["seffaf", "cizgi", "isik"]);
  });

  it("finds the client-logo rule among rules and skills", () => {
    const hits = searchKnowledge(FACTORY_ROOT, "client logo own file", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.source).toBe("rules/custom-site.md");
    expect(hits[0]!.text.length).toBeLessThanOrEqual(1400);
  });

  it("has the animate skill: searchable in Standard, loaded only for the animations in Premium", () => {
    const hits = searchKnowledge(FACTORY_ROOT, "easing entering exiting ease-out duration", 5);
    expect(hits.some((h) => h.source.startsWith(".claude/skills/animate/"))).toBe(true);
    const premium = finalPrompt("[[DESIGN_SKILLS]]", { skills: "full", screenshots: true });
    expect(premium).toMatch(/When you come to the animations and the signature motion \(not before\), also load animate/);
    expect(premium).toMatch(/ignore any 'initial response'/);
    expect(finalPrompt("[[DESIGN_SKILLS]]", { skills: "none", screenshots: true })).not.toMatch(/animate/);
  });
});
