/**
 * Renders a handful of stills from v20.html for eyeballing.
 * Usage: node trailer/check-v20.mjs 1200 4000 7000 ...
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const times = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const outDir = path.join(import.meta.dirname, "preview-v20");
fs.mkdirSync(outDir, { recursive: true });

const exe = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars"],
  defaultViewport: { width: 1280, height: 1280, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[page]", m.text());
  });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto("http://localhost:5199/v20.html", { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction("typeof window.__seek === 'function'", { timeout: 120000 });
  await page.waitForFunction("document.body.dataset.ready === '1'", { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r)),
      ),
    );
  });

  for (const t of times) {
    await page.evaluate(async (ms) => {
      window.__seek(ms);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t);
    const file = path.join(outDir, `t-${String(t).padStart(5, "0")}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
} finally {
  await browser.close();
}