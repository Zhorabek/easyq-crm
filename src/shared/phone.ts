import {
  AsYouType,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

// Phone numbers, for any country.
//
// DUPLICATED, keep in sync (same rule as the slug.ts pairing above it):
//   easyq-crm/src/shared/phone.ts      <- source of truth
//   easyq-landing/src/lib/phone.ts     <- signup wizard input mask
//
// ## Storage
//
// Always E.164 — `+998901234567`, `+14155552671`. One canonical form, so two records for the
// same person compare equal however either was typed. Clients are KEYED on this (see the
// client derivation in worker.ts), so a formatting difference here splits one customer in two.
//
// Uzbek numbers keep exactly the shape they already have in the database — E.164 for +998 is
// what the hand-rolled version produced — so nothing needs migrating.
//
// ## Why a library now
//
// This module used to hardcode Uzbekistan: strip to digits, drop a leading 998, require
// exactly 9 left. It carried one genuinely subtle rule — 998 is both the country code AND a
// real UzMobile operator prefix, so `998998xxxxxxx` must lose only the first — and that is the
// kind of rule every country has its own version of. Hand-reproducing them for a second
// country, let alone all of them, is not work worth doing when maintained metadata exists.
//
// `libphonenumber-js` validates against real numbering plans rather than a digit count, so it
// knows which operator prefixes exist and how long a subscriber number is where.
//
// Every function stays TOTAL: given something it cannot parse it returns the input untouched
// rather than throwing or blanking a field, because this runs over rows written years ago.

/** Where a number typed with no country code is assumed to be from. */
export const DEFAULT_COUNTRY: CountryCode = "UZ";

/**
 * Uzbekistan's calling code, kept for callers that still assume one country.
 * Prefer `callingCodeFor(country)`.
 */
export const PHONE_COUNTRY_CODE = "998";

/** Countries offered in the picker — most likely first, not alphabetical. */
export const PHONE_COUNTRIES: CountryCode[] = [
  "UZ", "RU", "KZ", "KG", "TJ", "TM", "AZ", "TR", "AE", "US", "GB", "DE", "KR", "CN",
];

/** Flag emoji from the two-letter code: 'UZ' -> 🇺🇿. No image assets, no lookup table. */
export function countryFlag(country: CountryCode): string {
  return String.fromCodePoint(
    ...country.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

export function callingCodeFor(country: CountryCode): string {
  try {
    return getCountryCallingCode(country);
  } catch {
    return getCountryCallingCode(DEFAULT_COUNTRY);
  }
}

/**
 * The national part of whatever was typed, as bare digits.
 *
 * A leading calling code is stripped only when one is genuinely there. The +998 case that
 * motivated the original hand-rolled version now falls out of the library's metadata: a bare
 * `998123456` stays whole because it is a valid national number, while `998998123456` loses
 * only its first 998.
 */
export function nationalDigits(raw: string, country: CountryCode = DEFAULT_COUNTRY): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const parsed = parsePhoneNumberFromString(text, country);
  if (parsed?.nationalNumber) return String(parsed.nationalNumber);

  // Unparseable — normally just mid-typing. Fall back to digits, minus a calling code the
  // user has spelled out, so the field does not show it twice.
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2); // international dialling prefix

  const calling = callingCodeFor(country);
  if (digits.startsWith(calling) && digits.length > calling.length) {
    const rest = digits.slice(calling.length);
    // Strip it only when what remains could itself be a national number; otherwise those
    // digits were the start of one. The +998 / UzMobile-998 problem, generalised.
    if (parsePhoneNumberFromString(`+${calling}${rest}`, country)?.isPossible()) return rest;
  }
  return digits;
}

/** Group a national number the way its country writes it, tolerating a partial one. */
export function formatNational(digits: string, country: CountryCode = DEFAULT_COUNTRY): string {
  const clean = String(digits ?? "").replace(/\D/g, "");
  if (!clean) return "";

  // AsYouType formats an INCOMPLETE number, which is the whole point inside an input.
  const formatted = new AsYouType(country).input(clean);
  // It re-adds the calling code once the number is complete; the field shows that separately.
  const stripped = formatted.replace(new RegExp(`^\\+?\\s*${callingCodeFor(country)}\\s*`), "").trim();
  return stripped || clean;
}

/** An example national number for the country, for use as an input placeholder. */
export function nationalPlaceholder(country: CountryCode = DEFAULT_COUNTRY): string {
  const EXAMPLES: Partial<Record<CountryCode, string>> = {
    UZ: "901234567", RU: "9123456789", KZ: "7012345678", KG: "700123456",
    TJ: "900123456", TM: "65123456", AZ: "401234567", TR: "5012345678",
    AE: "501234567", US: "2015550123", GB: "7400123456", DE: "15112345678",
    KR: "1012345678", CN: "13123456789",
  };
  return formatNational(EXAMPLES[country] ?? EXAMPLES[DEFAULT_COUNTRY]!, country);
}

/** Backwards-compatible Uzbek placeholder, for callers that pick no country. */
export const PHONE_NATIONAL_PLACEHOLDER = "90 123 45 67";

/**
 * Is this a real, dialable number?
 *
 * `isValid`, not `isPossible`: possible only checks the length and would accept an operator
 * prefix that does not exist. A typo that happens to be the right length is exactly the case
 * worth catching, because it fails silently later — as a booking nobody can be called about.
 */
export function isValidPhone(raw: string, country: CountryCode = DEFAULT_COUNTRY): boolean {
  const text = String(raw ?? "").trim();
  if (!text) return false;
  return parsePhoneNumberFromString(text, country)?.isValid() === true;
}

/** E.164 for storage, or null when the number is not a valid one. */
export function toStoragePhone(raw: string, country: CountryCode = DEFAULT_COUNTRY): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const parsed = parsePhoneNumberFromString(text, country);
  return parsed?.isValid() ? parsed.number : null;
}

/**
 * A stored number, formatted for a human.
 *
 * International grouping, so a foreign number reads correctly instead of being squeezed into
 * Uzbek spacing. Unparseable input comes back trimmed but otherwise untouched, so a legacy row
 * holding "тел. 71-200" still shows what it holds rather than an empty cell.
 */
export function formatPhone(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const parsed = parsePhoneNumberFromString(text, DEFAULT_COUNTRY);
  return parsed?.isValid() ? parsed.formatInternational() : text;
}

/** Which country a stored number belongs to, so a picker can open on the right entry. */
export function countryOfPhone(raw: string): CountryCode | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  return parsePhoneNumberFromString(text, DEFAULT_COUNTRY)?.country ?? null;
}

export type { CountryCode };
