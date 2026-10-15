import type { Locale } from "../lib/data";
import { ar } from "./ar";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { pl } from "./pl";
import { tr } from "./tr";

/** English defines the keys; every other locale must match its shape exactly. */
export type UiStrings = typeof en;

const ALL: Readonly<Record<Locale, UiStrings>> = { en, tr, de, fr, es, it, pl, ar };

export function strings(locale: Locale): UiStrings {
  return ALL[locale];
}
