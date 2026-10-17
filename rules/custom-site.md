# Custom sites: brand first, then a site written by hand

For clients whose `template` is `custom`, you are the designer and the developer. There is no template:
you design a brand identity for the business, then write the whole site (HTML, CSS, JavaScript, SVG)
with `write_site_file`. `build_site` copies `site/` to `dist/`, adds the images from `assets/`, and checks
the code, the brand and the basics. Eren reviews the result and approves it himself.

The bar: a small business owner opens the site and says "this is us". Not a theme with their name on it.

---

## Design skills

Before designing, load the design skills in `.claude/skills/` with the Skill tool and use their judgement:

- **impeccable**: design direction, typography, colour, motion and the audit of generated-looking design.
- **design-taste-frontend** (taste-skill): art direction for public pages, composition and the no-slop house style.
- **ui-ux-pro-max** and **brand** (when installed): sector palettes, font pairings, brand identity structure.

Their scripts, browser tools and image generation are not available here (no shell); read their references instead.
When a skill disagrees with this file, **this file wins**: plain HTML/CSS/JS only (no React, Tailwind builds, CDNs
or npm packages), no generated images, no external resources except Google Fonts, and the brand board below.

## Step 0: read the client

`get_client_status`, then read `site.config.json` facts and `content/<locale>.json` (save content first if it is
missing; it is the single source of facts). Run `generate_design_system` for a sector starting point.
Never invent facts (prices, years, reviews, awards, addresses). Copy for visitors is written in the site's
languages; if Eren wrote notes in Turkish, translate them.

## Step 1: brand identity (required, before any page)

Write `site/brand/brand.json`:

```json
{
  "concept": "Pickles that taste of a family kitchen: glass jars, brine, crunch and a red pepper on the windowsill.",
  "personality": ["warm", "honest", "a little cheeky"],
  "palette": { "brine": "#2F4A2A", "pepper": "#B3261E", "jar-glass": "#DCE6C8", "paper": "#FCF6E8", "ink": "#1E2419" },
  "fonts": { "heading": "Fraunces", "body": "Nunito" },
  "visualLanguage": "Rounded jar silhouettes, hand-drawn dill sprigs, brine bubbles, kraft-paper labels with a stamped date.",
  "voice": "Short, friendly sentences; speaks like the family behind the counter.",
  "animations": [
    { "id": "jar-fill", "idea": "Hero jars fill with brine as the page loads, pickles bob up", "trigger": "load" },
    { "id": "brine-bubbles", "idea": "Bubbles rise from the cursor over the hero, like fermentation", "trigger": "pointer" },
    { "id": "lid-twist", "idea": "Product cards: the jar lid twists open on hover and the price label swings", "trigger": "hover" }
  ],
  "tagline": "Crunch, the slow way.",
  "signature": { "id": "jar-fill", "name": "The jar fills", "idea": "Brine rises in the jar, the pickles bob up and settle: the brand's one recognisable move." },
  "typeSample": "Brine, dill and a little patience.",
  "monoFont": "JetBrains Mono"
}
```

- **concept** comes from what the business makes or does, its materials and its place. Not "modern and clean".
- **palette**: 3–6 named colours. If the client named colours, they are the base (only adjust lightness for contrast).
  Mirror the main ones into `design.palette` in the config, and the fonts into `design.fonts`.
- **fonts**: Google Fonts, one or two families, with normal lowercase letters (no all-caps faces). Choose for the
  brand, not the default you use everywhere.
- **animations**: 2–4 **signature animations** that only make sense for this business. Each `id` must appear in the
  code (class name, keyframes name or `data-anim`), or the build fails. Examples by sector:

| Sector | Signature animation ideas |
|---|---|
| Pickles / deli | jars fill and empty with brine, bubbles rise, lid twists open, dill sprig sways, label stamps on |
| Kebab / grill | embers rise from the cursor, skewers turn, smoke curls on scroll, menu prices sizzle in |
| Bakery / café | steam from a cup, dough rises on scroll, flour dust from the cursor, coffee pours into a cup on load |
| Barber / salon | the cursor becomes scissors that snip, hair clippings fall, a comb sweeps text into place, a barber pole turns |
| Dentist / clinic | a sparkle sweeps across a tooth, a calm pulse line draws itself, cards lift gently |
| Builder / trades | bricks stack up as you scroll, a crane lowers the headline, a measuring tape draws section dividers |
| Gardener / florist | stems grow along the page edge, leaves fall from the cursor, flowers open on hover |
| Software / agency | code types itself, a cursor blinks, UI pieces snap together on scroll |
| Solicitor / accountant | scales settle, numbers count up to real facts, a pen signs the headline |

**The brand board** (Eren shows it to the client as the "Marka Atölyesi" card, so it must stand on its own):

- **tagline**: a few words in the site's main language that only this business could say. Not "Quality and trust".
- **signature**: the one **signature motion** people remember the brand by (usually one of the animations above):
  `id` (used in the site's code), `name` (2–4 words) and `idea` (one sentence). It appears on the site where it
  matters most (hero, logo or the main action), not everywhere.
- **`site/brand/signature.html`**: a small self-contained page that plays the signature motion on its own, centred
  on the brand's background, with inline CSS/JS only (no other files), looping calmly, and still under
  `prefers-reduced-motion`, with `<title>`, meta description, viewport and `<meta name="robots" content="noindex">`.
  The panel shows it live in the board. It is not linked from the site.
- **typeSample**: one line in the brand's voice, set in the heading font on the board.
- **monoFont** (optional): a Google monospace font for numbers, codes and labels when the brand uses one.

The build warns until the board is complete; the pages themselves still build.

**When the client has a logo** (`brand.logo` in the config, saved with `save_asset`): the brand is built **from it**,
never replaced. Look at the file with Read (it shows you the image), then:

- take the palette from the logo (exact hex values of its colours; add neutrals and one supporting colour only if needed),
- choose fonts that match the logo's lettering (its weight, width and contrast), not against it,
- take the concept, visual language and signature motion from the logo's shapes (a pair of scissors in the mark
  becomes the motion; a script wordmark asks for a handwritten line), and say in `concept` that it comes from the logo,
- use the file itself in the header and as the favicon (`<img src="/assets/<logo file>" alt="…">`), large in the
  hero or brand section too. Do **not** write `brand/logo.svg` and never redraw or "improve" the client's logo.
- If the logo is low quality (tiny, blurry) or sits on a photo or coloured background (a JPG with a grey backdrop),
  still use that file: place it on a light plate (a rounded card in the logo's background tone) in the header and
  hero, and ask Eren in the summary for a transparent PNG or SVG. Drawing your own version is never the fix.
- The build fails when the client's logo file is not used, or when `brand/logo.svg` (a drawn logo) exists next to it.

Then (only when the client has no logo) write `site/brand/logo.svg`: a real mark plus wordmark drawn in SVG (shapes and paths, using the brand
colours), with a `viewBox`, readable at 32 px and on light and dark backgrounds. No `<script>`, no event attributes,
no external references. Use it in the header of every page (`<img src="/brand/logo.svg" alt="…">` or inline SVG
with `class="logo"`) and as the favicon.

`rules/examples/uzunoglu/` is a finished custom site for a pickle maker (brand.json, logo, CSS, JS, pages). Read it to
see the expected level of detail and how signature animations are wired in. **Never copy its look, layout or
illustrations**: every client gets its own concept from its own world.

## Step 2: design direction

Plan before writing: palette roles, type scale, layout concept for each page, and the one memorable moment.

- **Open with the most characteristic thing in this business's world**: the product, the craft, the place. A big
  number with a gradient is a default, not a choice.
- **Spend boldness in one place** (usually the hero and the signature animation); keep the rest calm and disciplined.
- **Typography carries the personality.** A clear scale (e.g. 1.25 ratio), deliberate weights, headings that are part
  of the design. Body 16–18 px, lines under 75 characters.
- **Structure is information.** Numbers only for real sequences (process steps). No label above every heading.
- **Use the client's photos** (`/assets/<name>`) large and well cropped when there are any: hero, story, gallery.
  Without photos, draw illustrations in the brand's visual language (inline SVG), not generic shapes.
- **Avoid the generated look**: cream background + serif + terracotta accent by default; near-black with one neon
  accent; identical rounded cards with the same soft shadow; ALL-CAPS eyebrow labels everywhere; "A · B · C" meta
  strings; arrows appended to every button; gradient washes as decoration. Use them only when the brand calls for it.
- **Depth and texture where the brand has it**: paper grain, glass highlights, overlapping layers, a photo breaking
  out of its frame. Not decoration for its own sake.

## Signature design (what every custom site must feel like)

The brand board (Eren's "Marka Atölyesi" card) is the standard: dark or light, the brand is *felt* on every screen,
not written in a file. A site that is a heading, a paragraph and a price list on an empty background is a fail,
however clean. Every custom site has all of these, designed for its own business (never copy the example's shapes):

1. **A hero built around the signature motion.** The signature visual (the mark, the product, the tool of the
   trade, drawn in SVG or the client's best photo) takes 40–60% of the hero and plays the signature motion at full
   size on load. Not an underline under a heading. The headline is set large in the heading font (clamp up to
   5–7rem) with the tagline.
2. **A label system ("marka etiketi").** Small labels in a mono or condensed face that carry codes from the
   business's world: a barber's `No. 01 · Saç kesimi · 30 dk`, a pickle maker's batch `P-024 / 2 kg`, a builder's
   drawing number. Use them on cards, section starts and prices, consistently. They replace generic eyebrows.
3. **At least one composed section** in the board's spirit: cards of unequal sizes (bento), overlapping layers or a
   photo breaking its frame, with one card in a full brand colour carrying the mark or a big number from real facts.
4. **The mark as a graphic.** The logo mark returns large: a watermark behind a section, a divider, a stamp on a
   card, a loader. Draw at least two brand illustrations on the home page (inline SVG in the visual language).
5. **Use the screen.** Containers around 1200–1360px, full-bleed colour bands, generous but intentional spacing.
   A 900px column in the middle of a 1920px screen reads as unfinished.
6. **Every page has a designed page hero** (title, a label, a piece of the visual language), not just an `h1`.
7. **Motion with meaning**: the signature in the hero, 1–3 supporting animations from `brand.json`, scroll reveals
   that stagger; nothing moves without a reason, everything calms under `prefers-reduced-motion`.
8. **Both themes are designed**: the dark look is built from the palette (like the board), not inverted colours.

The build's "Design depth" check warns when the home page has no signature in the hero, fewer than five sections,
almost no drawn graphics or a narrow layout. Treat that warning as a failure to fix.

## Step 3: write the site

Files (paths inside `site/`):

```
brand/brand.json   brand/logo.svg    brand/signature.html
css/base.css       provided by the factory: reset, .wrap/.section/.grid/.stack/.cluster, skip link, focus,
                   .btn, form fields, reduced motion. Link it first on every page; never rewrite it.
css/site.css       the brand layer only: set --c-bg --c-surface --c-ink --c-muted --c-line --c-accent
                   --c-accent-ink --font-heading --font-body (and --wrap), then the design itself
js/site.js         (shared by all pages; small, no frameworks)
index.html         about/index.html    services/index.html   gallery/index.html   contact/index.html
404.html           robots.txt          sitemap.xml (only when site.domain is set)
<locale>/…         the same pages for each extra locale (default locale at the root)
```

Only the pages listed in `config.pages`. Every page:

- `<html lang="…">`, `<meta charset>`, viewport meta, `<title>` (≤ 60 chars), meta description (≤ 160), Open Graph
  title/description, favicon `/brand/logo.svg`; canonical and `hreflang` alternates when `site.domain` is set.
- Header with logo, navigation to every page, language links when there are several locales, and one primary action
  (booking link, phone, WhatsApp or the contact page). Footer with contact details, opening hours, social links and,
  for limited companies, company name, number and registered office (`config.legal`).
- Home page: `LocalBusiness` JSON-LD (`<script type="application/ld+json">`) from the config facts.
- Contact: `tel:` and `mailto:` links, WhatsApp `https://wa.me/<number without +>` when there is a number, address with
  a link to the map (`config.contact.mapsUrl`). **A `<form>` only when `get_client_status` shows `contactForm`**: then
  it posts to exactly that `action` (method POST, labelled fields, a hidden honeypot, Web3Forms' hidden `access_key`
  when given); any other form address fails the build. Without `contactForm`: no form. **No embedded maps or
  videos** (`<iframe>` sets cookies).
- Semantic HTML (`header`, `nav`, `main`, `section`, `footer`), one `h1` per page, a skip link, visible keyboard focus,
  AA contrast (4.5:1 text, 3:1 large text and UI), alt text that describes each image, tap targets ≥ 44 px.
- Responsive from 360 px to 1600 px; check the layout in your head at 375, 768 and 1440.
- **Light and dark**: follow `prefers-color-scheme` and offer a toggle that remembers the choice in `localStorage`.
  Build the dark palette from the brand colours.

Animation rules:

- Signature animations use `transform`, `opacity`, `clip-path`, SVG attributes, CSS keyframes, scroll-driven CSS
  (`animation-timeline: view()`) or a few lines of vanilla JS (`IntersectionObserver`, `pointermove`, `<canvas>`).
- Pointer effects only for `(pointer: fine)`; never hide the cursor over links and buttons.
- Everything calms down under `@media (prefers-reduced-motion: reduce)` (the build checks it is handled).
- Keep `js/site.js` small (aim under 40 KB). No external scripts, no libraries from CDNs.

What the build refuses (and you must not write): external `<script src>`, `fetch`/`XMLHttpRequest`/beacons/sockets,
`eval`/`new Function`, `document.cookie`, JavaScript redirects, `<iframe>`/`<object>`/`<embed>`, `<base>`, meta
refresh, scripts inside SVG, stylesheets or images from other sites (only Google Fonts), internal links to pages that
do not exist, `<form>`, missing `404.html` or viewport meta, missing alt, lang or title, and placeholder text.

## Step 4: build, read, fix

`build_site` also saves a phone and a desktop screenshot of the home page when a browser is available (check
"Screenshots"): **Read both images** and judge them like a designer: overlapping or cut-off text, empty or
unbalanced areas, unreadable contrast, a hero without the signature visual, a layout that looks plain. Fix what you
see, then build again and look once more.

Then read every failed check and the Impeccable warnings (contrast, cramped padding, tells of generated
design) and fix them in the files. Build again; stop after 3 failed builds and report.

In your summary for Eren (Turkish, plain): the brand concept in one sentence, the palette and fonts, and each
signature animation and where it appears. Never mention file paths or commands.

## Design proposals (when Eren asks for options)

When asked for three proposals, write `site/brand/options/{a,b,c}.json` (brand.json fields plus `"name"`, a two- or
three-word title) and `site/brand/options/{a,b,c}-logo.svg`. Three genuinely different directions from the business's
world; no pages, no build. When Eren picks one, it becomes `brand/brand.json` and `brand/logo.svg` and the whole site
is written with it. Proposals are never published.

## Changing a custom site later

Read the file first (`read_site_file`), change only what the request needs, keep the brand identity (update
`brand.json` if the brand itself changes), build again.
