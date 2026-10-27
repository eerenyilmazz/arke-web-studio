# Custom sites: brand first, then a site written by hand

For clients whose `template` is `custom`, you are the designer and the developer. There is no template:
you design a brand identity for the business, then write the whole site (HTML, CSS, JavaScript, SVG)
with `write_site_file`. `build_site` copies `site/` to `dist/`, adds the images from `assets/`, and checks
the code, the brand and the basics. The operator reviews the result and approves it themselves.

The bar: a small business owner opens the site and says "this is us". Not a theme with their name on it.

---

## What the operator sold (extras)

When the prompt has a "What the operator sold to this client" list, it decides five things and wins over this file on
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
  "Signature motion" (`rules/custom/brand.md`). Only its CSS and WAAPI paths apply (no Motion library, no npm packages).

Their scripts, browser tools and image generation are not available here (no shell). Do not load their reference
files whole: ask `search_design_knowledge` for the passage you need (e.g. "hero composition bakery", "dark palette
contrast") or read one specific reference. The skills' setup steps (context scripts, PRODUCT.md, DESIGN.md) do not
apply here: skip them.
When a skill disagrees with this file, **this file wins**: plain HTML/CSS/JS only (no React, Tailwind builds, CDNs
or npm packages), no generated images, no external resources except Google Fonts, and the brand board (`rules/custom/brand.md`).

## Step 0: read the client

`get_client_status`, then read `site.config.json` facts and `content/<locale>.json` (save content first if it is
missing; it is the single source of facts). Run `generate_design_system` for a sector starting point.
Never invent facts (prices, years, reviews, awards, addresses). Copy for visitors is written in the site's
languages; if the operator wrote notes in Turkish, translate them. The market rules (`rules/markets.md`: language, spelling,
formats, legal pages) and `rules/local-seo.md` (titles, local facts, JSON-LD, images) apply to every page you write.

## Where the rest is

The custom-site rules are split so each job reads only what it needs. The job's prompt names the files; when unsure, read them all.

| File | What it covers | Read for |
| --- | --- | --- |
| `rules/custom/plan.md` | The design plan (storyboard, beats, approval) | a new design, before anything else |
| `rules/custom/brand.md` | Step 1 brand identity and the brand board, **Signature motion**, Step 2 design direction, **Signature design** | designing or changing a brand, a plan's signature |
| `rules/custom/build.md` | Step 3 writing the site (**Factory parts**, languages, layout hygiene), Step 4 build, read, fix | writing or changing pages |
| `rules/custom/changes.md` | Design proposals, changing a custom site later | proposals and edits after launch |
| `rules/products/<kind>.md` | The kind's pages and what each holds (showcase: `rules/products/showcase.md`) | writing or changing pages |

App sites (e-commerce, booking, restaurant) also follow `rules/parts.md`.
