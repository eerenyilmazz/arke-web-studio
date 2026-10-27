import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildJsonSchemas } from "../src/cli/export-schema.js";
import { addApproval } from "../src/lib/client/approvals.js";
import { contrastRatio } from "../src/lib/checks/contrast.js";
import { contentHash } from "../src/lib/core/files.js";
import { clientPaths } from "../src/lib/core/paths.js";
import { buildQuestionnaire } from "../src/lib/client/questionnaire.js";
import { QUESTIONS } from "../src/schema/questions.js";
import { SiteConfigSchema } from "../src/schema/site-config.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, PNG_1PX, installStubTemplate, tempFactory } from "./helpers.js";

const NEW_CLIENT = { slug: "willow-thread", businessName: "Willow & Thread", industry: "bridal salon", hostingModel: "managed" as const };

describe("questions ↔ schema", () => {
  it("every config target points at a real schema field", () => {
    const json = z.toJSONSchema(SiteConfigSchema, { io: "input" }) as { properties: Record<string, { properties?: Record<string, unknown>; anyOf?: unknown }> };
    for (const q of QUESTIONS) {
      for (const t of q.targets.filter((x) => x.startsWith("config:"))) {
        const [top, sub] = t.slice("config:".length).split(".");
        expect(json.properties[top as string], `${q.id} -> ${t}`).toBeDefined();
        if (sub) {
          const node = json.properties[top as string] as { properties?: Record<string, unknown> };
          expect(node.properties?.[sub], `${q.id} -> ${t}`).toBeDefined();
        }
      }
    }
  });

  it("round 1 is short and client-only", () => {
    const q = buildQuestionnaire({ businessName: "X", industry: "law firm", round: 1 });
    expect(q.questionIds.length).toBeLessThanOrEqual(10);
    expect(q.questionIds).not.toContain("hosting");
    expect(q.plainText).not.toMatch(/FOR YOUR SECTOR/);
  });

  it("round 2 adds sector extras and the later checklist", () => {
    const q = buildQuestionnaire({ businessName: "X", industry: "family law solicitor", round: 2 });
    expect(q.markdown).toMatch(/SRA/);
    expect(q.markdown).toMatch(/QR code/);
  });

  it("JSON Schema export matches the Zod source", () => {
    const fresh = buildJsonSchemas();
    for (const [file, schema] of Object.entries(fresh)) {
      const onDisk = path.join(process.cwd(), "schema", file);
      expect(existsSync(onDisk), `${file} missing: run npm run schema`).toBe(true);
      expect(JSON.parse(readFileSync(onDisk, "utf8")), `${file} out of date: run npm run schema`).toEqual(schema);
    }
  });
});

describe("contrast", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
  });
});

describe("end-to-end flow", () => {
  it("goes from new client to a passing build, and deploy respects approvals", async () => {
    const f = tempFactory();
    installStubTemplate(f.templatesDir);

    const created = await tools.createClient(f, NEW_CLIENT);
    expect(created.templateFound).toBe(true);
    await expect(tools.createClient(f, NEW_CLIENT)).rejects.toThrow(/already exists/);
    expect(tools.getClientStatus(f, { slug: "willow-thread" }).stage).toBe("collecting-answers");

    const q1 = tools.generateQuestionnaire(f, { slug: "willow-thread", round: 1, replyBy: "Friday" });
    expect(q1.plainText).toMatch(/Willow & Thread/);

    // Invalid values are rejected and nothing is saved.
    expect(() => tools.updateClientConfig(f, { slug: "willow-thread", patch: { contact: { email: "not-an-email" } } })).toThrow(/Nothing saved/);
    expect(() => tools.updateClientConfig(f, { slug: "willow-thread", patch: { slug: "other" } })).toThrow(/cannot be changed/);

    // Answers that fit nowhere are kept, not dropped.
    const r = tools.updateClientConfig(f, {
      slug: "willow-thread",
      patch: COMPLETE_PATCH,
      unmapped: [{ question: "extra", answer: "We also do menswear" }],
      laterInterests: ["later-qr-code"],
    });
    expect(r.complete).toBe(true);
    expect(r.unmappedCount).toBe(1);

    expect(tools.getClientStatus(f, { slug: "willow-thread" }).stage).toBe("content");
    expect(() => tools.saveContent(f, { slug: "willow-thread", locale: "de", content: {} })).toThrow(/not in i18n.locales/);
    expect(() =>
      tools.saveContent(f, { slug: "willow-thread", locale: "en", content: { seo: { home: { title: "x".repeat(80), description: "ok ok ok ok" } } } }),
    ).toThrow(/Invalid content/);
    tools.saveContent(f, { slug: "willow-thread", locale: "en", content: COMPLETE_CONTENT });

    writeFileSync(path.join(f.inboxDir, "logo.png"), PNG_1PX);
    const asset = tools.saveAssetTool(f, { slug: "willow-thread", inboxFile: "logo.png", kind: "logo" });
    expect(() => tools.saveAssetTool(f, { slug: "willow-thread", inboxFile: "../clients/willow-thread/site.config.json", kind: "logo" })).toThrow();
    tools.updateClientConfig(f, { slug: "willow-thread", patch: { brand: { logo: asset.relPath } } });

    const paths = clientPaths(f.clientsRoot, "willow-thread");
    expect(tools.getClientStatus(f, { slug: "willow-thread" }).stage).toBe("awaiting-content-approval");

    // Deploy before approvals is blocked.
    await expect(tools.deploy(f, { slug: "willow-thread", target: "preview", dryRun: true })).rejects.toThrow(/Deploy blocked/);

    addApproval(paths.approvals, { kind: "content", by: "test", at: new Date().toISOString(), hash: contentHash(paths.root) });
    expect(tools.getClientStatus(f, { slug: "willow-thread" }).stage).toBe("build");

    const built = await tools.buildSite(f, { slug: "willow-thread" });
    expect(built.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(built.passed).toBe(true);
    expect(readFileSync(path.join(paths.distDir, "index.html"), "utf8")).toContain("Willow &amp; Thread");
    expect(existsSync(paths.qualityReport)).toBe(true);
    expect(tools.getClientStatus(f, { slug: "willow-thread" }).stage).toBe("awaiting-visual-approval");

    // Any content change invalidates approvals and the build.
    tools.saveContent(f, { slug: "willow-thread", locale: "en", content: { tagline: "Changed tagline" } });
    const after = tools.getClientStatus(f, { slug: "willow-thread" });
    expect(after.approvals.content).toBeNull();
    expect(after.stage).toBe("awaiting-content-approval");
  });

  it("build fails with a clear report when contrast is too low", async () => {
    const f = tempFactory();
    installStubTemplate(f.templatesDir);
    await tools.createClient(f, NEW_CLIENT);
    tools.updateClientConfig(f, {
      slug: "willow-thread",
      patch: { ...COMPLETE_PATCH, design: { ...COMPLETE_PATCH.design, palette: { ...COMPLETE_PATCH.design.palette, text: "#CCCCCC" } } },
    });
    tools.saveContent(f, { slug: "willow-thread", locale: "en", content: COMPLETE_CONTENT });
    const built = await tools.buildSite(f, { slug: "willow-thread" });
    expect(built.passed).toBe(false);
    expect(built.checks.find((c) => c.name.startsWith("Contrast: body"))?.status).toBe("fail");
    expect(built.checks.find((c) => c.name === "Template build")?.status).toBe("skip");
  });
});
