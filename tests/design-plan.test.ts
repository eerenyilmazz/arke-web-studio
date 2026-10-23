import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACTORY_ROOT } from "../src/config.js";
import { inlineMotionKit } from "../src/lib/custom-site.js";
import { approvePlan, planState, previousPlans, requirePlan, resetPlanApproval, waivePlan } from "../src/lib/design-plan.js";
import { clientPaths } from "../src/lib/paths.js";
import { checkSignature, countMotionSteps } from "../src/lib/signature-check.js";
import * as tools from "../src/tools.js";
import { COMPLETE_CONTENT, COMPLETE_PATCH, SAMPLE_PLAN as PLAN, tempFactory } from "./helpers.js";

const SLUG = "plan-co";

async function client() {
  const f = tempFactory();
  await tools.createClient(f, { slug: SLUG, businessName: "Plan Co", industry: "bakery", hostingModel: "managed", template: "custom" });
  tools.updateClientConfig(f, { slug: SLUG, patch: COMPLETE_PATCH });
  tools.saveContent(f, { slug: SLUG, locale: "en", content: COMPLETE_CONTENT });
  return { f, paths: clientPaths(f.clientsRoot, SLUG) };
}

describe("design plan", () => {
  it("leaves older sites alone, and for new designs refuses pages until the operator approves the plan", async () => {
    const { f, paths } = await client();
    const write = (p: string) => () => tools.writeSiteFileTool(f, { slug: SLUG, path: p, content: "<!doctype html><title>x</title>" });
    expect(planState(paths)).toBe("not-required");
    expect(write("index.html")).not.toThrow(); // an older site works as before

    requirePlan(paths);
    expect(tools.getClientStatus(f, { slug: SLUG }).designPlan.state).toBe("missing");
    expect(write("about/index.html")).toThrow(/design plan is not written yet/);
    expect(write("brand/signature.html")).not.toThrow(); // the motion preview is allowed
    expect(() => tools.deleteSiteFileTool(f, { slug: SLUG, path: "index.html" })).toThrow(/design plan/);

    // A plan with an informal shape is refused with the fields to use.
    expect(() => tools.saveDesignPlanTool(f, { slug: SLUG, plan: { ...PLAN, signature: { ...PLAN.signature, beats: [] } } })).toThrow(/signature\.beats/);
    expect(tools.saveDesignPlanTool(f, { slug: SLUG, plan: PLAN }).state).toBe("awaiting");
    expect(planState(paths)).toBe("awaiting");
    expect(write("about/index.html")).toThrow(/waiting for the operator's approval/);

    approvePlan(paths, "panel:eren");
    expect(planState(paths)).toBe("approved");
    expect(write("about/index.html")).not.toThrow();

    // Edited after approval: no longer approved.
    const file = path.join(paths.root, "design-plan.json");
    writeFileSync(file, readFileSync(file, "utf8").replace("Katmanlı Kabarma", "Başka Bir Şey"));
    expect(planState(paths)).toBe("changed");
    expect(write("about/index.html")).toThrow(/changed after the operator approved/);
  });

  it("keeps earlier plans for a new idea, starts over on a redesign, and a chosen proposal waives the plan", async () => {
    const { f, paths } = await client();
    requirePlan(paths);
    tools.saveDesignPlanTool(f, { slug: SLUG, plan: PLAN });
    approvePlan(paths, "panel:eren");
    tools.saveDesignPlanTool(f, {
      slug: SLUG,
      plan: { ...PLAN, concept: "Başka bir fikir: fırının ağzı ve kor ışığı.", differs: "Kaynak fırın, somun değil." },
    });
    expect(previousPlans(paths)).toHaveLength(1);
    expect(planState(paths)).toBe("awaiting"); // a new plan is never approved by itself
    approvePlan(paths, "panel:eren");
    resetPlanApproval(paths);
    expect(planState(paths)).toBe("awaiting");
    waivePlan(paths);
    expect(planState(paths)).toBe("not-required");
  });

  it("fails the build of a new design without an approved plan", async () => {
    const { f, paths } = await client();
    requirePlan(paths);
    const r = await tools.buildSite(f, { slug: SLUG });
    expect(r.passed).toBe(false);
    expect(readFileSync(paths.qualityReport, "utf8")).toMatch(/Design plan \(approved by the operator\) \| FAIL/);
  });
});

describe("signature motion check", () => {
  const page = (body: string, style = "@media (prefers-reduced-motion: reduce) { * { animation: none } }") =>
    `<!doctype html><html><head><style>${style}</style></head><body>${body}</body></html>`;

  it("counts animated steps from keyframes in use, Web Animations, the kit's sequence and its attributes", () => {
    expect(countMotionSteps(page("<p>x</p>", "@keyframes a{to{opacity:1}} .x{animation: a 1s}"))).toBe(1);
    expect(countMotionSteps(page("<p>x</p>", "@keyframes unused{to{opacity:1}}"))).toBe(0);
    expect(countMotionSteps(page('<script>el.animate([], 1); SFMotion.sequence([{ at: 0 }, { at: 200 }])</script><svg><path data-draw d="M0 0"/></svg>'))).toBe(
      4,
    );
  });

  it("fails a one-step motion or a missing still state for new designs, and only warns for older sites", () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), "sf-sig-"));
    mkdirSync(path.join(dist, "brand"));
    expect(checkSignature(dist, true, 3)?.status).toBe("fail"); // missing
    expect(checkSignature(dist, false, null)).toBeNull();
    writeFileSync(path.join(dist, "brand", "signature.html"), page("<p>x</p>", "@keyframes a{to{opacity:1}} p{animation:a 1s}"));
    expect(checkSignature(dist, true, 3)?.status).toBe("fail");
    expect(checkSignature(dist, false, null)?.status).toBe("warn");
    writeFileSync(
      path.join(dist, "brand", "signature.html"),
      page("<script>SFMotion.sequence([{ at: 0 }, { at: 250 }, { at: 700 }, { at: 900 }])</script>", "p{} @media (prefers-reduced-motion: reduce) {}"),
    );
    expect(checkSignature(dist, true, 4)?.status).toBe("pass");
  });

  it("puts the motion kit inline where the demo is shown on its own", () => {
    const html = inlineMotionKit('<p>x</p><script src="/js/motion.js" defer></script>');
    expect(html).toContain("window.SFMotion");
    expect(html.startsWith("<p>x</p><script>/*")).toBe(true); // the tag itself is replaced by the code
    expect(readFileSync(path.join(FACTORY_ROOT, "rules", "site-kit", "motion.js"), "utf8")).toContain("SFMotion.sequence");
  });
});
