import { writeFile } from "node:fs/promises";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const res = await fetch("https://telegifter.ru/gifts/collections/torch-freedom/", {
  headers: { "user-agent": UA, "accept-language": "ru-RU,ru;q=0.9" },
});
console.log("status", res.status);
const html = await res.text();

const m = html.match(/<img decoding="async" src="(\/wp-content\/themes\/gifts\/assets\/img\/gifts\/noupdate\/[^"]+)"/);
console.log("base:", m?.[1]);

if (m) {
  const url = "https://telegifter.ru" + m[1];
  const r = await fetch(url, { headers: { "user-agent": UA } });
  console.log("img status", r.status, r.headers.get("content-type"));
  const buf = Buffer.from(await r.arrayBuffer());
  console.log("bytes", buf.length);
  if (r.ok && buf.length > 512) {
    await writeFile("public/gifts/noupdate/Chill Flame.webp", buf);
    console.log("saved");
  }
}