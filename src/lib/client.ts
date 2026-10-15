import { existsSync } from "node:fs";
import type { FactoryConfig } from "../config.js";
import { ContentSchema, type Content } from "../schema/content.js";
import { QUESTIONS, type Question } from "../schema/questions.js";
import { SiteConfigSchema, type SiteConfig } from "../schema/site-config.js";
import { approvalState, type ApprovalKind } from "./approvals.js";
import { FactoryError } from "./errors.js";
import { readJson, readJsonIfExists } from "./files.js";
import { clientPaths, type ClientPaths } from "./paths.js";
import { validateDraft, type FieldIssue } from "./validation.js";

export interface BuildRecord {
  readonly hash: string;
  readonly at: string;
  readonly passed: boolean;
  readonly failures: string[];
  /** Hash of dist/ right after this build. Missing in records written before it existed. */
  readonly distHash?: string;
}

export interface DeployRecord {
  readonly hash: string;
  readonly at: string;
  readonly target: "preview" | "production";
  readonly url: string | null;
}

export type Stage =
  | "collecting-answers"
  | "design"
  | "content"
  | "awaiting-content-approval"
  | "build"
  | "awaiting-visual-approval"
  | "awaiting-production-approval"
  | "ready-to-deploy"
  | "live";

export interface ClientStatus {
  readonly slug: string;
  readonly stage: Stage;
  readonly nextStep: string;
  readonly config: { missing: FieldIssue[]; invalid: FieldIssue[] };
  readonly content: Record<string, { missing: FieldIssue[]; invalid: FieldIssue[] } | "file-missing">;
  readonly openQuestions: Array<Pick<Question, "id" | "round" | "audience" | "text">>;
  readonly approvals: Record<ApprovalKind, string | null>;
  readonly lastBuild: BuildRecord | null;
  readonly lastDeploy: DeployRecord | null;
  readonly contentHash: string;
}

export function openClient(factory: FactoryConfig, slug: string): ClientPaths {
  const paths = clientPaths(factory.clientsRoot, slug);
  if (!existsSync(paths.config)) {
    throw new FactoryError(`Client "${slug}" does not exist.`, "Call create_client first, or check the slug with list_clients.");
  }
  return paths;
}

export function readDraftConfig(paths: ClientPaths): Record<string, unknown> {
  const raw = readJson(paths.config);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new FactoryError("site.config.json is not an object.");
  return raw as Record<string, unknown>;
}

/** Locales listed in the draft config (falls back to the default locale or "en"). */
export function draftLocales(draft: Record<string, unknown>): string[] {
  const i18n = draft.i18n as { locales?: unknown; defaultLocale?: unknown } | undefined;
  if (Array.isArray(i18n?.locales) && i18n.locales.every((l) => typeof l === "string")) return i18n.locales as string[];
  return [typeof i18n?.defaultLocale === "string" ? i18n.defaultLocale : "en"];
}

/** Questions whose config targets are still missing, plus required record/content ones not yet confirmed. */
export function openQuestionsFor(missingPaths: readonly string[], contentMissing: boolean): Question[] {
  return QUESTIONS.filter((q) => {
    if (q.round === "later") return false;
    const configTargets = q.targets.filter((t) => t.startsWith("config:")).map((t) => t.slice("config:".length));
    const hitsConfig = configTargets.some((t) => missingPaths.some((m) => m === t || m.startsWith(`${t}.`) || t.startsWith(`${m}.`)));
    const hitsContent = contentMissing && q.required && q.targets.some((t) => t.startsWith("content:"));
    return hitsConfig || hitsContent;
  });
}

export function clientStatus(factory: FactoryConfig, slug: string): ClientStatus {
  const paths = openClient(factory, slug);
  const draft = readDraftConfig(paths);
  const cfg = validateDraft(SiteConfigSchema, draft);

  const content: ClientStatus["content"] = {};
  let contentOk = true;
  for (const locale of draftLocales(draft)) {
    const file = paths.content(locale);
    if (!existsSync(file)) {
      content[locale] = "file-missing";
      contentOk = false;
      continue;
    }
    const r = validateDraft(ContentSchema, readJson(file));
    content[locale] = { missing: r.missing, invalid: r.invalid };
    if (!r.data) contentOk = false;
  }

  const lastBuild = (readJsonIfExists(paths.buildRecord) as BuildRecord | undefined) ?? null;
  const { hash, valid } = approvalState(paths.root, paths.approvals, lastBuild?.distHash ?? null);
  const lastDeploy = (readJsonIfExists(paths.lastDeploy) as DeployRecord | undefined) ?? null;

  const missingPaths = cfg.missing.map((m) => m.path);
  const clientMissing = missingPaths.filter((p) => !p.startsWith("design"));
  const designMissing = missingPaths.some((p) => p.startsWith("design"));
  const buildCurrent = lastBuild !== null && lastBuild.hash === hash && lastBuild.passed;

  let stage: Stage;
  let nextStep: string;
  if (clientMissing.length > 0 || cfg.invalid.length > 0) {
    stage = "collecting-answers";
    nextStep = cfg.invalid.length > 0
      ? "Fix the invalid fields with update_client_config."
      : "Generate the next questionnaire round (generate_questionnaire) or record answers with update_client_config.";
  } else if (designMissing) {
    stage = "design";
    nextStep = "Run generate_design_system, choose palette/fonts/variants, then save them under `design` with update_client_config.";
  } else if (!contentOk) {
    stage = "content";
    nextStep = "Write the missing text for every locale with save_content.";
  } else if (!valid.content) {
    stage = "awaiting-content-approval";
    nextStep = "Show Eren the content summary. He approves in a terminal: npm run approve -- <slug> content";
  } else if (!buildCurrent) {
    stage = "build";
    nextStep = lastBuild && lastBuild.hash === hash ? "Fix the failures in quality-report.md, then build_site again." : "Run build_site.";
  } else if (!valid.visual) {
    stage = "awaiting-visual-approval";
    nextStep = "Ask Eren to review the built site against the design checklist. He approves with: npm run approve -- <slug> visual";
  } else if (lastDeploy?.hash === hash && lastDeploy.target === "production") {
    stage = "live";
    nextStep = "Site is live with the current content. For changes: edit config/content, then build again.";
  } else if (!valid.production) {
    stage = "awaiting-production-approval";
    nextStep = "Deploy a preview (deploy target=preview) for the client; after their OK, Eren runs: npm run approve -- <slug> production";
  } else {
    stage = "ready-to-deploy";
    nextStep = "Run deploy with target=production.";
  }

  return {
    slug,
    stage,
    nextStep,
    config: { missing: cfg.missing, invalid: cfg.invalid },
    content,
    openQuestions: openQuestionsFor(missingPaths, !contentOk).map(({ id, round, audience, text }) => ({ id, round, audience, text })),
    approvals: {
      content: valid.content?.at ?? null,
      visual: valid.visual?.at ?? null,
      production: valid.production?.at ?? null,
    },
    lastBuild,
    lastDeploy,
    contentHash: hash,
  };
}

/** Full validation for build/deploy: throws with every problem listed. */
export function loadValidClient(factory: FactoryConfig, slug: string): { paths: ClientPaths; config: SiteConfig; content: Record<string, Content> } {
  const paths = openClient(factory, slug);
  const cfg = validateDraft(SiteConfigSchema, readDraftConfig(paths));
  if (!cfg.data) {
    const lines = [...cfg.missing.map((m) => `missing ${m.path}`), ...cfg.invalid.map((i) => `invalid ${i.path}: ${i.message}`)];
    throw new FactoryError(`site.config.json is not complete:\n- ${lines.join("\n- ")}`, "Use get_client_status to see what to ask or fix.");
  }
  const content: Record<string, Content> = {};
  for (const locale of cfg.data.i18n.locales) {
    const file = paths.content(locale);
    if (!existsSync(file)) throw new FactoryError(`content/${locale}.json is missing.`, "Write it with save_content.");
    const r = validateDraft(ContentSchema, readJson(file));
    if (!r.data) {
      const lines = [...r.missing.map((m) => `missing ${m.path}`), ...r.invalid.map((i) => `invalid ${i.path}: ${i.message}`)];
      throw new FactoryError(`content/${locale}.json is not complete:\n- ${lines.join("\n- ")}`);
    }
    content[locale] = r.data;
  }
  return { paths, config: cfg.data, content };
}
