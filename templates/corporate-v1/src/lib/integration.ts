import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { readableOn } from "./color";
import { loadSite, referencedImages } from "./data";
import { faviconPath, robotsTxt, sitemapXml, wordmarkSvg } from "./files";
import { selfHostFonts } from "./fonts";
import { pageUrl } from "./site";

/** Font subsets per locale; everything else is dropped to keep downloads small. */
const LATIN_SUBSETS = ["latin", "latin-ext"] as const;

/**
 * Writes the site-wide files that are not pages: client images, favicon, robots.txt,
 * sitemap.xml and self-hosted fonts. Runs after Astro has written the pages.
 */
export function clientFiles(): AstroIntegration {
  return {
    name: "arke-web-studio-client-files",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const site = loadSite();
        const { config } = site;

        for (const rel of referencedImages(config, site.content)) {
          const target = path.join(outDir, rel);
          mkdirSync(path.dirname(target), { recursive: true });
          copyFileSync(path.join(site.clientDir, rel), target);
        }

        const favicon = faviconPath(config);
        if (config.brand.logo) copyFileSync(path.join(site.clientDir, config.brand.logo), path.join(outDir, favicon));
        else writeFileSync(path.join(outDir, favicon), wordmarkSvg(config, readableOn(config.design.palette.primary, config.design.palette.text)));

        writeFileSync(path.join(outDir, "robots.txt"), robotsTxt(config, site.baseUrl));
        if (site.baseUrl) {
          const paths = config.i18n.locales.flatMap((locale) => config.pages.map((page) => pageUrl(config, page, locale)));
          writeFileSync(path.join(outDir, "sitemap.xml"), sitemapXml(site.baseUrl, paths));
        } else {
          logger.warn("No site.domain yet: sitemap.xml and absolute URLs (canonical, og:image) are skipped.");
        }

        const subsets = new Set<string>(LATIN_SUBSETS);
        if (config.i18n.locales.includes("ar")) subsets.add("arabic");
        const { heading, body } = config.design.fonts;
        for (const warning of await selfHostFonts(outDir, [heading, body], subsets)) logger.warn(warning);

        for (const page of config.pages) {
          for (const section of config.sections[page] ?? []) {
            if (section === "team") logger.warn(`Section "team" on ${page} is not supported by corporate-v1 yet and was left out.`);
          }
        }
      },
    },
  };
}
