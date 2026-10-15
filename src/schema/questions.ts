/**
 * Client questionnaire as data. The questionnaire text, follow-up rounds and the
 * "which answers are still missing" check are all generated from this list, so a
 * question can never exist without saying where its answer goes.
 *
 * targets:
 *   "config:<path>"  -> a field in site.config.json (dot path)
 *   "content:<path>" -> a field in content/<locale>.json
 *   "brief"          -> free notes the agent folds into brief.* (no single field)
 *   "asset"          -> a file the client sends (saved with save_asset)
 *   "record"         -> kept for the business side only (meta / approvals), never rendered
 */

export type Round = 1 | 2 | "later";
export type Audience = "client" | "internal";

export interface Question {
  readonly id: string;
  readonly round: Round;
  readonly audience: Audience;
  readonly required: boolean;
  /** Why the build needs it. Shown to the agent, never to the client. */
  readonly why?: string;
  readonly text: string;
  readonly hint?: string;
  readonly example?: string;
  readonly choices?: readonly string[];
  readonly targets: readonly string[];
}

export const QUESTIONS: readonly Question[] = [
  // ---------- Round 1: the ten-minute form ----------
  {
    id: "business-name",
    round: 1,
    audience: "client",
    required: true,
    why: "Header, page titles, legal footer.",
    text: "What is your business name, exactly as it should appear on the site?",
    example: "Willow & Thread Tailoring",
    targets: ["config:business.name"],
  },
  {
    id: "services",
    round: 1,
    audience: "client",
    required: true,
    why: "Services section and page; drives the design-system industry match.",
    text: "What do you do? List your main services (3–8), one line each.",
    example: "Wedding dress alterations — fittings by appointment",
    targets: ["config:business.industry", "content:services"],
  },
  {
    id: "audience",
    round: 1,
    audience: "client",
    required: true,
    why: "Copy tone and design direction.",
    text: "Who are your ideal customers, and where are they based?",
    example: "Brides and wedding parties in south-west London",
    targets: ["config:brief.audience"],
  },
  {
    id: "logo",
    round: 1,
    audience: "client",
    required: false,
    text: "Do you have a logo? Please share it (SVG or a large PNG). If not, we will set your name in a clean wordmark.",
    targets: ["asset", "config:brand.logo"],
  },
  {
    id: "brand-colours",
    round: 1,
    audience: "client",
    required: false,
    text: "Do you have brand colours? If not, we will propose a palette that suits your sector.",
    choices: ["Yes (please give hex codes or a reference)", "No, please suggest"],
    targets: ["config:brand.colors"],
  },
  {
    id: "tone",
    round: 1,
    audience: "client",
    required: true,
    why: "Copy voice and design style.",
    text: "How should the site feel?",
    choices: ["Formal", "Friendly", "Premium", "Energetic", "Calm"],
    targets: ["config:brief.tone"],
  },
  {
    id: "pages",
    round: 1,
    audience: "client",
    required: true,
    why: "Decides which pages are built.",
    text: "Which pages do you need?",
    choices: ["Home", "About", "Services", "Gallery", "Contact"],
    hint: "A single-page site (Home only) is fine too.",
    targets: ["config:pages", "config:sections"],
  },
  {
    id: "contact-details",
    round: 1,
    audience: "client",
    required: true,
    why: "Contact section, footer, structured data for local search.",
    text: "Contact details to show: email, phone, address and opening hours.",
    example: "hello@willowthread.co.uk · +44 7700 900123 · 12 High St, Kingston KT1 1AA · Tue–Sat 10:00–18:00",
    targets: ["config:contact.email", "config:contact.phone", "config:contact.address", "config:contact.hours"],
  },
  {
    id: "whatsapp",
    round: 1,
    audience: "client",
    required: false,
    text: "Would you like a WhatsApp button? If yes, which number, and what should the pre-filled message say?",
    example: "+44 7700 900123 — \"Hi, I'd like to book a fitting\"",
    targets: ["config:whatsapp.number", "config:whatsapp.floatingButton", "content:whatsappMessage"],
  },
  {
    id: "languages",
    round: 1,
    audience: "client",
    required: true,
    why: "Number of content files and routes.",
    text: "The site is built in English. Do you need any other language as well? Which one(s)?",
    choices: ["English only", "English + one more (please name it)"],
    targets: ["config:i18n.locales", "config:i18n.defaultLocale"],
  },

  // ---------- Round 2: only what is still missing ----------
  {
    id: "about",
    round: 2,
    audience: "client",
    required: true,
    why: "About section/page.",
    text: "Tell us your story in a few sentences: how you started, what makes you different.",
    targets: ["content:about"],
  },
  {
    id: "photos",
    round: 2,
    audience: "client",
    required: false,
    text: "Please share photos (premises, work, team) via a shared folder link. Are stock photos acceptable where we lack images?",
    hint: "Google Drive or WeTransfer link is easiest.",
    targets: ["asset", "content:gallery"],
  },
  {
    id: "testimonials-faq",
    round: 2,
    audience: "client",
    required: false,
    text: "Any customer reviews we may quote (with first name), and common questions customers ask?",
    targets: ["content:testimonials", "content:faq"],
  },
  {
    id: "form-recipient",
    round: 2,
    audience: "client",
    required: false,
    text: "Which email address should receive contact-form messages? (If different from the public one.)",
    targets: ["config:contact.formRecipient"],
  },
  {
    id: "maps-booking",
    round: 2,
    audience: "client",
    required: false,
    text: "Do you have a Google Maps / Business Profile link, or an online booking link (Calendly, Booksy, Fresha…)?",
    targets: ["config:contact.mapsUrl", "config:integrations.bookingUrl"],
  },
  {
    id: "social",
    round: 2,
    audience: "client",
    required: false,
    text: "Social media links to show.",
    targets: ["config:social"],
  },
  {
    id: "domain",
    round: 2,
    audience: "client",
    required: true,
    why: "Decides the deploy path and who does DNS.",
    text: "Do you already have a domain name? If yes, which, and who can change its DNS settings? If not, shall we buy one for you, and what budget?",
    choices: ["Yes, I have one", "Please buy one for me", "I will buy one myself", "Not sure yet"],
    targets: ["config:site.domain", "config:site.domainStatus"],
  },
  {
    id: "legal",
    round: 2,
    audience: "client",
    required: false,
    text: "For the footer and privacy notice: registered company name, company number, registered address and VAT number (if any).",
    hint: "UK limited companies must show these on their website.",
    targets: ["config:legal"],
  },
  {
    id: "style-references",
    round: 2,
    audience: "client",
    required: false,
    text: "Two websites you like and two styles you definitely do not want.",
    targets: ["config:brief.references", "config:brief.avoid"],
  },
  {
    id: "ai-crawlers",
    round: 2,
    audience: "client",
    required: false,
    text: "May AI search tools (e.g. ChatGPT, Perplexity) read your site? Default is yes.",
    choices: ["Yes", "No"],
    targets: ["config:bots.aiCrawlers"],
  },
  {
    id: "rights",
    round: 2,
    audience: "client",
    required: true,
    why: "We only publish material the client may use.",
    text: "Please confirm you own or have permission to use every logo, photo and text you send us.",
    choices: ["I confirm"],
    targets: ["record"],
  },
  {
    id: "approver",
    round: 2,
    audience: "client",
    required: true,
    why: "Who signs off the preview.",
    text: "Who will approve the site before it goes live (name and email)? Any launch date we should aim for?",
    targets: ["record"],
  },

  // ---------- Internal: decided by you, never sent to the client ----------
  {
    id: "hosting",
    round: 1,
    audience: "internal",
    required: true,
    why: "Picks which Cloudflare account/token deploy uses.",
    text: "Hosting on our Cloudflare account (managed) or the client's own (client)?",
    choices: ["managed", "client"],
    targets: ["config:hosting.model"],
  },

  // ---------- Later: interest only, never affects the build ----------
  ...(
    [
      ["multi-location", "More than one branch/location on the site"],
      ["migration", "Moving from an existing website (keeping Google rankings)"],
      ["search-console", "Google Search Console setup and reporting"],
      ["special-hours", "Holiday / special opening hours"],
      ["team", "Team members page"],
      ["video", "Promotional video"],
      ["payments", "Online payment or deposit link"],
      ["newsletter", "Newsletter sign-up"],
      ["branded-email", "Branded email (info@yourdomain)"],
      ["qr-code", "QR code for shop window / business cards"],
      ["maintenance", "Monthly maintenance and updates"],
    ] as const
  ).map(
    ([id, text]): Question => ({
      id: `later-${id}`,
      round: "later",
      audience: "client",
      required: false,
      text,
      targets: ["config:meta.laterInterests"],
    }),
  ),
];

/** Extra round-2 questions for common sectors. Matched by substring of business.industry. */
export const INDUSTRY_EXTRAS: Readonly<Record<string, readonly string[]>> = {
  restaurant: ["Please share your menu (PDF or text) and say whether you take reservations."],
  cafe: ["Please share your menu and say whether you offer takeaway or delivery."],
  salon: ["Please list your services with prices or \"from\" prices."],
  barber: ["Please list your services with prices, and whether walk-ins are welcome."],
  law: ["Which practice areas do you cover, and are you SRA-regulated? (Your SRA number must appear on the site.)"],
  solicitor: ["Which practice areas do you cover? Please give your SRA number."],
  dental: ["Do you accept NHS patients, private only, or both?"],
  clinic: ["Which treatments do you offer, and are you registered with a regulator we should show?"],
  builder: ["Which areas do you cover, and any trade accreditations (e.g. TrustMark, Gas Safe)?"],
};

export function questionById(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}
