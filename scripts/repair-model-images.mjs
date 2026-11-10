/**
 * Repair pass: fills in `image` for models that lost it during a flaky scrape.
 * Reads src/data/telegram-gifts.json, re-derives the model image URL from the
 * collection's `folder` + model name, downloads it, and writes the path back.
 *
 * Usage: node scripts/repair-model-images.mjs [--concurrency 4] [--dry]
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const BASE = "https://telegifter.ru";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const ROOT = path.resolve(import.meta.dirname, "..");
const DEST = path.join(ROOT, "src", "data", "telegram-gifts.json");

const args = process.argv.slice(2);
const CONCURRENCY = Number(args.includes("--concurrency") ? args[args.indexOf("--concurrency") + 1] : 4);
const DRY = args.includes("--dry");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchImage(url, dest, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/webp,image/png,image/*" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.startsWith("image/")) throw new Error(`not an image (${ctype})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error("empty body");
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      return true;
    } catch {
      await sleep(400 * (i + 1));
    }
  }
  return false;
}

const catalog = JSON.parse(await readFile(DEST, "utf8"));

// every (collection, model) pair still lacking artwork
const todo = [];
for (const c of catalog) {
  const folder = c.folder;
  if (!folder) continue;
  for (const m of c.models ?? []) {
    if (m.image) continue;
    todo.push({ c, m, folder });
  }
}

console.log(`models without artwork: ${todo.length}`);
if (DRY) {
  console.log(todo.slice(0, 20).map((t) => `${t.c.name} → ${t.m.name}`).join("\n"));
  process.exit(0);
}

let saved = 0;
let failed = 0;
let cursor = 0;

const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, todo.length)) }, async () => {
  while (cursor < todo.length) {
    const i = cursor++;
    const { c, m, folder } = todo[i];
    // file name on the server mirrors the model name, percent-encoded
    const fileName = `${m.name}.webp`;
    const url = `${BASE}/wp-content/themes/gifts/assets/img/gifts/${folder}/${encodeURIComponent(m.name)}.webp`;
    const dest = path.join(ROOT, "public", "gifts", "models", folder, fileName);
    const ok = await fetchImage(url, dest);
    if (ok) {
      m.image = `gifts/models/${folder}/${encodeURIComponent(fileName)}`;
      saved++;
    } else {
      failed++;
      if (failed <= 20) console.log(`✗ ${c.name} → ${m.name}`);
    }
    if ((saved + failed) % 100 === 0) {
      console.log(`… ${saved + failed}/${todo.length} (ok ${saved}, failed ${failed})`);
    }
  }
});

await Promise.all(workers);
await writeFile(DEST, JSON.stringify(catalog, null, 2), "utf8");
console.log(`\n✓ repaired ${saved} models, ${failed} still without artwork`);