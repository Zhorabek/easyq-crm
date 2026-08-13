/**
 * Render the app icon PNGs from their SVG sources.
 *
 *   node scripts/build-icons.cjs
 *
 * The SVGs in public/icons are the masters. PNGs are generated and should never be edited by
 * hand — if one is, the next run silently overwrites it, and the two would have disagreed in
 * the meantime with nothing to say which was right.
 *
 * Not wired into `npm run build`. Icons change roughly never, sharp is a heavy native dep to
 * put on the critical path of every deploy, and the CI runner would need it installed for a
 * step whose output is already committed. Run it when the SVG changes and commit the result.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ICONS = path.join(__dirname, "..", "public", "icons");

/**
 * Which sizes, and why each one exists — otherwise this list grows by superstition.
 *
 *   192  the smallest Chrome will accept for an installable PWA
 *   512  the install prompt and the Android splash screen
 *   180  apple-touch-icon; iOS ignores the manifest and reads this link tag instead
 *
 * `maskable` is a separate SOURCE, not a separate size: Android crops to a circle, so it
 * needs the padded artwork rather than a resize of the rounded tile.
 */
const JOBS = [
  { src: "easyq-icon.svg", out: "icon-192.png", size: 192 },
  { src: "easyq-icon.svg", out: "icon-512.png", size: 512 },
  { src: "easyq-icon.svg", out: "apple-touch-icon.png", size: 180 },
  { src: "easyq-icon-maskable.svg", out: "icon-maskable-512.png", size: 512 },
];

(async () => {
  for (const job of JOBS) {
    const from = path.join(ICONS, job.src);
    const to = path.join(ICONS, job.out);
    await sharp(from, { density: 384 })
      .resize(job.size, job.size)
      // Flattened onto the brand colour rather than left transparent. A PWA icon with an alpha
      // channel gets a white or black plate behind it depending on the launcher, and the tile
      // IS the artwork here.
      .flatten({ background: "#b4d94e" })
      .png({ compressionLevel: 9 })
      .toFile(to);
    const { size } = fs.statSync(to);
    console.log(`  ${job.out.padEnd(24)} ${job.size}x${job.size}  ${(size / 1024).toFixed(1)} KB`);
  }
  console.log("\nDone. Commit the PNGs alongside the SVG they came from.");
})().catch((error) => {
  console.error("icon build failed:", error);
  process.exit(1);
});
