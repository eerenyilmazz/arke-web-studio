import { z } from "zod";

/**
 * Single source of truth for a client's site config (site.config.json).
 * The JSON Schema file is generated from this (npm run schema) and must never be hand-edited.
 *
 * Rule of thumb for what lives here vs. content/<locale>.json:
 *   - here: structure and language-independent facts (pages, sections, phone, colours)
 *   - content: every human-readable text, per locale (tagline, service descriptions, ...)
 */

export const SCHEMA_VERSION = 1 as const;

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** Relative path inside the client folder, e.g. assets/logo.svg. No "..", no absolute paths. */
const CLIENT_ASSET_PATH = /^assets\/[a-z0-9][a-z0-9._-]{0,80}$/;

export const LOCALES = ["en", "tr", "de", "fr", "es", "it", "pl", "ar"] as const;
export const PAGES = ["home", "about", "services", "gallery", "contact"] as const;
export const SECTIONS = [
  "hero",
  "intro",
  "services",
  "gallery",
  "testimonials",
  "faq",
  "team",
  "contact-cta",
  "contact-form",
  "map",
  // corporate-v2 and later; older templates skip sections they do not know.
  "process",
  "highlights",
] as const;
export const TONES = ["formal", "friendly", "premium", "energetic", "calm"] as const;
export const VARIANTS = ["a", "b", "c"] as const;
/** Overall character of a corporate-v2 site, chosen by sector (see rules/design-rules.md). */
export const PERSONALITIES = ["bold", "premium", "friendly"] as const;
/** Animated sector illustrations in corporate-v2. "abstract" fits any sector; "none" turns motion off. */
export const DARK_MODES = ["auto", "off"] as const;
export const MOTIFS = [
  "jar",
  "code",
  "cup",
  "scissors",
  "tooth",
  "bricks",
  "leaf",
  "car",
  "scales",
  "heartbeat",
  "bread",
  "grill",
  "plate",
  "abstract",
  "none",
] as const;

const hexColor = z.string().regex(HEX_COLOR, "Use a 6-digit hex colour such as #1A2B3C");
const assetPath = z.string().regex(CLIENT_ASSET_PATH, "Must be a file saved with save_asset (assets/<name>)");
const httpsUrl = z.url({ protocol: /^https$/ });
/** E.164-ish: + then 8–15 digits. Spaces are stripped by the agent before saving. */
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +447700900123");

export const PaletteSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  accent: hexColor,
  background: hexColor,
  text: hexColor,
});

export const SiteConfigSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    slug: z.string().regex(SLUG_PATTERN),
    template: z.string().regex(SLUG_PATTERN),

    i18n: z.object({
      defaultLocale: z.enum(LOCALES),
      locales: z.array(z.enum(LOCALES)).min(1).max(3),
    }),

    business: z.object({
      name: z.string().min(1).max(80),
      industry: z.string().min(2).max(60),
      country: z.string().length(2).default("GB"),
      timezone: z.string().min(3).default("Europe/London"),
      currency: z.string().length(3).default("GBP"),
    }),

    brief: z.object({
      audience: z.string().min(3).max(400),
      tone: z.enum(TONES),
      references: z.array(z.string().max(200)).max(5).default([]),
      avoid: z.array(z.string().max(200)).max(10).default([]),
    }),

    brand: z.object({
      logo: assetPath.nullable(),
      /** Client-supplied colours. null = let the design system choose. */
      colors: z.object({ primary: hexColor, secondary: hexColor.optional(), accent: hexColor.optional() }).nullable(),
    }),

    design: z.object({
      style: z.string().min(2).max(80),
      palette: PaletteSchema,
      fonts: z.object({ heading: z.string().min(2).max(60), body: z.string().min(2).max(60) }),
      variants: z.object({
        hero: z.enum(VARIANTS).default("a"),
        services: z.enum(VARIANTS).default("a"),
        testimonials: z.enum(VARIANTS).default("a"),
        cta: z.enum(VARIANTS).default("a"),
      }),
      personality: z.enum(PERSONALITIES).default("premium"),
      motif: z.enum(MOTIFS).default("abstract"),
      // corporate-v2: "auto" follows the visitor's device and shows a light/dark switch; "off" keeps the site light.
      darkMode: z.enum(DARK_MODES).default("auto"),
    }),

    pages: z.array(z.enum(PAGES)).min(1),
    sections: z.partialRecord(z.enum(PAGES), z.array(z.enum(SECTIONS)).min(1)),

    contact: z.object({
      email: z.email(),
      formRecipient: z.email().nullable().default(null),
      phone: phone.nullable().default(null),
      address: z.string().max(300).nullable().default(null),
      hours: z.string().max(300).nullable().default(null),
      mapsUrl: httpsUrl.nullable().default(null),
      showCallButton: z.boolean().default(true),
      showEmailButton: z.boolean().default(true),
    }),

    whatsapp: z.object({
      number: phone.nullable().default(null),
      floatingButton: z.boolean().default(false),
    }),

    social: z
      .object({
        instagram: httpsUrl,
        facebook: httpsUrl,
        linkedin: httpsUrl,
        x: httpsUrl,
        tiktok: httpsUrl,
        youtube: httpsUrl,
      })
      .partial()
      .default({}),

    integrations: z.object({ bookingUrl: httpsUrl.nullable().default(null) }).default({ bookingUrl: null }),
    analytics: z.object({ enabled: z.boolean().default(true) }).default({ enabled: true }),
    bots: z.object({ aiCrawlers: z.enum(["allow", "block"]).default("allow") }).default({ aiCrawlers: "allow" }),

    legal: z
      .object({
        companyName: z.string().max(160).nullable().default(null),
        companyNumber: z.string().max(40).nullable().default(null),
        registeredAddress: z.string().max(300).nullable().default(null),
        vatNumber: z.string().max(40).nullable().default(null),
      })
      .default({ companyName: null, companyNumber: null, registeredAddress: null, vatNumber: null }),

    hosting: z.object({
      model: z.enum(["managed", "client"]),
      workerName: z.string().regex(SLUG_PATTERN).nullable().default(null),
    }),

    site: z.object({
      domain: z
        .string()
        .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/, "Lowercase domain such as example.co.uk")
        .nullable(),
      domainStatus: z.enum(["own", "we-buy", "client-buys", "undecided"]),
    }),

    /** Bookkeeping the agent maintains. Never rendered on the site. */
    meta: z
      .object({
        unmapped: z.array(z.object({ question: z.string(), answer: z.string(), note: z.string().optional() })).default([]),
        laterInterests: z.array(z.string()).default([]),
      })
      .default({ unmapped: [], laterInterests: [] }),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.i18n.locales.includes(cfg.i18n.defaultLocale)) {
      ctx.addIssue({ code: "custom", path: ["i18n", "locales"], message: "locales must include defaultLocale" });
    }
    if (!cfg.pages.includes("home")) {
      ctx.addIssue({ code: "custom", path: ["pages"], message: "pages must include home" });
    }
    for (const page of Object.keys(cfg.sections)) {
      if (!cfg.pages.includes(page as (typeof PAGES)[number])) {
        ctx.addIssue({ code: "custom", path: ["sections", page], message: `sections defined for page "${page}" which is not in pages` });
      }
    }
    if (cfg.whatsapp.floatingButton && !cfg.whatsapp.number) {
      ctx.addIssue({ code: "custom", path: ["whatsapp", "number"], message: "floatingButton needs a WhatsApp number" });
    }
    if (cfg.site.domainStatus === "own" && !cfg.site.domain) {
      ctx.addIssue({ code: "custom", path: ["site", "domain"], message: "domainStatus 'own' needs the domain" });
    }
  });

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type Locale = (typeof LOCALES)[number];
