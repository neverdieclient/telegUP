/**
 * Deterministic frame capture for the telegUP trailer.
 *
 * Drives a headless Chrome/Edge over CDP (puppeteer-core), calls
 * `window.__seek(ms)` for every frame and saves `frame-%04d.png`.
 *
 * Usage: node trailer/capture.mjs [startIndex] [endIndex] [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const FPS = 30;
const DURATION_MS = 26000;
const TOTAL = Math.round((DURATION_MS / 1000) * FPS);

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const start = Number(process.argv[2] ?? 0);
const end = Number(process.argv[3] ?? TOTAL);
const outDir = process.argv[4] ?? path.join(import.meta.dirname, "frames-out");

const exe = BROWSERS.find((p) => fs.existsSync(p));
if (!exe) throw new Error("No Chrome/Edge found");

fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[page]", m.text());
  });
  await page.goto("http://localhost:5199/", { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction("typeof window.__seek === 'function'", { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  // let all inlined images (AVIF data URLs) decode before seeking
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r)),
      ),
    );
  });

  const t0 = Date.now();
  for (let i = start; i < end; i++) {
    const ms = Math.round((i * 1000) / FPS);
    await page.evaluate(async (t) => {
      window.__seek(t);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, ms);
    const file = path.join(outDir, `frame-${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path: file, type: "png" });
    if ((i - start) % 60 === 0) {
      console.log(`frame ${i}/${end - 1}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  }
  console.log(`done ${start}..${end - 1} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} finally {
  await browser.close();
}