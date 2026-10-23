# Custom sites: brand first, then a site written by hand

For clients whose `template` is `custom`, you are the designer and the developer. There is no template:
you design a brand identity for the business, then write the whole site (HTML, CSS, JavaScript, SVG)
with `write_site_file`. `build_site` copies `site/` to `dist/`, adds the images from `assets/`, and checks
the code, the brand and the basics. Eren reviews the result and approves it himself.

The bar: a small business owner opens the site and says "this is us". Not a theme with their name on it.

---

## What Eren sold (extras)

When the prompt has a "What Eren sold to this client" list, it decides five things and wins over this file on
them: a second language and its switch, light/dark theme and its toggle, a blog, a WhatsApp button, an online
booking button. Build what is included and nothing that is not (a single-theme site has no toggle and no
`prefers-color-scheme` switch). Without that list (clients from before extras existed), build as this file says.

## Design skills

Before designing, load the design skills in `.claude/skills/` with the Skill tool and use their judgement:

- **impeccable**: design direction, typography, colour, motion and the audit of generated-looking design.
- **design-taste-frontend** (taste-skill): art direction for public pages, composition and the no-slop house style.
- **ui-ux-pro-max** and **brand** (when installed): sector palettes, font pairings, brand identity structure.
- **animate** (Emil Kowalski, MIT): for interface motion only (buttons, menus, cards, form feedback): whether it
  should move at all, the property, curve, duration and reduced-motion variant. Its restraint ("should this move?",
  150–250 ms) does **not** apply to the signature motion, which is brand expression: that follows
  "Signature motion" below. Only its CSS and WAAPI paths apply (no Motion library, no npm packages).

Their scripts, browser tools and image generation are not available here (no shell). Do not load their reference
files whole: ask `search_design_knowledge` for the passage you need (e.g. "hero composition bakery", "dark palette
contrast") or read one specific reference. The skills' setup steps (context scripts, PRODUCT.md, DESIGN.md) do not
apply here: skip them.
When a skill disagrees with this file, **this file wins**: plain HTML/CSS/JS only (no React, Tailwind builds, CDNs
or npm packages), no generated images, no external resources except Google Fonts, and the brand board below.

## Step 0: read the client

`get_client_status`, then read `site.config.json` facts and `content/<locale>.json` (save content first if it is
missing; it is the single source of facts). Run `generate_design_system` for a sector starting point.
Never invent facts (prices, years, reviews, awards, addresses). Copy for visitors is written in the site's
languages; if Eren wrote notes in Turkish, translate them. The market rules (`rules/markets.md`: language, spelling,
formats, legal pages) and `rules/local-seo.md` (titles, local facts, JSON-LD, images) apply to every page you write.

## Design plan (new designs: approved by Eren before anything is built)

When `get_client_status` shows `designPlan.state` other than `not-required`, the site is not designed straight away.
First write the plan with `save_design_plan`, then **stop**: Eren reads it in the panel and approves it, or asks for
a new idea with notes. Until he approves, the write tools refuse every site file except `brand/signature.html`
(write it to show the motion live in the plan card). After approval, build exactly to the plan; any departure goes
in the summary with its reason. The build fails without an approved plan, or when the plan changed after approval.

The plan (all names formal and in the site's main language; no jokes, puns or cute phrasing):

- `concept`: the one idea the design grows from; `source`: where it comes from (the logo's shapes, the craft's
  material, the place), never "modern and clean".
- `tone` (2–4 words), `palette` (3–6 named colours with hex and role), `fonts` (heading, body, optional mono).
- `hero`: what fills the first screen, where the signature plays, how the headline sits.
- `pages`: every page with its sections and the purpose of each (only what earns its place).
- `signature`: the signature motion (see "Signature motion"): formal `name`, `idea`, `trigger`, `beats`
  (3–8: start `atMs`, `durationMs`, `what` moves, `easing`), `totalMs` (800–6000) and the `reducedMotion` still state.
- `animations`: 0–4 supporting animations with formal names, trigger and what moves.
- `differs` (only after a new-idea request): how this plan differs from the earlier ones.

In the summary, write the plan out for Eren in formal Turkish: concept and source, palette, fonts, hero, pages, the
signature's name and its beats in order with timings. On a new-idea request, read the earlier plans
(`design-plans/`): the new one has a different concept or source, hero composition and signature motion (not a
variation), unless Eren's notes keep a part.

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
  "signature": { "id": "jar-fill", "name": "Brine Fill Sequence", "idea": "Brine rises in the jar, the pickles rise and settle: the brand's one recognisable move." },
  "typeSample": "Brine, dill and a little patience.",
  "monoFont": "JetBrains Mono"
}
```

- **concept** comes from what the business makes or does, its materials and its place. Not "modern and clean".
- **palette**: 3–6 named colours. If the client named colours, they are the base (only adjust lightness for contrast).
  Mirror the main ones into `design.palette` in the config, and the fonts into `design.fonts`.
- **fonts**: Google Fonts, one or two families, with normal lowercase letters (no all-caps faces). Choose for the
  brand, not the default you use everywhere.
- **animations**: 2–4 **signature animations** that only make sense for this business, with formal names. Each `id`
  must appear in the code (class name, keyframes name or `data-anim`), or the build fails. How to find them: see
  "Signature motion" below; there is no list of ready ideas per sector on purpose.

### Signature motion

The one movement people remember the brand by. It is designed like a short film, not added as an effect.

1. **Source.** Take it from the logo's shapes (a stroke that draws itself, a mark that assembles) or from the
   craft's real material and process (how the product is made, cut, poured, folded, built). Say the source in the plan.
2. **Choreography.** 3–8 beats with a clear order: something is established, something transforms, the brand
   resolves (the mark and the headline settle into the composed first screen). Overlap beats (a beat starts before
   the previous ends); vary durations; one beat carries the moment. Total 0.8–2.5 s on load (up to 6 s for a
   scroll-driven scene).
3. **Craft.** Animate several elements and at least two properties (position/scale, stroke drawing, clip/mask,
   colour); ease out on arrival (`--ease-out`), use `--ease-spring` for a physical settle, never linear except for
   continuous loops. It plays at full size in the hero (40–60% of it), not as a small icon.
4. **Stills.** Under `prefers-reduced-motion` it shows the composed end state at once.
5. **Avoid the defaults** unless the logo itself asks for them: steam from a cup, flour or dust particles from the
   cursor, typing code, a blinking cursor, sparkles on a tooth, scissors cursor, a generic fade-and-slide, a
   counter as the hero. They read as a template.

Build it with the factory's motion kit (`js/motion.js`, see "Factory parts"): `SFMotion.sequence` takes the plan's
beats almost one to one (`at`, `duration`, `easing`, `draw`, `stagger`). After `build_site`, Read the four
**signature frames** it lists (start → end) and fix the motion if they do not show the planned beats. The build
fails for new designs when `brand/signature.html` is missing, has fewer animated steps than the plan's beats (at
least 3), or has no reduced-motion state.

**The brand board** (Eren shows it to the client as the "Marka Atölyesi" card, so it must stand on its own):

- **tagline**: a few words in the site's main language that only this business could say. Not "Quality and trust".
- **signature**: the one **signature motion** people remember the brand by (usually one of the animations above):
  `id` (used in the site's code), `name` (2–4 words, formal, e.g. "Katmanlı Açılış", "Layered Reveal") and
  `idea` (one sentence). With a design plan, it is the plan's signature. It appears on the site where it
  matters most (hero, logo or the main action), not everywhere.
- **`site/brand/signature.html`**: a small self-contained page that plays the signature motion on its own, centred
  on the brand's background, with inline CSS/JS only (the one exception: it may load `/js/motion.js`), looping calmly, and still under
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
   **Calm is not plain**: the first screen carries the brand at full strength in both themes (a full-colour or
   dark field from the palette, or the signature visual large); a white page with a small drawing reads as
   unfinished. The restraint rules below are about decoration, not about the hero.
2. **Labels only where they carry a fact.** Small labels in a mono or condensed face for real codes and values from
   the business's world: a price, a duration (`30 dk`), a step number in a real process, a batch or product code.
   **Never a label above every heading** ("No. 01 · Neden biz" on each section is the generated look); most
   headings stand alone.
3. **At least one composed section** in the board's spirit: cards of unequal sizes (bento), overlapping layers or a
   photo breaking its frame, with one card in a full brand colour carrying the mark or a big number from real facts.
4. **Drawings with a purpose.** At least one drawn illustration on the home page that shows the product, the craft
   or the place (inline SVG in the visual language); the mark may return once as a stamp or watermark. Every
   decoration must do a job (divide, guide the eye, show something); no dots, connectors, blobs or half-shapes for
   their own sake. When in doubt, leave it out.
5. **Use the screen.** Containers around 1200–1360px, full-bleed colour bands, generous but intentional spacing.
   A 900px column in the middle of a 1920px screen reads as unfinished.
6. **Every page has a designed page hero** (title, a label, a piece of the visual language), not just an `h1`.
7. **Motion with meaning**: the signature in the hero (as planned, at full size), 1–3 supporting animations from
   `brand.json`, scroll reveals that stagger (`data-reveal`, `data-stagger`); nothing moves without a reason,
   everything calms under `prefers-reduced-motion`.
8. **Both themes are designed**: the dark look is built from the palette (like the board), not inverted colours.

9. **Every section earns its place.** No minimum number of sections: hero, what they sell, why them, how to reach
   them is often enough. Each section fills its width with content (text with an illustration, a list, prices,
   a quote); never a heading and one sentence on a half-empty screen. Two sections of the same shape do not follow
   each other.

The build's "Design depth" check warns when the home page has no signature in the hero, no drawing besides the
logo, or a narrow layout. Treat that warning as a failure to fix.

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
privacy/index.html (gizlilik/ on Turkish-only sites) when there is a form; impressum/index.html in Germany
<locale>/…         the same pages for each extra locale (default locale at the root)
```

Only the pages listed in `config.pages`. Every page:

- `<html lang="…">`, `<meta charset>`, viewport meta, `<title>` (≤ 60 chars), meta description (≤ 160), Open Graph
  title/description, favicon `/brand/logo.svg`; canonical and `hreflang` alternates when `site.domain` is set.
- Header with logo, navigation to every page, language links when there are several locales, and one primary action
  (booking link, phone, WhatsApp or the contact page). Footer with contact details, opening hours, social links and,
  for limited companies, company name, number and registered office (`config.legal`).
- Home page: `LocalBusiness` JSON-LD (`<script type="application/ld+json">`) from the config facts.
  Use the most specific type that fits (`BarberShop`, `Dentist`…), with the exact business name and telephone from the
  config. Every page has its own `<title>` (no two alike); `robots.txt` names the sitemap when there is one. The build
  warns about anything missing ("Search and AI visibility").
- Contact: `tel:` and `mailto:` links, WhatsApp `https://wa.me/<number without +>` when there is a number, address with
  a link to the map (`config.contact.mapsUrl`). **A `<form>` only when `get_client_status` shows `contactForm`**: then
  it posts to exactly that `action` (method POST, labelled fields, a hidden honeypot, Web3Forms' hidden `access_key`
  when given); any other form address fails the build. Without `contactForm`: no form. **No embedded maps or
  videos** (`<iframe>` sets cookies).
- Semantic HTML (`header`, `nav`, `main`, `section`, `footer`), one `h1` per page, a skip link, visible keyboard focus,
  AA contrast (4.5:1 text, 3:1 large text and UI), alt text that describes each image, tap targets ≥ 44 px.
- Responsive from 360 px to 1600 px; check the layout in your head at 375, 768 and 1440.
- **Light and dark**: build the dark palette from the brand colours (`:root[data-theme="dark"]` and
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`). The toggle is the factory's part,
  never hand-written (see "Factory parts" below). A single-theme site (when the extras say so) has neither.

### Factory parts (do not write your own)

`css/base.css`, `js/kit.js` and `js/motion.js` (the motion kit: `SFMotion.sequence`, `data-reveal`, `data-draw`,
`data-split`, `data-scene`, `data-count`; usage at the top of the file, readable with `read_site_file js/motion.js`)
are copied into every site by the factory and updated by it; never edit them. Every
page loads `<script src="/js/kit.js" defer></script>` and, in `<head>` before the stylesheets, this one line so the
saved theme applies before the first paint:
`<script>try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>`

- **Theme toggle** (in the header):
  `<button type="button" class="theme-toggle" data-theme-toggle data-label-dark="Koyu temaya geç" data-label-light="Açık temaya geç" aria-label="Koyu temaya geç"><svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">…</svg><svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">…</svg></button>`
  with simple stroke icons (`fill="none" stroke="currentColor"`) and labels in the page's language. No emoji or
  symbol characters (◐ ☀) as icons: many fonts do not have them.
- **Phone menu**: when the header has more than 4 links, add
  `<button type="button" class="nav-toggle" data-nav-toggle aria-controls="site-nav" aria-expanded="false" aria-label="Menü">`
  (a three-line icon) and give the nav `id="site-nav" data-nav`; the header needs `position: relative`. Below 48rem
  the menu folds into the button. The build warns when a long menu has no phone menu.
- **Fixed buttons** (WhatsApp, booking) get `class="float-btn"`: the page then keeps room at the bottom so the
  button never covers the last content.

### Languages

The design job writes the default language only: **never write a `<locale>/` page in a design job**, not even a
short home page; a half translation fails the build. The translation job writes every other language as
`<locale>/<same path>`, and on every page the language link (`hreflang`) goes to **the same page** in the other
language, never to its home page; links inside a translation stay in that language. The build fails on a
half-translated site, a language link to another page or a link out of the language. Menu, button and form words
use the standard terms in `rules/markets.md` ("Standard words").

### Layout hygiene

- Decorative shapes stay inside their section (`.section` clips sideways overflow); none sits half off the page or
  behind the next block's text.
- Space between a grid and the button under it (at least `var(--gap)`); no stray dots, connectors or lines on cards
  unless they mean something.
- Section spacing comes from `.section`; no extra empty blocks. A section with text only on one side uses the other
  side for an illustration, a list or a quote, or narrows the column; never a half-empty screen.

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
"Screenshots"). **Read both images** and go through this list; fix every "no", build again and look once more:

- Phone: the menu is folded into the menu button (one header row); no text is cut off or runs off the screen;
  buttons are full size; a fixed button (WhatsApp, booking) covers nothing.
- Both: no decoration sits over text or sticks out of its section; no half-empty section; the gap between
  sections looks even and not huge; the hero shows the signature visual; text is readable on its background.
- Desktop: the layout uses the width (no narrow column in the middle); cards in a row line up.

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
