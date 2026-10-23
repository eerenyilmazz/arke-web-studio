import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { finalPrompt, operatorLine } from "../src/panel/prompts.js";
import { profileComplete, readSettings, writeSettings } from "../src/panel/settings.js";
import { tempFactory } from "./helpers.js";

/** Every person runs their own panel: nothing the agent or the panel shows may be tied to one named person. */
describe("global studio: no personal traces", () => {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });

  it("never names one person in the code, rules, panel or portal", () => {
    const files = ["src", "panel/js", "rules", "portal", "parts", "templates"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .concat(
        ["AGENTS.md", "README.md", "CHANGELOG.md", "docs/history/SPEC.md", "scripts/install.sh", "scripts/update.sh", "scripts/setup-wsl.sh"].map((f) =>
          path.join(ROOT, f),
        ),
      );
    const hits = files.filter((f) => /\.(ts|js|md|html|json|sh)$/.test(f) && /\bEren\b|\beeren\b/.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("uses the name Arke Web Studio; the old name only where installs from before the rename are carried over", () => {
    const LEGACY_OK = new Set([
      "scripts/migrate-name.sh", // moves the old folders
      "scripts/shell-commands.sh", // removes the old shell block
      "scripts/install.sh", // accepts an old clone
      "scripts/update.sh", // accepts an old zip
      "src/config.ts", // old folders and settings while only they exist
      "src/tools/deploy.ts", // published clients keep their sf- Workers
      "src/panel/portal.ts", // an installed portal keeps its Worker
      "src/panel/jobs.ts", // strips the old SF_ secret names too
      "scripts/setup-wsl.sh", // keeps the old folders of an install from before the rename
      ".claude/settings.json", // the agent's limits cover the old folder and variable names too
      ".claude/settings.local.json", // made on this computer by setup-wsl.sh (not in the repository)
      "tests/global.test.ts",
      "tests/rename.test.ts",
      "README.md", // the section on the rename
    ]);
    const files = ["src", "panel", "rules", "portal", "parts", "templates", "scripts", "tests", ".claude"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .filter(
        (f) => !f.includes(`${path.sep}node_modules${path.sep}`) && !f.includes(`${path.sep}skills${path.sep}`) && !f.includes(`${path.sep}dist${path.sep}`),
      )
      .concat(["AGENTS.md", "README.md", "ROADMAP.md", ".mcp.json", "package.json", "factory.config.json"].map((f) => path.join(ROOT, f)))
      .filter((f) => /\.(ts|js|md|html|json|sh|mjs)$/.test(f));
    const old = files.filter(
      (f) => !LEGACY_OK.has(path.relative(ROOT, f)) && /Site Factory|site-factory|sf-clients|sf-inbox|\bSF_[A-Z]/.test(readFileSync(f, "utf8")),
    );
    expect(old.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("asks for the operator's profile once and tells the agent who the operator is", () => {
    const f = tempFactory();
    expect(profileComplete(readSettings(f))).toBe(false);
    const s = writeSettings(f, { profile: { name: '  Deniz "Kaya"\n', studio: "Atölye <Web>" } });
    expect(s.profile).toEqual({ name: "Deniz Kaya", studio: "Atölye Web" });
    expect(profileComplete(s)).toBe(true);
    expect(operatorLine(s.profile)).toBe(
      "The operator (the person using this panel, who reads your summaries and gives approvals) is Deniz Kaya of Atölye Web; address them by name.",
    );
    const prompt = finalPrompt("Do it.", { skills: "none", screenshots: true, operator: s.profile });
    expect(prompt).toContain("is Deniz Kaya of Atölye Web");
    expect(finalPrompt("Do it.", { skills: "none", screenshots: true, operator: { name: "", studio: "" } })).not.toContain("The operator (");
  });
});
