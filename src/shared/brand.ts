// Per-business brand colour for the public booking page.
//
// The owner picks ONE colour. Everything else is derived, because asking a barber to
// choose four coordinated shades is a design task, not a settings field — and the one
// that must not be guessed is the text colour on top of the accent. Pick that wrong and
// the primary button becomes unreadable, which is exactly the sort of thing nobody
// notices until a client cannot find the confirm button.
//
// Derived set, mirroring the token names in crm.css:
//   --accent        the chosen colour
//   --accent-deep   darker; hover states, and text on light backgrounds
//   --accent-tint   very light; section backgrounds and chips
//   --accent-ink    text ON the accent — black or white, whichever actually contrasts

/** easyQ green. Used when a business has not chosen anything. */
export const DEFAULT_BRAND_COLOR = "#b4d94e";

export type BrandPalette = {
  accent: string;
  accentDeep: string;
  accentTint: string;
  accentInk: string;
};

type Rgb = { r: number; g: number; b: number };

/** `#abc` and `#aabbcc`, with or without the hash. Anything else is null. */
export function parseHexColor(value: string): Rgb | null {
  const hex = String(value ?? "").trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function isValidBrandColor(value: string) {
  return parseHexColor(value) !== null;
}

/** Normalized `#rrggbb`, lowercase, or null. What gets stored. */
export function normalizeBrandColor(value: string): string | null {
  const rgb = parseHexColor(value);
  if (!rgb) return null;
  return toHex(rgb);
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * WCAG relative luminance. Not a simple average: the eye is far more sensitive to green
 * than to blue, so a naive brightness check calls pure blue "light" and puts black text
 * on it.
 */
export function relativeLuminance({ r, g, b }: Rgb) {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Toward black by `amount` (0–1). */
function darken(rgb: Rgb, amount: number): Rgb {
  return { r: rgb.r * (1 - amount), g: rgb.g * (1 - amount), b: rgb.b * (1 - amount) };
}

/** Toward white by `amount` (0–1). */
function lighten(rgb: Rgb, amount: number): Rgb {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount,
  };
}

const NEAR_BLACK: Rgb = { r: 20, g: 22, b: 15 };
const NEAR_WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * The four tokens for a chosen colour.
 *
 * `accentInk` is whichever of near-black or white contrasts better with the accent, so a
 * dark navy brand gets white button text and a bright yellow one gets black — without the
 * owner having to think about it.
 *
 * `accentDeep` is darkened enough to stay legible as text on a white panel. A pale brand
 * would otherwise produce a "deep" shade still too light to read, so the darkening is
 * scaled by how light the colour is rather than being a fixed step.
 */
export function brandPalette(color: string | null | undefined): BrandPalette {
  const rgb = parseHexColor(color ?? "") ?? parseHexColor(DEFAULT_BRAND_COLOR)!;
  const luminance = relativeLuminance(rgb);

  // 0.28 for a dark brand, up to ~0.55 for a very pale one.
  const deepAmount = 0.28 + Math.min(0.27, luminance * 0.4);

  return {
    accent: toHex(rgb),
    accentDeep: toHex(darken(rgb, deepAmount)),
    accentTint: toHex(lighten(rgb, 0.86)),
    accentInk: toHex(contrastRatio(rgb, NEAR_BLACK) >= contrastRatio(rgb, NEAR_WHITE) ? NEAR_BLACK : NEAR_WHITE),
  };
}

/** Ready-made options, so most owners never touch the hex field. */
export const BRAND_PRESETS: string[] = [
  DEFAULT_BRAND_COLOR, // easyQ green
  "#111827", // near-black
  "#c2410c", // rust
  "#b45309", // amber
  "#15803d", // forest
  "#0f766e", // teal
  "#1d4ed8", // blue
  "#6d28d9", // violet
  "#be123c", // crimson
  "#a16207", // gold
];
