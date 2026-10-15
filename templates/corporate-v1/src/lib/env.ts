import { readFileSync } from "node:fs";
import path from "node:path";

/** Environment variables from the template contract; missing ones stop the build with a clear message. */
export function requireEnv(name: "SF_CLIENT_DIR" | "SF_OUT_DIR"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. build_site sets it; to build by hand: ${name}=/path npm run build`);
  return path.resolve(value);
}

/** Optional: where the contact form posts. Without it the site shows contact buttons instead of a form. */
export function formAction(): string | null {
  const value = process.env.SF_FORM_ACTION;
  return value && /^https:\/\//.test(value) ? value : null;
}

/**
 * Public base URL, needed for absolute links (canonical, sitemap, og:image).
 * Comes from site.domain; null until the client has a domain.
 */
export function siteUrl(): string | null {
  try {
    const raw = JSON.parse(readFileSync(path.join(requireEnv("SF_CLIENT_DIR"), "site.config.json"), "utf8")) as { site?: { domain?: unknown } };
    const domain = raw.site?.domain;
    return typeof domain === "string" && domain.length > 0 ? `https://${domain}` : null;
  } catch {
    return null;
  }
}
