import type { PageContext } from "./site";

/** schema.org LocalBusiness for the home page. `</` is escaped so client text cannot close the script tag. */
export function localBusinessJsonLd(ctx: PageContext): string {
  const { config, site, content } = ctx;
  const abs = (p: string) => (site.baseUrl ? `${site.baseUrl}${p}` : undefined);
  const social = Object.values(config.social).filter((u): u is string => typeof u === "string");
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: config.business.name,
    description: content.tagline,
    email: config.contact.email,
    ...(config.contact.phone ? { telephone: config.contact.phone } : {}),
    ...(config.contact.address ? { address: config.contact.address } : {}),
    ...(config.contact.hours ? { openingHours: config.contact.hours } : {}),
    ...(abs("/") ? { url: abs("/") } : {}),
    ...(config.brand.logo && abs(`/${config.brand.logo}`) ? { logo: abs(`/${config.brand.logo}`) } : {}),
    ...(social.length ? { sameAs: social } : {}),
    ...(config.contact.mapsUrl ? { hasMap: config.contact.mapsUrl } : {}),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
