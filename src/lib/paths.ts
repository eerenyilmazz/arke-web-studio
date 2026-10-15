import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { SLUG_PATTERN } from "../schema/site-config.js";
import { FactoryError } from "./errors.js";

/** Validates a client slug. Every path and Cloudflare Worker name is derived from it. */
export function assertSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) {
    throw new FactoryError(
      `Invalid slug "${slug.slice(0, 60)}".`,
      "Use 3–40 lowercase letters, digits and hyphens, e.g. willow-thread.",
    );
  }
  return slug;
}

/**
 * Joins `parts` onto `base` and guarantees the result stays inside `base`,
 * including after resolving symlinks of the deepest existing ancestor.
 * This is the only way tools build file paths from agent-supplied input.
 */
export function safeJoin(base: string, ...parts: string[]): string {
  const root = path.resolve(base);
  for (const part of parts) {
    if (path.isAbsolute(part) || part.includes("\0")) {
      throw new FactoryError(`Path "${part.slice(0, 80)}" is not allowed.`, "Use a relative path inside the client folder.");
    }
  }
  const target = path.resolve(root, ...parts);
  assertInside(root, target);

  // Symlink check: the real location of the nearest existing ancestor must also be inside.
  let probe = target;
  while (!existsSync(probe) && probe !== root) probe = path.dirname(probe);
  if (existsSync(probe) && existsSync(root)) {
    assertInside(realpathSync(root), realpathSync(probe));
  }
  return target;
}

function assertInside(root: string, target: string): void {
  const rel = path.relative(root, target);
  if (rel === "" ) return;
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new FactoryError("Path escapes the allowed folder.", "Paths must stay inside the client folder.");
  }
}

export interface ClientPaths {
  readonly root: string;
  readonly config: string;
  readonly contentDir: string;
  readonly assetsDir: string;
  readonly distDir: string;
  readonly factoryDir: string;
  readonly auditLog: string;
  readonly approvals: string;
  readonly buildRecord: string;
  readonly lastDeploy: string;
  readonly qualityReport: string;
  readonly questionnaireDir: string;
  readonly wranglerConfig: string;
  content(locale: string): string;
}

export function clientPaths(clientsRoot: string, slug: string): ClientPaths {
  const root = safeJoin(clientsRoot, assertSlug(slug));
  const factoryDir = path.join(root, ".factory");
  return {
    root,
    config: path.join(root, "site.config.json"),
    contentDir: path.join(root, "content"),
    assetsDir: path.join(root, "assets"),
    distDir: path.join(root, "dist"),
    factoryDir,
    auditLog: path.join(factoryDir, "audit.log"),
    approvals: path.join(factoryDir, "approvals.json"),
    buildRecord: path.join(factoryDir, "last-build.json"),
    lastDeploy: path.join(factoryDir, "last-deploy.json"),
    qualityReport: path.join(root, "quality-report.md"),
    questionnaireDir: path.join(root, "questionnaires"),
    wranglerConfig: path.join(root, "wrangler.jsonc"),
    content: (locale: string) => {
      if (!/^[a-z]{2}$/.test(locale)) throw new FactoryError(`Invalid locale "${locale.slice(0, 10)}".`);
      return path.join(root, "content", `${locale}.json`);
    },
  };
}
