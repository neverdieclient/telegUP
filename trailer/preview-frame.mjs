import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

/** One frame of a banner page — fast check of a layout before a full render. */
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const exe = BROWSERS.find((p) => fs.existsSync(p));
const here = import.meta.dirname;
const id = process.argv[2] ?? "1080x1080";
const ms = Number(process.argv[3] ?? 3000);
const out = process.argv[4] ?? path.join(here, "banner-video", `preview-${id}.png`);

const FORMATS = {
  "970x250": [970, 250],
  "728x90": [728, 90],
  "1200x300": [1200, 300],
  "1080x1080": [1080, 1080],
  "1080x1920": [1080, 1920],
};
const [w, h] = FORMATS[id];
const file = path.join(here, "banner-video", `${id}.html`);
const url = "file:///" + file.replaceAll("\\", "/");

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars", "--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
await page.goto(`${url}?only=${id}`, { waitUntil: "load" });
await page.waitForFunction("document.body.dataset.ready === '1'", { timeout: 30000 });
await page.evaluate(() => window.__activate(document.querySelector(".banner.active").id.replace("banner-", "")));
await page.evaluate(async (t) => {
  window.__seek(t);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}, ms);
await page.screenshot({ path: out, type: "png" });
console.log("✓ " + out);
await browser.close();
