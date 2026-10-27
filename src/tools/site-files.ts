import { isAppSite, readProductRecord } from "../deploy/app.js";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FACTORY_ROOT, type FactoryConfig } from "../config.js";
import { RESEARCH_FILE, openClient, readDraftConfig } from "../lib/client/client.js";
import { FactoryError } from "../lib/core/errors.js";
import { assertSlug } from "../lib/core/paths.js";
import {
  editSiteFile,
  fileProblems,
  readSiteFileAround,
  siteMap,
  deleteSiteFile,
  isCustom,
  SIGNATURE_FILE,
  listSiteFiles,
  readSiteFile,
  writeSiteFile,
} from "../lib/site/custom-site.js";
import { searchKnowledge } from "../lib/site/knowledge.js";
import { effectiveFormAction } from "../lib/site/form.js";
import { allowedBeforeApproval, DesignPlanSchema, planState, previousPlans, savePlan } from "../lib/client/design-plan.js";
import type { ClientPaths } from "../lib/core/paths.js";

/** Tools for custom sites: reading and writing site files, the site map, design knowledge, research notes. */

// ---------------------------------------------------------------- custom site files

/**
 * New designs wait for the operator's approval of the design plan: until then only the signature preview may be written,
 * so no tokens go into pages the operator has not agreed to.
 */
function assertPlanAllows(paths: ClientPaths, rel: string): void {
  const state = planState(paths);
  if (state === "not-required" || state === "approved" || allowedBeforeApproval(rel)) return;
  throw new FactoryError(
    state === "changed"
      ? "Nothing written: design-plan.json changed after the operator approved it."
      : `Nothing written: the design plan is ${state === "missing" ? "not written yet" : "waiting for the operator's approval"}.`,
    state === "missing"
      ? "Write site/brand/signature.html (the motion's live demo) first, then the plan with save_design_plan; then stop and summarise it for the operator."
      : "Stop here and tell the operator the plan is waiting for their approval in the panel.",
  );
}

/** System and generic families: not a brand's heading face. */
const GENERIC_FONTS =
  /^(system-ui|-apple-system|blinkmacsystemfont|segoe ui|roboto|arial|helvetica( neue)?|verdana|tahoma|times( new roman)?|georgia|sans-serif|serif|monospace|ui-[a-z-]+|inherit)$/i;

/** The agent's design plan for a new design (rules/custom/plan.md). Saving it never approves it. */
export function saveDesignPlanTool(factory: FactoryConfig, args: { slug: string; plan: unknown }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const parsed = DesignPlanSchema.safeParse(args.plan);
  if (!parsed.success)
    throw new FactoryError(
      `Plan not saved: ${parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".") || "plan"} (${i.message})`)
        .join("; ")}`,
      "Fields: concept, source, tone[2–4], palette[3–6]{name,hex,role}, fonts{heading,body,mono?}, hero, pages[]{name,sections[]{name,purpose}}, signature{name,idea,trigger,beats[3–8]{atMs,durationMs,what,easing},totalMs,reducedMotion}, animations[]{name,trigger,what}, differs?",
    );
  // The heading font carries the brand: a real typeface, never the system stack.
  const heading = parsed.data.fonts.heading
    .split(",")[0]!
    .trim()
    .replace(/^["']|["']$/g, "");
  if (GENERIC_FONTS.test(heading))
    throw new FactoryError(
      `Plan not saved: the heading font "${heading}" is a system font.`,
      "Choose a typeface with character for the headings (a Google Font that fits the concept), and say why in the plan.",
    );
  // The operator judges the motion by watching it: the live demo comes before the plan.
  if (!existsSync(path.join(paths.root, "site", SIGNATURE_FILE)))
    throw new FactoryError(
      "Plan not saved: the signature motion has no live demo yet.",
      `Write site/${SIGNATURE_FILE} first (the storyboard's beats as a small self-contained page), then save the plan.`,
    );
  const earlier = previousPlans(paths).length;
  savePlan(paths, parsed.data);
  return {
    saved: true,
    state: "awaiting",
    earlierPlans: earlier,
    next: "Stop now. Summarise the plan for the operator in the panel's language (formal names, the signature storyboard in order); they approve it or asks for a new idea.",
  };
}

export function listSiteFilesTool(factory: FactoryConfig, args: { slug: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  return listSiteFiles(paths);
}

export function readSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string }) {
  return readSiteFile(openClient(factory, assertSlug(args.slug)), args.path);
}

export function writeSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string; content: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const template = (readDraftConfig(paths) as { template?: string }).template ?? "";
  if (!isCustom(template)) {
    throw new FactoryError(
      `Client "${args.slug}" uses the ${template} template, which you do not write code for.`,
      'Only sites with template "custom" are written by hand. Change config and content instead.',
    );
  }
  assertPlanAllows(paths, args.path);
  const written = writeSiteFile(paths, args.path, args.content);
  return withProblems(written, args.path, args.content, paths.factoryDir);
}

/** Write results carry the file's safety problems right away, so they are fixed before a build. */
function withProblems<T extends object>(result: T, rel: string, content: string, factoryDir: string) {
  const problems = fileProblems(rel, content, effectiveFormAction(factoryDir), isAppSite(readProductRecord({ factoryDir })));
  return problems.length ? { ...result, problems, fix: "The build will fail on these. Fix them now with edit_site_file." } : result;
}

export function editSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string; oldText: string; newText: string; all?: boolean }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const template = (readDraftConfig(paths) as { template?: string }).template ?? "";
  if (!isCustom(template)) throw new FactoryError(`Client "${args.slug}" uses the ${template} template, which you do not write code for.`);
  assertPlanAllows(paths, args.path);
  const r = editSiteFile(paths, args.path, args.oldText, args.newText, args.all ?? false);
  return withProblems(r, args.path, readSiteFile(paths, args.path).content, paths.factoryDir);
}

/** A few passages of design knowledge (rules and skills) for one question; see lib/site/knowledge.ts. */
export function searchDesignKnowledge(args: { query: string; k?: number }) {
  const hits = searchKnowledge(FACTORY_ROOT, args.query, args.k ?? 4);
  return {
    results: hits.map((h) => ({ source: h.source, heading: h.heading, text: h.text })),
    note: hits.length ? "Rules (rules/…) win over skills when they disagree." : "Nothing found; try other words (sector, section, colour, type, motion).",
  };
}

/** Research notes for a client (verified facts with sources, sector examples), reused by later jobs. */
export function saveResearchNotes(factory: FactoryConfig, args: { slug: string; notes: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  writeFileSync(path.join(paths.root, RESEARCH_FILE), `${args.notes.trim()}\n`);
  return { saved: true, chars: args.notes.length };
}

export function siteMapTool(factory: FactoryConfig, args: { slug: string }) {
  return { map: siteMap(openClient(factory, assertSlug(args.slug))) };
}

export function readSiteFileAroundTool(factory: FactoryConfig, args: { slug: string; path: string; around: string; lines?: number }) {
  return readSiteFileAround(openClient(factory, assertSlug(args.slug)), args.path, args.around, args.lines);
}

export function deleteSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  assertPlanAllows(paths, args.path);
  return deleteSiteFile(paths, args.path);
}
