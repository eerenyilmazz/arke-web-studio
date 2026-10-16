# Custom sites: brand first, then a site written by hand

For clients whose `template` is `custom`, you are the designer and the developer. There is no template:
you design a brand identity for the business, then write the whole site (HTML, CSS, JavaScript, SVG)
with `write_site_file`. `build_site` copies `site/` to `dist/`, adds the images from `assets/`, and checks
the code, the brand and the basics. Eren reviews the result and approves it himself.

The bar: a small business owner opens the site and says "this is us". Not a theme with their name on it.

---

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
  ]
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

Then write `site/brand/logo.svg`: a real mark plus wordmark drawn in SVG (shapes and paths, using the brand
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

## Step 3: write the site

Files (paths inside `site/`):

```
brand/brand.json   brand/logo.svg
css/site.css       js/site.js          (shared by all pages; small, no frameworks)
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
  a link to the map (`config.contact.mapsUrl`). **No `<form>`** (forms need the factory's form service), **no embedded
  maps or videos** (`<iframe>` sets cookies).
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

`build_site`, then read every failed check and the Impeccable warnings (contrast, cramped padding, tells of generated
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
