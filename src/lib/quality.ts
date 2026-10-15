import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Content } from "../schema/content.js";
import type { SiteConfig } from "../schema/site-config.js";
import { AA_LARGE_TEXT, AA_NORMAL_TEXT, contrastRatio } from "./contrast.js";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

const WHITE = "#FFFFFF";
/** Display fonts that only have capitals or small caps (headline-only faces). */
const CAPS_ONLY_FONT = /\bSC\b|small ?caps|cinzel|trajan|bebas|anton|oswald|league gothic|alfa slab one|abril fatface/i;

/** Checks that need only config + content (run before the template build). */
export function checkInputs(clientRoot: string, config: SiteConfig, content: Record<string, Content>): CheckResult[] {
  const results: CheckResult[] = [];
  const p = config.design.palette;

  const bodyRatio = contrastRatio(p.text, p.background);
  results.push({
    name: "Contrast: body text on background",
    status: bodyRatio >= AA_NORMAL_TEXT ? "pass" : "fail",
    detail: `${bodyRatio.toFixed(2)}:1 (needs ${AA_NORMAL_TEXT}:1)`,
  });

  const onPrimary = Math.max(contrastRatio(WHITE, p.primary), contrastRatio(p.text, p.primary));
  results.push({
    name: "Contrast: button text on primary",
    status: onPrimary >= AA_NORMAL_TEXT ? "pass" : "fail",
    detail: `best of white/text colour = ${onPrimary.toFixed(2)}:1 (needs ${AA_NORMAL_TEXT}:1). If it fails, darken or lighten primary.`,
  });

  const accentRatio = contrastRatio(p.accent, p.background);
  results.push({
    name: "Contrast: accent on background (large text / UI)",
    status: accentRatio >= AA_LARGE_TEXT ? "pass" : "warn",
    detail: `${accentRatio.toFixed(2)}:1 (needs ${AA_LARGE_TEXT}:1 if used for text or icons)`,
  });

  const capsFont = [config.design.fonts.heading, config.design.fonts.body].find((f) => CAPS_ONLY_FONT.test(f));
  if (capsFont) {
    results.push({
      name: "Fonts have lowercase letters",
      status: "warn",
      detail: `"${capsFont}" sets every word in capitals, which reads as shouting and is hard to scan. Pick a font with normal lowercase (rules/design-rules.md, Typography).`,
    });
  }

  const referenced = new Set<string>();
  if (config.brand.logo) referenced.add(config.brand.logo);
  for (const c of Object.values(content)) for (const g of c.gallery) referenced.add(g.src);
  const missingAssets = [...referenced].filter((rel) => !existsSync(path.join(clientRoot, rel)));
  results.push({
    name: "Referenced images exist",
    status: missingAssets.length === 0 ? "pass" : "fail",
    detail: missingAssets.length === 0 ? `${referenced.size} referenced` : `missing: ${missingAssets.join(", ")}`,
  });

  const locales = Object.keys(content);
  if (locales.length > 1) {
    const shape = (c: Content) => `${c.services.length}/${c.gallery.length}/${c.testimonials.length}/${c.faq.length}`;
    const shapes = new Set(locales.map((l) => shape(content[l] as Content)));
    results.push({
      name: "Locales have matching content",
      status: shapes.size === 1 ? "pass" : "fail",
      detail: shapes.size === 1 ? `${locales.join(", ")} match` : `item counts differ (services/gallery/testimonials/faq): ${locales.map((l) => `${l}=${shape(content[l] as Content)}`).join(" ")}`,
    });
  }

  const usesForm = Object.values(config.sections).some((s) => s?.includes("contact-form"));
  if (usesForm) {
    results.push({
      name: "Contact form has a recipient",
      status: "pass",
      detail: config.contact.formRecipient ?? `${config.contact.email} (public email)`,
    });
  }
  if (config.legal.companyNumber === null) {
    results.push({ name: "Legal details", status: "warn", detail: "No company number. Fine for sole traders; UK limited companies must show it." });
  }
  return results;
}

const LEAK_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/lorem ipsum/i, "placeholder text (lorem ipsum)"],
  [/\bundefined\b|\[object Object\]|\bNaN\b/, "rendering bug (undefined / [object Object] / NaN)"],
  [/\bTODO\b|\bFIXME\b/, "TODO/FIXME left in output"],
  [/https?:\/\/(?:localhost|127\.0\.0\.1)/i, "localhost URL"],
];

/** Checks on the built HTML in dist/. */
export function checkOutput(distDir: string, config: SiteConfig): CheckResult[] {
  if (!existsSync(path.join(distDir, "index.html"))) {
    return [{ name: "Build output", status: "fail", detail: "dist/index.html not found. The template build did not produce a site." }];
  }
  const htmlFiles = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => path.join(e.parentPath, e.name));

  const problems: string[] = [];
  const warnings: string[] = [];
  for (const file of htmlFiles) {
    const rel = path.relative(distDir, file);
    const html = readFileSync(file, "utf8");
    if (!/<html[^>]*\slang=["'][a-z]{2}/i.test(html)) problems.push(`${rel}: <html> has no lang`);
    if (!/<title>[^<]{3,}<\/title>/i.test(html)) problems.push(`${rel}: missing <title>`);
    if (!/<meta[^>]+name=["']description["'][^>]*content=["'][^"']{10,}/i.test(html)) warnings.push(`${rel}: missing meta description`);
    for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
      if (!/\salt=/i.test(img)) problems.push(`${rel}: <img> without alt`);
    }
    for (const [pattern, label] of LEAK_PATTERNS) {
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
      if (pattern.test(text)) problems.push(`${rel}: ${label}`);
    }
    if (!html.includes(config.business.name.replace(/&/g, "&amp;")) && !html.includes(config.business.name)) {
      warnings.push(`${rel}: business name not found`);
    }
  }

  return [
    { name: "Build output", status: "pass", detail: `${htmlFiles.length} HTML page(s)` },
    {
      name: "HTML basics (lang, title, alt, no placeholders)",
      status: problems.length === 0 ? "pass" : "fail",
      detail: problems.length === 0 ? "ok" : problems.slice(0, 20).join("; "),
    },
    ...(warnings.length > 0 ? [{ name: "HTML warnings", status: "warn" as const, detail: warnings.slice(0, 20).join("; ") }] : []),
  ];
}

export function renderReport(slug: string, hash: string, results: readonly CheckResult[]): string {
  const icon: Record<CheckStatus, string> = { pass: "PASS", fail: "FAIL", warn: "WARN", skip: "SKIP" };
  const failed = results.filter((r) => r.status === "fail").length;
  const lines = [
    `# Quality report: ${slug}`,
    "",
    `Content hash: \`${hash}\` · ${new Date().toISOString()}`,
    "",
    failed === 0 ? "**Result: passed.** Visual review by a person is still required (design checklist in rules/design-rules.md)." : `**Result: ${failed} check(s) failed.** Fix them and run build_site again.`,
    "",
    "| Check | Result | Detail |",
    "| --- | --- | --- |",
    ...results.map((r) => `| ${r.name} | ${icon[r.status]} | ${r.detail.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`),
    "",
    "Not automated yet: Lighthouse scores and screenshots at 375/768/1440 px. Check them by hand before the visual approval.",
    "",
  ];
  return lines.join("\n");
}
