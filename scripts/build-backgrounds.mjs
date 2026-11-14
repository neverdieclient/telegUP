// Собирает фоны подарков из папки с исходниками Telegram: 1200×1200 PNG →
// 640×640 webp (фоны почти однотонные, поэтому весит копейки) и считает
// средний цвет каждой картинки — он нужен как подложка, пока webp грузится,
// и для затемнения под текстом в карточке.
//
//   node scripts/build-backgrounds.mjs "C:\Users\User\Downloads\фоныэ"
//
// Результат: public/backgrounds/<slug>.webp + src/data/backgrounds.ts

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

const FFMPEG =
  "C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node scripts/build-backgrounds.mjs <folder-with-png>");
  process.exit(1);
}
const OUT = "public/backgrounds";
const SIZE = 640;
mkdirSync(OUT, { recursive: true });

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Средний цвет картинки: сплющиваем до одного пикселя и читаем rgb. */
const averageColor = (file) => {
  const raw = execFileSync(
    FFMPEG,
    ["-v", "error", "-i", file, "-vf", `scale=1:1:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 20 },
  );
  const hex = (n) => n.toString(16).padStart(2, "0");
  return `#${hex(raw[0])}${hex(raw[1])}${hex(raw[2])}`;
};

const files = readdirSync(SRC)
  .filter((f) => extname(f).toLowerCase() === ".png")
  .sort((a, b) => a.localeCompare(b));

const list = [];
for (const file of files) {
  const name = basename(file, extname(file));
  const slug = slugify(name);
  const out = join(OUT, `${slug}.webp`);
  execFileSync(
    FFMPEG,
    ["-y", "-v", "error", "-i", join(SRC, file), "-vf", `scale=${SIZE}:${SIZE}:flags=lanczos`, "-c:v", "libwebp", "-quality", "84", "-map_metadata", "-1", out],
    { stdio: "inherit" },
  );
  const kb = Math.round(statSync(out).size / 1024);
  const color = averageColor(join(SRC, file));
  list.push({ id: slug, name, color, kb });
  console.log(`${name.padEnd(18)} ${slug.padEnd(18)} ${color}  ${kb} KB`);
}

const total = list.reduce((n, b) => n + b.kb, 0);
console.log(`\n${list.length} фонов, ~${(total / 1024).toFixed(1)} МБ webp`);

const rows = list.map((b) => `  ["${b.id}", "${b.name}", "${b.color}"],`).join("\n");
console.log("\nсписок для src/data/backgrounds.ts:\n" + rows);