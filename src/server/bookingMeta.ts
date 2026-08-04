/**
 * Social-share and search metadata for a shop's booking page.
 *
 * ## The problem this solves
 *
 * `/booking` is served by the same SPA shell as the CRM, so every shop's link previewed as
 * "EasyQ CRM — Boshqaruv paneli" with our description. Paste a booking link into Telegram,
 * Instagram or WhatsApp and the card said EasyQ, not the barbershop — which is the opposite of
 * the point, since the whole page is meant to be the shop's own front door.
 *
 * Crawlers and link unfurlers do not run JavaScript, so setting `document.title` from React
 * fixes the browser tab and nothing that matters here. The tags have to be in the HTML the
 * server sends.
 *
 * ## Why string rewriting rather than a template engine
 *
 * The shell is a built Vite artifact served from the ASSETS binding. Rewriting the `<head>` of
 * the response we already have keeps one build and one HTML file; templating would mean a
 * second copy of the shell that silently rots the first time someone edits index.html.
 */

/**
 * Just the columns the card needs. Structural rather than importing BusinessRow, which lives in
 * worker.ts — this module has no reason to know about sessions, credentials or brand tokens.
 */
type BusinessLike = {
  name: string;
  type: string | null;
  address: string | null;
  schedule: string | null;
  description: string | null;
  photo_file_id: string | null;
  slug: string | null;
};

/** Everything the preview card needs, already escaped. */
export type BookingMeta = {
  title: string;
  description: string;
  imageUrl: string | null;
  canonical: string;
  siteName: string;
  locale: string;
};

/**
 * HTML-escape a value going into an attribute.
 *
 * Business name, address and description are owner-supplied and land inside `content="..."`.
 * Without this a quote in a shop's name would break out of the attribute — the same injection
 * as anywhere else, just wearing a meta tag.
 */
export function escapeAttribute(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapse whitespace and cut on a word boundary, so a description does not end mid-word. */
export function clampText(value: string, max: number): string {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const TYPE_LABEL: Record<string, string> = {
  barbershop: "Барбершоп",
  beauty_salon: "Салон красоты",
  salon: "Салон",
  carwash: "Автомойка",
  spa_salon: "СПА-салон",
  dentistry: "Стоматология",
  medical_services: "Медицинский центр",
  fitness: "Фитнес",
  massage: "Массаж",
  veterinary: "Ветклиника",
};

/**
 * Build the card for one business.
 *
 * The description prefers what the owner wrote. Failing that it is assembled from what we know
 * — type, address, hours — because a card with no description looks like a broken link, and
 * "Барбершоп · Ташкент · 09:00-22:00" is genuinely what somebody deciding whether to tap wants.
 */
export function buildBookingMeta(business: BusinessLike, origin: string, hasLogo: boolean): BookingMeta {
  const name = clampText(business.name || "EasyQ", 60);
  const type = TYPE_LABEL[String(business.type ?? "")] ?? "";

  const written = clampText(business.description ?? "", 200);
  const assembled = [type, business.address, business.schedule]
    .map((part) => clampText(String(part ?? ""), 60))
    .filter(Boolean)
    .join(" · ");

  const description = written || assembled || `Онлайн-запись — ${name}`;

  return {
    // "Online booking" in the title is what makes the card useful in a feed: the name alone
    // does not say what tapping it does.
    title: `${name} — онлайн-запись`,
    description,
    // Only when a logo genuinely exists, and passed IN rather than guessed from the row —
    // whether there is one lives in crm_images, which this module has no business querying.
    //
    // The first version read `photo_file_id || slug ? url : null`, which parses as
    // `(photo_file_id || slug) ? url : null`. Slug is always set, so every shop advertised an
    // image and the ones without a logo pointed og:image at a 404 while still claiming
    // summary_large_image — a broken preview, which is worse than a plain one.
    //
    // Absolute URL, because a relative og:image resolves against nothing on the crawler's side.
    imageUrl: hasLogo ? `${origin}/api/public/photo` : null,
    canonical: `${origin}/booking`,
    siteName: name,
    locale: "ru_RU",
  };
}

/** The tags themselves. Kept separate from the rewrite so they can be asserted directly. */
export function renderMetaTags(meta: BookingMeta): string {
  const tags = [
    `<title>${escapeAttribute(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(meta.description)}" />`,
    `<link rel="canonical" href="${escapeAttribute(meta.canonical)}" />`,

    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttribute(meta.siteName)}" />`,
    `<meta property="og:title" content="${escapeAttribute(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(meta.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(meta.canonical)}" />`,
    `<meta property="og:locale" content="${escapeAttribute(meta.locale)}" />`,

    // Twitter reads og:* for most fields but needs its own card type, and X/Twitter cards are
    // what several other apps copied, so this is worth the four lines.
    `<meta name="twitter:card" content="${meta.imageUrl ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeAttribute(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(meta.description)}" />`,
  ];

  if (meta.imageUrl) {
    tags.push(`<meta property="og:image" content="${escapeAttribute(meta.imageUrl)}" />`);
    tags.push(`<meta name="twitter:image" content="${escapeAttribute(meta.imageUrl)}" />`);
  }

  return tags.join("\n    ");
}

/**
 * Swap the shell's own title and description for this shop's, and add the rest.
 *
 * The existing `<title>` and `<meta name="description">` are REMOVED rather than appended to.
 * Two titles in one document is not an error anyone reports; unfurlers just pick one, usually
 * the first, and the shop's card would keep saying EasyQ while the tags looked right.
 */
export function injectBookingMeta(html: string, meta: BookingMeta): string {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/i, "");

  const head = stripped.indexOf("<head>");
  if (head === -1) return stripped;

  const at = head + "<head>".length;
  return `${stripped.slice(0, at)}\n    ${renderMetaTags(meta)}${stripped.slice(at)}`;
}
