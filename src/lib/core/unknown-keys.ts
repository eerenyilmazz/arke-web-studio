import type { z } from "zod";

/** Wrappers that do not change the shape of the value inside them. */
const TRANSPARENT_WRAPPERS = new Set(["optional", "nullable", "default", "prefault", "readonly", "catch", "nonoptional"]);

interface ZodDefLike {
  readonly type: string;
  readonly innerType?: z.ZodType;
  readonly in?: z.ZodType;
  readonly element?: z.ZodType;
  readonly valueType?: z.ZodType;
  readonly shape?: Record<string, z.ZodType>;
}

function defOf(schema: z.ZodType): ZodDefLike {
  return (schema as unknown as { _zod: { def: ZodDefLike } })._zod.def;
}

function unwrap(schema: z.ZodType): z.ZodType {
  let current = schema;
  for (;;) {
    const def = defOf(current);
    if (TRANSPARENT_WRAPPERS.has(def.type) && def.innerType) current = def.innerType;
    else if (def.type === "pipe" && def.in) current = def.in;
    else return current;
  }
}

/**
 * Lists keys in `value` that the schema does not define (e.g. a typo like "contakt").
 * Zod objects strip unknown keys silently, so without this check a misspelt field would be
 * reported as saved while the template never sees it. Only the incoming patch is checked,
 * so files already on disk keep working unchanged. `hints` adds the fields that exist at each unknown one's place.
 */
export function findUnknownKeys(schema: z.ZodType, value: unknown, prefix = "", hints = false): string[] {
  if (value === null || typeof value !== "object") return [];
  const inner = unwrap(schema);
  const def = defOf(inner);

  if (def.type === "array" && def.element && Array.isArray(value)) {
    return value.flatMap((item, i) => findUnknownKeys(def.element as z.ZodType, item, `${prefix}${i}.`, hints));
  }
  if (def.type === "record" && def.valueType && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([k, v]) => findUnknownKeys(def.valueType as z.ZodType, v, `${prefix}${k}.`, hints));
  }
  if (def.type === "object" && def.shape && !Array.isArray(value)) {
    const shape = def.shape;
    return Object.entries(value).flatMap(([k, v]) => {
      const child = shape[k];
      if (child) return findUnknownKeys(child, v, `${prefix}${k}.`, hints);
      // With hints, the fields that do exist at that place, so the next try is right instead of another guess.
      return [hints ? `${prefix}${k} (fields there: ${Object.keys(shape).join(", ")})` : `${prefix}${k}`];
    });
  }
  return [];
}
