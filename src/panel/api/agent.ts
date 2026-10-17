import type { IncomingMessage, ServerResponse } from "node:http";
import { snapshot } from "../../lib/versions.js";
import { DESIGN_KINDS, resolvePolicy } from "../budget.js";
import { applyLibraryDesign, clearStartDesign } from "../library.js";
import { readDraftConfig } from "../../lib/client.js";
import { assertSlug, clientPaths } from "../../lib/paths.js";
import * as tools from "../../tools.js";
import { HttpError, readJsonBody, sendJson, str } from "../http.js";
import { appendInput, readInputs } from "../history.js";
import { serialiseJob } from "../jobs.js";
import { fromLibraryPrompt, redesignPrompt, answersPrompt, autopilotPrompt, brandBoardPrompt, chooseConceptPrompt, conceptsPrompt, designContentPrompt, earlierInputsBlock, fixBuildPrompt, revisePrompt, upgradeTemplatePrompt, type AnswersInput } from "../prompts.js";
import { OPTION_IDS } from "../../lib/custom-site.js";
import { type ApiDeps, type Route, SLUG, JSON_LIMIT, MAX_TEXT, asHttp, launchAgent, inboxFiles, stringRecord, isQa } from "./common.js";
import { filledNote } from "./library.js";

/**
 * Agent jobs started from the panel, one entry per kind. Each entry checks its input and returns the prompt and
 * the texts shown to Eren; starting, history and snapshots are shared (startAgent). A new kind of job is one
 * new entry here, no change elsewhere in this file (the route accepts exactly the kinds listed).
 */
interface JobSpec {
  readonly prompt: string;
  readonly title: string;
  /** Shown in the job list as what Eren asked for. */
  readonly request: string;
  /** What Eren gave in this job, kept for later jobs (answers as "question: answer" lines). */
  readonly input?: string;
}

interface JobContext {
  readonly deps: ApiDeps;
  readonly slug: string;
  readonly body: Record<string, unknown>;
}

type JobBuilder = (ctx: JobContext) => JobSpec | Promise<JobSpec>;

/** Design, concept and library jobs exist only for custom sites. */
function requireCustom(ctx: JobContext, message: string): void {
  const template = (readDraftConfig(clientPaths(ctx.deps.factory.clientsRoot, ctx.slug)) as { template?: string }).template;
  if (template !== "custom") throw new HttpError(409, message);
}

/** Replaces site/ with a library design (a version of the current site is saved first). */
async function applyFromLibrary(ctx: JobContext, id: string) {
  if (ctx.deps.jobs.running()) throw new HttpError(409, "Agent başka bir işte; bitince tekrar dene.");
  await snapshot(clientPaths(ctx.deps.factory.clientsRoot, ctx.slug).root, "Önce: kütüphaneden tasarım").catch(() => null);
  return asHttp(() => applyLibraryDesign(ctx.deps.factory, ctx.slug, id));
}

const JOBS: Readonly<Record<string, JobBuilder>> = {
  answers: ({ deps, slug, body }) => {
    const answers = stringRecord(body.answers);
    const extras = Array.isArray(body.extras) ? body.extras.filter(isQa).slice(0, 20) : [];
    const later = Array.isArray(body.later) ? body.later.filter((x): x is string => typeof x === "string" && /^later-[a-z0-9-]+$/.test(x)) : [];
    const freeText = str(body, "freeText", { optional: true, max: MAX_TEXT }) ?? "";
    const files = inboxFiles(deps.factory, slug);
    if (!Object.values(answers).some((a) => a.trim()) && !extras.some((e) => e.answer.trim()) && !freeText.trim() && files.length === 0) {
      throw new HttpError(400, "İşlenecek cevap ya da dosya yok.");
    }
    const answered = Object.values(answers).filter((a) => a.trim()).length + extras.filter((e) => e.answer.trim()).length;
    return {
      prompt: answersPrompt(slug, { answers, extras, later, freeText, files: files.map((f) => f.name) }),
      input: [
        ...Object.entries(answers).filter(([, a]) => a.trim()).map(([id, a]) => `${id}: ${a.trim()}`),
        ...extras.filter((e) => e.answer.trim()).map((e) => `${e.question}: ${e.answer.trim()}`),
        freeText,
      ].filter((x) => x.trim()).join("\n"),
      title: "Cevapları işle",
      request: [`Müşterinin cevaplarını işle: ${answered} cevap`, freeText.trim() ? "serbest metin" : "", files.length ? `${files.length} dosya` : ""].filter(Boolean).join(", "),
    };
  },

  autopilot: async (ctx) => {
    const { deps, slug, body } = ctx;
    const pasted: AnswersInput = {
      answers: stringRecord(body.answers),
      extras: Array.isArray(body.extras) ? body.extras.filter(isQa).slice(0, 20) : [],
      later: [],
      freeText: str(body, "freeText", { optional: true, max: MAX_TEXT }) ?? "",
      files: inboxFiles(deps.factory, slug).map((f) => f.name),
    };
    const hasInput = pasted.freeText.trim() !== "" || Object.values(pasted.answers).some((a) => a.trim()) || pasted.files.length > 0;
    const libraryId = str(body, "libraryId", { optional: true, max: 41 });
    let libraryName: string | undefined;
    let libraryFilled = "";
    if (libraryId) {
      requireCustom(ctx, "Kütüphane tasarımları serbest tasarımlı sitelerde kullanılır.");
      const applied = await applyFromLibrary(ctx, libraryId);
      libraryName = applied.entry.name;
      libraryFilled = filledNote(applied);
      // The start design chosen at "Yeni müşteri" is used once; later runs must not replace the site again.
      clearStartDesign(deps.factory, slug);
    }
    return {
      prompt: autopilotPrompt(slug, hasInput ? pasted : null, { web: resolvePolicy(deps.factory, slug, "autopilot").research, askFirst: body.askFirst !== false, libraryName, libraryFilled }),
      input: pasted.freeText,
      title: "Siteyi hazırla",
      request: pasted.freeText.trim() ? pasted.freeText.trim() : pasted.files.length ? `Siteyi hazırla (${pasted.files.length} dosya)` : "Siteyi hazırla.",
    };
  },

  "design-content": ({ slug }) => ({ prompt: designContentPrompt(slug), title: "Tasarım ve metinler", request: "Tasarımı seç ve bütün metinleri yaz." }),

  "fix-build": ({ slug }) => ({ prompt: fixBuildPrompt(slug), title: "Build ve düzeltme", request: "Build al, kontroller geçmezse düzelt." }),

  redesign: (ctx) => {
    requireCustom(ctx, "Marka kartı serbest tasarımlı sitelerde var. Önce 'Serbest tasarıma geç'.");
    return { prompt: redesignPrompt(ctx.slug), title: "Markayla yeniden tasarla", request: "Siteyi markanın imza tasarımıyla baştan tasarla." };
  },

  "brand-board": (ctx) => {
    requireCustom(ctx, "Marka kartı serbest tasarımlı sitelerde var. Önce 'Serbest tasarıma geç'.");
    return { prompt: brandBoardPrompt(ctx.slug), title: "Marka kartını tamamla", request: "Marka kartını tamamla: slogan, imza hareketi ve tipografi örneği." };
  },

  concepts: (ctx) => {
    requireCustom(ctx, "Tasarım önerileri serbest tasarımlı sitelerde var. Önce 'Serbest tasarıma geç'.");
    return { prompt: conceptsPrompt(ctx.slug), title: "3 tasarım önerisi", request: "Bu müşteri için 3 farklı tasarım önerisi hazırla." };
  },

  "choose-concept": (ctx) => {
    requireCustom(ctx, "Tasarım önerileri serbest tasarımlı sitelerde var. Önce 'Serbest tasarıma geç'.");
    const option = str(ctx.body, "option", { max: 1 })!;
    if (!(OPTION_IDS as readonly string[]).includes(option)) throw new HttpError(400, "Öneri a, b ya da c olmalı.");
    return { prompt: chooseConceptPrompt(ctx.slug, option), title: "Seçilen tasarımla siteyi kur", request: `Öneri ${option.toUpperCase()} seçildi; siteyi bu tasarımla kur.` };
  },

  "from-library": async (ctx) => {
    requireCustom(ctx, "Kütüphane tasarımları serbest tasarımlı sitelerde kullanılır. Önce 'Serbest tasarıma geç'.");
    const applied = await applyFromLibrary(ctx, str(ctx.body, "id", { max: 41 })!);
    const { name } = applied.entry;
    return { prompt: fromLibraryPrompt(ctx.slug, name, filledNote(applied)), title: `Kütüphaneden: ${name}`, request: `"${name}" tasarımını bu müşteriye uyarla.` };
  },

  "upgrade-template": ({ deps, slug }) => ({
    prompt: upgradeTemplatePrompt(slug, deps.factory.defaultTemplate),
    title: deps.factory.defaultTemplate === "custom" ? "Serbest tasarıma geç" : "Yeni şablona geç",
    request: `Siteyi yeni şablona (${deps.factory.defaultTemplate}) taşı.`,
  }),

  revise: ({ slug, body }) => {
    const change = str(body, "request", { max: 4000 })!;
    return { prompt: revisePrompt(slug, change), input: change, title: "Değişiklik isteği", request: change };
  },
};

/** Design jobs get everything pasted before; small changes only the most recent part (enough for noted facts). */
const SMALL_JOB_HISTORY = 4000;

export const agentRoutes: Route[] = [
  { method: "POST", pattern: new RegExp(`^/api/clients/${SLUG}/agent/(${Object.keys(JOBS).join("|")})$`), handler: startAgent },
];

async function startAgent(deps: ApiDeps, req: IncomingMessage, res: ServerResponse, [slug, kind]: string[]): Promise<void> {
  const s = assertSlug(slug!);
  tools.getClientStatus(deps.factory, { slug: s });
  const build = JOBS[kind!];
  if (!build) throw new HttpError(404, "Bilinmeyen iş türü.");
  const body = await readJsonBody(req, JSON_LIMIT);
  const earlier = readInputs(deps.factory, s);
  const spec = await build({ deps, slug: s, body });
  // A version before the agent touches anything, so its changes can always be undone.
  if (!deps.jobs.running()) await snapshot(clientPaths(deps.factory.clientsRoot, s).root, `Önce: ${spec.title}`).catch(() => null);
  const history = DESIGN_KINDS.has(kind!) || kind === "answers" ? earlierInputsBlock(earlier) : earlierInputsBlock(earlier, SMALL_JOB_HISTORY);
  const job = launchAgent(deps, s, kind!, spec.title, `${spec.prompt}${history}`, spec.request);
  appendInput(deps.factory, s, kind!, spec.input ?? "");
  sendJson(res, 202, serialiseJob(job));
}
