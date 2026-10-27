import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/core/paths.js";
import { readHistory, readInputs } from "../src/panel/history.js";
import { currentKind } from "../src/panel/kinds.js";
import * as tools from "../src/tools.js";
import { tempFactory } from "./helpers.js";

describe("renamed job kinds", () => {
  it("reads history and inputs saved under the old names with the new ones", async () => {
    const f = tempFactory();
    await tools.createClient(f, { slug: "old-co", businessName: "Old Co", industry: "cafe", hostingModel: "managed" });
    const dir = clientPaths(f.clientsRoot, "old-co").factoryDir;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/jobs.jsonl`,
      `${JSON.stringify({ id: "1", slug: "old-co", kind: "autopilot", title: "Siteyi hazırla", status: "succeeded", startedAt: "2026-09-01T10:00:00Z" })}\n`,
    );
    writeFileSync(`${dir}/inputs.jsonl`, `${JSON.stringify({ at: "2026-09-01T10:00:00Z", kind: "client-feedback", text: "Bigger logo" })}\n`);
    expect(readHistory(f, "old-co")[0]!.kind).toBe("create-site");
    expect(readInputs(f, "old-co")[0]!.kind).toBe("portal-comments");
    expect(currentKind("revise")).toBe("revise");
  });
});

describe("deploy gate", () => {
  it("allows a deploy only for a passing, untouched build of the approved content", async () => {
    const { deployBlockers } = await import("../src/tools/deploy.js");
    const build = { hash: "h1", passed: true, distHash: "d1", at: "2026-10-01T00:00:00Z" } as never;
    const all = { content: {}, visual: {}, production: {} };
    expect(deployBlockers("production", build, "h1", all, () => "d1")).toEqual([]);
    expect(deployBlockers("preview", build, "h1", { ...all, production: null }, () => "d1")).toEqual([]);
    expect(deployBlockers("production", build, "h1", { ...all, production: null }, () => "d1")).toEqual([expect.stringMatching(/production approval/)]);
    expect(deployBlockers("preview", build, "h2", all, () => "d1")).toEqual([expect.stringMatching(/No build for the current content/)]);
    expect(deployBlockers("preview", build, "h1", all, () => "changed")).toEqual([expect.stringMatching(/dist\/ is not the output/)]);
    expect(deployBlockers("preview", { ...(build as object), passed: false } as never, "h1", all, () => "d1")).toEqual([
      expect.stringMatching(/failed its checks/),
    ]);
    expect(deployBlockers("preview", undefined, "h1", { content: null, visual: null, production: null }, () => null)).toHaveLength(3);
  });
});
