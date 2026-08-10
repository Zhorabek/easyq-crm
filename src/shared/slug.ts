// Business subdomain slugs — the label in `<slug>.easyq.uz`.
//
// DUPLICATED, keep in sync (same rule as the crm-auth.ts pairing in CLAUDE.md):
//   easyq-crm/src/shared/slug.ts              <- source of truth
//   easyq-landing/src/lib/slug.ts             <- client-side suggest + pre-validate
//   easyqueue-business-bot/src/utils/slug.ts  <- slug for bot-created businesses
//
// These are DNS labels, so the rules are stricter than normalizeCrmUsernameBase()
// in src/server/auth.ts: no dots, no underscores, and hyphens are preserved rather
// than stripped. normalizeCrmUsernameBase also drops Cyrillic entirely, which would
// turn "Видок Барбер" into an empty string — hence the transliteration table below.

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** Cyrillic → Latin, covering both Russian and Uzbek Cyrillic. */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  // Uzbek Cyrillic extras
  ў: "o", қ: "q", ғ: "g", ҳ: "h", ә: "a", ө: "o", ү: "u", ұ: "u", і: "i", ң: "ng",
};

/** Latin letters Uzbek/Turkish names use that NFKD does not fold to ASCII. */
const LATIN_FOLD: Record<string, string> = {
  ʻ: "", ʼ: "", "‘": "", "’": "", "`": "", "'": "",
  ğ: "g", ı: "i", ş: "s", ç: "c", ö: "o", ü: "u", ñ: "n", ə: "a",
};

/**
 * Reserved labels that must never belong to a business: infrastructure hostnames,
 * our own product names, and anything we might want to claim later.
 */
export const RESERVED_SLUGS = new Set([
  "www", "api", "app", "apps", "crm", "admin", "administrator", "root", "system",
  "mail", "email", "smtp", "imap", "pop", "ftp", "ns", "ns1", "ns2", "dns", "mx",
  "static", "assets", "cdn", "img", "images", "media", "files", "download",
  "dashboard", "panel", "console", "account", "accounts", "profile", "settings",
  "help", "support", "docs", "doc", "blog", "news", "status", "health",
  "dev", "development", "staging", "stage", "test", "testing", "demo", "preview", "sandbox",
  "billing", "pay", "payment", "payments", "invoice", "checkout",
  "login", "signin", "signup", "register", "auth", "oauth", "sso", "logout",
  "bot", "bots", "tg", "telegram", "webhook", "webhooks",
  // The two bot Workers have custom domains under this zone. `bot` and `telegram` were
  // reserved from the start; the compound names were not, so `client-bot` was claimable at
  // signup — and the wildcard route means claiming it would have pointed a real
  // infrastructure hostname at that business's CRM.
  "client-bot", "business-bot", "clientbot", "businessbot",
  "easyq", "easyqueue", "yengil", "book", "booking", "bookings",
  "shop", "store", "about", "contact", "terms", "privacy", "legal", "security",
]);

export type SlugProblem = "too_short" | "too_long" | "invalid_chars" | "reserved";

/**
 * `business-<id>` is the placeholder the migration assigns to every pre-existing
 * business, so it must stay ROUTABLE — but nobody may *claim* it at signup, or they
 * could squat on another business's fallback address.
 */
const SYSTEM_SLUG_PATTERN = /^business-\d+$/;

/**
 * Turn a free-form business name into a candidate subdomain.
 * "Vidok Barber" -> "vidok-barber";  "Видок Барбер" -> "vidok-barber".
 * May return "" when the name has nothing usable in it — callers must handle that.
 */
export function slugify(name: string): string {
  const lowered = (name ?? "").toLowerCase();

  let mapped = "";
  for (const char of lowered) {
    if (char in TRANSLIT) mapped += TRANSLIT[char];
    else if (char in LATIN_FOLD) mapped += LATIN_FOLD[char];
    else mapped += char;
  }

  return mapped
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks left by NFKD
    .toLowerCase() // NFKD can reintroduce uppercase, e.g. "№" -> "No"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, ""); // slice() can leave a trailing hyphen
}

/**
 * Why this slug is unacceptable, or null if it is fine.
 * Returns a CODE rather than a message so the landing can render it in uz/ru/en.
 */
export function slugProblem(value: string): SlugProblem | null {
  const slug = (value ?? "").trim();

  if (slug.length < SLUG_MIN_LENGTH) return "too_short";
  if (slug.length > SLUG_MAX_LENGTH) return "too_long";
  // DNS label: lowercase alphanumerics and inner hyphens only.
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(slug)) return "invalid_chars";
  if (slug.includes("--")) return "invalid_chars";
  // `xn--` is the punycode prefix; letting businesses claim it invites homograph tricks.
  if (slug.startsWith("xn--")) return "invalid_chars";
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  if (SYSTEM_SLUG_PATTERN.test(slug)) return "reserved";

  return null;
}

export function isValidSlug(value: string): boolean {
  return slugProblem(value) === null;
}

/**
 * What the user typed, coerced toward a legal slug. Used to sanitize input
 * as it is typed — deliberately lenient, `slugProblem` is what actually gates.
 */
export function normalizeSlugInput(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX_LENGTH);
}

/**
 * A guaranteed-valid slug for a business, given its name and id.
 * Falls back through `<slug>-<id>` to `business-<id>` so this never returns "".
 */
export function fallbackSlug(name: string, businessId: number): string {
  const base = slugify(name);
  if (isValidSlug(base)) return base;

  // A name that transliterates to nothing ("!!!", "***") gets the system placeholder
  // rather than a bare numeric slug.
  if (base.length > 0) {
    const room = SLUG_MAX_LENGTH - String(businessId).length - 1;
    const suffixed = `${base.slice(0, Math.max(room, 0)).replace(/-+$/g, "")}-${businessId}`;
    if (isValidSlug(suffixed)) return suffixed;
  }

  return `business-${businessId}`;
}
