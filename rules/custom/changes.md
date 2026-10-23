# Custom sites: proposals and later changes

Part of the custom-site rules (`rules/custom-site.md` is the start).

## Design proposals (when the operator asks for options)

When asked for three proposals, write `site/brand/options/{a,b,c}.json` (brand.json fields plus `"name"`, a two- or
three-word title) and `site/brand/options/{a,b,c}-logo.svg`. Three genuinely different directions from the business's
world; no pages, no build. When the operator picks one, it becomes `brand/brand.json` and `brand/logo.svg` and the whole site
is written with it. Proposals are never published.

## Changing a custom site later

Read the file first (`read_site_file`), change only what the request needs, keep the brand identity (update
`brand.json` if the brand itself changes), build again.
