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

/** `a` moved `amount` (0–1) of the way toward `b`. */
function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
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

// ------------------------------------------------------------------ full theme
//
// The accent alone leaves the page itself off-white, so a business whose brand is a dark
// room with warm light gets easyQ's grey-blue no matter what it picks. The theme adds two
// more choices — page background and text — and derives the other nine tokens from them.
//
// Three fields, not twelve, and the same reasoning as accentInk: the ones an owner can
// judge by eye are background, text and button. Panels, borders and muted text are
// relationships between those, and a barber choosing them by hand will get them wrong.
//
// Everything derived here is background-aware, which is the part the accent-only palette
// could not do. `accentTint` lightened unconditionally, so on a dark page it painted a
// near-white slab; `accentDeep` darkened unconditionally, so on a dark page it walked the
// accent toward the background until it vanished. Both now move in whichever direction
// increases contrast with the page.

/** What the owner actually picks. Everything else is computed from these three. */
export type BrandTheme = {
  /** Page background. */
  bg: string;
  /** Body text on that background. */
  ink: string;
  /** Buttons and highlights. */
  accent: string;
};

/** easyQ's own look — the light tokens from crm.css, so "reset" lands exactly on stock. */
export const DEFAULT_BRAND_THEME: BrandTheme = {
  bg: "#f4f6fa",
  ink: "#0f172a",
  accent: DEFAULT_BRAND_COLOR,
};

/** The full token set applied to the booking page. Mirrors the names in crm.css. */
export type BrandTokens = BrandPalette & {
  bg: string;
  panel: string;
  panel2: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  /** True when the derived set is a dark theme. Callers use it to pick a shadow strength. */
  isDark: boolean;
};

/**
 * WCAG AA for body text. Enforced on ink-against-background, which is the pair an owner
 * can actually make unreadable — every other pairing is derived and clamped below.
 */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * WCAG AA for large text and UI, applied to the muted labels — timestamps, field captions,
 * the avatar initial. Holding those to 4.5 would flatten them into the body text and lose
 * the hierarchy they exist to carry.
 */
export const MIN_MUTED_CONTRAST = 3;

/**
 * Nudge `color` toward black or white until it clears `target` against `against`.
 *
 * Used instead of a fixed lighten/darken step because the required move depends on both
 * colours: a mid-grey accent on a mid-grey background needs a long walk, and the same
 * accent on white needs none. Steps toward whichever pole is *away* from the background,
 * so the result stays as close to the chosen colour as the contrast floor allows.
 */
function ensureContrast(color: Rgb, against: Rgb, target: number): Rgb {
  if (contrastRatio(color, against) >= target) return color;
  // Whichever pole actually contrasts better, measured — not inferred from a luminance
  // threshold. A mid-grey page reads as "dark" by luminance (0.22) while black still
  // contrasts with it nearly 35% better than white does, so a threshold sends the walk
  // toward the pole that can never reach the target and it gives up at the ceiling.
  const toward = contrastRatio(NEAR_BLACK, against) >= contrastRatio(NEAR_WHITE, against) ? NEAR_BLACK : NEAR_WHITE;
  const STEPS = 24;
  for (let step = 1; step <= STEPS; step++) {
    const candidate = mix(color, toward, step / STEPS);
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  // Unreachable in practice — NEAR_BLACK on NEAR_WHITE is 19:1 — but a saturated target
  // against a mid-luminance background can fall short, and returning the pole is still
  // the most readable answer available.
  return toward;
}

/** A theme is dark when its background is dark, which flips every derivation below. */
function isDarkBackground(bg: Rgb) {
  return relativeLuminance(bg) < 0.22;
}

/**
 * A filled chip of the brand on a permanently dark surface — the CRM sidebar's active nav
 * item and its logo tile — plus the text colour to put on it.
 *
 * `brandTokens` cannot answer this on its own. Its `accentDeep` clears the *background*
 * floor and stops, which for a dark brand on navy lands around mid-grey: visible against the
 * sidebar, but the one zone where neither near-black nor white text clears AA. So the fill
 * has two constraints at once — apart from the sidebar, and readable under its own label —
 * and it is walked toward white to satisfy both.
 *
 * Toward white specifically, not toward "whichever pole contrasts better": the surface here
 * is always dark, so a light fill is the only direction that can separate from it, and it is
 * what the default lime already does.
 */
export function accentOnDark(color: string | null | undefined, surface: string): { fill: string; ink: string } {
  const bg = parseHexColor(surface) ?? NEAR_BLACK;
  const base = parseHexColor(color ?? "") ?? parseHexColor(DEFAULT_BRAND_COLOR)!;
  const STEPS = 20;
  for (let step = 0; step <= STEPS; step++) {
    const fill = step === 0 ? base : lighten(base, step / STEPS);
    const label = contrastRatio(fill, NEAR_BLACK) >= contrastRatio(fill, NEAR_WHITE) ? NEAR_BLACK : NEAR_WHITE;
    if (contrastRatio(fill, bg) >= MIN_MUTED_CONTRAST && contrastRatio(label, fill) >= MIN_TEXT_CONTRAST) {
      return { fill: toHex(fill), ink: toHex(label) };
    }
  }
  // White satisfies both against any dark surface, so this is a real fallback rather than a
  // shrug: 19:1 apart from the navy, and near-black text on it is 18:1.
  return { fill: toHex(NEAR_WHITE), ink: toHex(NEAR_BLACK) };
}

export function brandTokens(input: Partial<BrandTheme> | null | undefined): BrandTokens {
  const bg = parseHexColor(input?.bg ?? "") ?? parseHexColor(DEFAULT_BRAND_THEME.bg)!;
  const ink = parseHexColor(input?.ink ?? "") ?? parseHexColor(DEFAULT_BRAND_THEME.ink)!;
  const accent = parseHexColor(input?.accent ?? "") ?? parseHexColor(DEFAULT_BRAND_THEME.accent)!;
  const dark = isDarkBackground(bg);

  // Cards lift off the page by getting lighter — on a dark theme too, where raising a
  // surface reads as nearer and darkening it reads as a hole. The step is much smaller on
  // a dark page because the same distance is far more visible against near-black.
  //
  // The exception is a page that is already white: there is no lighter left, so the
  // surface separates by going very slightly toward the ink instead. Without this branch
  // a #ffffff theme derives panel === bg and every card on the booking page dissolves
  // into it, held together by the border alone.
  const nearWhite = !dark && relativeLuminance(bg) > 0.82;
  const panel = dark ? lighten(bg, 0.08) : nearWhite ? mix(bg, ink, 0.045) : lighten(bg, 0.7);
  // Always the same direction as the panel, at roughly half the distance, so the three
  // surfaces stay in a consistent order however the page was derived.
  const panel2 = mix(bg, panel, 0.45);

  // Borders and muted text are the ink bled into the background, so they stay in the
  // owner's colour family instead of falling back to a grey that clashes with a warm or
  // cool page.
  const line = mix(bg, ink, 0.12);
  const line2 = mix(bg, ink, 0.2);

  // Both muted inks carry a floor, measured against the panel rather than the page: cards
  // are the surface furthest from the ink in every theme this derives, so clearing it
  // there clears it everywhere. A fixed fraction alone is not enough — a mid-tone ink like
  // sand's brown is still readable at full strength but washes out past ~40% toward a pale
  // page, and secondary text is where an owner would notice it last.
  //
  // Clamping these is not the auto-correction refused for `ink` itself: the owner chose
  // that colour and it stands, whereas these two are ours and nobody picked them.
  const ink2 = ensureContrast(mix(ink, bg, 0.3), panel, MIN_TEXT_CONTRAST);
  const ink3 = ensureContrast(mix(ink, bg, 0.48), panel, MIN_MUTED_CONTRAST);

  // 0.28 for a dark brand, up to ~0.55 for a very pale one — as before, but only on a
  // light page. On a dark page the same intent means going lighter.
  const deepBase = dark
    ? lighten(accent, 0.22)
    : darken(accent, 0.28 + Math.min(0.27, relativeLuminance(accent) * 0.4));

  return {
    bg: toHex(bg),
    panel: toHex(panel),
    panel2: toHex(panel2),
    ink: toHex(ink),
    ink2: toHex(ink2),
    ink3: toHex(ink3),
    line: toHex(line),
    line2: toHex(line2),
    accent: toHex(accent),
    // accentDeep is used as text on the page, so it carries the same floor as body text.
    accentDeep: toHex(ensureContrast(deepBase, bg, MIN_TEXT_CONTRAST)),
    // Chips and section fills: a wash of the accent over the page, in whichever direction
    // keeps it distinguishable from the panels sitting on top of it.
    accentTint: toHex(dark ? mix(bg, accent, 0.16) : lighten(accent, 0.86)),
    accentInk: toHex(contrastRatio(accent, NEAR_BLACK) >= contrastRatio(accent, NEAR_WHITE) ? NEAR_BLACK : NEAR_WHITE),
    isDark: dark,
  };
}

/** Contrast of body text against the page — the number the settings screen shows. */
export function themeTextContrast(theme: Partial<BrandTheme> | null | undefined) {
  const bg = parseHexColor(theme?.bg ?? "") ?? parseHexColor(DEFAULT_BRAND_THEME.bg)!;
  const ink = parseHexColor(theme?.ink ?? "") ?? parseHexColor(DEFAULT_BRAND_THEME.ink)!;
  return contrastRatio(ink, bg);
}

/**
 * Every field a valid hex, and the text readable on the background.
 *
 * Shared by the settings screen and the worker so the button that is disabled in the UI
 * is the same rule that returns 400 — a check that lives only in the client is not a
 * check. Unlike the accent, this pair cannot be auto-corrected: silently darkening text
 * the owner deliberately chose is worse than telling them it will not be readable.
 */
export function normalizeBrandTheme(input: unknown): BrandTheme | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const bg = normalizeBrandColor(String(raw.bg ?? ""));
  const ink = normalizeBrandColor(String(raw.ink ?? ""));
  const accent = normalizeBrandColor(String(raw.accent ?? ""));
  if (!bg || !ink || !accent) return null;
  if (contrastRatio(parseHexColor(ink)!, parseHexColor(bg)!) < MIN_TEXT_CONTRAST) return null;
  return { bg, ink, accent };
}

/** Stored as JSON in one column. Unparseable or stale JSON reads as "not chosen". */
export function parseBrandTheme(raw: string | null | undefined): BrandTheme | null {
  if (!raw) return null;
  try {
    return normalizeBrandTheme(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function serializeBrandTheme(theme: BrandTheme): string {
  return JSON.stringify({ bg: theme.bg, ink: theme.ink, accent: theme.accent });
}

/**
 * The theme to actually render.
 *
 * Falls back through: stored theme → stored accent on the default page → all defaults.
 * The middle rung is what keeps every business that picked a colour before themes existed
 * looking exactly as it did.
 */
export function resolveBrandTheme(storedTheme: string | null | undefined, storedAccent: string | null | undefined): BrandTheme {
  const theme = parseBrandTheme(storedTheme);
  if (theme) return theme;
  return { ...DEFAULT_BRAND_THEME, accent: normalizeBrandColor(storedAccent ?? "") ?? DEFAULT_BRAND_COLOR };
}

/**
 * Ready-made themes. Most owners should never touch a hex field — picking one of these
 * and stopping is the expected path, and each is checked to clear MIN_TEXT_CONTRAST.
 */
export const BRAND_THEME_PRESETS: Array<{ id: string; theme: BrandTheme }> = [
  { id: "easyq", theme: DEFAULT_BRAND_THEME },
  { id: "paper", theme: { bg: "#ffffff", ink: "#111827", accent: "#1d4ed8" } },
  { id: "sand", theme: { bg: "#fbf7f0", ink: "#3a2f22", accent: "#b45309" } },
  { id: "mint", theme: { bg: "#f2faf5", ink: "#123122", accent: "#15803d" } },
  { id: "rose", theme: { bg: "#fdf4f5", ink: "#3d1620", accent: "#be123c" } },
  { id: "midnight", theme: { bg: "#0f172a", ink: "#e8edf4", accent: "#60a5fa" } },
  { id: "noir", theme: { bg: "#131313", ink: "#f0ece6", accent: "#d4b483" } },
  { id: "forest", theme: { bg: "#0e1b16", ink: "#e3f0e8", accent: "#5ec98a" } },
];

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
