// Конвертирует PNG-паттерны символов Telegram (скачанные gift-parser.py в
// папку <Collection>_patterns/) в маленькие webp-тайлы для telegUP.
//
//   node scripts/build-patterns.mjs "C:\...\Plushpepe_patterns" [--size 128]
//
// PNG у паттернов обычно с прозрачностью и белым/цветным символом — кладём
// как есть, только уменьшаем. Результат: public/patterns/<slug>.webp и список
// строк для `LIST` в src/data/patterns.ts (расширение придётся сменить на
// .webp у импортированных записей или подключить их отдельно).

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

const FFMPEG =
  "C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe";

const args = process.argv.slice(2);
const SRC = args.find((a) => !a.startsWith("--"));
const sizeIdx = args.indexOf("--size");
const SIZE = sizeIdx >= 0 ? Number(args[sizeIdx + 1] || 128) : 128;
if (!SRC) {
  console.error('usage: node scripts/build-patterns.mjs "<patterns-folder>" [--size 128]');
  process.exit(1);
}
const OUT = "public/patterns";
mkdirSync(OUT, { recursive: true });

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "pattern";

const files = readdirSync(SRC)
  .filter((f) => [".png", ".webp", ".svg"].includes(extname(f).toLowerCase()))
  .sort((a, b) => a.localeCompare(b));

const list = [];
for (const file of files) {
  const name = basename(file, extname(file));
  const slug = slugify(name);
  const out = join(OUT, `${slug}.webp`);
  execFileSync(
    FFMPEG,
    [
      "-y", "-v", "error", "-i", join(SRC, file),
      "-vf", `scale=${SIZE}:${SIZE}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
      "-c:v", "libwebp", "-quality", "90", "-pix_fmt", "yuva420p", "-map_metadata", "-1", out,
    ],
    { stdio: "inherit" },
  );
  const kb = Math.round(statSync(out).size / 1024);
  list.push({ id: slug, name, kb });
  console.log(`${name.padEnd(24)} ${slug.padEnd(24)} ${kb} KB`);
}

console.log(`\n${list.length} узоров → ${OUT}`);
console.log("\nстроки для src/data/patterns.ts (LIST):");
for (const p of list) console.log(`  ["${p.id}", "${p.name}"],`);