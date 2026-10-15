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
      icon?:
        | "code"
        | "mobile"
        | "globe"
        | "qr"
        | "box"
        | "chart"
        | "cart"
        | "scissors"
        | "tooth"
        | "home"
        | "hammer"
        | "leaf"
        | "car"
        | "scales"
        | "heart"
        | "cup"
        | "bread"
        | "sparkle"
        | "shield"
        | "clock"
        | "calendar"
        | "chat"
        | "camera"
        | "star";
    },
    ...{
      title: string;
      description: string;
      price?: string;
      icon?:
        | "code"
        | "mobile"
        | "globe"
        | "qr"
        | "box"
        | "chart"
        | "cart"
        | "scissors"
        | "tooth"
        | "home"
        | "hammer"
        | "leaf"
        | "car"
        | "scales"
        | "heart"
        | "cup"
        | "bread"
        | "sparkle"
        | "shield"
        | "clock"
        | "calendar"
        | "chat"
        | "camera"
        | "star";
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
  /**
   * @maxItems 6
   */
  process?: {
    title: string;
    description: string;
  }[];
  /**
   * @maxItems 4
   */
  highlights?: {
    title: string;
    text: string;
  }[];
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
