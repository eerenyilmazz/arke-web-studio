import { existsSync } from "node:fs";
import path from "node:path";
import { FACTORY_ROOT, type FactoryConfig } from "../config.js";
import { loadValidClient, type BuildRecord } from "../lib/client.js";
import { run } from "../lib/exec.js";
import { contentHash, dirHash, writeJson, writeText } from "../lib/files.js";
import { assertSlug, safeJoin } from "../lib/paths.js";
import { checkInputs, checkOutput, renderReport, type CheckResult } from "../lib/quality.js";
import { buildCustomSite, checkBrand, checkCustomCode, checkLibraryLeftovers, isCustom } from "../lib/custom-site.js";
import { takeScreenshots, takeSignatureFrames } from "../lib/screenshots.js";
import { checkImages, checkLegal, checkSeo } from "../lib/seo.js";
import { checkLanguages } from "../lib/i18n-check.js";
import { checkKitParts } from "../lib/kit-check.js";
import { planState, readPlan } from "../lib/design-plan.js";
import { checkSignature } from "../lib/signature-check.js";
import { checkCurrency } from "../lib/currency-check.js";
import { effectiveFormAction } from "../lib/form.js";
import { buildEnv } from "./shared.js";

/** The build tool: checks inputs, builds the site (template or custom), runs the quality checks. */

// ---------------------------------------------------------------- build

export async function buildSite(factory: FactoryConfig, args: { slug: string }) {
  const { paths, config, content } = loadValidClient(factory, assertSlug(args.slug));
  const results: CheckResult[] = [{ name: "Config and content schema", status: "pass", detail: `locales: ${config.i18n.locales.join(", ")}` }];
  results.push(...checkInputs(paths.root, config, content));

  // Pin the inputs before building: if they change while the build runs, the output no longer matches them.
  const hashBefore = contentHash(paths.root);
  let buildOutput = "";
  if (isCustom(config.template)) {
    // The agent wrote the site itself: copy it, then check the code and the brand identity.
    const plan = planState(paths);
    if (plan !== "not-required")
      results.push(
        plan === "approved"
          ? { name: "Design plan (approved by Eren)", status: "pass", detail: "Built to the approved plan." }
          : {
              name: "Design plan (approved by Eren)",
              status: "fail",
              detail:
                plan === "changed"
                  ? "design-plan.json changed after approval; Eren must approve it again."
                  : "No approved design plan yet: Eren approves it in the panel first.",
            },
      );
    if (results.some((r) => r.status === "fail")) {
      results.push({ name: "Custom site build", status: "skip", detail: "Skipped because input checks failed." });
    } else {
      const built = buildCustomSite(paths);
      results.push(built);
      if (built.status === "pass") {
        results.push(...checkOutput(paths.distDir, config));
        results.push(...checkCustomCode(paths.distDir, effectiveFormAction(paths.factoryDir)));
        results.push(...checkBrand(paths.distDir, config.brand.logo));
        results.push(...checkLibraryLeftovers(paths.distDir, paths.factoryDir));
        const languages = checkLanguages(paths.distDir, config.i18n.defaultLocale, config.i18n.locales, config.site.domain ?? null);
        if (languages) results.push(languages);
        results.push(checkKitParts(paths.distDir));
        results.push(checkCurrency(paths.distDir, config.business.currency));
        results.push(checkSeo(paths.distDir, { name: config.business.name, phone: config.contact.phone ?? null, domain: config.site.domain ?? null }));
        results.push(checkImages(paths.distDir), checkLegal(paths.distDir, config.business.country));
        results.push(await takeScreenshots(paths.distDir, path.join(paths.factoryDir, "shots")));
        const planned = plan !== "not-required" ? readPlan(paths) : null;
        const signature = checkSignature(paths.distDir, plan !== "not-required", planned?.signature.beats.length ?? null);
        if (signature) results.push(signature);
        const frames = await takeSignatureFrames(paths.distDir, path.join(paths.factoryDir, "shots"), planned?.signature.totalMs ?? 2000);
        if (frames) results.push(frames);
      }
    }
  } else if (!existsSync(path.join(safeJoin(factory.templatesDir, config.template), "package.json"))) {
    results.push({ name: "Template build", status: "fail", detail: `Template "${config.template}" not found in templates/. See README: template contract.` });
  } else if (!existsSync(path.join(safeJoin(factory.templatesDir, config.template), "node_modules"))) {
    results.push({ name: "Template build", status: "fail", detail: `Run "npm install" once in templates/${config.template}.` });
  } else if (results.some((r) => r.status === "fail")) {
    results.push({ name: "Template build", status: "skip", detail: "Skipped because input checks failed." });
  } else {
    const res = await run("npm", ["run", "build", "--silent"], {
      cwd: safeJoin(factory.templatesDir, config.template),
      timeoutMs: factory.limits.buildTimeoutMs,
      env: buildEnv(paths.root, paths.distDir),
    });
    buildOutput = `${res.stdout}\n${res.stderr}`.trim();
    results.push({
      name: "Template build",
      status: res.code === 0 ? "pass" : "fail",
      detail: res.code === 0 ? `templates/${config.template}` : `exit ${res.code}: ${buildOutput.slice(-600)}`,
    });
    if (res.code === 0) results.push(...checkOutput(paths.distDir, config));
  }

  results.push(await runImpeccable(paths.distDir, results));

  const hash = hashBefore;
  if (contentHash(paths.root) !== hashBefore) {
    results.push({ name: "Inputs unchanged during build", status: "fail", detail: "Config, content or assets changed while building. Run build_site again." });
  }
  const failures = results.filter((r) => r.status === "fail").map((r) => `${r.name}: ${r.detail}`);
  const distHash = dirHash(paths.distDir);
  const record: BuildRecord = { hash, at: new Date().toISOString(), passed: failures.length === 0, failures, ...(distHash ? { distHash } : {}) };
  writeJson(paths.buildRecord, record);
  writeText(paths.qualityReport, renderReport(config.slug, hash, results));

  return {
    passed: record.passed,
    report: "quality-report.md",
    dist: record.passed ? paths.distDir : null,
    checks: results,
    // Log only when something failed: it is long and costs tokens on every successful build.
    buildLogTail: !record.passed && buildOutput ? buildOutput.slice(-1500) : undefined,
    next: record.passed
      ? "Ask Eren to open dist/ locally and review it against the design checklist (visual approval)."
      : isCustom(config.template)
        ? "Fix the failed checks in config, content or the site files (write_site_file), then build again."
        : "Fix the failed checks (config/content only, never the template), then build again.",
  };
}

async function runImpeccable(distDir: string, prior: CheckResult[]): Promise<CheckResult> {
  const bin = path.join(FACTORY_ROOT, "node_modules", ".bin", process.platform === "win32" ? "impeccable.cmd" : "impeccable");
  if (prior.some((r) => r.name === "Build output" && r.status === "pass") === false) {
    return { name: "Impeccable design lint", status: "skip", detail: "No build output." };
  }
  if (!existsSync(bin)) return { name: "Impeccable design lint", status: "skip", detail: "Not installed (optional: npm i -D impeccable)." };
  const res = await run(bin, ["detect", "--json", distDir], {
    cwd: FACTORY_ROOT,
    timeoutMs: 120_000,
    env: { IMPECCABLE_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" },
    maxOutputChars: IMPECCABLE_MAX_OUTPUT,
  });
  // Exit 0 = clean, 2 = findings (warnings included), 1 = could not scan.
  if (res.code === 0) return { name: "Impeccable design lint", status: "pass", detail: "No findings." };
  if (res.code !== 2) return { name: "Impeccable design lint", status: "warn", detail: `Could not scan: ${res.stderr.slice(-300)}` };
  return summariseImpeccable(res.stdout, distDir);
}

const IMPECCABLE_MAX_OUTPUT = 2_000_000;

interface ImpeccableFinding {
  readonly antipattern?: string;
  readonly severity?: string;
  /** Absolute path of the page or stylesheet, a line (0 when unknown) and what was measured ("text #b9c0d0 on bg #172544"). */
  readonly file?: string;
  readonly line?: number;
  readonly snippet?: string;
}

/** How many distinct places the build lists, so the agent can find them without the detail growing without end. */
const IMPECCABLE_MAX_PLACES = 20;

/**
 * Where each finding is: the same measurement on several pages is one line ("gray-on-color: text #b9c0d0 on bg
 * #172544 · about/, blog/"), so the agent can search the CSS for the exact colours or snippet instead of guessing.
 */
function impeccablePlaces(findings: readonly ImpeccableFinding[], distDir: string | null): string {
  const groups = new Map<string, Set<string>>();
  for (const f of findings) {
    const where = f.file ? (distDir ? path.relative(distDir, f.file) : path.basename(f.file)) : "?";
    const page = where.replace(/index\.html$/, "") || "/";
    const key = `${f.antipattern ?? "unknown"}: ${(f.snippet ?? "").slice(0, 120)}${f.line ? ` (line ${f.line})` : ""}`;
    (groups.get(key) ?? groups.set(key, new Set()).get(key)!).add(page);
  }
  const lines = [...groups].map(([k, pages]) => `${k} · ${[...pages].slice(0, 4).join(", ")}${pages.size > 4 ? ` +${pages.size - 4}` : ""}`);
  return lines.slice(0, IMPECCABLE_MAX_PLACES).join("; ") + (lines.length > IMPECCABLE_MAX_PLACES ? `; …and ${lines.length - IMPECCABLE_MAX_PLACES} more` : "");
}

/**
 * Design findings are advice, not proof the site is broken: warnings are reported (and the agent can act
 * on them), only findings marked "error" fail the build.
 */
export function summariseImpeccable(stdout: string, distDir: string | null = null): CheckResult {
  let findings: ImpeccableFinding[];
  try {
    const parsed: unknown = JSON.parse(stdout);
    findings = Array.isArray(parsed) ? (parsed as ImpeccableFinding[]) : [];
  } catch {
    return { name: "Impeccable design lint", status: "warn", detail: "Findings could not be read." };
  }
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.antipattern ?? "unknown", (counts.get(f.antipattern ?? "unknown") ?? 0) + 1);
  const top = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, n]) => `${k} ×${n}`)
    .join(", ");
  const errors = findings.filter((f) => f.severity === "error").length;
  return {
    name: "Impeccable design lint",
    status: errors > 0 ? "fail" : findings.length > 0 ? "warn" : "pass",
    detail: findings.length
      ? `${findings.length} finding(s)${errors ? `, ${errors} error(s)` : ""}: ${top}. Where: ${impeccablePlaces(findings, distDir)}`
      : "No findings.",
  };
}
