/**
 * Renders every telegUP banner to PNG.
 *
 * `build-banners.mjs` writes one HTML file where each creative is a block with
 * an exact CSS size. This script opens the page once per creative (via
 * `?only=<id>`), sets the viewport to that exact size and screenshots — no
 * cropping, no scaling, so 728×90 really is 728×90 pixels.
 *
 * Usage:
 *   node trailer/build-banners.mjs
 *   node trailer/capture-banners.mjs
 *
 * Output: trailer/banners/*.png
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

/** Must match the ids in build-banners.mjs — id, width, height. */
const SIZES = [
  ["wide-728x90", 728, 90],
  ["wide-970x250", 970, 250],
  ["mini-300x250", 300, 250],
  ["mini-320x50", 320, 50],
  ["square-1080", 1080, 1080],
  ["story-1080x1920", 1080, 1920],
];

const here = import.meta.dirname;
const file = path.join(here, "banners.html");
const outDir = path.join(here, "banners");

if (!fs.existsSync(file)) {
  throw new Error("banners.html missing — run `node trailer/build-banners.mjs` first");
}

const exe = BROWSERS.find((p) => fs.existsSync(p));
if (!exe) throw new Error("No Chrome/Edge found");

fs.mkdirSync(outDir, { recursive: true });

// file:// keeps the whole thing offline: the art is inlined as a data URL.
const url = "file:///" + file.replaceAll("\\", "/");

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files"],
});

try {
  const t0 = Date.now();
  for (const [id, width, height] of SIZES) {
    const page = await browser.newPage();
    // deviceScaleFactor 2 → crisp type on retina, doubles the pixel size.
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.goto(`${url}?only=${id}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("document.body.dataset.ready === '1'", { timeout: 30000 });
    // decode the inlined artwork before the shot, otherwise it can be blank
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((img) => (img.decode ? img.decode().catch(() => {}) : null)),
      );
    });
    const out = path.join(outDir, `${id}.png`);
    await page.screenshot({ path: out, type: "png" });
    console.log(`✓ ${path.basename(out)}  ${width * 2}×${height * 2}`);
    await page.close();
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outDir}`);
} finally {
  await browser.close();
}