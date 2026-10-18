import { writeFileSync } from "node:fs";
import path from "node:path";
import { FACTORY_ROOT, type FactoryConfig } from "../config.js";
import { RESEARCH_FILE, openClient, readDraftConfig } from "../lib/client.js";
import { FactoryError } from "../lib/errors.js";
import { assertSlug } from "../lib/paths.js";
import {
  editSiteFile,
  fileProblems,
  readSiteFileAround,
  siteMap,
  deleteSiteFile,
  isCustom,
  listSiteFiles,
  readSiteFile,
  writeSiteFile,
} from "../lib/custom-site.js";
import { searchKnowledge } from "../lib/knowledge.js";
import { effectiveFormAction } from "../lib/form.js";

/** Tools for custom sites: reading and writing site files, the site map, design knowledge, research notes. */

// ---------------------------------------------------------------- custom site files

export function listSiteFilesTool(factory: FactoryConfig, args: { slug: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  return listSiteFiles(paths);
}

export function readSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string }) {
  return readSiteFile(openClient(factory, assertSlug(args.slug)), args.path);
}

export function writeSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string; content: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const template = (readDraftConfig(paths) as { template?: string }).template ?? "";
  if (!isCustom(template)) {
    throw new FactoryError(
      `Client "${args.slug}" uses the ${template} template, which you do not write code for.`,
      'Only sites with template "custom" are written by hand. Change config and content instead.',
    );
  }
  const written = writeSiteFile(paths, args.path, args.content);
  return withProblems(written, args.path, args.content, paths.factoryDir);
}

/** Write results carry the file's safety problems right away, so they are fixed before a build. */
function withProblems<T extends object>(result: T, rel: string, content: string, factoryDir: string) {
  const problems = fileProblems(rel, content, effectiveFormAction(factoryDir));
  return problems.length ? { ...result, problems, fix: "The build will fail on these. Fix them now with edit_site_file." } : result;
}

export function editSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string; oldText: string; newText: string; all?: boolean }) {
  const paths = openClient(factory, assertSlug(args.slug));
  const template = (readDraftConfig(paths) as { template?: string }).template ?? "";
  if (!isCustom(template)) throw new FactoryError(`Client "${args.slug}" uses the ${template} template, which you do not write code for.`);
  const r = editSiteFile(paths, args.path, args.oldText, args.newText, args.all ?? false);
  return withProblems(r, args.path, readSiteFile(paths, args.path).content, paths.factoryDir);
}

/** A few passages of design knowledge (rules and skills) for one question; see lib/knowledge.ts. */
export function searchDesignKnowledge(args: { query: string; k?: number }) {
  const hits = searchKnowledge(FACTORY_ROOT, args.query, args.k ?? 4);
  return {
    results: hits.map((h) => ({ source: h.source, heading: h.heading, text: h.text })),
    note: hits.length ? "Rules (rules/…) win over skills when they disagree." : "Nothing found; try other words (sector, section, colour, type, motion).",
  };
}

/** Research notes for a client (verified facts with sources, sector examples), reused by later jobs. */
export function saveResearchNotes(factory: FactoryConfig, args: { slug: string; notes: string }) {
  const paths = openClient(factory, assertSlug(args.slug));
  writeFileSync(path.join(paths.root, RESEARCH_FILE), `${args.notes.trim()}\n`);
  return { saved: true, chars: args.notes.length };
}

export function siteMapTool(factory: FactoryConfig, args: { slug: string }) {
  return { map: siteMap(openClient(factory, assertSlug(args.slug))) };
}

export function readSiteFileAroundTool(factory: FactoryConfig, args: { slug: string; path: string; around: string; lines?: number }) {
  return readSiteFileAround(openClient(factory, assertSlug(args.slug)), args.path, args.around, args.lines);
}

export function deleteSiteFileTool(factory: FactoryConfig, args: { slug: string; path: string }) {
  return deleteSiteFile(openClient(factory, assertSlug(args.slug)), args.path);
}
