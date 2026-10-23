/**
 * Personal-data profile of a client, by market (Web Stüdyosu step 3b). The law follows the client's country, not the
 * page language. One profile decides: where an app site's data lives, how long each kind of record is kept before the
 * Worker deletes it, and what the privacy notice says. Sources and reasoning: docs/privacy.md.
 *
 *   TR       KVKK (6698)     periodic deletion at most every 6 months, requests answered in 30 days
 *   GB       UK GDPR         data in the EU region (adequate for the UK), requests in one month
 *   IE DE NL GDPR            data in the EU region, requests in one month
 *   US       none federal    short privacy notice, same retention
 *
 * Retention is a purpose limit, not a legal minimum: contact messages and bookings have no fixed period in any of
 * these laws, so they are deleted after a year. Order records have legal minimums (TR distance-selling rules: 3
 * years; UK records: 6 years), so they are kept that long; accounting documents live in the business's accounting
 * system, not on the site.
 */

export type PrivacyLaw = "KVKK" | "UK_GDPR" | "GDPR" | "NONE";
export type Jurisdiction = "eu";

export interface PrivacyProfile {
  readonly law: PrivacyLaw;
  /** Where the app site's database and media bucket are created; null = Cloudflare's default placement. */
  readonly jurisdiction: Jurisdiction | null;
  /** Days each kind of record is kept before the daily clean-up deletes it. */
  readonly retentionDays: { readonly messages: number; readonly bookings: number; readonly orders: number };
  /** Days the business has to answer a person's request (see, export, delete). */
  readonly requestDays: number;
  /** Name of the notice page the agent writes. */
  readonly notice: string;
}

const YEAR = 365;
const BASE = { messages: YEAR, bookings: YEAR };

const PROFILES: Readonly<Record<string, PrivacyProfile>> = {
  TR: {
    law: "KVKK",
    jurisdiction: null,
    retentionDays: { ...BASE, orders: 3 * YEAR },
    requestDays: 30,
    notice: "KVKK Aydınlatma Metni",
  },
  GB: { law: "UK_GDPR", jurisdiction: "eu", retentionDays: { ...BASE, orders: 6 * YEAR }, requestDays: 30, notice: "Privacy notice" },
  IE: { law: "GDPR", jurisdiction: "eu", retentionDays: { ...BASE, orders: 6 * YEAR }, requestDays: 30, notice: "Privacy notice" },
  DE: { law: "GDPR", jurisdiction: "eu", retentionDays: { ...BASE, orders: 8 * YEAR }, requestDays: 30, notice: "Datenschutzerklärung / Privacy notice" },
  NL: { law: "GDPR", jurisdiction: "eu", retentionDays: { ...BASE, orders: 7 * YEAR }, requestDays: 30, notice: "Privacy notice" },
  US: { law: "NONE", jurisdiction: null, retentionDays: { ...BASE, orders: 6 * YEAR }, requestDays: 30, notice: "Privacy notice" },
};

/** The profile of a market; an unknown country gets the strictest one (GDPR, EU region). */
export function privacyProfile(country: string | undefined): PrivacyProfile {
  return PROFILES[(country ?? "").toUpperCase()] ?? PROFILES.IE!;
}

export const LAW_NAMES: Readonly<Record<PrivacyLaw, string>> = { KVKK: "KVKK", UK_GDPR: "UK GDPR", GDPR: "GDPR", NONE: "—" };
