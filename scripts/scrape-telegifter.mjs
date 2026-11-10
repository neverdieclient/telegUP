/**
 * Scraper for real Telegram gift data from telegifter.ru
 *
 * Outputs:
 *   src/data/telegram-gifts.json   — curated gift collections with real models,
 *                                    backgrounds and symbols (with rarity + supply)
 *   public/gifts/noupdate/*.webp    — base gift image for every gift
 *   public/gifts/models/<slug>/...  — every model / background / symbol image
 *
 * Usage: node scripts/scrape-telegifter.mjs [--limit N] [--force] [--concurrency N]
 */
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE = "https://telegifter.ru";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const ROOT = path.resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const LIMIT = Number(argVal("--limit", Infinity));
const CONCURRENCY = Number(argVal("--concurrency", 3));
const FORCE = args.includes("--force");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "ru-RU,ru;q=0.9", accept: "text/html" } });
      if (res.status === 429 || res.status === 503) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < 20000) throw new Error("suspiciously small page");
      return text;
    } catch (e) {
      if (i === tries - 1) throw e;
      // progressive backoff: 2s, 4s, 8s, 16s, 30s, 30s, 30s
      await sleep(Math.min(30000, 2000 * 2 ** i));
    }
  }
}

const clean = (s) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const num = (s) => {
  const m = String(s)
    .replace(/\s/g, "")
    .replace(/,/g, "")
    .match(/-?[\d.]+/);
  return m ? Number(m[0]) : 0;
};

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const fileSafe = (s) => s.replace(/[\\/:*?"<>|]/g, "_");

async function download(url, dest, tries = 3) {
  if (!FORCE && existsSync(dest)) {
    const st = await stat(dest);
    if (st.size > 0) return true;
  }
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
      await sleep(500 * (i + 1));
    }
  }
  return false;
}

/* ---------------------------------------------------------------- listing */

function parseListing(html) {
  const cards = [
    ...html.matchAll(
      /<a href="(https:\/\/telegifter\.ru\/gifts\/collections\/[^"]+)">\s*<div class="mini-single-info[\s\S]*?mini-single-stars col">([\s\S]*?)<\/div>[\s\S]*?mini-single-other col">([\s\S]*?)<\/div>[\s\S]*?<img[^>]*src="([^"]+)" alt="[^"]*"[\s\S]*?mini-single-title-gifts">([^<]*)</g,
    ),
  ];
  return cards.map((m) => {
    const priceRaw = clean(m[2]);
    const totalRaw = clean(m[3]);
    return {
      slug: m[1].replace(/\/$/, "").split("/").pop(),
      url: m[1],
      name: m[5].trim(),
      priceRaw,
      ton: /pre-market/i.test(priceRaw) ? 0 : num(priceRaw.replace(/\$.*$/, "")),
      preMarket: /pre-market/i.test(priceRaw),
      totalRaw,
      total: /∞/.test(totalRaw) ? Infinity : num(totalRaw.replace(/ВСЕГО/i, "")),
      image: m[4],
    };
  });
}

/* ------------------------------------------------------- collection page */

function sectionSlice(html, k) {
  const start = html.search(new RegExp(`<div class="gifts-table-rare[^"]*" data-table="${k}"`));
  if (start < 0) return "";
  const others = [0, 1, 2].map((x) =>
    html.search(new RegExp(`<div class="gifts-table-rare[^"]*" data-table="${x}"`)),
  );
  const nexts = others.filter((v) => v > start);
  const end = nexts.length ? Math.min(...nexts) : html.length;
  return html.slice(start, end);
}

function parseRows(chunk, kind) {
  const rows = [];
  const re = /data-price="([\d.]+)" data-rarity="([\d.]+)" data-quantity="(\d+)"([\s\S]*?)(?=<div class="row gift-item"|$)/g;
  for (const m of chunk.matchAll(re)) {
    const body = m[4];
    // every row can hold several <img> tags (star icon, lazy preload…) — collect only gift artwork
    const imgs = [...body.matchAll(/src="([^"]*\/assets\/img\/gifts\/([a-z0-9_-]+)\/[^"]+?)"/g)];
    const img = imgs.length ? [null, imgs[imgs.length - 1][1], imgs[imgs.length - 1][2]] : null;
    const grad = body.match(/style="background: ([^"]+)"/);
    const cells = [...body.matchAll(/<div class="col-sm-3 col-xs-6">([\s\S]*?)<\/div>/g)].map((c) => c[1]);
    const nameCell = cells.find((c) => !/<img|<div/.test(c));
    const name = nameCell ? clean(nameCell) : "";
    const priceCell = body.match(/price-cell">([\s\S]*?)<\/div>/);
    const priceRaw = priceCell ? clean(priceCell[1]) : "";
    const priceTon = priceRaw && priceRaw !== "—" ? num(priceRaw.replace(/GRAM[\s\S]*$/, "")) : 0;
    if (!name) continue;
    rows.push({
      kind,
      name,
      rarityPct: Number(m[2]),
      supply: Number(m[3]),
      priceTon,
      image: img ? img[1] : null,
      folder: img ? img[2] : null,
      gradient: grad ? grad[1] : null,
    });
  }
  return rows;
}

function statRaw(html, label) {
  const m = html.match(
    new RegExp(`${label}</div>\\s*<div class="col-sm-6 col-xs-12 stat-table-info">([\\s\\S]*?)</div>`),
  );
  return m ? m[1] : "";
}

/** Stars values are rendered as `<span>12<img src="telegram-star.svg"></span>` — strip tags first. */
function parseStars(html, label) {
  const raw = statRaw(html, label);
  if (!raw) return 0;
  return num(clean(raw.replace(/<img[^>]*>/g, " ")));
}

function parseStats(html) {
  return {
    released: clean(statRaw(html, "Дата выхода")),
    upgradeDate: clean(statRaw(html, "Выход улучшений")),
    initialStars: parseStars(html, "Первоначальная цена"),
    upgradeStars: parseStars(html, "Стоимость улучшения"),
    upgradeNote: clean(statRaw(html, "Стоимость улучшения")),
    issued: num(clean(statRaw(html, "Изначальное количество"))),
    left: num(clean(statRaw(html, "Всего осталось"))),
    upgraded: num(clean(statRaw(html, "Всего улучшено"))),
    minPrice: num(clean(statRaw(html, "Текущая минимальная цена").replace(/<img[^>]*>/g, " "))),
  };
}

function parseMainImage(html, name) {
  const m = html.match(/<img decoding="async" src="(\/wp-content\/themes\/gifts\/assets\/img\/gifts\/noupdate\/[^"]+)"/);
  return m ? m[1] : `/wp-content/themes/gifts/assets/img/gifts/noupdate/${encodeURIComponent(name)}.webp`;
}

function parseDescription(html) {
  const m = html.match(/<p class="post_h title_gift_price">[\s\S]*?<\/p>\s*([\s\S]{0,4000})/);
  if (!m) return "";
  const first = m[1].match(/<p>([\s\S]*?)<\/p>/);
  if (!first) return "";
  const text = clean(first[1]);
  return text.length > 260 ? `${text.slice(0, 257).trimEnd()}…` : text;
}

/* ------------------------------------------------------------------ main */

async function scrapeCollection(c, index, total) {
  const tag = `[${index + 1}/${total}] ${c.name}`;
  let html;
  try {
    html = await get(c.url);
  } catch (e) {
    console.log(`${tag} ✗ skip (${e.message})`);
    return null;
  }

  const models = parseRows(sectionSlice(html, 0), "model");
  if (!models.length) {
    console.log(`${tag} ✗ skip (no models)`);
    return null;
  }

  const stats = parseStats(html);
  const folder = models[0].folder ?? slugify(c.name).replace(/-/g, "");
  const mainImagePath = parseMainImage(html, c.name);
  const modelSupply = models.reduce((a, b) => a + b.supply, 0);
  const totalSupply = modelSupply || stats.issued;

  const dir = path.join(ROOT, "public", "gifts", "models", folder);
  await mkdir(dir, { recursive: true });

  const baseFile = path.join(ROOT, "public", "gifts", "noupdate", `${fileSafe(c.name)}.webp`);
  await download(BASE + encodeURI(mainImagePath), baseFile);

  const localize = async (row) => {
    const base = { name: row.name, rarityPct: row.rarityPct, supply: row.supply, priceTon: row.priceTon, gradient: row.gradient };
    if (!row.image) return base;
    // keep the remote file name verbatim so names with spaces/percent-encoding still map 1:1
    const fileName = decodeURIComponent(row.image.split("/").pop());
    const ok = await download(BASE + encodeURI(row.image), path.join(dir, fileName));
    return ok ? { ...base, image: `gifts/models/${folder}/${encodeURIComponent(fileName)}` } : base;
  };

  // The game only ships model artwork, so downloading every background and
  // symbol would add ~10k unused files. Keep them out of the bundle entirely.
  const [modelOut] = await Promise.all([Promise.all(models.map(localize))]);
  const bgOut = [];
  const symOut = [];

  console.log(`${tag} ✓ (${modelOut.length} models)`);

  return {
    slug: c.slug,
    name: c.name,
    ton: c.ton,
    listingTotal: Number.isFinite(c.total) ? c.total : 0,
    supply: totalSupply || (Number.isFinite(c.total) ? c.total : 0),
    image: `gifts/noupdate/${encodeURIComponent(fileSafe(c.name) + ".webp")}`,
    folder,
    released: stats.released,
    upgradeDate: stats.upgradeDate,
    initialStars: stats.initialStars,
    upgradeStars: stats.upgradeStars,
    upgradeNote: stats.upgradeNote,
    issued: stats.issued || totalSupply,
    left: stats.left,
    upgraded: stats.upgraded,
    minPrice: stats.minPrice || c.ton,
    description: parseDescription(html),
    models: modelOut,
    backgrounds: bgOut,
    symbols: symOut,
  };
}

async function main() {
  const dest = path.join(ROOT, "src", "data", "telegram-gifts.json");

  console.log("→ fetching collections listing");
  const listingHtml = await get(`${BASE}/gifts/collections/`);
  let catalog = parseListing(listingHtml);
  console.log(`  found ${catalog.length} collections`);

  const picked = [];
  for (const c of catalog) {
    if (picked.length >= LIMIT) break;
    if (c.preMarket) continue; // no real market price yet
    if (!c.ton) continue;
    picked.push(c);
  }
  console.log(`  scraping ${picked.length} collections · concurrency ${CONCURRENCY}`);

  // resume: keep whatever was already scraped in a previous run
  const done = new Map();
  if (!FORCE && existsSync(dest)) {
    try {
      const prev = JSON.parse(await readFile(dest, "utf8"));
      for (const c of prev) {
        if (c.models?.length && c.initialStars) done.set(c.slug, c);
      }
      console.log(`  resuming with ${done.size} already scraped collections`);
    } catch {
      /* ignore broken cache */
    }
  }

  const flush = async () => {
    const arr = [...done.values()].sort((a, b) => b.ton - a.ton);
    await writeFile(dest, JSON.stringify(arr, null, 2), "utf8");
    return arr.length;
  };

  const todo = picked.filter((c) => !done.has(c.slug));
  let cursor = 0;
  let saved = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, todo.length)) }, async () => {
    while (cursor < todo.length) {
      const i = cursor++;
      const res = await scrapeCollection(todo[i], i, todo.length);
      if (res) {
        done.set(res.slug, res);
        saved++;
        if (saved % 5 === 0) await flush();
      }
      await sleep(400);
    }
  });
  await Promise.all(workers);

  const count = await flush();
  console.log(`\n✓ wrote ${count} collections → ${path.relative(ROOT, dest)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});