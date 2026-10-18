import { z } from "zod";

/**
 * Per-locale client text: content/<locale>.json.
 * Every sentence a visitor reads comes from here, so the template never contains client text.
 * Interface strings (nav labels, "Send", cookie banner) belong to the template's own locale files.
 */

const assetPath = z.string().regex(/^assets\/[a-z0-9][a-z0-9._-]{0,80}$/);
const shortText = (max: number) => z.string().trim().min(1).max(max);

/** Service icons available in corporate-v2 (stroke icons drawn by the template). */
export const ICONS = [
  "code",
  "mobile",
  "globe",
  "qr",
  "box",
  "chart",
  "cart",
  "scissors",
  "tooth",
  "home",
  "hammer",
  "leaf",
  "car",
  "scales",
  "heart",
  "cup",
  "bread",
  "sparkle",
  "shield",
  "clock",
  "calendar",
  "chat",
  "camera",
  "star",
] as const;

const SeoSchema = z.object({
  title: shortText(60),
  description: shortText(160),
});

export const ContentSchema = z.object({
  tagline: shortText(90),
  hero: z.object({
    title: shortText(80),
    subtitle: shortText(200),
    ctaLabel: shortText(30),
  }),
  about: z.object({
    title: shortText(60),
    body: shortText(2000),
  }),
  services: z
    .array(
      z.object({
        title: shortText(60),
        description: shortText(300),
        /** Free text so "from £30" or "on request" both work; only shown if set. */
        price: z.string().trim().max(40).optional(),
        /** corporate-v2 icon; older templates ignore it. */
        icon: z.enum(ICONS).optional(),
      }),
    )
    .min(1)
    .max(12),
  gallery: z
    .array(z.object({ src: assetPath, alt: shortText(150) }))
    .max(24)
    .default([]),
  testimonials: z
    .array(z.object({ quote: shortText(400), author: shortText(60) }))
    .max(8)
    .default([]),
  faq: z
    .array(z.object({ question: shortText(150), answer: shortText(600) }))
    .max(12)
    .default([]),
  contact: z.object({
    title: shortText(60),
    intro: shortText(300),
  }),
  /** corporate-v2 "how it works" steps: only steps the business really follows. */
  process: z
    .array(z.object({ title: shortText(50), description: shortText(220) }))
    .max(6)
    .default([]),
  /** corporate-v2 strip of short facts (e.g. "NHS & private", "Same-week appointments"). Facts only. */
  highlights: z
    .array(z.object({ title: shortText(40), text: shortText(80) }))
    .max(4)
    .default([]),
  whatsappMessage: z.string().trim().max(200).optional(),
  seo: z.object({
    home: SeoSchema,
    about: SeoSchema.optional(),
    services: SeoSchema.optional(),
    gallery: SeoSchema.optional(),
    contact: SeoSchema.optional(),
  }),
});

export type Content = z.infer<typeof ContentSchema>;
