import { z } from "zod";
import { FactoryError } from "./errors.js";
import { contentHash, dirHash, readJsonIfExists, writeJson } from "./files.js";

/**
 * Human sign-offs. Only the approve CLI (run by a person in a terminal) writes this file;
 * the MCP server only reads it. Each approval pins the content hash at the moment it was
 * given, so any later change to config, text or images silently invalidates it.
 */
export const APPROVAL_KINDS = ["content", "visual", "production"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
/** Approvals that are about the built site, not just its inputs. */
const OUTPUT_APPROVALS: ReadonlySet<ApprovalKind> = new Set(["visual", "production"]);

const ApprovalSchema = z.object({
  kind: z.enum(APPROVAL_KINDS),
  by: z.string().min(1),
  at: z.string(),
  hash: z.string(),
  /** Hash of dist/ at approval time. Required for visual/production; older approvals without it no longer count. */
  distHash: z.string().optional(),
  note: z.string().optional(),
});
const ApprovalsFileSchema = z.object({ approvals: z.array(ApprovalSchema) });
export type Approval = z.infer<typeof ApprovalSchema>;

export function readApprovals(file: string): Approval[] {
  const raw = readJsonIfExists(file);
  if (raw === undefined) return [];
  const parsed = ApprovalsFileSchema.safeParse(raw);
  return parsed.success ? parsed.data.approvals : [];
}

export function addApproval(file: string, approval: Approval): void {
  writeJson(file, { approvals: [...readApprovals(file), approval] });
}

export interface ApprovalState {
  readonly hash: string;
  readonly valid: Record<ApprovalKind, Approval | null>;
}

/**
 * The latest approval of each kind that still matches the current content.
 * Visual and production approvals must also match `currentDistHash` (the last build's output),
 * so a template change or an edited dist/ invalidates them even when the content is unchanged.
 */
export function approvalState(clientRoot: string, approvalsFile: string, currentDistHash: string | null = null): ApprovalState {
  const hash = contentHash(clientRoot);
  const valid = { content: null, visual: null, production: null } as Record<ApprovalKind, Approval | null>;
  for (const a of readApprovals(approvalsFile)) {
    if (a.hash !== hash) continue;
    if (OUTPUT_APPROVALS.has(a.kind) && (currentDistHash === null || a.distHash !== currentDistHash)) continue;
    valid[a.kind] = a;
  }
  return { hash, valid };
}

/**
 * What the operator typed after the slug. "site" approves content and visuals in one go: the operator
 * looked at the built site, which shows both. Production stays separate (it needs the client's OK).
 */
export const SITE_APPROVAL = "site";
export function approvalTargets(arg: string): ApprovalKind[] | null {
  if (arg === SITE_APPROVAL) return ["content", "visual"];
  return (APPROVAL_KINDS as readonly string[]).includes(arg) ? [arg as ApprovalKind] : null;
}

export interface BuildPin {
  readonly hash: string;
  readonly passed: boolean;
  readonly distHash?: string;
}

export interface ApprovalPins {
  readonly hash: string;
  readonly distHash?: string;
}

/**
 * What an approval of `kind` would pin right now. Output approvals need a passing build of the
 * current content whose dist/ is still exactly what was built; otherwise there is nothing to approve.
 */
export function approvalPins(kind: ApprovalKind, clientRoot: string, distDir: string, build: BuildPin | null): ApprovalPins {
  const hash = contentHash(clientRoot);
  if (!OUTPUT_APPROVALS.has(kind)) return { hash };
  if (!build || build.hash !== hash || !build.passed || !build.distHash) {
    throw new FactoryError(`Cannot approve "${kind}": there is no passing build for the current content.`, "Run build_site first.");
  }
  if (dirHash(distDir) !== build.distHash) {
    throw new FactoryError(`Cannot approve "${kind}": dist/ changed after the last build.`, "Run build_site again, then review.");
  }
  return { hash, distHash: build.distHash };
}
