# Older template sites (corporate-v1 / corporate-v2)

Only for clients whose `template` is not `custom` (sites made before custom design became the default). Custom
sites never read this file. The general rules in `rules/design-rules.md` still apply.

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

**Other sector layouts** (also picked by the motif):
- `scissors` → beauty: editorial headline, tall arch photo, turning booking badge, salon price list. Prices on every service matter here.
- `tooth`, `heartbeat` → health: calm hero with the highlights as a checklist and an hours card, equal treatment cards, contact panel. 4 highlights read best.
- `bricks`, `car`, `leaf` → trades: dark hero with the phone number as the main button, highlights as badges (free quotes, insured, guarantee), sturdy job tiles, a huge tap-to-call number. Put the process steps in; trades customers want to know what happens.

**Pointer effects.** On desktop the hero reacts to the mouse automatically, by motif: scissors become the cursor and snip, a grill throws embers, food steams, code leaves glyphs, health sparkles, trades kick up dust. Nothing to configure; touch, keyboard and reduced-motion visitors see the normal page.

**Dark mode.** `design.darkMode` = `auto` (default): the site follows the visitor's device and shows a sun/moon switch; the dark palette is made from the client's colours automatically. Set `off` only if the client asks for a light-only site.

Content for corporate-v2:
- `services[].icon`: pick the closest icon from the allowed list; leave it out if none fits.
- `highlights` (up to 4, e.g. "15 years" + "of bridal tailoring"): facts the client gave only. Never invent numbers. None = leave empty, the strip is hidden.
- `process` (up to 6 steps): how working with them goes, from the client's answers. None = leave empty.

