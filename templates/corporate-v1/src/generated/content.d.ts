/* Generated from schema/content.schema.json by scripts/gen-types.mjs. Do not edit. */

export interface Content {
  tagline: string;
  hero: {
    title: string;
    subtitle: string;
    ctaLabel: string;
  };
  about: {
    title: string;
    body: string;
  };
  /**
   * @minItems 1
   * @maxItems 12
   */
  services: [
    {
      title: string;
      description: string;
      price?: string;
    },
    ...{
      title: string;
      description: string;
      price?: string;
    }[]
  ];
  /**
   * @maxItems 24
   */
  gallery?: {
    src: string;
    alt: string;
  }[];
  /**
   * @maxItems 8
   */
  testimonials?: {
    quote: string;
    author: string;
  }[];
  /**
   * @maxItems 12
   */
  faq?: {
    question: string;
    answer: string;
  }[];
  contact: {
    title: string;
    intro: string;
  };
  whatsappMessage?: string;
  seo: {
    home: {
      title: string;
      description: string;
    };
    about?: {
      title: string;
      description: string;
    };
    services?: {
      title: string;
      description: string;
    };
    gallery?: {
      title: string;
      description: string;
    };
    contact?: {
      title: string;
      description: string;
    };
  };
}
