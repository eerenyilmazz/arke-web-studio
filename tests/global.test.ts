import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { finalPrompt, operatorLine } from "../src/panel/prompts.js";
import { profileComplete, readSettings, writeSettings } from "../src/panel/settings.js";
import { tempFactory } from "./helpers.js";

/** Every person runs their own panel: nothing the agent or the panel shows may be tied to one named person. */
// The product's old name and prefixes, spelled out in pieces so a rename sweep cannot change this check itself.
const OLD_NAME = new RegExp(
  ["Site Fac" + "tory", "site-fac" + "tory", "SiteFac" + "tory", "SF" + "Motion", "(?<![A-Za-z0-9])s" + "f[-_][A-Za-z0-9$]", "\\bS" + "F_[A-Z]"].join("|"),
);

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
    // The copyright line ("© 2026 …") is the one place an owner's name belongs; the panel and rules address the operator.
    const text = (f: string) =>
      readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => !l.includes("©"))
        .join("\n");
    const hits = files.filter((f) => /\.(ts|js|md|html|json|sh)$/.test(f) && /\bEren\b|\beeren\b/.test(text(f)));
    expect(hits.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("uses only the name Arke Web Studio, also in technical names", () => {
    // settings.local.json is written on each computer by setup-wsl.sh (not part of the repository).
    const LEGACY_OK = new Set(["tests/global.test.ts", ".claude/settings.local.json"]);
    const files = ["src", "panel", "rules", "portal", "parts", "templates", "scripts", "tests", ".claude"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .filter(
        (f) => !f.includes(`${path.sep}node_modules${path.sep}`) && !f.includes(`${path.sep}skills${path.sep}`) && !f.includes(`${path.sep}dist${path.sep}`),
      )
      .concat(["AGENTS.md", "README.md", "ROADMAP.md", ".mcp.json", "package.json", "factory.config.json"].map((f) => path.join(ROOT, f)))
      .filter((f) => /\.(ts|js|md|html|json|sh|mjs)$/.test(f));
    const old = files.filter((f) => !LEGACY_OK.has(path.relative(ROOT, f)) && OLD_NAME.test(readFileSync(f, "utf8")));
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
