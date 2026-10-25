# Local search, AI search and images

A small business is found by people searching "barber in Sincan" or "emergency plumber Leeds", on Google, on maps
and more and more through AI assistants. The site helps when its facts are exact, consistent and easy to read for
people and machines. Facts come only from the config, the client and verified research; never invent them.

## 1. The same facts everywhere (NAP)

- Name, address and phone are written **exactly the same** on every page, in the JSON-LD and as on the business's
  Google Business Profile (when research found it). Same spelling, same phone number, same street form.
- If research shows a different phone, address or name on the maps listing than the client gave, do not choose:
  tell the operator in the summary which one differs.
- Opening hours in one place in the content, reused on every page that shows them.

## 2. Pages that answer local searches

- The home page says **what, where and for whom** in the `h1` and the first paragraph: "Men's barber in Sincan,
  Ankara", "Family solicitors in Bristol". Not a slogan alone.
- The `<title>` follows `Service in Area | Business name` (≤ 60 characters); the meta description names the main
  service, the area and one reason to choose them (≤ 160).
- Services page: one section per main service with its own heading, a plain description, price or "from" price
  when the client gave one, and the area served.
- **Areas served**: list the towns or districts the client named (in content, and `areaServed` in JSON-LD). Never
  add areas the client did not name. Separate pages per area only when the operator asks; thin copies of the same page for
  different towns hurt more than they help.
- Contact page: full address, a link to the map (`config.contact.mapsUrl`, only when set; never one made up from the
  address, none when the client does not want visitors), hours, phone and WhatsApp, how to find
  or reach the place (parking, entrance, nearest stop) when the client said so.

## 3. Structured data (JSON-LD on the home page)

Use the most specific `LocalBusiness` subtype that fits (`BarberShop`, `Dentist`, `Plumber`, `Restaurant`,
`LegalService`…). Fill only what the config has:

- `name`, `url` (when `site.domain` is set), `telephone` (international form), `email`, `image` and `logo`
  (absolute URLs when the domain is set), `address` (`PostalAddress`: street, locality, region, postcode, country
  code), `openingHoursSpecification`, `priceRange` only when the client gave prices, `areaServed`, and `sameAs` with
  the business's own social and maps links.
- No `aggregateRating` or `review` unless the operator gives real reviews with permission to show them. Invented ratings
  are against search engine rules and the factory's rules.
- Services with prices can also be `OfferCatalog` / `Service` items; only with the client's real prices.

## 4. AI search

- Plain HTML text: facts must be in the page text, not only inside images, SVG or animations.
- A short FAQ section (real questions customers ask, from the client) helps both people and AI assistants. Use
  `FAQPage` JSON-LD only for questions shown on that page.
- `robots.txt` allows AI crawlers unless the client said no (`bots.aiCrawlers` = `block`).
- `sitemap.xml` and canonical links when `site.domain` is set.

## 5. Images

Images are most of a page's weight, and weight decides how fast the site opens on a phone.

- Use the client's photos large where they matter (hero, story, gallery), cropped with intent; never stretched.
- Every `<img>` has `width` and `height` (stops the layout jumping), `alt` describing the image in the page's
  language, and `loading="lazy"` except the first image on the screen (that one gets `fetchpriority="high"`).
- Size to how big it is shown: a hero about 1600–2000 px wide, cards and gallery thumbnails 600–900 px. The factory
  does not resize photos: when one is very large or too small for where it goes, say so to the operator in the summary
  (they ask the client for another file or resizes it) instead of hiding the problem.
- Aim for under 300 KB per photo and under 1.5 MB for the whole home page. The build warns about images over
  500 KB and `<img>` tags without `width`/`height` ("Image weight and size attributes").
- Logos and drawings are SVG where possible. No text baked into photos (it cannot be read, translated or found).
- File names describe the image (`barber-chair-sincan.jpg`, not `IMG_2041.jpg`) when you choose them.
