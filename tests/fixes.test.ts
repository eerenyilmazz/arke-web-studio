import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentHash } from "../src/lib/files.js";
import { clientPaths } from "../src/lib/paths.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, installStubTemplate, tempFactory } from "./helpers.js";

const NEW_CLIENT = { slug: "willow-thread", businessName: "Willow & Thread", industry: "bridal salon", hostingModel: "managed" as const };
const SLUG = NEW_CLIENT.slug;

async function readyClient() {
  const f = tempFactory();
  installStubTemplate(f.templatesDir);
  await tools.createClient(f, NEW_CLIENT);
  tools.updateClientConfig(f, { slug: SLUG, patch: COMPLETE_PATCH });
  tools.saveContent(f, { slug: SLUG, locale: "en", content: COMPLETE_CONTENT });
  return { f, paths: clientPaths(f.clientsRoot, SLUG) };
}

/** Stub template variant that writes the given env var into the page, or edits content mid-build. */
function overrideStubBuild(templatesDir: string, script: string): void {
  writeFileSync(path.join(templatesDir, "stub-v1", "build.mjs"), script);
}

describe("unknown fields are rejected, not silently saved", () => {
  it("rejects a misspelt config field and saves nothing", async () => {
    const { f, paths } = await readyClient();
    const before = readFileSync(paths.config, "utf8");
    expect(() => tools.updateClientConfig(f, { slug: SLUG, patch: { contakt: { email: "a@b.co.uk" } } })).toThrow(/Unknown field\(s\): contakt/);
    expect(() => tools.updateClientConfig(f, { slug: SLUG, patch: { contact: { emial: "a@b.co.uk" } } })).toThrow(/contact\.emial/);
    expect(readFileSync(paths.config, "utf8")).toBe(before);
  });

  it("rejects a misspelt content field inside an array item", async () => {
    const { f } = await readyClient();
    expect(() => tools.saveContent(f, { slug: SLUG, locale: "en", content: { services: [{ title: "Hem", description: "Hems.", prise: "£30" }] } })).toThrow(
      /services\.0\.prise/,
    );
  });

  it("does not let a patch touch meta; recorded answers stay", async () => {
    const { f } = await readyClient();
    tools.updateClientConfig(f, { slug: SLUG, patch: {}, unmapped: [{ question: "q", answer: "keep me" }] });
    expect(() => tools.updateClientConfig(f, { slug: SLUG, patch: { meta: { unmapped: [] } } })).toThrow(/cannot be changed/);
    expect(tools.updateClientConfig(f, { slug: SLUG, patch: {} }).unmappedCount).toBe(1);
  });
});

describe("build_site", () => {
  const saved = process.env.SF_FORM_ACTION;
  afterEach(() => {
    if (saved === undefined) delete process.env.SF_FORM_ACTION;
    else process.env.SF_FORM_ACTION = saved;
  });

  it("passes SF_FORM_ACTION through to the template", async () => {
    const { f, paths } = await readyClient();
    process.env.SF_FORM_ACTION = "https://forms.example.com/submit";
    overrideStubBuild(
      f.templatesDir,
      `import fs from "node:fs"; import path from "node:path";
const out = process.env.SF_OUT_DIR; fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), '<!doctype html><html lang="en"><head><title>Willow &amp; Thread</title></head><body><h1>Willow &amp; Thread</h1><form action="' + (process.env.SF_FORM_ACTION ?? "none") + '"></form></body></html>');`,
    );
    const built = await tools.buildSite(f, { slug: SLUG });
    expect(built.passed).toBe(true);
    expect(readFileSync(path.join(paths.distDir, "index.html"), "utf8")).toContain("https://forms.example.com/submit");
  });

  it("fails when inputs change while the build runs, and records the pre-build hash", async () => {
    const { f, paths } = await readyClient();
    const hashBefore = contentHash(paths.root);
    // The stub edits content mid-build, simulating a parallel save_content call.
    overrideStubBuild(
      f.templatesDir,
      `import fs from "node:fs"; import path from "node:path";
const client = process.env.SF_CLIENT_DIR, out = process.env.SF_OUT_DIR;
const file = path.join(client, "content", "en.json");
const c = JSON.parse(fs.readFileSync(file, "utf8")); c.tagline = "Changed during build"; fs.writeFileSync(file, JSON.stringify(c));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), '<!doctype html><html lang="en"><head><title>Willow &amp; Thread</title></head><body><h1>Willow &amp; Thread</h1></body></html>');`,
    );
    const built = await tools.buildSite(f, { slug: SLUG });
    expect(built.passed).toBe(false);
    expect(built.checks.find((c) => c.name === "Inputs unchanged during build")?.status).toBe("fail");
    expect((JSON.parse(readFileSync(paths.buildRecord, "utf8")) as { hash: string }).hash).toBe(hashBefore);
  });

  it("returns the build log only when the build failed", async () => {
    const { f } = await readyClient();
    const ok = await tools.buildSite(f, { slug: SLUG });
    expect(ok.passed).toBe(true);
    expect(ok.buildLogTail).toBeUndefined();
  });
});

describe("Impeccable findings", () => {
  it("reports warnings without failing the build; only errors fail", async () => {
    const { summariseImpeccable } = await import("../src/tools.js");
    const warn = summariseImpeccable(JSON.stringify([{ antipattern: "cream-palette", severity: "warning" }, { antipattern: "cream-palette", severity: "warning" }, { antipattern: "side-tab", severity: "warning" }]));
    expect(warn.status).toBe("warn");
    expect(warn.detail).toBe("3 finding(s): cream-palette ×2, side-tab ×1");
    expect(summariseImpeccable(JSON.stringify([{ antipattern: "x", severity: "error" }])).status).toBe("fail");
    expect(summariseImpeccable("not json").status).toBe("warn");
    expect(summariseImpeccable("[]").status).toBe("pass");
  });
});
