import { portalMessages, updateEntry } from "../portal.js";
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { planState, requirePlan, resetPlanApproval, waivePlan } from "../../lib/design-plan.js";
import { snapshot } from "../../lib/versions.js";
import { DESIGN_KINDS, resolvePolicy } from "../budget.js";
import { applyLibraryDesign, clearStartDesign } from "../library.js";
import { readBrandStale, sharedLogo } from "../logo-check.js";
import { readDraftConfig } from "../../lib/client.js";
import { assertSlug, clientPaths } from "../../lib/paths.js";
import * as tools from "../../tools.js";
import { HttpError, readJsonBody, sendJson, str } from "../http.js";
import { appendInput, readInputs } from "../history.js";
import { serialiseJob } from "../jobs.js";
import {
  addPagePrompt,
  blogPostPrompt,
  portalCommentsPrompt,
  translatePrompt,
  fromLibraryPrompt,
  redesignPrompt,
  answersPrompt,
  autopilotPrompt,
  brandBoardPrompt,
  chooseConceptPrompt,
  conceptsPrompt,
  designContentPrompt,
  earlierInputsBlock,
  fixBuildPrompt,
  revisePrompt,
  upgradeTemplatePrompt,
  newPlanPrompt,
  type AnswersInput,
} from "../prompts.js";
import { OPTION_IDS } from "../../lib/custom-site.js";
import { type ApiDeps, type Route, SLUG, JSON_LIMIT, MAX_TEXT, asHttp, launchAgent, inboxFiles, stringRecord, isQa, lastBuildOf } from "./common.js";
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
  /** Runs only once the job has started (e.g. marking client comments as sent). */
  readonly afterStart?: () => void;
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

function isCustomClient(ctx: JobContext): boolean {
  return (readDraftConfig(clientPaths(ctx.deps.factory.clientsRoot, ctx.slug)) as { template?: string }).template === "custom";
}

/** Replaces site/ with a library design (a version of the current site is saved first). */
async function applyFromLibrary(ctx: JobContext, id: string) {
  if (ctx.deps.jobs.running()) throw new HttpError(409, "Agent başka bir işte; bitince tekrar dene.");
  await snapshot(clientPaths(ctx.deps.factory.clientsRoot, ctx.slug).root, "Önce: kütüphaneden tasarım").catch(() => null);
  return asHttp(() => applyLibraryDesign(ctx.deps.factory, ctx.slug, id));
}

/** "Sıkça Sorulan Sorular" → "sikca-sorulan-sorular" (the page's folder). */
function pageSlug(name: string): string {
  const s = name
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (s.length < 2) throw new HttpError(400, "Sayfa adı en az iki harf ya da rakam içermeli.");
  return s;
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
        ...Object.entries(answers)
          .filter(([, a]) => a.trim())
          .map(([id, a]) => `${id}: ${a.trim()}`),
        ...extras.filter((e) => e.answer.trim()).map((e) => `${e.question}: ${e.answer.trim()}`),
        freeText,
      ]
        .filter((x) => x.trim())
        .join("\n"),
      title: "Cevapları işle",
      request: [`Müşterinin cevaplarını işle: ${answered} cevap`, freeText.trim() ? "serbest metin" : "", files.length ? `${files.length} dosya` : ""]
        .filter(Boolean)
        .join(", "),
    };
  },

  "create-site": async (ctx) => {
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
    // A new design (no brand yet, or a library start) goes through the design plan Eren approves first.
    const cp = clientPaths(deps.factory.clientsRoot, slug);
    if (isCustomClient(ctx) && (libraryId || !existsSync(path.join(cp.root, "site", "brand", "brand.json")))) requirePlan(cp);
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
      prompt: autopilotPrompt(slug, hasInput ? pasted : null, {
        web: resolvePolicy(deps.factory, slug, "autopilot").research,
        askFirst: body.askFirst !== false,
        libraryName,
        libraryFilled,
      }),
      input: pasted.freeText,
      title: "Siteyi hazırla",
      request: pasted.freeText.trim() ? pasted.freeText.trim() : pasted.files.length ? `Siteyi hazırla (${pasted.files.length} dosya)` : "Siteyi hazırla.",
    };
  },

  "design-content": ({ slug }) => ({ prompt: designContentPrompt(slug), title: "Tasarım ve metinler", request: "Tasarımı seç ve bütün metinleri yaz." }),

  "fix-build": ({ slug }) => ({ prompt: fixBuildPrompt(slug), title: "Build ve düzeltme", request: "Build al, kontroller geçmezse düzelt." }),

  redesign: (ctx) => {
    requireCustom(ctx, "Marka kartı serbest tasarımlı sitelerde var. Önce 'Serbest tasarıma geç'.");
    // A redesign is a new design: a new plan, approved again.
    const cp = clientPaths(ctx.deps.factory.clientsRoot, ctx.slug);
    requirePlan(cp);
    resetPlanApproval(cp);
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
    // Choosing one of the three full proposals is Eren's approval of that direction.
    waivePlan(clientPaths(ctx.deps.factory.clientsRoot, ctx.slug));
    return {
      prompt: chooseConceptPrompt(ctx.slug, option),
      title: "Seçilen tasarımla siteyi kur",
      request: `Öneri ${option.toUpperCase()} seçildi; siteyi bu tasarımla kur.`,
    };
  },

  "from-library": async (ctx) => {
    requireCustom(ctx, "Kütüphane tasarımları serbest tasarımlı sitelerde kullanılır. Önce 'Serbest tasarıma geç'.");
    const applied = await applyFromLibrary(ctx, str(ctx.body, "id", { max: 41 })!);
    const { name } = applied.entry;
    return {
      prompt: fromLibraryPrompt(ctx.slug, name, filledNote(applied)),
      title: `Kütüphaneden: ${name}`,
      request: `"${name}" tasarımını bu müşteriye uyarla.`,
    };
  },

  "new-plan": (ctx) => {
    requireCustom(ctx, "Tasarım planı serbest tasarımlı sitelerde var.");
    const cp = clientPaths(ctx.deps.factory.clientsRoot, ctx.slug);
    if (planState(cp) === "not-required") throw new HttpError(409, "Bu müşteri için tasarım planı kullanılmıyor.");
    const notes = (str(ctx.body, "notes", { optional: true, max: 2000 }) ?? "").trim();
    return {
      prompt: newPlanPrompt(ctx.slug, notes),
      input: notes ? `Tasarım planı için not: ${notes}` : "",
      title: "Yeni tasarım planı",
      request: notes ? `Yeni bir tasarım fikri hazırla. Notlarım: ${notes}` : "Yeni bir tasarım fikri hazırla.",
    };
  },

  "add-page": (ctx) => {
    requireCustom(ctx, "Ek sayfa yalnızca serbest tasarımlı sitelere eklenir.");
    const name = (str(ctx.body, "name", { max: 40 }) ?? "").trim();
    if (name.length < 2) throw new HttpError(400, "Sayfa adı yazınız.");
    const purpose = (str(ctx.body, "purpose", { optional: true, max: 1200 }) ?? "").trim();
    const path = pageSlug(name);
    if (["index", "brand", "css", "js", "assets", "img", "fonts"].includes(path)) throw new HttpError(400, "Bu sayfa adı kullanılamaz; başka bir ad yazınız.");
    return {
      prompt: addPagePrompt(ctx.slug, name, path, purpose),
      input: purpose ? `Ek sayfa "${name}": ${purpose}` : "",
      title: `Sayfa ekle: ${name}`,
      request: `"${name}" sayfasını ekle.`,
    };
  },

  "upgrade-template": ({ deps, slug }) => ({
    prompt: upgradeTemplatePrompt(slug, deps.factory.defaultTemplate),
    title: deps.factory.defaultTemplate === "custom" ? "Serbest tasarıma geç" : "Yeni şablona geç",
    request: `Siteyi yeni şablona (${deps.factory.defaultTemplate}) taşı.`,
  }),

  "blog-post": (ctx) => {
    requireCustom(ctx, "Blog yazısı yalnızca serbest tasarımlı sitelere eklenir.");
    const title = (str(ctx.body, "title", { max: 100 }) ?? "").trim();
    if (title.length < 4) throw new HttpError(400, "Yazının konusunu ya da başlığını yazınız.");
    const notes = (str(ctx.body, "notes", { optional: true, max: 2000 }) ?? "").trim();
    return {
      prompt: blogPostPrompt(ctx.slug, title, pageSlug(title), notes, resolvePolicy(ctx.deps.factory, ctx.slug, "blog-post").research),
      input: notes ? `Blog yazısı "${title}": ${notes}` : "",
      title: `Blog: ${title}`,
      request: `"${title}" blog yazısını yaz.`,
    };
  },

  translate: (ctx) => {
    requireCustom(ctx, "Diğer diller serbest tasarımlı sitelerde ayrı iş olarak çevrilir.");
    const draft = readDraftConfig(clientPaths(ctx.deps.factory.clientsRoot, ctx.slug)) as { i18n?: { defaultLocale?: string; locales?: string[] } };
    const locales = draft.i18n?.locales ?? [];
    const def = draft.i18n?.defaultLocale ?? locales[0] ?? "en";
    if (locales.length < 2) throw new HttpError(400, "Bu sitede tek dil var.");
    // Translating pages that never built (missing config, unanswered questions) spends tokens on text that will change.
    if (!lastBuildOf(ctx.deps, ctx.slug)?.passed)
      throw new HttpError(
        409,
        "Önce site tamamlanmalı: son derleme geçmedi ya da hiç yapılmadı. Siteyi oluşturun ya da hataları düzeltin, sonra diğer dilleri güncelleyin.",
      );
    const others = locales.filter((l) => l !== def);
    return {
      prompt: translatePrompt(ctx.slug, def, locales),
      title: "Diğer diller",
      request: `Diğer dilleri (${others.join(", ")}) varsayılan dile göre güncelle.`,
    };
  },

  /** Open portal comments, read from the client's folder by id (never text from the request). */
  "portal-comments": ({ deps, slug, body }) => {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 30) : [];
    const chosen = portalMessages(deps.factory, slug).comments.filter((f) => ids.includes(f.id) && f.status === "open");
    if (chosen.length === 0) throw new HttpError(400, "İletilecek açık yorum yok.");
    return {
      afterStart: () => {
        for (const f of chosen) updateEntry(deps.factory, slug, "comment", f.id, { status: "sent" });
      },
      prompt: portalCommentsPrompt(slug, chosen),
      input: chosen.map((c) => `Müşteri yorumu (${c.page || "genel"}): ${c.text}`).join("\n"),
      title: "Müşteri yorumları",
      request: `Müşterinin ${chosen.length} yorumunu uygula.`,
    };
  },

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
  // A design job with another client's logo wastes the whole job: stop before spending anything.
  const owner = DESIGN_KINDS.has(kind!) ? sharedLogo(deps.factory, s) : null;
  if (owner && body.allowSharedLogo !== true) {
    sendJson(res, 409, {
      error: `Bu müşterinin logosu "${owner.name}" müşterisinin logosuyla aynı. Müşteri Bilgileri → Logo ve Görseller'den doğru logoyu seçiniz.`,
      code: "shared-logo",
      owner,
    });
    return;
  }
  const earlier = readInputs(deps.factory, s);
  const spec = await build({ deps, slug: s, body });
  // A version before the agent touches anything, so its changes can always be undone.
  if (!deps.jobs.running()) await snapshot(clientPaths(deps.factory.clientsRoot, s).root, `Önce: ${spec.title}`).catch(() => null);
  const history = DESIGN_KINDS.has(kind!) || kind === "answers" ? earlierInputsBlock(earlier) : earlierInputsBlock(earlier, SMALL_JOB_HISTORY);
  const stale = DESIGN_KINDS.has(kind!) ? readBrandStale(deps.factory, s) : null;
  const staleNote = stale
    ? `\nThe client's logo changed after the brand was made (now ${stale.logo}). First rebuild brand/brand.json from this logo (palette, concept, tagline if it no longer fits, signature motion and brand/signature.html), then the pages; never keep colours that came from the old logo.`
    : "";
  const job = launchAgent(deps, s, kind!, spec.title, `${spec.prompt}${staleNote}${history}`, spec.request);
  appendInput(deps.factory, s, kind!, spec.input ?? "");
  spec.afterStart?.();
  sendJson(res, 202, serialiseJob(job));
}
