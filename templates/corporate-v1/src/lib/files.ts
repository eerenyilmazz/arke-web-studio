import type { Config } from "./data";

/** AI crawlers blocked when bots.aiCrawlers is "block". Search engines are never blocked. */
export const AI_CRAWLERS = [
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
  "Google-Extended", "Applebot-Extended", "PerplexityBot", "CCBot", "Bytespider", "Meta-ExternalAgent", "Amazonbot",
] as const;

/** Favicon path shared by the layout and the build step: the logo's own file type, or a generated wordmark. */
export function faviconPath(config: Config): string {
  const ext = config.brand.logo?.split(".").pop();
  return ext ? `/favicon.${ext}` : "/favicon.svg";
}

export function faviconType(path: string): string {
  const ext = path.split(".").pop();
  return ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
}

/** Letter-mark favicon for clients without a logo: first letter of the business name on the primary colour. */
export function wordmarkSvg(config: Config, onPrimary: string): string {
  const letter = [...config.business.name.trim()][0]?.toUpperCase() ?? "•";
  const safe = letter.replace(/[<>&"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${config.design.palette.primary}"/><text x="32" y="44" font-family="system-ui, sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="${onPrimary}">${safe}</text></svg>\n`;
}

export function robotsTxt(config: Config, baseUrl: string | null): string {
  const lines = ["User-agent: *", "Allow: /", ""];
  if (config.bots.aiCrawlers === "block") {
    for (const bot of AI_CRAWLERS) lines.push(`User-agent: ${bot}`, "Disallow: /", "");
  }
  if (baseUrl) lines.push(`Sitemap: ${baseUrl}/sitemap.xml`, "");
  return lines.join("\n");
}

export function sitemapXml(baseUrl: string, paths: readonly string[]): string {
  const urls = paths.map((p) => `  <url><loc>${baseUrl}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
