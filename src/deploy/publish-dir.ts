import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * What Cloudflare receives. dist/ stays exactly what was built and approved (its hash is checked before every
 * publish); this copy only leaves out the factory's working files and adds the rules a published site needs:
 * - brand/brand.json, brand/signature.html and brand/options/ are for the operator, not visitors
 *   (brand/logo.svg and other images stay: pages use them);
 * - a preview is never indexed (X-Robots-Tag and a robots.txt that disallows everything);
 * - security headers on every response, and on a static site a Content-Security-Policy that matches what the
 *   build checks already allow (own files, inline styles and scripts, the form's address).
 */

export const PUBLISH_DIR = ".factory/publish";
const BRAND_INTERNAL = /^brand\/(?:options(?:\/|$)|[^/]+\.(?:json|html)$)/;
const HEADERS_FILE = "_headers";
const ROBOTS_FILE = "robots.txt";
const PREVIEW_ROBOTS = "User-agent: *\nDisallow: /\n";
const HSTS_MAX_AGE_S = 31_536_000; // one year

export interface PublishOptions {
  readonly target: "preview" | "production";
  /** App sites run their own Worker code; their responses get no CSP from here. */
  readonly app: boolean;
  /** The contact form's address (ARKE_FORM_ACTION or the client's own), allowed as a form target. */
  readonly formAction: string | null;
}

export function contentSecurityPolicy(formAction: string | null): string {
  let formTarget = "";
  if (formAction) {
    try {
      formTarget = ` ${new URL(formAction).origin}`;
    } catch {
      formTarget = "";
    }
  }
  return [
    "default-src 'self'",
    "img-src 'self' data:",
    // Google Fonts stay allowed for a site built while Google could not be reached (the build then warns).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "script-src 'self' 'unsafe-inline'",
    `form-action 'self'${formTarget}`,
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
}

export function headersFor(opts: PublishOptions): string {
  const lines = ["/*", "  X-Content-Type-Options: nosniff", "  Referrer-Policy: strict-origin-when-cross-origin"];
  if (opts.target === "preview") lines.push("  X-Robots-Tag: noindex, nofollow");
  else lines.push(`  Strict-Transport-Security: max-age=${HSTS_MAX_AGE_S}`);
  // No frame rules: the client's review page shows the site in a frame.
  if (!opts.app) lines.push(`  Content-Security-Policy: ${contentSecurityPolicy(opts.formAction)}`);
  return `${lines.join("\n")}\n`;
}

/** Fills <client>/.factory/publish from dist/ and returns the path wrangler's config points at ("./…"). */
export function preparePublishDir(root: string, distDir: string, opts: PublishOptions): string {
  const out = path.join(root, PUBLISH_DIR);
  rmSync(out, { recursive: true, force: true });
  cpSync(distDir, out, {
    recursive: true,
    dereference: false,
    filter: (from) => !BRAND_INTERNAL.test(path.relative(distDir, from).replaceAll("\\", "/")),
  });
  const own = path.join(out, HEADERS_FILE);
  const theirs = existsSync(own) ? readFileSync(own, "utf8").trimEnd() : "";
  writeFileSync(own, `${headersFor(opts)}${theirs ? `\n${theirs}\n` : ""}`);
  if (opts.target === "preview") writeFileSync(path.join(out, ROBOTS_FILE), PREVIEW_ROBOTS);
  return `./${PUBLISH_DIR}`;
}
