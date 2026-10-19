import { z } from "zod";

/**
 * Extras Eren sells on top of the base site, chosen per client (Business Tracking, or the new-client form).
 * The list decides two things: the proposal (a line and a price each) and what the agent builds. A client with no
 * list at all (made before 1.19.0) keeps the old behaviour: the agent follows rules/custom-site.md as before.
 */
export const ADDON_IDS = ["language", "theme", "blog", "whatsapp", "booking"] as const;
export type AddonId = (typeof ADDON_IDS)[number];

export const AddonSchema = z.object({
  id: z.enum(ADDON_IDS),
  /** In the client's currency; null = included without a separate price. */
  price: z.number().nonnegative().max(10_000_000).nullable().default(null),
  /** For "language": the second language's code (en, tr, de…). */
  value: z
    .string()
    .regex(/^[a-z]{2}$/)
    .optional(),
});
export type Addon = z.infer<typeof AddonSchema>;

export const AddonsSchema = z
  .array(AddonSchema)
  .max(ADDON_IDS.length)
  .refine((list) => new Set(list.map((a) => a.id)).size === list.length, "Each extra can be chosen once.");

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: "English",
  tr: "Turkish",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pl: "Polish",
  ar: "Arabic",
};

/** What the agent is told for each extra: when it was sold, and when it was not. */
const INSTRUCTIONS: Readonly<Record<AddonId, { included: (a: Addon) => string; excluded: string }>> = {
  language: {
    included: (a) =>
      `A second language${a.value ? ` (${LANGUAGE_NAMES[a.value] ?? a.value})` : ""}: write the default language; the other is added by the separate translation job. Add a language switch in the header.`,
    excluded: "One language only: no language switch.",
  },
  theme: {
    included: () => "Light and dark theme: design both from the palette and use the factory's theme toggle (rules/custom-site.md, Factory parts).",
    excluded: "One theme only: design the site in a single (light or dark) look that suits the brand; no theme toggle and no prefers-color-scheme switch.",
  },
  blog: {
    included: () => "A blog: a Blog link in the menu and a blog index page. Posts come only from Eren's 'Blog post' jobs; never invent posts.",
    excluded: "No blog: no blog page or blog link.",
  },
  whatsapp: {
    included: () =>
      "A WhatsApp button (class float-btn, with the pre-filled message if there is one) using whatsapp.number. If there is no number, leave it out and ask Eren for it.",
    excluded: "No WhatsApp button (a WhatsApp link in the contact details is fine when there is a number).",
  },
  booking: {
    included: () =>
      "Online booking: a clear 'Book online' call to action on every page, linking to integrations.bookingUrl. If there is no link, leave it out and ask Eren for it.",
    excluded: "No online booking button.",
  },
};

/**
 * The part of an agent prompt that says what Eren sold. Null for a client without a list (old clients), so their
 * jobs run exactly as before.
 */
export function addonsNote(addons: readonly Addon[] | undefined): string | null {
  if (!addons) return null;
  const chosen = new Map(addons.map((a) => [a.id, a]));
  const lines = ADDON_IDS.map((id) => {
    const a = chosen.get(id);
    return `- ${a ? INSTRUCTIONS[id].included(a) : INSTRUCTIONS[id].excluded}`;
  });
  return ["What Eren sold to this client (it overrides rules/custom-site.md on these points; build exactly this, nothing more):", ...lines].join("\n");
}

/** Sum of the extras' prices (those without a price count as 0). */
export function addonsTotal(addons: readonly Addon[] | undefined): number {
  return (addons ?? []).reduce((sum, a) => sum + (a.price ?? 0), 0);
}
