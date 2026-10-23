import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readJsonIfExists, writeJson } from "./files.js";
import type { ClientPaths } from "./paths.js";

/**
 * Design plan: before a new design is built, the agent describes how it will design the site (concept, palette,
 * type, hero, pages, the signature motion as a timed storyboard) and stops. The operator reads it in the panel and either
 * approves it (then the site is built exactly to it) or asks for a new idea with notes.
 *
 * The plan lives in the client folder (design-plan.json, never published). The approval is written by the panel in
 * .factory/, which the agent cannot write, together with the plan's hash: a plan edited after approval is no longer
 * approved. The gate applies only to clients the panel marked (new designs from 1.24.0 on); older sites are untouched.
 */
export const PLAN_FILE = "design-plan.json";
const HISTORY_DIR = "design-plans";
const APPROVAL_FILE = "design-plan-approval.json";
const REQUIRED_FILE = "design-plan-required.json";

const text = (max: number) => z.string().trim().min(2).max(max);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a #RRGGBB colour");

export const DesignPlanSchema = z
  .object({
    /** One or two sentences: the idea the whole design grows from. */
    concept: text(600),
    /** Where the idea comes from: the logo's shapes, the craft's material, the place. */
    source: text(300),
    tone: z.array(text(40)).min(2).max(4),
    palette: z
      .array(z.object({ name: text(30), hex, role: text(60) }).strict())
      .min(3)
      .max(6),
    fonts: z.object({ heading: text(60), body: text(60), mono: text(60).optional() }).strict(),
    /** The first screen: what fills it, where the signature plays, how the headline sits. */
    hero: text(700),
    pages: z
      .array(
        z
          .object({
            name: text(40),
            sections: z
              .array(z.object({ name: text(60), purpose: text(240) }).strict())
              .min(1)
              .max(10),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    signature: z
      .object({
        /** Formal, descriptive name in the site's main language (e.g. "Katmanlı Açılış", "Layered Reveal"). */
        name: text(40),
        idea: text(300),
        trigger: z.enum(["load", "scroll", "hover", "pointer"]),
        /** The storyboard: what moves, when, for how long and on which curve. */
        beats: z
          .array(
            z.object({ atMs: z.number().int().min(0).max(6000), durationMs: z.number().int().min(80).max(4000), what: text(200), easing: text(60) }).strict(),
          )
          .min(3)
          .max(8),
        totalMs: z.number().int().min(800).max(6000),
        reducedMotion: text(200),
      })
      .strict(),
    animations: z
      .array(z.object({ name: text(40), trigger: z.enum(["load", "scroll", "hover", "pointer", "focus"]), what: text(200) }).strict())
      .max(4)
      .default([]),
    /** After a "new idea" request: how this plan differs from the earlier ones. */
    differs: text(400).optional(),
  })
  .strict();
export type DesignPlan = z.infer<typeof DesignPlanSchema>;

export type PlanState = "not-required" | "missing" | "awaiting" | "approved" | "changed";

const planPath = (p: ClientPaths) => path.join(p.root, PLAN_FILE);
const hashOf = (raw: string) => createHash("sha256").update(raw).digest("hex").slice(0, 16);

function readSafe(file: string): unknown {
  try {
    return readJsonIfExists(file);
  } catch {
    return undefined; // a broken file counts as no plan / no approval
  }
}

export function readPlan(p: ClientPaths): DesignPlan | null {
  const raw = readSafe(planPath(p));
  const parsed = DesignPlanSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Earlier plans (newest first), so a new idea is really new. */
export function previousPlans(p: ClientPaths): DesignPlan[] {
  const dir = path.join(p.root, HISTORY_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => DesignPlanSchema.safeParse(readSafe(path.join(dir, f))))
    .filter((r) => r.success)
    .map((r) => r.data as DesignPlan);
}

/** Saves a new plan (the previous one moves to design-plans/) and drops the earlier approval. */
export function savePlan(p: ClientPaths, plan: DesignPlan): void {
  const file = planPath(p);
  if (existsSync(file)) {
    const dir = path.join(p.root, HISTORY_DIR);
    mkdirSync(dir, { recursive: true });
    renameSync(file, path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
  }
  writeJson(file, plan);
  // A new plan is never approved by itself: an approval of the earlier plan no longer applies.
  rmSync(path.join(p.factoryDir, APPROVAL_FILE), { force: true });
}

export function planRequired(p: ClientPaths): boolean {
  return existsSync(path.join(p.factoryDir, REQUIRED_FILE));
}

/** Panel only: new designs from now on go through a plan first. */
export function requirePlan(p: ClientPaths): void {
  if (!planRequired(p)) writeJson(path.join(p.factoryDir, REQUIRED_FILE), { since: new Date().toISOString() });
}

export function planState(p: ClientPaths): PlanState {
  if (!planRequired(p)) return "not-required";
  const file = planPath(p);
  if (!existsSync(file) || !readPlan(p)) return "missing";
  const approval = readSafe(path.join(p.factoryDir, APPROVAL_FILE)) as { hash?: string } | undefined;
  if (!approval?.hash) return "awaiting";
  return approval.hash === hashOf(readFileSync(file, "utf8")) ? "approved" : "changed";
}

/** Panel only: a redesign starts over with a new plan (the old approval no longer counts). */
export function resetPlanApproval(p: ClientPaths): void {
  rmSync(path.join(p.factoryDir, APPROVAL_FILE), { force: true });
}

/** Panel only: The operator chose a full design proposal (3 proposals) themselves; that choice is the approval. */
export function waivePlan(p: ClientPaths): void {
  rmSync(path.join(p.factoryDir, REQUIRED_FILE), { force: true });
}

/** Panel only (the operator's click): approves the plan as it is now. */
export function approvePlan(p: ClientPaths, by: string): { hash: string } {
  const file = planPath(p);
  if (!readPlan(p)) throw new Error("Onaylanacak bir tasarım planı yok.");
  const hash = hashOf(readFileSync(file, "utf8"));
  writeJson(path.join(p.factoryDir, APPROVAL_FILE), { hash, at: new Date().toISOString(), by });
  return { hash };
}

/** Site files the agent may write before the plan is approved: only the signature preview, to show the motion. */
export function allowedBeforeApproval(rel: string): boolean {
  return rel.replaceAll("\\", "/") === "brand/signature.html";
}

/** What get_client_status tells the agent about the plan. */
export function planStatus(p: ClientPaths): { state: PlanState; next: string | null } {
  const state = planState(p);
  const next: Record<PlanState, string | null> = {
    "not-required": null,
    missing:
      "Before any design work: write the design plan with save_design_plan (and optionally site/brand/signature.html to show the motion), then STOP and summarise it for the operator. Write no pages.",
    awaiting: "The design plan waits for the operator's approval in the panel. Do not design or write pages; stop and say so.",
    approved: "The design plan is approved: build the site exactly to it (design-plan.json).",
    changed: "design-plan.json changed after the operator approved it. Do not build; tell the operator the plan needs approving again.",
  };
  return { state, next: next[state] };
}
