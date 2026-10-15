import { z } from "zod";
import { contentHash, readJsonIfExists, writeJson } from "./files.js";

/**
 * Human sign-offs. Only the approve CLI (run by a person in a terminal) writes this file;
 * the MCP server only reads it. Each approval pins the content hash at the moment it was
 * given, so any later change to config, text or images silently invalidates it.
 */
export const APPROVAL_KINDS = ["content", "visual", "production"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

const ApprovalSchema = z.object({
  kind: z.enum(APPROVAL_KINDS),
  by: z.string().min(1),
  at: z.string(),
  hash: z.string(),
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

/** The latest approval of each kind that still matches the current content. */
export function approvalState(clientRoot: string, approvalsFile: string): ApprovalState {
  const hash = contentHash(clientRoot);
  const valid = { content: null, visual: null, production: null } as Record<ApprovalKind, Approval | null>;
  for (const a of readApprovals(approvalsFile)) {
    if (a.hash === hash) valid[a.kind] = a;
  }
  return { hash, valid };
}
