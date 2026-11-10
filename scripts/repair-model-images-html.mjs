/**
 * Final pass: for models that still have no artwork, learns the *real* remote
 * file name from the collection page (names sometimes contain doubled spaces
 * or a trailing "?") and downloads it under the local name the game expects.
 *
 * Usage: node scripts/repair-model-images-html.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://telegifter.ru";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const ROOT = path.resolve(import.meta.dirname, "..");
const DEST = path.join(ROOT, "src", "data", "telegram-gifts.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) =>
  String(s)
    .normalize("NFC")
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[?？]+$/g, "")
    .trim()
    .toLowerCase();

async function download(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/webp,image/*" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!(res.headers.get("content-type") || "").startsWith("image/")) throw new Error("not an image");
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error("empty");
      return buf;
    } catch {
      await sleep(500 * (i + 1));
    }
  }
  return null;
}

const catalog = JSON.parse(await readFile(DEST, "utf8"));

const pending = [];
for (const c of catalog) {
  for (const m of c.models ?? []) if (!m.image) pending.push({ c, m });
}
console.log(`models still missing artwork: ${pending.length}`);
if (!pending.length) process.exit(0);

// group by collection so each page is fetched once
const byCollection = new Map();
for (const p of pending) {
  const arr = byCollection.get(p.c.slug) ?? [];
  arr.push(p.m);
  byCollection.set(p.c.slug, arr);
}

let fixed = 0;
let left = 0;

for (const [slug, models] of byCollection) {
  const c = catalog.find((x) => x.slug === slug);
  const folder = c.folder;
  let html;
  try {
    html = await fetch(`${BASE}/gifts/collections/${slug}/`, { headers: { "user-agent": UA } }).then((r) => r.text());
  } catch {
    console.log(`✗ ${c.name}: page fetch failed`);
    left += models.length;
    continue;
  }
  // every artwork reference on the page, as a raw (still encoded) path
  const refs = [...new Set([...html.matchAll(/assets\/img\/gifts\/[a-z0-9_-]+\/[^"'<> ]+/g)].map((m) => m[0]))];
  const index = new Map();
  for (const ref of refs) {
    const rawName = decodeURIComponent(ref.split("/").pop());
    index.set(norm(rawName.replace(/\.webp$/i, "")), ref);
  }
  for (const m of models) {
    const key = norm(m.name);
    const ref = index.get(key);
    if (!ref) {
      left++;
      console.log(`  ? ${c.name} → ${m.name} (no match on page)`);
      continue;
    }
    // `ref` is already percent-encoded exactly as the page wrote it — use it verbatim
    const buf = await download(`${BASE}/${ref}`);
    if (!buf) {
      left++;
      console.log(`  ✗ ${c.name} → ${m.name} (download failed)`);
      continue;
    }
    const fileName = `${m.name.replace(/[\\/:*?"<>|]/g, "_")}.webp`;
    await mkdir(path.join(ROOT, "public", "gifts", "models", folder), { recursive: true });
    await writeFile(path.join(ROOT, "public", "gifts", "models", folder, fileName), buf);
    m.image = `gifts/models/${folder}/${encodeURIComponent(fileName)}`;
    fixed++;
    console.log(`  ✓ ${c.name} → ${m.name}  (from "${decodeURIComponent(ref.split("/").pop())}")`);
  }
}

await writeFile(DEST, JSON.stringify(catalog, null, 2), "utf8");
console.log(`\n✓ fixed ${fixed}, still missing ${left}`);