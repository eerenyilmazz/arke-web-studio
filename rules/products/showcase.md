# Showcase sites: the pages and what each one holds

The kind-specific part of a showcase site (a brand site for the business, its services and how to reach it). Everything
shared by every kind stays where it is: the brand and the plan (`rules/custom/brand.md`, `rules/custom/plan.md`), how
pages are written and checked (`rules/custom/build.md`), market, privacy and local search rules (`rules/markets.md`,
`rules/privacy.md`, `rules/local-seo.md`). Read this file before writing or changing pages of a showcase site.

## Pages

Only the pages listed in `config.pages`, at these paths inside `site/`:

```
index.html             home
about/index.html       about
services/index.html    services
gallery/index.html     gallery
contact/index.html     contact
404.html               always
privacy/index.html     when there is a form (gizlilik/ on Turkish-only sites); impressum/index.html in Germany
<locale>/…             the same pages for each extra locale, written by the translation job only
```

Every page has its designed page hero (`rules/custom/brand.md`, "Signature design" 6) and the header's one primary
action (booking link, phone, WhatsApp or the contact page).

## What each page holds

- **Home:** the signature hero (`rules/custom/brand.md`), then only the sections that earn their place: what they sell,
  why them, a glimpse of the work, how to reach them. The `h1` and first paragraph say what, where and for whom
  (`rules/local-seo.md`); `LocalBusiness` JSON-LD from the config facts (`rules/custom/build.md`).
- **About:** the business's own story and facts the client gave (founding year, people, place); no invented history,
  awards or numbers.
- **Services:** one section per main service with its own heading, a plain description, the price or "from" price
  when the client gave one, and the area served.
- **Gallery:** the client's own photos, large and cropped with intent, with alt text that describes each one. Without
  photos the page is left out of `config.pages`; never fill it with drawings or stock pictures.
- **Contact:** full address, hours, `tel:` and `mailto:` links, WhatsApp `https://wa.me/<number without +>` when there
  is a number, how to find or reach the place (parking, entrance, nearest stop) when the client said so.
  - A link to the map (`config.contact.mapsUrl`) only when it is set; never build a map or "Get directions" link from
    the address yourself, and none at all when the client said they do not want one (remote-only businesses).
  - **A `<form>` only when `get_client_status` shows `contactForm`**: then it posts to exactly that `action` (method
    POST, labelled fields, a hidden honeypot, Web3Forms' hidden `access_key` when given); any other form address fails
    the build. Without `contactForm`: no form, and say so in the summary if the plan had one.
  - **No embedded maps or videos** (`<iframe>` sets cookies).
- **Privacy notice:** whenever the site collects personal data (a form), from `rules/privacy.md`.
- **404:** in the site's design, with a way back home and to the contact page.

## Extras the operator sold

The prompt's "What the operator sold to this client" list decides the second language, the theme toggle, the blog,
the WhatsApp button and the online booking button (`rules/custom-site.md`, "What the operator sold"). A booking button
on a showcase site links to the client's own booking page; the booking system itself is the booking kind, not this one.
