/**
 * What may be uploaded as a logo, decided by looking at the bytes.
 *
 * ## Why not the filename or the Content-Type
 *
 * Both are chosen by whoever is uploading. `logo.png` can be a Windows executable and
 * `Content-Type: image/png` is a string the browser was told to send. The only thing that
 * describes a file honestly is its leading bytes, so that is what is checked — an allowlist of
 * three formats, and everything else refused whatever it claims to be.
 *
 * ## This is validation, not antivirus
 *
 * Nothing here inspects a real PNG for a payload hidden inside it, and a Worker has no engine
 * that could. What it does guarantee is narrower and still worth having:
 *
 *  - a file that is not one of three image formats never reaches storage, so an .exe or .apk
 *    renamed to .png is refused at the door;
 *  - the served response carries a Content-Type we chose from a fixed list plus
 *    `X-Content-Type-Options: nosniff`, so nothing that did get stored can be talked into
 *    executing in a visitor's browser — which is what actually turns a bad upload into an
 *    attack on somebody else;
 *  - SVG is refused outright. It is an image to a person and an XML document with `<script>`
 *    support to a browser, which makes it the standard way an "image upload" becomes stored
 *    XSS. There is no safe way to serve attacker-supplied SVG from our own origin.
 *
 * Both sides use this file so the browser's error message and the server's refusal cannot
 * disagree. The browser check is a courtesy — instant feedback instead of a round trip — and
 * carries no authority; the server repeats every check on bytes it read itself.
 */

/** Formats accepted for a logo. Telegram re-encodes photos to JPEG regardless. */
export type ImageKind = "image/jpeg" | "image/png" | "image/webp";

export const ALLOWED_IMAGE_TYPES: ImageKind[] = ["image/jpeg", "image/png", "image/webp"];

/** For the file picker's `accept`. A filter, not a check — the dialog can always be bypassed. */
export const IMAGE_ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

/**
 * 4 MB. Telegram's own sendPhoto ceiling is 10 MB, but a logo is a small square and a cap this
 * side means an oversized file is refused before it is read into a Worker's memory rather than
 * after a slow upload to Telegram.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Enough bytes for every signature below; WebP needs 12. */
const SNIFF_BYTES = 16;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/** The image format these bytes actually are, or null for anything not on the allowlist. */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  // 89 P N G \r \n 1a \n — the trailing bytes exist to catch mangled transfers, so check all 8.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // ff d8 ff. The fourth byte varies by JPEG flavour (e0 JFIF, e1 Exif, db raw), so it is not
  // part of the check — requiring e0 would reject most photos out of a phone camera.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // RIFF....WEBP — the four size bytes at offset 4 are skipped.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/**
 * A reason code for bytes that are not an accepted image, so the message can name what was
 * actually uploaded. "That is a Windows program" is worth far more to somebody who picked the
 * wrong file than "invalid image".
 */
export type RejectionReason =
  | "empty"
  | "too_large"
  | "svg_or_html"
  | "executable"
  | "archive"
  | "pdf"
  | "not_an_image";

export function classifyRejection(bytes: Uint8Array): RejectionReason {
  if (bytes.length === 0) return "empty";

  // Leading whitespace and a UTF-8 BOM are both legal in XML, and a browser will still parse
  // the document — so skip them before looking for '<' rather than after.
  let i = 0;
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  if (bytes[i] === 0x3c) return "svg_or_html"; // '<' — covers <svg, <?xml, <html, <!DOCTYPE

  if (startsWith(bytes, [0x4d, 0x5a])) return "executable"; // MZ — Windows PE
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return "executable"; // ELF — Linux
  if (startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])) return "executable"; // Mach-O fat binary
  // PK.. — zip, and everything built on it: docx, xlsx, jar, apk.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return "archive";
  if (startsWith(bytes, [0x52, 0x61, 0x72, 0x21])) return "archive"; // Rar!
  if (startsWith(bytes, [0x1f, 0x8b])) return "archive"; // gzip
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF

  return "not_an_image";
}

export type ImageCheck =
  | { ok: true; kind: ImageKind }
  | { ok: false; reason: RejectionReason };

/**
 * The whole decision for a set of bytes. Callers pass the full file: `size` is checked here so
 * there is one place that can say yes, rather than a size test in one file and a type test in
 * another that drift apart.
 */
export function checkImageBytes(bytes: Uint8Array, size = bytes.length): ImageCheck {
  if (size === 0) return { ok: false, reason: "empty" };
  if (size > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  const kind = sniffImageKind(bytes);
  if (!kind) return { ok: false, reason: classifyRejection(bytes) };
  return { ok: true, kind };
}

/**
 * Read only the leading bytes of a Blob. The signature lives in the first 12, so there is no
 * reason to pull a 4 MB file into memory to find out it is a .zip.
 */
export async function checkImageFile(file: Blob): Promise<ImageCheck> {
  if (file.size === 0) return { ok: false, reason: "empty" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  return checkImageBytes(head, file.size);
}

/**
 * The Content-Type to serve a stored logo under.
 *
 * Never the value the upstream sent: the point of an allowlist is that the header on the way
 * out is one of ours. An unrecognised type becomes image/jpeg, which is what Telegram
 * re-encodes photos to anyway — so the fallback is the likely truth rather than a guess.
 */
export function safeImageContentType(upstream: string | null | undefined): ImageKind {
  const value = (upstream ?? "").split(";")[0]!.trim().toLowerCase();
  return (ALLOWED_IMAGE_TYPES as string[]).includes(value) ? (value as ImageKind) : "image/jpeg";
}
