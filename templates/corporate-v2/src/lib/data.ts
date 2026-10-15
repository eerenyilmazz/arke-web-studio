import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { imageSize } from "image-size";
import type { Content } from "../generated/content";
import type { SiteConfig } from "../generated/site-config";
import { formAction, requireEnv, siteUrl } from "./env";

/*
 * The only module that reads client data. Everything else receives props built from `loadSite()`.
 * Validation uses the factory's JSON Schema (the template contract) with defaults applied,
 * so the types below can rely on defaulted fields being present.
 */

export type Locale = SiteConfig["i18n"]["defaultLocale"];
export type PageId = SiteConfig["pages"][number];
export type SectionId = NonNullable<SiteConfig["sections"][PageId]>[number];

type Defaulted<T> = Required<NonNullable<T>>;

/** Site config after schema defaults are applied. */
export type Config = Omit<SiteConfig, "contact" | "whatsapp" | "social" | "integrations" | "bots" | "legal" | "hosting" | "design" | "business"> & {
  business: Defaulted<SiteConfig["business"]>;
  contact: Defaulted<SiteConfig["contact"]>;
  whatsapp: Defaulted<SiteConfig["whatsapp"]>;
  social: NonNullable<SiteConfig["social"]>;
  integrations: Defaulted<SiteConfig["integrations"]>;
  bots: Defaulted<SiteConfig["bots"]>;
  legal: Defaulted<SiteConfig["legal"]>;
  hosting: Defaulted<SiteConfig["hosting"]>;
  design: SiteConfig["design"] & {
    variants: Defaulted<SiteConfig["design"]["variants"]>;
    personality: NonNullable<SiteConfig["design"]["personality"]>;
    motif: NonNullable<SiteConfig["design"]["motif"]>;
  };
};

/** Content after schema defaults are applied. */
export type LocaleContent = Omit<Content, "gallery" | "testimonials" | "faq" | "process" | "highlights"> & {
  gallery: NonNullable<Content["gallery"]>;
  testimonials: NonNullable<Content["testimonials"]>;
  faq: NonNullable<Content["faq"]>;
  process: NonNullable<Content["process"]>;
  highlights: NonNullable<Content["highlights"]>;
};

export type Personality = Config["design"]["personality"];
export type Motif = Config["design"]["motif"];
export type IconName = NonNullable<Content["services"][number]["icon"]>;

export interface ImageInfo {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export interface Site {
  readonly clientDir: string;
  readonly config: Config;
  readonly content: Readonly<Record<string, LocaleContent>>;
  /** Intrinsic sizes of every referenced image, keyed by its `assets/…` path, so pages avoid layout shift. */
  readonly images: ReadonlyMap<string, ImageInfo>;
  readonly baseUrl: string | null;
  readonly formAction: string | null;
}

/** `npm run build` runs in the template folder (templates/<name>), so the factory schema is two levels up. Bundling moves this module, so cwd is used rather than its own URL. */
const SCHEMA_DIR = path.resolve(process.cwd(), "..", "..", "schema");

let cached: Site | null = null;

export function loadSite(): Site {
  if (cached) return cached;
  const clientDir = requireEnv("SF_CLIENT_DIR");
  const ajv = new Ajv2020({ useDefaults: true, allErrors: true, strict: false, validateFormats: false });
  const validateConfig = ajv.compile(readSchema("site.config.schema.json"));
  const validateContent = ajv.compile(readSchema("content.schema.json"));

  const config = readClientJson(clientDir, "site.config.json");
  if (!validateConfig(config)) throw new Error(`site.config.json is invalid: ${ajv.errorsText(validateConfig.errors)}`);
  const cfg = config as unknown as Config;

  const content: Record<string, LocaleContent> = {};
  for (const locale of cfg.i18n.locales) {
    const data = readClientJson(clientDir, path.join("content", `${locale}.json`));
    if (!validateContent(data)) throw new Error(`content/${locale}.json is invalid: ${ajv.errorsText(validateContent.errors)}`);
    content[locale] = data as unknown as LocaleContent;
  }

  cached = { clientDir, config: cfg, content, images: readImages(clientDir, cfg, content), baseUrl: siteUrl(), formAction: formAction() };
  return cached;
}

function readSchema(file: string): object {
  return JSON.parse(readFileSync(path.join(SCHEMA_DIR, file), "utf8")) as object;
}

function readClientJson(clientDir: string, rel: string): unknown {
  const file = path.join(clientDir, rel);
  if (!existsSync(file)) throw new Error(`Missing client file: ${rel}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Every image the site will show: the logo and gallery items of every locale. */
export function referencedImages(config: Config, content: Readonly<Record<string, LocaleContent>>): string[] {
  const set = new Set<string>();
  if (config.brand.logo) set.add(config.brand.logo);
  for (const c of Object.values(content)) for (const g of c.gallery) set.add(g.src);
  return [...set];
}

function readImages(clientDir: string, config: Config, content: Record<string, LocaleContent>): Map<string, ImageInfo> {
  const map = new Map<string, ImageInfo>();
  for (const rel of referencedImages(config, content)) {
    const file = path.join(clientDir, rel);
    if (!existsSync(file)) throw new Error(`Referenced image is missing: ${rel}`);
    const size = imageSize(readFileSync(file));
    map.set(rel, { src: `/${rel}`, width: size.width, height: size.height });
  }
  return map;
}
