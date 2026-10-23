import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./quality.js";

/**
 * The signature motion's demo page (brand/signature.html) must really move: several animated steps (CSS keyframes
 * in use, Web Animations calls or the factory's motion kit), and a still version for visitors who ask for less
 * motion. Required for new designs (those with a design plan); a warning for older sites.
 */
const MIN_STEPS = 3;

export function countMotionSteps(html: string): number {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  const used = new Set<string>();
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) for (const name of defined) if (m[1]!.includes(name!)) used.add(name!);
  const waapi = (html.match(/\.animate\(/g) ?? []).length;
  const kit = (html.match(/\bdata-(draw|reveal|split|scene|count)\b/g) ?? []).length;
  const sequence = (html.match(/\bat\s*:\s*\d+/g) ?? []).length; // SFMotion.sequence steps
  return used.size + waapi + kit + sequence;
}

export function checkSignature(distDir: string, required: boolean, plannedBeats: number | null): CheckResult | null {
  const name = "Signature motion (moves in steps, still under reduced motion)";
  const file = path.join(distDir, "brand", "signature.html");
  if (!existsSync(file))
    return required
      ? { name, status: "fail", detail: "brand/signature.html is missing: write the signature motion's demo page (rules/custom-site.md)." }
      : null;
  const html = readFileSync(file, "utf8");
  const steps = countMotionSteps(html);
  const want = Math.max(MIN_STEPS, Math.min(plannedBeats ?? MIN_STEPS, 6));
  const problems: string[] = [];
  if (steps < want) problems.push(`${steps} animated step(s) found, at least ${want} expected${plannedBeats ? ` (the plan has ${plannedBeats} beats)` : ""}`);
  if (!/prefers-reduced-motion/.test(html)) problems.push("no prefers-reduced-motion handling (show the final, composed state)");
  if (!problems.length) return { name, status: "pass", detail: `${steps} animated steps` };
  return {
    name,
    status: required ? "fail" : "warn",
    detail: `${problems.join("; ")}. A fade or one moving part is not a signature: build it from the plan's beats (rules/custom-site.md, "Signature motion").`,
  };
}
