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
 * ## Still not antivirus, but stronger than a signature check alone
 *
 * No engine here inspects a real PNG for a payload hidden inside it, and a Worker has none to
 * call. Three things together make that matter less:
 *
 *  - a file that is not one of three image formats never reaches storage, so an .exe or .apk
 *    renamed to .png is refused at the door;
 *  - `downscaleImage` below re-encodes every upload from decoded pixels before it is sent, so
 *    the stored bytes are the browser's own output. An executable appended to a valid PNG, or a
 *    payload tucked in a metadata chunk, passes a signature check and does NOT survive that
 *    round trip — only how the image looked comes out the other side;
 *  - the served response carries a Content-Type we chose from a fixed list plus
 *    `X-Content-Type-Options: nosniff`, so anything that did reach storage cannot be talked
 *    into executing in a visitor's browser — which is what turns a bad upload into an attack
 *    on somebody else.
 *
 *  - SVG is refused outright. It is an image to a person and an XML document with `<script>`
 *    support to a browser, which makes it the standard way an "image upload" becomes stored
 *    XSS. There is no safe way to serve attacker-supplied SVG from our own origin.
 *
 * The re-encode runs in the browser and so carries no authority: a caller that skips it can
 * still POST arbitrary bytes, which is why the server repeats every check on bytes it read
 * itself. What it does mean is that an upload from the actual UI is laundered by construction.
 *
 * Both sides use this file so the browser's error message and the server's refusal cannot
 * disagree.
 */

/** Formats accepted for a logo or a specialist photo. */
export type ImageKind = "image/jpeg" | "image/png" | "image/webp";

export const ALLOWED_IMAGE_TYPES: ImageKind[] = ["image/jpeg", "image/png", "image/webp"];

/** For the file picker's `accept`. A filter, not a check — the dialog can always be bypassed. */
export const IMAGE_ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

/**
 * 4 MB, the ceiling on what may be SENT. Deliberately well above what is stored: this is the
 * gate on a raw camera file arriving from a phone, which the browser then downscales to
 * `MAX_STORED_BYTES`. The server enforces the smaller number separately, so a caller that
 * skips the downscale is still held to what a D1 row should hold.
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
 * Never the value an upstream sent: the point of an allowlist is that the header on the way out
 * is one of ours. An unrecognised type becomes image/jpeg — the most likely truth for a stored
 * photo, and harmless either way once `nosniff` is on the response.
 */
export function safeImageContentType(upstream: string | null | undefined): ImageKind {
  const value = (upstream ?? "").split(";")[0]!.trim().toLowerCase();
  return (ALLOWED_IMAGE_TYPES as string[]).includes(value) ? (value as ImageKind) : "image/jpeg";
}

/* ------------------------------------------------------------ browser downscale */

/** Longest edge of a stored image. A logo and an avatar are both small on screen. */
export const MAX_IMAGE_EDGE = 512;

/** Server-side storage ceiling, mirrored here so the browser aims under it. */
export const MAX_STORED_BYTES = 512 * 1024;

/**
 * Shrink an image to `MAX_IMAGE_EDGE` and re-encode it.
 *
 * Two reasons, and the second is the more interesting one:
 *
 *  1. **Size.** Stored bytes live in a D1 row that is read back whole. A photo straight off a
 *     phone is several megabytes of detail nobody will see at 34 pixels in a sidebar.
 *
 *  2. **It launders the file.** Re-encoding means the bytes that get stored are produced by the
 *     BROWSER'S encoder from decoded pixels — nothing of the original file survives except how
 *     it looked. That closes the gap byte-sniffing leaves open: a valid PNG with an executable
 *     appended, or a payload hidden in a metadata chunk, passes a signature check and does not
 *     survive a decode/re-encode round trip. Only pixels come out the other side.
 *
 * Returns null when the browser cannot decode it — treated as a rejection by the caller, since
 * anything the browser will not decode is not an image it can display either.
 *
 * PNG first to keep transparency, which logos rely on. If that comes out too large — a
 * photograph, where PNG is the wrong format — it falls back to JPEG, where transparency is
 * moot because a photo has none.
 */
export async function downscaleImage(file: Blob): Promise<File | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  let out = await toBlob("image/png");
  let kind: ImageKind = "image/png";
  if (!out || out.size > MAX_STORED_BYTES) {
    const jpeg = await toBlob("image/jpeg", 0.88);
    // Only if JPEG actually helped: a small PNG beats a larger JPEG for a flat logo.
    if (jpeg && (!out || jpeg.size < out.size)) {
      out = jpeg;
      kind = "image/jpeg";
    }
  }
  if (!out) return null;

  return new File([out], `image.${kind === "image/png" ? "png" : "jpg"}`, { type: kind });
}
