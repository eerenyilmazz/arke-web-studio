import type { SectionId } from "../../lib/data";
import ContactCta from "./ContactCta.astro";
import ContactForm from "./ContactForm.astro";
import Faq from "./Faq.astro";
import Gallery from "./Gallery.astro";
import Hero from "./Hero.astro";
import Intro from "./Intro.astro";
import MapBlock from "./MapBlock.astro";
import Services from "./Services.astro";
import Testimonials from "./Testimonials.astro";

/**
 * Section name (from site.config.json) → component. A new section is a new component plus one line here.
 * null = known to the schema but not built in this template version (skipped with a build warning).
 */
export const SECTIONS: Readonly<Record<SectionId, typeof Hero | null>> = {
  hero: Hero,
  intro: Intro,
  services: Services,
  gallery: Gallery,
  testimonials: Testimonials,
  faq: Faq,
  team: null,
  "contact-cta": ContactCta,
  "contact-form": ContactForm,
  map: MapBlock,
};
