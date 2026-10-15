# Design rules

Small-business sites that look trustworthy, load fast and do not look AI-generated.
Combines the useful parts of UI UX Pro Max (sector-matched systems) and Impeccable (anti-patterns).
When the two disagree, this file wins.

## Choosing a design

1. Start from the sector: a solicitor needs calm trust, a restaurant appetite, a salon style. Use `generate_design_system` output as the starting point.
2. Client brand colours always win. Change only shade/lightness to meet contrast, and tell Eren.
3. Choose `design.personality` and `design.motif` (corporate-v2, see below). Section `variants` only matter for corporate-v1 sites.
4. Write down in your summary *why* you chose the style, in one sentence.

## Personality and motif (corporate-v2)

The personality sets the whole layout (hero, services, quotes, call to action); the palette and fonts make it the client's own.

| personality | feel | typical sectors |
|---|---|---|
| `bold` | dark hero, big heavy type, bento cards | software, agencies, trades, builders, gyms, garages |
| `premium` | calm, editorial, arch photo, price list | solicitors, accountants, clinics, dentists, bridal, interiors |
| `friendly` | rounded, warm tints, playful | cafés, bakeries, food shops, salons, pets, kids, cleaning |

Motif = the animated drawing in the hero (decorative, colours from the palette):

| motif | for |
|---|---|
| `jar` | pickles, preserves, deli, honey, food shops |
| `code` | software, web, IT, digital agencies |
| `cup` | cafés, tea rooms, coffee |
| `bread` | bakeries, patisseries, sandwich shops |
| `grill` | kebab shops, grills, BBQ, steakhouses, burger, Turkish / Middle Eastern restaurants |
| `plate` | restaurants, cafés serving meals, takeaways, caterers (any food business without a closer motif) |
| `scissors` | hair, barbers, tailoring, alterations |
| `tooth` | dentists, orthodontists |
| `bricks` | builders, roofers, plumbers, electricians, trades |
| `leaf` | gardeners, florists, landscaping, wellbeing |
| `car` | garages, car wash, driving schools, removals |
| `scales` | solicitors, accountants, consultants |
| `heartbeat` | clinics, physio, care, fitness |
| `abstract` | last resort, only when nothing above is even close. Never for food, trades or health |
| `none` | when the client has strong photos and wants them in the hero (premium/friendly show the first photo) |

**Food layout.** The motifs `grill`, `plate`, `bread`, `cup` and `jar` switch on the restaurant layout whatever the personality: charcoal full-width hero (photo behind it when there is one), a scrolling ribbon made of `highlights`, services shown as a menu with dotted price lines, dark quotes band and a full-width booking band. Give food clients 3–4 short `highlights` and prices on every dish you have a price for.

**Dark mode.** `design.darkMode` = `auto` (default): the site follows the visitor's device and shows a sun/moon switch; the dark palette is made from the client's colours automatically. Set `off` only if the client asks for a light-only site.

Content for corporate-v2:
- `services[].icon`: pick the closest icon from the allowed list; leave it out if none fits.
- `highlights` (up to 4, e.g. "15 years" + "of bridal tailoring"): facts the client gave only. Never invent numbers. None = leave empty, the strip is hidden.
- `process` (up to 6 steps): how working with them goes, from the client's answers. None = leave empty.

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
