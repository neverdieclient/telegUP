/**
 * Re-downloads base gift images that the main scraper missed.
 * Usage: node scripts/fix-missing.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://telegifter.ru";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ROOT = process.cwd();
const DIR = path.join(ROOT, "public", "gifts", "noupdate");

const NAMES = [
  "Chill Flame",
  "Cookie Heart",
  "Ginger Cookie",
  "Intelligence Cup",
  "Lush Bouquet",
  "Magic Potion",
  "Precious Peach",
  "Pretty Posy",
  "Signet Ring",
  "Trapped Heart",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grab(url, dest, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "image/webp,image/png,image/*" },
        redirect: "follow",
      });
      const ctype = res.headers.get("content-type") || "";
      if (res.ok && ctype.startsWith("image/")) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 512) {
          await writeFile(dest, buf);
          return buf.length;
        }
      }
    } catch {
      /* retry */
    }
    await sleep(800 * (i + 1));
  }
  return 0;
}

await mkdir(DIR, { recursive: true });

for (const name of NAMES) {
  const dest = path.join(DIR, `${name}.webp`);
  const encoded = name.split(" ").map(encodeURIComponent).join("%20");
  const urls = [
    `${BASE}/wp-content/themes/gifts/assets/img/gifts/noupdate/${encoded}.webp`,
    `${BASE}/wp-content/themes/gifts/assets/img/gifts/noupdate/${name.replace(/ /g, "_")}.webp`,
    `${BASE}/wp-content/themes/gifts/assets/img/gifts/noupdate/${name.replace(/ /g, "-").toLowerCase()}.webp`,
  ];
  let size = 0;
  for (const u of urls) {
    size = await grab(u, dest);
    if (size) break;
  }
  console.log(size ? `ok   ${name} (${size} b)` : `FAIL ${name}`);
}
