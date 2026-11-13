/**
 * telegUP banners — a set of promo creatives rendered to PNG.
 *
 * Why a generator and not hand-made pictures: the brand has one visual
 * language (neon green #a3ff12, violet #8b5cf6, Montserrat/Manrope, the
 * lightning bolt). Drawing it once in HTML means every size stays identical
 * and a domain change is a one-word edit instead of redoing ten files.
 *
 * Output (trailer/banners/):
 *   wide-728x90.png      728×90    under a header on a site
 *   wide-970x250.png     970×250   big leaderboard on the landing
 *   square-1080.png      1080×1080 feed post / VK / Discord
 *   story-1080x1920.png  1080×1920 story / Reels / Shorts cover
 *   mini-300x250.png     300×250   sidebar box
 *   mini-320x50.png      320×50    mobile strip
 *
 * How to use:
 *   1. edit `SITE_URL` below when the domain changes;
 *   2. `node trailer/build-banners.mjs` → writes `banners.html`;
 *   3. `node trailer/capture-banners.mjs` → writes the PNGs.
 *
 * The page supports `?only=wide-728x90` so the capture step renders one
 * creative per screenshot with an exact viewport instead of cropping.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const gifts = join(root, "public", "gifts");
const out = join(here, "banners");
mkdirSync(out, { recursive: true });

/* ------------------------------------------------------------- settings */

/** Меняй один раз, когда домен заменится. */
const SITE_URL = "telegup.mooo.com";

/** Headline shown on the big creatives. */
const HEADLINE = "Симулятор подарков Telegram";
/** Secondary line under the headline. */
const SUBLINE = "Кейсы · Апгрейд · Аукцион · Дуэли";
/** Button label. */
const CTA = "Играть бесплатно";

/**
 * Artwork: the gifts are square PNG/WebP with a transparent background. A few
 * files are missing in some checkouts, so each entry is filtered by
 * `existsSync` and a fallback list is used when none is found.
 */
const ART_CANDIDATES = [
  "noupdate/Eternal Rose.webp",
  "noupdate/Plush Pepe.webp",
  "noupdate/Astral Shard.webp",
  "models/plushpepe/Princess.webp",
];

function pickArt() {
  for (const rel of ART_CANDIDATES) {
    const p = join(gifts, rel);
    if (existsSync(p)) return { path: p, name: rel.split("/").pop() };
  }
  return null;
}

const art = pickArt();
const artB64 = art ? readFileSync(art.path).toString("base64") : null;
const artMime = art && art.path.endsWith(".webp") ? "image/webp" : "image/png";

/** The bolt glyph, used as the brand mark on every size. */
const BOLT = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>`;

/* --------------------------------------------------------------- page */

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>telegUP banners</title>
<style>
  :root{
    --neon:#a3ff12;
    --violet:#8b5cf6;
    --ink:#05060a;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#111;color:#fff;
    font-family:"Manrope","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}

  /* The capture step opens the page with ?only=<id> and sets the viewport to
     the creative's exact size, so a creative is a plain block, not a crop. */
  .banner{
    position:relative;overflow:hidden;
    background:linear-gradient(180deg,#07080d 0%,#04050a 100%);
    display:none;
  }
  .banner.active{display:block}

  /* ---- the living background: aurora, grid, bokeh, grain, vignette ---- */
  .aurora{position:absolute;inset:-30%;
    background:
      radial-gradient(46% 52% at 20% 12%, rgba(163,255,18,.20) 0%, transparent 62%),
      radial-gradient(44% 48% at 82% 24%, rgba(139,92,246,.24) 0%, transparent 64%),
      radial-gradient(62% 62% at 50% 104%, rgba(59,157,255,.13) 0%, transparent 70%);
    filter:blur(70px)}
  .aurora.b{opacity:.7;inset:-24%;
    background:
      radial-gradient(40% 44% at 74% 78%, rgba(139,92,246,.22) 0%, transparent 64%),
      radial-gradient(38% 40% at 16% 86%, rgba(163,255,18,.14) 0%, transparent 66%)}
  .grid{position:absolute;inset:0;opacity:.22;
    background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
                     linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
    background-size:46px 46px;
    mask-image:radial-gradient(ellipse 92% 82% at 50% 40%,#000 0%,transparent 76%);
    -webkit-mask-image:radial-gradient(ellipse 92% 82% at 50% 40%,#000 0%,transparent 76%)}
  .bokeh{position:absolute;inset:0}
  .bokeh i{position:absolute;border-radius:50%;filter:blur(26px);
    background:radial-gradient(circle,rgba(163,255,18,.38),transparent 68%)}
  .bokeh i:nth-child(even){background:radial-gradient(circle,rgba(139,92,246,.40),transparent 68%)}
  .vignette{position:absolute;inset:0;box-shadow:inset 0 0 120px rgba(0,0,0,.7)}
  .grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:screen;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

  .row{position:relative;display:flex;align-items:center;height:100%}
  .col{position:relative;display:flex;flex-direction:column;
    align-items:center;justify-content:center;height:100%;text-align:center}

  /* brand lockup */
  .brand{display:flex;align-items:center;gap:.34em}
  .bolt{display:grid;place-items:center;background:linear-gradient(145deg,#b7ff35,#7ac200);
    box-shadow:0 10px 26px rgba(163,255,18,.42);border-radius:22%}
  .bolt svg{fill:#0b1206;width:58%;height:58%}
  .word{font-family:"Montserrat","Arial Black",sans-serif;font-weight:900;
    letter-spacing:-.045em;line-height:1;white-space:nowrap}
  .word i{font-style:normal;
    background:linear-gradient(92deg,#a3ff12,#e4ffb8);-webkit-background-clip:text;
    background-clip:text;color:transparent}

  .url{font-family:"Montserrat","Arial Black",sans-serif;font-weight:900;
    color:#dcffa0;letter-spacing:-.025em;white-space:nowrap;
    text-shadow:0 6px 22px rgba(0,0,0,.6)}

  .headline{font-family:"Montserrat","Arial Black",sans-serif;font-weight:900;
    letter-spacing:.01em;line-height:1.05;text-transform:uppercase;
    text-shadow:0 6px 24px rgba(0,0,0,.6)}
  .headline em{font-style:normal;
    background:linear-gradient(92deg,#a3ff12,#e4ffb8);-webkit-background-clip:text;
    background-clip:text;color:transparent}
  .rule{width:58%;height:3px;border-radius:99px;
    background:linear-gradient(90deg,transparent,#a3ff12,transparent);
    box-shadow:0 0 16px rgba(163,255,18,.55)}

  .badge{display:inline-flex;align-items:center;gap:.4em;border-radius:999px;
    border:1px solid rgba(163,255,18,.38);background:rgba(163,255,18,.10);
    color:#cdf58a;font-weight:800;text-transform:uppercase;letter-spacing:.18em}

  .cta{display:inline-flex;align-items:center;gap:.5em;border-radius:999px;
    background:var(--neon);color:#081005;font-weight:900;
    box-shadow:0 12px 34px rgba(163,255,18,.35);white-space:nowrap}

  .sub{font-weight:800;color:rgba(255,255,255,.5);letter-spacing:.1em;text-transform:uppercase}

  .art{display:block;object-fit:contain;flex:none;
    filter:drop-shadow(0 24px 60px rgba(163,255,18,.34))}
  .art-wrap{position:relative;display:grid;place-items:center;flex:none}
  .art-wrap::before{content:"";position:absolute;inset:-18%;border-radius:50%;
    background:radial-gradient(circle,rgba(163,255,18,.30),rgba(139,92,246,.18) 55%,transparent 72%)}

  .disc{position:absolute;left:0;right:0;text-align:center;font-weight:700;
    color:rgba(255,255,255,.26)}

  /* ---------- 728×90 ---------- */
  #wide-728x90{width:728px;height:90px;border-radius:6px}
  #wide-728x90 .row{padding:0 18px;gap:14px}
  #wide-728x90 .bolt{width:42px;height:42px;border-radius:10px}
  #wide-728x90 .word{font-size:30px}
  #wide-728x90 .url{font-size:16px;margin-top:3px}
  #wide-728x90 .cta{font-size:14px;padding:9px 16px;margin-left:auto}
  #wide-728x90 .art{width:64px;height:64px}
  #wide-728x90 .bokeh i:nth-child(1){width:56px;height:56px;left:6%;top:14%}
  #wide-728x90 .bokeh i:nth-child(2){width:44px;height:44px;right:12%;bottom:6%}
  #wide-728x90 .bokeh i:nth-child(3),#wide-728x90 .bokeh i:nth-child(4){display:none}

  /* ---------- 970×250 ---------- */
  #wide-970x250{width:970px;height:250px;border-radius:10px}
  #wide-970x250 .row{padding:0 44px;gap:34px}
  #wide-970x250 .bolt{width:64px;height:64px;border-radius:16px}
  #wide-970x250 .word{font-size:56px}
  #wide-970x250 .headline{font-size:26px;margin-top:12px}
  #wide-970x250 .rule{margin:12px 0 10px}
  #wide-970x250 .sub{font-size:14px}
  #wide-970x250 .badge{font-size:11px;padding:6px 12px;margin-bottom:12px}
  #wide-970x250 .cta{font-size:17px;padding:13px 24px;margin-top:16px}
  #wide-970x250 .url{font-size:20px;margin-top:0}
  #wide-970x250 .art{width:186px;height:186px}
  #wide-970x250 .bokeh i:nth-child(1){width:90px;height:90px;left:8%;top:16%}
  #wide-970x250 .bokeh i:nth-child(2){width:74px;height:74px;right:16%;bottom:8%}

  /* ---------- 300×250 ---------- */
  #mini-300x250{width:300px;height:250px;border-radius:12px}
  #mini-300x250 .col{padding:16px;gap:0}
  #mini-300x250 .bolt{width:32px;height:32px;border-radius:9px}
  #mini-300x250 .word{font-size:23px}
  #mini-300x250 .brand{margin-bottom:6px}
  #mini-300x250 .art{width:74px;height:74px;margin:8px 0 8px}
  #mini-300x250 .headline{font-size:12px;margin-top:4px}
  #mini-300x250 .rule{width:110px;margin:7px 0 6px}
  #mini-300x250 .sub{font-size:8px}
  #mini-300x250 .cta{font-size:11px;padding:8px 16px;margin-top:9px}
  #mini-300x250 .url{font-size:10px;margin-top:7px}

  /* ---------- 320×50 ---------- */
  #mini-320x50{width:320px;height:50px;border-radius:5px}
  #mini-320x50 .row{padding:0 12px;gap:10px}
  #mini-320x50 .bolt{width:26px;height:26px;border-radius:7px;flex:none}
  #mini-320x50 .word{font-size:19px;flex:none}
  #mini-320x50 .url{font-size:12px;margin:0;flex:none}
  #mini-320x50 .art{width:32px;height:32px;flex:none}
  #mini-320x50 .bokeh i:nth-child(3),#mini-320x50 .bokeh i:nth-child(4){display:none}

  /* ---------- 1080×1080 ---------- */
  #square-1080{width:1080px;height:1080px}
  #square-1080 .col{padding:0 90px}
  #square-1080 .bolt{width:88px;height:88px;border-radius:22px}
  #square-1080 .word{font-size:76px}
  #square-1080 .headline{font-size:58px;margin-top:34px}
  #square-1080 .rule{margin:26px 0 22px}
  #square-1080 .sub{font-size:19px;letter-spacing:.14em}
  #square-1080 .art{width:330px;height:330px;margin:32px 0 24px}
  #square-1080 .cta{font-size:30px;padding:20px 40px}
  #square-1080 .url{font-size:30px;margin-top:22px}
  #square-1080 .disc{font-size:16px;bottom:38px}

  /* ---------- 1080×1920 ---------- */
  #story-1080x1920{width:1080px;height:1920px}
  #story-1080x1920 .col{padding:0 100px}
  #story-1080x1920 .bolt{width:104px;height:104px;border-radius:26px}
  #story-1080x1920 .word{font-size:92px}
  #story-1080x1920 .headline{font-size:78px;margin-top:56px}
  #story-1080x1920 .rule{margin:40px 0 34px}
  #story-1080x1920 .sub{font-size:24px;letter-spacing:.16em}
  #story-1080x1920 .art{width:480px;height:480px;margin:58px 0 42px}
  #story-1080x1920 .cta{font-size:38px;padding:26px 54px}
  #story-1080x1920 .url{font-size:36px;margin-top:30px}
  #story-1080x1920 .disc{font-size:20px;bottom:70px}
</style>
</head>
<body>

${artB64 ? "" : "<!-- artwork missing: creatives fall back to the brand lockup only -->"}

<!-- ===================== 728×90 ===================== -->
<div class="banner" id="wide-728x90">
  <div class="aurora"></div><div class="aurora b"></div>
  <div class="grid"></div>
  <div class="bokeh"><i style="width:56px;height:56px;left:6%;top:14%"></i><i style="width:44px;height:44px;right:12%;bottom:6%"></i><i style="width:40px;height:40px;left:44%;top:8%"></i><i style="width:36px;height:36px;right:36%;bottom:12%"></i></div>
  <div class="vignette"></div><div class="grain"></div>
  <div class="row">
    <span class="bolt">${BOLT}</span>
    <div>
      <div class="word">teleg<i>UP</i></div>
      <div class="url">${SITE_URL}</div>
    </div>
    ${artB64 ? `<div class="art-wrap"><img class="art" src="data:${artMime};base64,${artB64}" alt=""></div>` : ""}
    <span class="cta">${CTA} →</span>
  </div>
</div>

<!-- ===================== 970×250 ===================== -->
<div class="banner" id="wide-970x250">
  <div class="aurora"></div><div class="aurora b"></div>
  <div class="grid"></div>
  <div class="bokeh"><i style="width:90px;height:90px;left:8%;top:16%"></i><i style="width:74px;height:74px;right:16%;bottom:8%"></i><i style="width:60px;height:60px;left:46%;top:6%"></i><i style="width:52px;height:52px;right:34%;bottom:12%"></i></div>
  <div class="vignette"></div><div class="grain"></div>
  <div class="row">
    <div style="flex:1;min-width:0">
      <span class="badge">симулятор · 18+</span>
      <div class="brand">
        <span class="bolt">${BOLT}</span>
        <span class="word">teleg<i>UP</i></span>
      </div>
      <div class="headline">${HEADLINE}</div>
      <div class="rule"></div>
      <div class="url">${SITE_URL}</div>
      <span class="cta">${CTA}</span>
    </div>
    ${artB64 ? `<div class="art-wrap"><img class="art" src="data:${artMime};base64,${artB64}" alt=""></div>` : ""}
  </div>
</div>

<!-- ===================== 300×250 ===================== -->
<div class="banner" id="mini-300x250">
  <div class="aurora"></div><div class="aurora b"></div>
  <div class="grid"></div>
  <div class="bokeh"><i style="width:70px;height:70px;left:6%;top:8%"></i><i style="width:60px;height:60px;right:4%;bottom:6%"></i><i style="width:46px;height:46px;left:20%;bottom:10%"></i><i style="width:42px;height:42px;right:22%;top:12%"></i></div>
  <div class="vignette"></div><div class="grain"></div>
  <div class="col">
    <div class="brand">
      <span class="bolt">${BOLT}</span>
      <span class="word">teleg<i>UP</i></span>
    </div>
    <div class="headline">${HEADLINE}</div>
    <div class="rule"></div>
    <div class="sub">${SUBLINE}</div>
    ${artB64 ? `<div class="art-wrap"><img class="art" src="data:${artMime};base64,${artB64}" alt=""></div>` : ""}
    <span class="cta">${CTA}</span>
    <div class="url">${SITE_URL}</div>
  </div>
</div>

<!-- ===================== 320×50 ===================== -->
<div class="banner" id="mini-320x50">
  <div class="aurora"></div>
  <div class="bokeh"><i style="width:40px;height:40px;left:8%;top:10%"></i><i style="width:34px;height:34px;right:14%;bottom:8%"></i><i style="width:30px;height:30px;left:44%;top:12%"></i><i style="width:28px;height:28px;right:34%;bottom:10%"></i></div>
  <div class="vignette"></div><div class="grain"></div>
  <div class="row">
    <span class="bolt">${BOLT}</span>
    <span class="word">teleg<i>UP</i></span>
    <span class="url">${SITE_URL}</span>
    ${artB64 ? `<img class="art" src="data:${artMime};base64,${artB64}" alt="">` : ""}
  </div>
</div>

<!-- ===================== 1080×1080 ===================== -->
<div class="banner" id="square-1080">
  <div class="aurora"></div><div class="aurora b"></div>
  <div class="grid"></div>
  <div class="bokeh"><i style="width:150px;height:150px;left:10%;top:12%"></i><i style="width:120px;height:120px;right:12%;bottom:14%"></i><i style="width:100px;height:100px;left:20%;bottom:18%"></i><i style="width:90px;height:90px;right:24%;top:10%"></i></div>
  <div class="vignette"></div><div class="grain"></div>
  <div class="col">
    <div class="brand">
      <span class="bolt">${BOLT}</span>
      <span class="word">teleg<i>UP</i></span>
    </div>
    <div class="headline">${HEADLINE}</div>
    <div class="rule"></div>
    <div class="sub">${SUBLINE}</div>
    ${artB64 ? `<div class="art-wrap"><img class="art" src="data:${artMime};base64,${artB64}" alt=""></div>` : ""}
    <span class="cta">${CTA}</span>
    <div class="url">${SITE_URL}</div>
    <div class="disc">Игра. Все подарки вымышлены, вывод средств невозможен.</div>
  </div>
</div>

<!-- ===================== 1080×1920 ===================== -->
<div class="banner" id="story-1080x1920">
  <div class="aurora"></div><div class="aurora b"></div>
  <div class="grid"></div>
  <div class="bokeh"><i style="width:210px;height:210px;left:8%;top:16%"></i><i style="width:170px;height:170px;right:8%;bottom:22%"></i><i style="width:140px;height:140px;left:18%;bottom:26%"></i><i style="width:120px;height:120px;right:20%;top:12%"></i></div>
  <div class="vignette"></div><div class="grain"></div>
  <div class="col">
    <div class="brand">
      <span class="bolt">${BOLT}</span>
      <span class="word">teleg<i>UP</i></span>
    </div>
    <div class="headline">${HEADLINE}</div>
    <div class="rule"></div>
    <div class="sub">${SUBLINE}</div>
    ${artB64 ? `<div class="art-wrap"><img class="art" src="data:${artMime};base64,${artB64}" alt=""></div>` : ""}
    <span class="cta">${CTA}</span>
    <div class="url">${SITE_URL}</div>
    <div class="disc">Игра. Все подарки вымышлены, вывод средств невозможен.</div>
  </div>
</div>

<script>
  /* ?only=<id> shows a single creative; without it every creative is shown
     stacked (handy to eyeball all of them in one page). */
  const id = new URLSearchParams(location.search).get("only");
  const all = [...document.querySelectorAll(".banner")];
  if (id) {
    const one = document.getElementById(id);
    if (one) one.classList.add("active");
    const size = { "wide-728x90": [728, 90], "wide-970x250": [970, 250],
      "mini-300x250": [300, 250], "mini-320x50": [320, 50],
      "square-1080": [1080, 1080], "story-1080x1920": [1080, 1920] }[id];
    if (size) document.body.style.cssText = "margin:0;width:" + size[0] + "px;height:" + size[1] + "px;overflow:hidden";
  } else {
    all.forEach((b) => b.classList.add("active"));
    document.body.style.cssText = "display:flex;flex-wrap:wrap;gap:20px;padding:20px;align-items:flex-start";
  }
  document.fonts.ready.then(() => { document.body.dataset.ready = "1"; });
</script>
</body>
</html>`;

writeFileSync(join(here, "banners.html"), html, "utf8");
console.log(
  `banners.html written (${html.length} bytes), artwork: ${art ? art.name : "MISSING → text-only creatives"}`,
);
console.log("Sizes: " + ["wide-728x90", "wide-970x250", "mini-300x250", "mini-320x50", "square-1080", "story-1080x1920"].join(", "));
