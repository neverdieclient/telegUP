/**
 * Renders the animated banner pages into looping video files.
 *
 * `build-banner-video.mjs` writes one HTML per format; this opens each of them
 * in a headless Chrome, steps `__seek(ms)` frame by frame at 30 fps, dumps the
 * PNGs and pipes them into ffmpeg twice:
 *
 *   <id>.mp4   H.264, yuv420p, no alpha — every ad network takes this
 *   <id>.webm  VP9 — smaller, used in normal <video> tags on the site
 *
 * Why frame-by-frame and not a screen recorder: the page is fully seekable, so
 * every frame is deterministic, the loop seam is exact (last frame → first),
 * and the output has no dropped or duplicated frames from a busy machine.
 *
 * Usage:
 *   node trailer/capture-banner-video.mjs            # all formats
 *   node trailer/capture-banner-video.mjs 970x250    # one format
 *
 * Output: trailer/banner-video/<id>.mp4 and .webm
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const FPS = 30;
/** Must match the loop length in build-banner-video.mjs (DUR). */
const DURATION_MS = 5000;
const TOTAL = Math.round((DURATION_MS / 1000) * FPS);

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const FFMPEG =
  process.env.FFMPEG ??
  "C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe";

const FORMATS = {
  "970x250": [970, 250],
  "728x90": [728, 90],
  "1200x300": [1200, 300],
  "1080x1080": [1080, 1080],
  "1080x1920": [1080, 1920],
};

const here = import.meta.dirname;
const dir = path.join(here, "banner-video");

const only = process.argv[2];
const list = only ? [[only, FORMATS[only]]] : Object.entries(FORMATS);
if (only && !FORMATS[only]) {
  throw new Error(`unknown format "${only}" — pick: ${Object.keys(FORMATS).join(", ")}`);
}
for (const [id] of list) {
  const page = path.join(dir, `${id}.html`);
  if (!fs.existsSync(page)) throw new Error(`${page} missing — run node trailer/build-banner-video.mjs`);
}
if (!fs.existsSync(FFMPEG)) throw new Error(`ffmpeg not found at ${FFMPEG}`);

const exe = BROWSERS.find((p) => fs.existsSync(p));
if (!exe) throw new Error("No Chrome/Edge found");

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files"],
});

const t0 = Date.now();
try {
  for (const [id, [w, h]] of list) {
    const framesDir = path.join(dir, `frames-${id}`);
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });

    const page = await browser.newPage();
    // 2× device pixels: text stays crisp when a network upscales the creative
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    const url = "file:///" + path.join(dir, `${id}.html`).replaceAll("\\", "/");
    await page.goto(`${url}?only=${id}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("document.body.dataset.ready === '1'", { timeout: 30000 });
    await page.evaluate(() => window.__activate(document.querySelector('.banner.active').id.replace('banner-', '')));
    // decode the inlined artwork once, otherwise early frames show an empty slot
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((img) => (img.decode ? img.decode().catch(() => {}) : null)),
      );
    });

    for (let i = 0; i < TOTAL; i++) {
      const ms = Math.round((i * 1000) / FPS);
      await page.evaluate(async (t) => {
        window.__seek(t);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, ms);
      await page.screenshot({
        path: path.join(framesDir, `f-${String(i).padStart(4, "0")}.png`),
        type: "png",
        clip: { x: 0, y: 0, width: w, height: h },
      });
    }
    await page.close();

    const pattern = path.join(framesDir, "f-%04d.png");
    const mp4 = path.join(dir, `${id}.mp4`);
    const webm = path.join(dir, `${id}.webm`);

    // H.264 needs even dimensions; all our formats are, but scale hard anyway
    execFileSync(FFMPEG, [
      "-y", "-loglevel", "error",
      "-framerate", String(FPS),
      "-i", pattern,
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v", "libx264", "-preset", "slow", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-an", mp4,
    ]);

    execFileSync(FFMPEG, [
      "-y", "-loglevel", "error",
      "-framerate", String(FPS),
      "-i", pattern,
      "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-row-mt", "1",
      "-pix_fmt", "yuv420p", "-an", webm,
    ]);

    const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0);
    console.log(`✓ ${id}  ${w * 2}×${h * 2}  mp4 ${kb(mp4)} kB · webm ${kb(webm)} kB`);
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${dir}`);
} finally {
  await browser.close();
}