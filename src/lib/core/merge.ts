type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * JSON-merge-patch style merge: objects merge recursively, arrays and scalars replace,
 * and `null` is kept as a value (several config fields are intentionally nullable).
 * Prototype-pollution keys are rejected.
 */
export function deepMerge(target: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) return structuredClone(patch);
  const base: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Key "${key}" is not allowed.`);
    base[key] = isPlainObject(value) ? deepMerge(base[key], value) : structuredClone(value);
  }
  return base;
}

/** Reads a value by path (["contact", "email"]); undefined if any step is missing. */
export function getAtPath(obj: unknown, pathParts: ReadonlyArray<string | number | symbol>): unknown {
  let cur: unknown = obj;
  for (const part of pathParts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number | symbol, unknown>)[part];
  }
  return cur;
}

export type { Json };
