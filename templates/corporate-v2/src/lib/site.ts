import type { Config, Locale, LocaleContent, PageId, SectionId, Site } from "./data";
import { strings, type UiStrings } from "../i18n";

/** URL path segment per page. Home is the locale root. */
const PAGE_SLUGS: Readonly<Record<PageId, string>> = { home: "", about: "about", services: "services", gallery: "gallery", contact: "contact" };

/** Used when the config lists a page but not its sections. */
const DEFAULT_SECTIONS: Readonly<Record<PageId, readonly SectionId[]>> = {
  home: ["hero", "highlights", "services", "process", "intro", "gallery", "testimonials", "contact-cta"],
  about: ["intro", "process", "testimonials", "contact-cta"],
  services: ["services", "process", "faq", "contact-cta"],
  gallery: ["gallery", "contact-cta"],
  contact: ["contact-form", "map"],
};

const RTL_LOCALES: ReadonlySet<Locale> = new Set(["ar"]);

/** Everything a page and its sections need. Built once per page; components only read it. */
export interface PageContext {
  readonly site: Site;
  readonly config: Config;
  readonly locale: Locale;
  readonly page: PageId;
  readonly content: LocaleContent;
  readonly t: UiStrings;
  readonly dir: "ltr" | "rtl";
  url(page: PageId, locale?: Locale): string;
}

export function pageUrl(config: Config, page: PageId, locale: Locale): string {
  const prefix = locale === config.i18n.defaultLocale ? "" : `/${locale}`;
  const slug = PAGE_SLUGS[page];
  return `${prefix}/${slug ? `${slug}/` : ""}`;
}

export function routeParam(config: Config, page: PageId, locale: Locale): string | undefined {
  const p = pageUrl(config, page, locale).replace(/^\/|\/$/g, "");
  return p === "" ? undefined : p;
}

export function buildContext(site: Site, page: PageId, locale: Locale): PageContext {
  const content = site.content[locale];
  if (!content) throw new Error(`No content for locale ${locale}`);
  return {
    site,
    config: site.config,
    locale,
    page,
    content,
    t: strings(locale),
    dir: RTL_LOCALES.has(locale) ? "rtl" : "ltr",
    url: (target, loc = locale) => pageUrl(site.config, target, loc),
  };
}

export function sectionsFor(config: Config, page: PageId): readonly SectionId[] {
  return config.sections[page] ?? DEFAULT_SECTIONS[page];
}

export function seoFor(content: LocaleContent, page: PageId): { title: string; description: string } {
  return content.seo[page] ?? content.seo.home;
}

export interface Cta {
  readonly label: string;
  readonly href: string;
  readonly external: boolean;
}

/** The one primary action per page: booking link, else the contact page, else a phone call or email. */
export function primaryCta(ctx: PageContext): Cta {
  const { config, content } = ctx;
  const label = content.hero.ctaLabel;
  if (config.integrations.bookingUrl) return { label, href: config.integrations.bookingUrl, external: true };
  if (config.pages.includes("contact") && ctx.page !== "contact") return { label, href: ctx.url("contact"), external: false };
  if (config.contact.phone) return { label, href: `tel:${config.contact.phone}`, external: false };
  return { label, href: `mailto:${config.contact.email}`, external: false };
}

/** Numbers read better grouped: UK +44 7700 900123, Turkey +90 506 101 81 82; other countries as stored. */
export function displayPhone(e164: string): string {
  const uk = e164.match(/^\+44(\d{4})(\d+)$/);
  if (uk) return `+44 ${uk[1]} ${uk[2]}`;
  const tr = e164.match(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return tr ? `+90 ${tr[1]} ${tr[2]} ${tr[3]} ${tr[4]}` : e164;
}

export function whatsappHref(number: string, message: string | undefined): string {
  const base = `https://wa.me/${number.replace(/^\+/, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Gallery image by position (0 = hero, 1 = about), with its size; null when there is none. */
export function galleryImage(ctx: PageContext, index: number): { src: string; alt: string; width: number; height: number } | null {
  const item = ctx.content.gallery[index];
  if (!item) return null;
  const info = ctx.site.images.get(item.src);
  return info ? { ...info, alt: item.alt } : null;
}

/** First gallery image, used by hero variants that show a photo. */
export function heroImage(ctx: PageContext): { src: string; alt: string; width: number; height: number } | null {
  const first = ctx.content.gallery[0];
  if (!first) return null;
  const info = ctx.site.images.get(first.src);
  return info ? { ...info, alt: first.alt } : null;
}

/** Sector layouts, picked from the motif. Each changes hero, highlights, services and call to action. */
export type SectorFamily = "food" | "beauty" | "health" | "trades";
const FAMILY_BY_MOTIF: Readonly<Partial<Record<Config["design"]["motif"], SectorFamily>>> = {
  grill: "food", plate: "food", bread: "food", cup: "food", jar: "food",
  scissors: "beauty",
  tooth: "health", heartbeat: "health",
  bricks: "trades", car: "trades", leaf: "trades",
};

export function sectorFamily(config: Config): SectorFamily | null {
  return FAMILY_BY_MOTIF[config.design.motif] ?? null;
}

export function isFood(config: Config): boolean {
  return sectorFamily(config) === "food";
}
