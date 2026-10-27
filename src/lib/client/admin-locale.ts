/**
 * The language and formats of an app site's admin screen (the client's own screen at /admin), by the client's market:
 * Turkish in Türkiye, English elsewhere; dates and money in the country's own format. The client can switch between
 * Turkish and English on the screen itself; this is only where it starts.
 */
export type AdminLang = "tr" | "en";

const LOCALES: Readonly<Record<string, string>> = { TR: "tr-TR", GB: "en-GB", IE: "en-IE", US: "en-US", DE: "de-DE", NL: "nl-NL" };

export function adminLocale(country: string | undefined): { lang: AdminLang; locale: string } {
  const c = (country ?? "").toUpperCase();
  return { lang: c === "TR" ? "tr" : "en", locale: LOCALES[c] ?? "en-GB" };
}
