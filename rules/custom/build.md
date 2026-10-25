# Custom sites: writing and checking the site

Part of the custom-site rules (`rules/custom-site.md` is the start). Read before writing or changing pages.

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
  a link to the map (`config.contact.mapsUrl`) only when it is set; never build a map or "Get directions" link
  from the address yourself, and none at all when the client said they do not want one (remote-only businesses). **A `<form>` only when `get_client_status` shows `contactForm`**: then
  it posts to exactly that `action` (method POST, labelled fields, a hidden honeypot, Web3Forms' hidden `access_key`
  when given); any other form address fails the build. Without `contactForm`: no form. **No embedded maps or
  videos** (`<iframe>` sets cookies).
- Semantic HTML (`header`, `nav`, `main`, `section`, `footer`), one `h1` per page, a skip link, visible keyboard focus,
  AA contrast (4.5:1 text, 3:1 large text and UI), alt text that describes each image, tap targets ≥ 44 px.
- Responsive from 360 px to 1600 px; check the layout in your head at 375, 768 and 1440.
- **Light and dark**: build the dark palette from the brand colours (`:root[data-theme="dark"]` and
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`). The toggle is the factory's part,
  never hand-written (see "Factory parts" below). A single-theme site (when the extras say so) has neither.
- **One theme per page.** In the light theme every section, the header and the footer have light backgrounds; in the
  dark theme all of them are dark. No inverted bands: no dark hero, stats strip or footer on a light page, no white
  section on a dark page. Emphasis comes from the palette's accent, tints of the same theme, borders, scale and type,
  never from switching a section to the other theme. A single-theme site keeps its one theme everywhere.

### Factory parts (do not write your own)

`css/base.css`, `js/kit.js` and `js/motion.js` (the motion kit: `ArkeMotion.sequence`, `data-reveal`, `data-draw`,
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

In your summary for the operator (Turkish, plain): the brand concept in one sentence, the palette and fonts, and each
signature animation and where it appears. Never mention file paths or commands.
