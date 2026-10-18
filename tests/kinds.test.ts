import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientPaths } from "../src/lib/paths.js";
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
    writeFileSync(`${dir}/jobs.jsonl`, `${JSON.stringify({ id: "1", slug: "old-co", kind: "autopilot", title: "Siteyi hazırla", status: "succeeded", startedAt: "2026-09-01T10:00:00Z" })}\n`);
    writeFileSync(`${dir}/inputs.jsonl`, `${JSON.stringify({ at: "2026-09-01T10:00:00Z", kind: "client-feedback", text: "Bigger logo" })}\n`);
    expect(readHistory(f, "old-co")[0]!.kind).toBe("create-site");
    expect(readInputs(f, "old-co")[0]!.kind).toBe("portal-comments");
    expect(currentKind("revise")).toBe("revise");
  });
});
