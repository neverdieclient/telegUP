// Мини-сервер для проверки собранного сайта (dist) и dev-канала (dist/dev).
// Нужен только локально: отдаёт статику из корня и не мешает деплою.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const ROOT = process.argv[2] || "dist";
const PORT = Number(process.argv[3] || 5180);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let file = join(ROOT, p);
    try {
      const s = await stat(file);
      if (s.isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(ROOT, p, "index.html");
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
  }
});

server.listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
