/* Generated from schema/site.config.schema.json by scripts/gen-types.mjs. Do not edit. */

export interface SiteConfig {
  schemaVersion: 1;
  slug: string;
  template: string;
  i18n: {
    defaultLocale: "en" | "tr" | "de" | "fr" | "es" | "it" | "pl" | "ar";
    /**
     * @minItems 1
     * @maxItems 3
     */
    locales: [
      "en" | "tr" | "de" | "fr" | "es" | "it" | "pl" | "ar",
      ...("en" | "tr" | "de" | "fr" | "es" | "it" | "pl" | "ar")[]
    ];
  };
  business: {
    name: string;
    industry: string;
    country?: string;
    timezone?: string;
    currency?: string;
  };
  brief: {
    audience: string;
    tone: "formal" | "friendly" | "premium" | "energetic" | "calm";
    /**
     * @maxItems 5
     */
    references?: string[];
    /**
     * @maxItems 10
     */
    avoid?: string[];
  };
  brand: {
    logo: string | null;
    colors: {
      primary: string;
      secondary?: string;
      accent?: string;
    } | null;
  };
  design: {
    style: string;
    palette: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
      text: string;
    };
    fonts: {
      heading: string;
      body: string;
    };
    variants: {
      hero?: "a" | "b" | "c";
      services?: "a" | "b" | "c";
      testimonials?: "a" | "b" | "c";
      cta?: "a" | "b" | "c";
    };
    personality?: "bold" | "premium" | "friendly";
    motif?:
      | "jar"
      | "code"
      | "cup"
      | "scissors"
      | "tooth"
      | "bricks"
      | "leaf"
      | "car"
      | "scales"
      | "heartbeat"
      | "bread"
      | "grill"
      | "plate"
      | "abstract"
      | "none";
  };
  /**
   * @minItems 1
   */
  pages: [
    "home" | "about" | "services" | "gallery" | "contact",
    ...("home" | "about" | "services" | "gallery" | "contact")[]
  ];
  sections: {
    /**
     * @minItems 1
     */
    [k: string]: [
      (
        | "hero"
        | "intro"
        | "services"
        | "gallery"
        | "testimonials"
        | "faq"
        | "team"
        | "contact-cta"
        | "contact-form"
        | "map"
        | "process"
        | "highlights"
      ),
      ...(
        | "hero"
        | "intro"
        | "services"
        | "gallery"
        | "testimonials"
        | "faq"
        | "team"
        | "contact-cta"
        | "contact-form"
        | "map"
        | "process"
        | "highlights"
      )[]
    ];
  };
  contact: {
    email: string;
    formRecipient?: string | null;
    phone?: string | null;
    address?: string | null;
    hours?: string | null;
    mapsUrl?: string | null;
    showCallButton?: boolean;
    showEmailButton?: boolean;
  };
  whatsapp: {
    number?: string | null;
    floatingButton?: boolean;
  };
  social?: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    x?: string;
    tiktok?: string;
    youtube?: string;
  };
  integrations?: {
    bookingUrl?: string | null;
  };
  analytics?: {
    enabled?: boolean;
  };
  bots?: {
    aiCrawlers?: "allow" | "block";
  };
  legal?: {
    companyName?: string | null;
    companyNumber?: string | null;
    registeredAddress?: string | null;
    vatNumber?: string | null;
  };
  hosting: {
    model: "managed" | "client";
    workerName?: string | null;
  };
  site: {
    domain: string | null;
    domainStatus: "own" | "we-buy" | "client-buys" | "undecided";
  };
  meta?: {
    unmapped?: {
      question: string;
      answer: string;
      note?: string;
    }[];
    laterInterests?: string[];
  };
}
