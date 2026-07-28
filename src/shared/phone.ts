// Phone numbers — every number on the platform is an Uzbek +998 subscriber
// number: a 2-digit operator code plus 7 digits, shown as `+998 XX XXX XX XX`.
//
// DUPLICATED, keep in sync (same rule as the slug.ts pairing above it):
//   easyq-crm/src/shared/phone.ts      <- source of truth
//   easyq-landing/src/lib/phone.ts     <- signup wizard input mask
//
// Two representations, deliberately kept apart:
//   STORAGE  `+998901234567`       canonical, what new rows should hold
//   DISPLAY  `+998 90 123 45 67`   what a human reads
//
// Grouping is applied at DISPLAY time rather than by migrating existing rows, so
// numbers written before this module existed still render correctly. That is also
// why every function here is total: given something it cannot parse it returns the
// input untouched instead of throwing or blanking the field.

export const PHONE_COUNTRY_CODE = "998";

/** Digits after the country code: `XX` operator + 7 subscriber. */
export const PHONE_NATIONAL_LENGTH = 9;

/** Digit-group sizes of `XX XXX XX XX`. */
const GROUPS = [2, 3, 2, 2];

/** What an empty national field should hint at, without the country code. */
export const PHONE_NATIONAL_PLACEHOLDER = "90 123 45 67";

/**
 * The 9 national digits of whatever the user typed, or a prefix of them while
 * they are still typing. Accepts `+998 90 123 45 67`, `998901234567`,
 * `00998901234567` and `901234567` alike.
 */
export function nationalDigits(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");

  // `00` is the international dialling prefix; drop it before looking for 998.
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // `998` is both our country code AND a legal operator prefix — "99 812 34 56" is
  // a real UzMobile number. Only strip it when doing so still leaves a full
  // subscriber number, which is what keeps a bare 9-digit `998123456` intact.
  if (digits.length > PHONE_NATIONAL_LENGTH && digits.startsWith(PHONE_COUNTRY_CODE)) {
    digits = digits.slice(PHONE_COUNTRY_CODE.length);
  }

  return digits.slice(0, PHONE_NATIONAL_LENGTH);
}

/** Space out national digits as `XX XXX XX XX`, tolerating a partial number. */
export function formatNational(digits: string): string {
  const parts: string[] = [];
  let offset = 0;
  for (const size of GROUPS) {
    if (offset >= digits.length) break;
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }
  return parts.join(" ");
}

/**
 * A complete Uzbek mobile or landline number. Operator and area codes all start
 * with 3, 7, 8 or 9, so a leading 0 is the one shape worth rejecting outright —
 * enumerating the live code list would mean editing this file every time a
 * carrier is allocated a new one.
 */
export function isValidPhone(raw: string): boolean {
  const digits = nationalDigits(raw);
  return digits.length === PHONE_NATIONAL_LENGTH && digits[0] !== "0";
}

/** Canonical `+998901234567` for storage, or null when the input is not a full number. */
export function toStoragePhone(raw: string): string | null {
  if (!isValidPhone(raw)) return null;
  return `+${PHONE_COUNTRY_CODE}${nationalDigits(raw)}`;
}

/**
 * Display form. Anything unparseable comes back trimmed but otherwise untouched,
 * so a legacy row holding "тел. 71-200" still shows what it holds rather than
 * an empty cell.
 */
export function formatPhone(raw: string): string {
  const value = (raw ?? "").trim();
  if (!isValidPhone(value)) return value;
  return `+${PHONE_COUNTRY_CODE} ${formatNational(nationalDigits(value))}`;
}
