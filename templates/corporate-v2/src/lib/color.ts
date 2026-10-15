/** WCAG 2.x contrast helpers, used to pick readable text on brand colours. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const WHITE = "#FFFFFF";

/** White or the site's text colour, whichever reads better on `background` (build_site already checks ≥ 4.5:1). */
export function readableOn(background: string, textColor: string): string {
  return contrast(WHITE, background) >= contrast(textColor, background) ? WHITE : textColor;
}

const AA_TEXT = 4.5;
const DARKEN_STEP = 0.05;
const MAX_DARKEN = 0.7;

/** Mixes colour `a` toward colour `b` by `amount` (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number): string {
  const ch = (i: number) => {
    const x = parseInt(a.slice(i, i + 2), 16);
    const y = parseInt(b.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  };
  return `#${ch(1)}${ch(3)}${ch(5)}`.toUpperCase();
}

const BLACK = "#000000";

/** Mixes a colour toward black by `amount` (0–1). */
function darken(hex: string, amount: number): string {
  return mix(hex, BLACK, amount);
}

/**
 * The accent, darkened in small steps only as far as needed to reach normal-text contrast against `against`
 * (best of white / text colour when `against` is null, i.e. the accent is the background). Keeps the hue,
 * so a bright orange button becomes a deeper orange instead of failing contrast.
 */
export function readableAccent(accent: string, textColor: string, against: string | null, direction: "darken" | "lighten" = "darken"): string {
  const ok = (c: string) => (against ? contrast(c, against) : Math.max(contrast(WHITE, c), contrast(textColor, c))) >= AA_TEXT;
  for (let a = 0; a <= MAX_DARKEN; a += DARKEN_STEP) {
    const c = a === 0 ? accent : direction === "darken" ? darken(accent, a) : mix(accent, WHITE, a);
    if (ok(c)) return c;
  }
  return against ? textColor : accent;
}

export interface Palette {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly background: string;
  readonly text: string;
}

/** Share of black mixed into the brand primary to get the dark-mode page background (keeps a hint of the hue). */
const DARK_BG_SHADE = 0.8;
const DARK_SECONDARY_TINT = 0.86;
const AAA_TEXT = 7;
const DARK_FALLBACK_TEXT = "#F3F1EE";

/** Dark version of the client's palette: same hues, dark surfaces, the light background colour becomes the text. */
export function darkPalette(p: Palette): Palette {
  const background = darken(p.primary, DARK_BG_SHADE);
  const text = contrast(p.background, background) >= AAA_TEXT ? p.background : DARK_FALLBACK_TEXT;
  return {
    primary: p.primary, // brand bands and buttons keep their colour; the darker page sets them apart
    secondary: mix(p.secondary, background, DARK_SECONDARY_TINT),
    accent: p.accent,
    background,
    text,
  };
}
