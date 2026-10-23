import type { AddonId } from "../panel/addons.js";

/**
 * Web Stüdyosu: the kinds of site the factory makes. Everything shared lives in the core (clients, approvals,
 * versions, brand system, checks, publishing, accounts, analysis); each kind declares only what is its own here.
 *
 * Working rule for every kind: the factory supplies the working parts (catalogue, cart, payment integrations,
 * calendar, menu, admin screen) as tested, ready-made code configured by scripts; the agent designs and places
 * them and never writes them. That keeps jobs short and cheap, and the parts reliable.
 */
export const PRODUCT_IDS = ["showcase", "ecommerce", "booking", "restaurant"] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

/** Ready-made factory parts a kind is built from (shared between kinds). */
export type FactoryPart = "site-kit" | "motion" | "catalog" | "cart" | "payments" | "calendar" | "menu-qr" | "admin" | "notifications" | "legal-pages";

export interface ProductModule {
  readonly id: ProductId;
  readonly name: string;
  readonly summary: string;
  /** "soon": shown in the new-client form, not selectable yet. */
  readonly status: "active" | "soon";
  /** static = files on Workers (today); app = a Worker with a database and secrets. */
  readonly deploy: "static" | "app";
  readonly addons: readonly AddonId[];
  readonly parts: readonly FactoryPart[];
  /** Rule files the agent reads for this kind (the shared ones are read for every kind). */
  readonly rules: readonly string[];
}

export const PRODUCTS: Readonly<Record<ProductId, ProductModule>> = {
  showcase: {
    id: "showcase",
    name: "Tanıtım sitesi",
    summary: "İşletmeyi, hizmetlerini ve iletişim bilgilerini anlatan marka sitesi.",
    status: "active",
    deploy: "static",
    addons: ["language", "theme", "blog", "whatsapp", "booking"],
    parts: ["site-kit", "motion"],
    rules: ["rules/custom-site.md"],
  },
  ecommerce: {
    id: "ecommerce",
    name: "E-ticaret",
    summary: "Ürünler, sepet ve müşterinin seçtiği ödeme sağlayıcısıyla online satış.",
    status: "soon",
    deploy: "app",
    addons: ["language", "theme", "whatsapp"],
    parts: ["site-kit", "motion", "catalog", "cart", "payments", "admin", "notifications", "legal-pages"],
    rules: [],
  },
  booking: {
    id: "booking",
    name: "Randevu",
    summary: "Hizmetler, personel ve takvimle online randevu (kuaför, klinik, salon).",
    status: "soon",
    deploy: "app",
    addons: ["language", "theme", "whatsapp"],
    parts: ["site-kit", "motion", "catalog", "calendar", "admin", "notifications"],
    rules: [],
  },
  restaurant: {
    id: "restaurant",
    name: "Restoran ve kafe",
    summary: "Menü, masadaki QR menü, rezervasyon ve isteğe bağlı paket sipariş.",
    status: "soon",
    deploy: "app",
    addons: ["language", "theme", "whatsapp"],
    parts: ["site-kit", "motion", "catalog", "menu-qr", "calendar", "cart", "payments", "admin", "notifications", "legal-pages"],
    rules: [],
  },
};

/** A client's kind: clients from before kinds existed are showcase sites. */
export function productOf(business: { product?: ProductId } | null | undefined): ProductModule {
  return PRODUCTS[business?.product ?? "showcase"];
}

/** What the new-client form lists. */
export function productList() {
  return PRODUCT_IDS.map((id) => {
    const p = PRODUCTS[id];
    return { id: p.id, name: p.name, summary: p.summary, status: p.status };
  });
}
