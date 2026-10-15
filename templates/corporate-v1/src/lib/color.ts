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
