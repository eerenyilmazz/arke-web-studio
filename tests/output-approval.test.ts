import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addApproval, approvalPins } from "../src/lib/approvals.js";
import type { BuildRecord } from "../src/lib/client.js";
import { contentHash } from "../src/lib/files.js";
import { clientPaths } from "../src/lib/paths.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate, tempFactory } from "./helpers.js";

const SLUG = "willow-thread";
const NEW_CLIENT = { slug: SLUG, businessName: "Willow & Thread", industry: "bridal salon", hostingModel: "managed" as const };

/** A client with content approval and a passing build: the point where the operator gives the visual approval. */
async function builtClient() {
  const f = tempFactory();
  installStubTemplate(f.templatesDir);
  await tools.createClient(f, NEW_CLIENT);
  tools.updateClientConfig(f, { slug: SLUG, patch: COMPLETE_PATCH });
  tools.saveContent(f, { slug: SLUG, locale: "en", content: COMPLETE_CONTENT });
  const paths = clientPaths(f.clientsRoot, SLUG);
  addApproval(paths.approvals, { kind: "content", by: "test", at: new Date().toISOString(), hash: contentHash(paths.root) });
  expect((await tools.buildSite(f, { slug: SLUG })).passed).toBe(true);
  return { f, paths };
}

function lastBuild(file: string): BuildRecord {
  return JSON.parse(readFileSync(file, "utf8")) as BuildRecord;
}

/** What the approve CLI does after the person types the slug. */
function approve(paths: ReturnType<typeof clientPaths>, kind: "visual" | "production") {
  const pins = approvalPins(kind, paths.root, paths.distDir, lastBuild(paths.buildRecord));
  addApproval(paths.approvals, { kind, by: "test", at: new Date().toISOString(), ...pins });
}

describe("visual/production approvals are pinned to the built output", () => {
  it("records a dist hash and moves on after visual approval", async () => {
    const { f, paths } = await builtClient();
    expect(lastBuild(paths.buildRecord).distHash).toMatch(/^[0-9a-f]{16}$/);
    approve(paths, "visual");
    expect(tools.getClientStatus(f, { slug: SLUG }).stage).toBe("awaiting-production-approval");
  });

  it("a template change that alters the output invalidates the visual approval", async () => {
    const { f, paths } = await builtClient();
    approve(paths, "visual");
    // Same client content, different template output.
    const buildFile = path.join(f.templatesDir, "stub-v1", "build.mjs");
    writeFileSync(buildFile, readFileSync(buildFile, "utf8").replace("<h1>", '<h1 class="v2">'));
    expect((await tools.buildSite(f, { slug: SLUG })).passed).toBe(true);

    expect(tools.getClientStatus(f, { slug: SLUG }).stage).toBe("awaiting-visual-approval");
    await expect(tools.deploy(f, { slug: SLUG, target: "preview", dryRun: true })).rejects.toThrow(/Missing visual approval/);
  });

  it("deploy refuses a dist/ that was edited after the build", async () => {
    const { f, paths } = await builtClient();
    approve(paths, "visual");
    writeFileSync(path.join(paths.distDir, "index.html"), '<html lang="en"><title>tampered</title></html>');
    await expect(tools.deploy(f, { slug: SLUG, target: "preview", dryRun: true })).rejects.toThrow(/dist\/ is not the output of the last build/);
  });

  it("output approvals cannot be given without a passing, untouched build", async () => {
    const { paths } = await builtClient();
    writeFileSync(path.join(paths.distDir, "extra.html"), "x");
    expect(() => approve(paths, "visual")).toThrow(/dist\/ changed after the last build/);
    expect(() => approvalPins("visual", paths.root, paths.distDir, null)).toThrow(/no passing build/);
    expect(approvalPins("content", paths.root, paths.distDir, null).distHash).toBeUndefined();
  });

  it("older visual approvals without a dist hash no longer count", async () => {
    const { f, paths } = await builtClient();
    addApproval(paths.approvals, { kind: "visual", by: "test", at: new Date().toISOString(), hash: contentHash(paths.root) });
    expect(tools.getClientStatus(f, { slug: SLUG }).stage).toBe("awaiting-visual-approval");
  });
});

describe("site approval alias", () => {
  it("'site' means content + visual; production stays separate", async () => {
    const { approvalTargets } = await import("../src/lib/approvals.js");
    expect(approvalTargets("site")).toEqual(["content", "visual"]);
    expect(approvalTargets("production")).toEqual(["production"]);
    expect(approvalTargets("everything")).toBeNull();
  });
});

describe("preview deploy target", () => {
  it("uses a separate -preview Worker and never the custom domain", async () => {
    const { f, paths } = await builtClient();
    addApproval(paths.approvals, {
      kind: "visual",
      by: "t",
      at: new Date().toISOString(),
      ...approvalPins("visual", paths.root, paths.distDir, lastBuild(paths.buildRecord)),
    });
    tools.updateClientConfig(f, { slug: SLUG, patch: {} });
    const r = await tools.deploy(f, { slug: SLUG, target: "preview", dryRun: true }).catch((e: Error) => e);
    // wrangler may be missing in the test env; the generated config is what matters.
    void r;
    const cfg = readFileSync(path.join(paths.root, "wrangler.jsonc"), "utf8");
    expect(cfg).toContain('"name": "arke-willow-thread-preview"');
    expect(cfg).not.toContain("routes");
  });
});
