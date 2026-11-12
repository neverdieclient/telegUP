/** Serves the trailer folder over http for the frame grabber. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.TRAILER_PORT ?? 5199);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = join(here, path === "/" ? "trailer.html" : path.replace(/^\/+/, ""));
  if (!file.startsWith(here)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`trailer on http://localhost:${port}/`));