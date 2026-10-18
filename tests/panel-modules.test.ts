import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../src/config.js";

/**
 * The panel's browser code is plain JS split into ES modules (panel/app.js + panel/js/*.js). A name used in one
 * module but not imported there only fails in the browser, on the screen that uses it. The TypeScript checker
 * finds those without running anything: every name must resolve and every import must exist.
 */
const MISSING_NAME = new Set([
  2304, // Cannot find name
  2581, // Cannot find name "$" (TypeScript suggests jQuery types)
  2582, // Cannot find name (TypeScript suggests test-runner types)
  2305, // Module has no exported member
  2552, // Cannot find name, did you mean
  2724, // has no exported member named, did you mean
  2448, // Block-scoped variable used before its declaration
  2307, // Cannot find module
]);

describe("panel browser modules", () => {
  it("every name used in the panel scripts is declared or imported", () => {
    // The TypeScript compiler as a checker only (this project's TypeScript has no JS API): plain JS, no config.
    const tsc = path.join(FACTORY_ROOT, "node_modules", ".bin", "tsc");
    const run = spawnSync(tsc, [
      "--ignoreConfig", "--allowJs", "--checkJs", "--noEmit", "--skipLibCheck", "--listFiles",
      "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--lib", "es2022,dom,dom.iterable",
      path.join(FACTORY_ROOT, "panel", "app.js"),
    ], { encoding: "utf8", timeout: 120_000 });
    const out = `${run.stdout}${run.stderr}`;
    const problems = out.split("\n").filter((line) => {
      const m = /error TS(\d+):/.exec(line);
      return m && MISSING_NAME.has(Number(m[1]));
    });
    expect(problems).toEqual([]);
    // The split is real: the entry imports the screens.
    expect(out.split("\n").filter((l) => l.includes("/panel/js/")).length).toBeGreaterThan(5);
  });
});
