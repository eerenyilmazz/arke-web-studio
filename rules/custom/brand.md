# Custom sites: brand identity, signature motion, design direction

Part of the custom-site rules (`rules/custom-site.md` is the start). Read before designing or changing a brand.

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

Build it with the factory's motion kit (`js/motion.js`, see "Factory parts"): `ArkeMotion.sequence` takes the plan's
beats almost one to one (`at`, `duration`, `easing`, `draw`, `stagger`). After `build_site`, Read the four
**signature frames** it lists (start → end) and fix the motion if they do not show the planned beats. The build
fails for new designs when `brand/signature.html` is missing, has fewer animated steps than the plan's beats (at
least 3), or has no reduced-motion state.

**The brand board** (the operator shows it to the client as the "Marka Atölyesi" card, so it must stand on its own):

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

A logo the client sent arrives in the inbox (a file named or looking like a logo; Read shows images): save it with
`save_asset` kind `logo` and set `brand.logo` before designing. If saving fails, stop and ask the operator; never draw a
replacement.

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
  hero, and ask the operator in the summary for a transparent PNG or SVG. Drawing your own version is never the fix.
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

The brand board (the operator's "Marka Atölyesi" card) is the standard: dark or light, the brand is *felt* on every screen,
not written in a file. A site that is a heading, a paragraph and a price list on an empty background is a fail,
however clean. Every custom site has all of these, designed for its own business (never copy the example's shapes):

1. **A hero built around the signature motion.** The signature visual (the mark, the product, the tool of the
   trade, drawn in SVG or the client's best photo) takes 40–60% of the hero and plays the signature motion at full
   size on load. Not an underline under a heading. The headline is set large in the heading font (clamp up to
   5–7rem) with the tagline.
   **Calm is not plain**: the first screen carries the brand at full strength in both themes (a tinted field from
   the palette that follows the theme, or the signature visual large); a white page with a small drawing reads as
   unfinished. The restraint rules below are about decoration, not about the hero. Strength comes from colour and
   scale, never from flipping the hero to the other theme (see "One theme per page" in `rules/custom/build.md`).
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
