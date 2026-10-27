import type { z } from "zod";
import { getAtPath } from "./merge.js";

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult<T> {
  readonly data: T | null;
  /** Required fields that have no value yet: normal while answers are still coming in. */
  readonly missing: FieldIssue[];
  /** Fields that have a value but the value is wrong: must be fixed before saving. */
  readonly invalid: FieldIssue[];
}

/**
 * Validates a draft against the full schema and splits problems into "not answered yet"
 * versus "answered wrongly". Drafts may be incomplete; they may never be wrong.
 */
export function validateDraft<S extends z.ZodType>(schema: S, draft: unknown): ValidationResult<z.infer<S>> {
  const result = schema.safeParse(draft);
  if (result.success) return { data: result.data, missing: [], invalid: [] };

  const missing: FieldIssue[] = [];
  const invalid: FieldIssue[] = [];
  for (const issue of result.error.issues) {
    const entry = { path: issue.path.map(String).join(".") || "(root)", message: issue.message };
    const value = getAtPath(draft, issue.path);
    const isMissing = value === undefined && issue.code !== "custom";
    (isMissing ? missing : invalid).push(entry);
  }
  return { data: null, missing: dedupe(missing), invalid: dedupe(invalid) };
}

function dedupe(items: FieldIssue[]): FieldIssue[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.path) ? false : (seen.add(i.path), true)));
}
