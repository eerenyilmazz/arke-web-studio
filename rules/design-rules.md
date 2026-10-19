# Design rules

Small-business sites that look trustworthy, load fast and do not look AI-generated.
Combines the useful parts of UI UX Pro Max (sector-matched systems) and Impeccable (anti-patterns).
When the two disagree, this file wins.

Which parts apply: **Choosing a design**, **Must pass**, **Palette**, **Colours the client names**, **Typography**
and **Avoid** apply to every site. Custom sites follow `rules/custom-site.md` on top of these; older template sites
also use `rules/legacy-templates.md`.

## Choosing a design

1. Start from the sector: a solicitor needs calm trust, a restaurant appetite, a salon style. Use `generate_design_system` output as the starting point.
2. Client brand colours always win. Change only shade/lightness to meet contrast, and tell Eren.
3. Template sites only: choose `design.personality` and `design.motif` (rules/legacy-templates.md).
4. Write down in your summary *why* you chose the style, in one sentence.

## Older template sites (corporate-v2)

Personality, motif and the content fields of the `corporate-v2` template are in `rules/legacy-templates.md`. Read it
only for clients whose `template` is not `custom`.

## Must pass (build_site checks the first three)

- Body text on background ≥ 4.5:1 contrast. Button text on primary ≥ 4.5:1.
- Accent used for text or icons ≥ 3:1 on background.
- Every image has descriptive alt text.
- Readable at 375 px wide; tap targets at least 44×44 px.
- Visible keyboard focus; motion respects `prefers-reduced-motion`.

## Palette

- Five tokens only: `primary`, `secondary`, `accent`, `background`, `text`.
- Tint neutrals: never pure `#000000` text or pure grey; use a dark shade of the primary hue.
- One accent colour, used sparingly (CTA, highlights).

## Colours the client names

Colours named anywhere in the client's text, in any language ("kırmızı ve siyah", "navy and gold"), are brand colours. Save them in `brand.colors` and build the palette from them. Change only lightness for contrast; never swap in a palette of your own.

## Typography

- Headings must use a font with normal lowercase letters. No all-caps or small-caps faces (Cinzel, "… SC", Bebas, Anton, Oswald, Abril Fatface): they shout and are hard to read. build_site warns about them.
- Food: warm, appetising pairs (e.g. Fraunces + Nunito, DM Serif Display + DM Sans, Bricolage Grotesque + Inter). Never a fine-dining serif for a takeaway.
- At most two families (heading + body), from Google Fonts, with a fallback stack.
- Avoid defaults that read as generic: Inter/Arial/system for everything. A characterful heading with a quiet body works best.
- Body 16–18 px, line length 60–75 characters, line height 1.5–1.7.

## Avoid (common AI-site tells)

- Purple-to-blue gradients, neon glows, glassmorphism for no reason.
- Cards inside cards; every section a grid of identical cards.
- Rounded-square icon tile above every heading; emoji as icons (use SVG icons).
- Grey text on coloured backgrounds; centred long paragraphs.
- Bounce/elastic easing; animation on every element.
- Stock photos of handshakes or people pointing at laptops.

## Visual approval checklist (Eren, before the preview goes to the client)

- [ ] Within 5 seconds it is clear what the business does and what to do next.
- [ ] One clear call to action per page; contact is never more than one tap away.
- [ ] Sections are neither empty nor crowded; spacing is consistent.
- [ ] Logo, colours and tone are the same on every page.
- [ ] It feels right for the sector (trust / appetite / style …).
- [ ] Next to another site from the same template, it is clearly different.
- [ ] Checked on a phone and a desktop; Lighthouse run by hand (performance ≥ 90, accessibility ≥ 95, SEO ≥ 95 as a starting target).
