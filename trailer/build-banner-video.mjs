/**
 * telegUP video banner — the animated promo strip shops use in ad networks.
 *
 * Not a PNG: an ad slot wants a short clip that loops in 5–10 s, shows the
 * product in motion and starts over. This builds one such clip, scaled to
 * whatever banner size is asked for, and the same page can be re-rendered for
 * any format without redrawing anything.
 *
 * The clip tells a small story in two acts:
 *
 *   0.0–2.1   title card — the brand lockup and «Симулятор подарков Telegram»
 *   2.1–2.6   the title lifts away and the gift rises out of the glow
 *   2.6–4.6   the domain, the call to action and the gift
 *   4.6–5.0   the copy fades out over the living background, the loop restarts
 *
 * The background never cuts: a slow aurora drifts under everything, so the
 * loop seam is the title fading in over the same light, not a black frame.
 *
 * Usage:
 *   node trailer/build-banner-video.mjs            # all formats
 *   node trailer/build-banner-video.mjs 970x250    # one format
 *   node trailer/capture-banner-video.mjs          # render frames + encode
 *
 * Formats: 970x250, 728x90, 1200x300, 1080x1080, 1080x1920.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const gifts = join(root, "public", "gifts");

/* ------------------------------------------------------------- settings */

/** Меняй один раз, когда домен заменится. */
const SITE_URL = "telegup.mooo.com";
const TITLE = "Симулятор подарков Telegram";
const TITLE2 = "Кейсы · Апгрейд · Аукцион · Дуэли";
const CTA = "Играть бесплатно";

/** Length of one loop, in ms. */
const DUR = 5000;

/**
 * Banner formats. `base` is the layout unit: everything below is sized in
 * fractions of `h`, so one set of CSS rules fits each format.
 */
const FORMATS = {
  "970x250": { w: 970, h: 250, kind: "wide" },
  "728x90": { w: 728, h: 90, kind: "tiny" },
  "1200x300": { w: 1200, h: 300, kind: "wide" },
  "1080x1080": { w: 1080, h: 1080, kind: "square" },
  "1080x1920": { w: 1080, h: 1920, kind: "story" },
};

const only = process.argv[2];
const formats = only ? { [only]: FORMATS[only] } : FORMATS;

if (only && !FORMATS[only]) {
  throw new Error(`unknown format "${only}" — pick: ${Object.keys(FORMATS).join(", ")}`);
}

/* --------------------------------------------------------------- assets */

const b64 = (p) => readFileSync(p).toString("base64");

const fontManrope = b64(join(here, "fonts", "manrope-cyr.woff2"));
const fontManropeLat = b64(join(here, "fonts", "manrope-lat.woff2"));
const fontMont = b64(join(here, "fonts", "montserrat800.woff2"));

/**
 * Gift artwork: the hero of the second act. The sets are square WebP with a
 * transparent background, so they sit on the glow without a visible box.
 */
const ART = {
  hero: "noupdate/Eternal Rose.webp",
  second: "noupdate/Astral Shard.webp",
};

function loadArt(wanted) {
  const out = {};
  for (const [key, rel] of Object.entries(wanted)) {
    const p = join(gifts, rel);
    if (existsSync(p)) out[key] = `data:image/webp;base64,${b64(p)}`;
  }
  return out;
}

const art = loadArt(ART);
const artKeys = Object.keys(art);

/** The bolt glyph — the only brand mark that survives a 90 px strip. */
const BOLT = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>`;

const FONTS = `
@font-face{font-family:M;src:url(data:font/woff2;base64,${fontManrope}) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:M;src:url(data:font/woff2;base64,${fontManropeLat}) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:D;src:url(data:font/woff2;base64,${fontMont}) format('woff2')}`;

/* ------------------------------------------------------------ the page */

/**
 * Every size is expressed with `--u` (one "unit" = banner height / 250), so
 * a 90 px strip scales down as a whole instead of overflowing. Square and
 * story switch to a vertical stack with the same content.
 */
function creative(id, { w, h, kind }) {
  // the layout unit is a fraction of the short side: a 90 px strip and a
  // 1080×1920 story must both stay inside their own frame
  const stacked = kind === "square" || kind === "story";
  const u = stacked ? w / 250 : h / 250;
  const hero = art.hero ?? art.second ?? null;

  return `
<!-- ${id} -->
<div class="banner ${kind}" id="banner-${id}" style="width:${w}px;height:${h}px;--u:${u};--w:${w}px;--h:${h}px">
  <div class="bg">
    <div class="aurora"></div>
    <div class="aurora b"></div>
    <div class="grid"></div>
    <div class="bokeh"><i style="--x:12%;--y:78%;--d:7.5s;--s:.55"></i><i style="--x:82%;--y:22%;--d:9.5s;--s:.42"></i><i style="--x:64%;--y:86%;--d:11s;--s:.34"></i><i style="--x:26%;--y:16%;--d:8.5s;--s:.28"></i></div>
    <div class="vignette"></div>
    <div class="grain"></div>
  </div>

  <!-- act 1: the title -->
  <div class="content">
  <div class="act title">
    <div class="brand">
      <span class="bolt">${BOLT}</span>
      <span class="word">teleg<i>UP</i></span>
    </div>
    <div class="headline">${TITLE}</div>
    <div class="rule"></div>
    <div class="kicker">${TITLE2}</div>
  </div>

  <!-- act 2: the domain + the gift -->
  <div class="act domain">
    ${hero ? `<div class="stage"><div class="ring"></div><div class="ring r2"></div><img class="gift" src="${hero}" alt=""></div>` : ""}
    <div class="domain-text">
      <div class="url">${SITE_URL}</div>
      <span class="cta">${CTA}</span>
    </div>
  </div>
  </div>

  <div class="disc">Игра. Все подарки вымышлены, вывод средств невозможен.</div>
</div>`;
}

const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#05060a;color:#fff;font-family:M,sans-serif;-webkit-font-smoothing:antialiased}
.banner{position:relative;overflow:hidden;display:none;isolation:isolate;
  background:linear-gradient(180deg,#07080d 0%,#04050a 100%)}
.banner.active{display:block}

/* ------------------------------------------------------------ background */
.bg{position:absolute;inset:0;overflow:hidden;z-index:0}
.aurora{position:absolute;inset:-30%;
  background:
    radial-gradient(46% 52% at 22% 14%, rgba(163,255,18,.20) 0%, transparent 62%),
    radial-gradient(44% 48% at 82% 26%, rgba(139,92,246,.24) 0%, transparent 64%),
    radial-gradient(60% 60% at 50% 104%, rgba(59,157,255,.14) 0%, transparent 70%);
  filter:blur(calc(var(--u)*26px));
  animation:drift 17s ease-in-out infinite alternate}
.aurora.b{animation-duration:23s;animation-direction:alternate-reverse;opacity:.72}
@keyframes drift{
  0%{transform:translate3d(-3%,-2%,0) scale(1)}
  100%{transform:translate3d(4%,3%,0) scale(1.08)}
}
.grid{position:absolute;inset:0;opacity:.22;
  background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
  background-size:calc(var(--u)*46px) calc(var(--u)*46px);
  mask-image:radial-gradient(ellipse 90% 80% at 50% 40%,#000 0%,transparent 76%);
  -webkit-mask-image:radial-gradient(ellipse 90% 80% at 50% 40%,#000 0%,transparent 76%)}
.bokeh i{position:absolute;left:var(--x);top:var(--y);width:calc(var(--u)*40px);height:calc(var(--u)*40px);
  border-radius:50%;background:radial-gradient(circle,rgba(163,255,18,.40),transparent 68%);
  filter:blur(calc(var(--u)*16px));opacity:var(--s);animation:float calc(var(--d)) ease-in-out infinite}
.bokeh i:nth-child(even){background:radial-gradient(circle,rgba(139,92,246,.42),transparent 68%)}
@keyframes float{
  0%{transform:translate3d(0,12%,0) scale(.9)}
  50%{transform:translate3d(6%,-14%,0) scale(1.1)}
  100%{transform:translate3d(0,12%,0) scale(.9)}
}
.vignette{position:absolute;inset:0;box-shadow:inset 0 0 calc(var(--u)*120px) rgba(0,0,0,.72)}
.grain{position:absolute;inset:0;opacity:.05;mix-blend-mode:screen;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

/* ------------------------------------------------------------------ acts */
.act{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;
  padding:calc(var(--u)*34px) calc(var(--u)*40px);gap:calc(var(--u)*12px)}
/* the second act sits next to the gift on wide formats, under it on square */
.content{position:absolute;inset:0;z-index:1}
.act.domain{flex-direction:row;gap:calc(var(--u)*26px)}
.domain-text{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*14px)}

.brand{display:flex;align-items:center;gap:calc(var(--u)*12px)}
.bolt{display:grid;place-items:center;background:linear-gradient(145deg,#b7ff35,#7ac200);
  box-shadow:0 calc(var(--u)*12px) calc(var(--u)*30px) rgba(163,255,18,.45);
  border-radius:24%;width:calc(var(--u)*58px);height:calc(var(--u)*58px)}
.bolt svg{fill:#0b1206;width:58%;height:58%}
.word{font-family:D,M,sans-serif;font-weight:900;letter-spacing:-.045em;line-height:1;
  white-space:nowrap;font-size:calc(var(--u)*54px)}
.word i{font-style:normal;background:linear-gradient(92deg,#a3ff12,#e4ffb8);
  -webkit-background-clip:text;background-clip:text;color:transparent}

.headline{font-family:D,M,sans-serif;font-weight:900;letter-spacing:.02em;line-height:1.06;
  font-size:calc(var(--u)*30px);color:#fff;text-transform:uppercase;
  text-shadow:0 calc(var(--u)*6px) calc(var(--u)*26px) rgba(0,0,0,.6)}
.rule{width:calc(var(--u)*180px);height:calc(var(--u)*3px);border-radius:99px;
  background:linear-gradient(90deg,transparent,#a3ff12,transparent);
  box-shadow:0 0 calc(var(--u)*18px) rgba(163,255,18,.55)}
.kicker{font-weight:800;font-size:calc(var(--u)*15px);letter-spacing:.14em;
  color:rgba(255,255,255,.42);text-transform:uppercase}

.stage{position:relative;display:grid;place-items:center;flex:none;
  width:calc(var(--u)*152px);height:calc(var(--u)*152px);margin-bottom:calc(var(--u)*4px)}
.ring{position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle,rgba(163,255,18,.34),rgba(139,92,246,.20) 52%,transparent 72%)}
.ring.r2{inset:14%;opacity:.6;
  background:radial-gradient(circle,rgba(255,255,255,.14),transparent 70%)}
.gift{position:relative;width:calc(var(--u)*120px);height:calc(var(--u)*120px);object-fit:contain;
  filter:drop-shadow(0 calc(var(--u)*18px) calc(var(--u)*44px) rgba(163,255,18,.42))}

.url{font-family:D,M,sans-serif;font-weight:900;color:#dcffa0;letter-spacing:-.025em;
  font-size:calc(var(--u)*40px);white-space:nowrap;
  text-shadow:0 calc(var(--u)*8px) calc(var(--u)*30px) rgba(0,0,0,.6)}
.cta{display:inline-flex;align-items:center;border-radius:999px;background:#a3ff12;color:#081005;
  font-weight:900;white-space:nowrap;font-size:calc(var(--u)*20px);
  padding:calc(var(--u)*13px) calc(var(--u)*26px);
  box-shadow:0 calc(var(--u)*12px) calc(var(--u)*36px) rgba(163,255,18,.42)}

.disc{position:absolute;left:0;right:0;bottom:calc(var(--u)*7px);text-align:center;z-index:2;
  font-weight:700;font-size:calc(var(--u)*10px);color:rgba(255,255,255,.20)}

/* the 90 px strip: one line, no room for two acts stacked */
.banner.tiny .headline{font-size:calc(var(--u)*24px);letter-spacing:.04em}
.banner.tiny .rule,.banner.tiny .kicker{display:none}
.banner.tiny .word{font-size:calc(var(--u)*40px)}
.banner.tiny .bolt{width:calc(var(--u)*54px);height:calc(var(--u)*54px)}
.banner.tiny .stage{width:calc(var(--u)*96px);height:calc(var(--u)*96px);margin:0}
.banner.tiny .gift{width:calc(var(--u)*78px);height:calc(var(--u)*78px)}
.banner.tiny .url{font-size:calc(var(--u)*30px)}
.banner.tiny .cta{font-size:calc(var(--u)*24px);padding:calc(var(--u)*9px) calc(var(--u)*18px)}
.banner.tiny .disc{display:none}
.banner.tiny .act{flex-direction:row;gap:calc(var(--u)*14px);padding:0 calc(var(--u)*20px)}
.banner.tiny .act.domain{flex-direction:row;gap:calc(var(--u)*16px)}
.banner.tiny .domain-text{gap:calc(var(--u)*6px)}

/* vertical formats get more air */
/* vertical formats get their own scale: the unit is the width, so a 1080
   square and a 1080×1920 story both stay inside their frame */
.banner.square .word{font-size:calc(var(--u)*26px)}
.banner.square .headline{font-size:calc(var(--u)*14px)}
.banner.square .kicker{font-size:calc(var(--u)*7px)}
.banner.square .stage{width:calc(var(--u)*97px);height:calc(var(--u)*97px)}
.banner.square .gift{width:calc(var(--u)*78px);height:calc(var(--u)*78px)}
.banner.square .url{font-size:calc(var(--u)*17px)}
.banner.square .cta{font-size:calc(var(--u)*9px);padding:calc(var(--u)*6px) calc(var(--u)*13px)}

.banner.story .word{font-size:calc(var(--u)*30px)}
.banner.story .headline{font-size:calc(var(--u)*16px)}
.banner.story .kicker{font-size:calc(var(--u)*8px)}
.banner.story .stage{width:calc(var(--u)*112px);height:calc(var(--u)*112px)}
.banner.story .gift{width:calc(var(--u)*90px);height:calc(var(--u)*90px)}
.banner.story .url{font-size:calc(var(--u)*20px)}
.banner.story .cta{font-size:calc(var(--u)*11px);padding:calc(var(--u)*7px) calc(var(--u)*15px)}
.banner.square .act.domain,.banner.story .act.domain{flex-direction:column}
`;

/**
 * The scene: two acts, one timeline. Everything is a paused Web Animation so
 * the capture step can seek frame by frame — the output is deterministic and
 * the loop seam is exact.
 */
const sceneScript = `
const DUR = ${DUR};
const EASE = 'cubic-bezier(.22,1,.36,1)';
const els = [...document.querySelectorAll('.banner')];
let current = null;

function anim(el, frames, opts) {
  if (!el) return null;
  const a = el.animate(frames, Object.assign({ fill: 'both', easing: EASE }, opts));
  a.pause();
  return a;
}

/* One timeline per banner, built once on activation so a re-seek never
   stacks duplicate animations on the same element. */
function buildTimeline(b) {
  const q = (s) => b.querySelector(s);
  const u = parseFloat(getComputedStyle(b).getPropertyValue('--u')) || 1;

  const t = {};

  /* ---------- act 1: the title ---------- */
  t.brand = anim(q('.title .brand'), [
    { opacity: 0, transform: 'translateY(' + (-22 * u) + 'px) scale(.92)' },
    { opacity: 1, transform: 'none', offset: .62 },
    { opacity: 1, transform: 'none' },
  ], { duration: 780, delay: 60 });

  t.headline = anim(q('.title .headline'), [
    { opacity: 0, transform: 'translateY(' + (16 * u) + 'px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 700, delay: 320 });

  t.rule = anim(q('.title .rule'), [
    { opacity: 0, transform: 'scaleX(0)' },
    { opacity: 1, transform: 'scaleX(1)', offset: .3 },
    { opacity: 1, transform: 'scaleX(1)' },
  ], { duration: 760, delay: 520, easing: 'cubic-bezier(.3,0,.2,1)' });

  t.kicker = anim(q('.title .kicker'), [
    { opacity: 0, transform: 'translateY(' + (10 * u) + 'px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 700, delay: 700 });

  /* the title lifts away and hands the frame to the domain */
  t.titleOut = anim(q('.title'), [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateY(' + (-26 * u) + 'px) scale(.97)' },
  ], { duration: 520, delay: 1720, easing: 'cubic-bezier(.6,0,.8,.4)' });

  /* ---------- act 2: the gift and the domain ---------- */
  t.gift = anim(q('.domain .gift'), [
    { opacity: 0, transform: 'translateY(' + (26 * u) + 'px) scale(.62) rotate(-9deg)' },
    { opacity: 1, transform: 'translateY(0) scale(1.07) rotate(0deg)', offset: .62 },
    { opacity: 1, transform: 'translateY(0) scale(1) rotate(0deg)' },
  ], { duration: 1000, delay: 1960 });

  t.ring = anim(q('.domain .ring'), [
    { opacity: 0, transform: 'scale(.45)' },
    { opacity: 1, transform: 'scale(1.22)', offset: .58 },
    { opacity: 1, transform: 'scale(1)' },
  ], { duration: 1100, delay: 1960 });

  t.url = anim(q('.domain .url'), [
    { opacity: 0, transform: 'translateY(' + (18 * u) + 'px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 620, delay: 2500 });

  t.cta = anim(q('.domain .cta'), [
    { opacity: 0, transform: 'scale(.86)' },
    { opacity: 1, transform: 'scale(1)' },
  ], { duration: 640, delay: 2760 });

  t.ctaGlow = anim(q('.domain .cta'), [
    { boxShadow: '0 ' + 12 * u + 'px ' + 34 * u + 'px rgba(163,255,18,.42)' },
    { boxShadow: '0 ' + 16 * u + 'px ' + 66 * u + 'px rgba(163,255,18,.78)' },
    { boxShadow: '0 ' + 12 * u + 'px ' + 34 * u + 'px rgba(163,255,18,.42)' },
  ], { duration: 1500, delay: 2760, easing: 'ease-in-out', iterations: 2 });

  /* the gift keeps breathing so the frame never looks like a still */
  t.bob = anim(q('.domain .gift'), [
    { transform: 'translateY(0) scale(1)' },
    { transform: 'translateY(' + (-6 * u) + 'px) scale(1.03)' },
    { transform: 'translateY(0) scale(1)' },
  ], { duration: 1900, delay: 2960, easing: 'ease-in-out', iterations: 2 });

  /* ---------- the loop seam ---------- */
  /* the copy fades out over the still-living background, then act 1 fades in */
  t.copyOut = anim(q('.content'), [
    { opacity: 1 },
    { opacity: 0 },
  ], { duration: 420, delay: DUR - 420, easing: 'linear' });

  const list = Object.entries(t).filter(([, a]) => a).map(([key, a]) => {
    const timing = a.effect.getTiming();
    return { key, a, delay: timing.delay || 0, dur: timing.duration || 0,
             loop: (timing.iterations === Infinity) };
  });
  /* delays live here, not in the timing: a paused animation with a future
     delay paints frame 0 forever once the fill is forced to "both" */
  for (const m of list) m.a.effect.updateTiming({ delay: 0, duration: m.dur, fill: 'both' });
  return list;
}

const timelines = new Map();

window.__activate = function (id) {
  current = id;
  for (const b of els) b.classList.toggle('active', b.id === 'banner-' + id);
  /* the capture step sizes the viewport to the banner, so the body must not
     add its own scrollbars or margins */
  const b = document.getElementById('banner-' + id);
  if (b) {
    document.body.style.cssText =
      'margin:0;overflow:hidden;width:' + b.offsetWidth + 'px;height:' + b.offsetHeight + 'px';
  }
  if (!timelines.has(id)) timelines.set(id, buildTimeline(b));
  return true;
};

window.__seek = function (ms) {
  const list = timelines.get(current);
  if (!list) return;
  for (const m of list) {
    const t = ms - m.delay;
    m.a.currentTime = m.loop ? Math.max(0, t) : Math.max(0, Math.min(t, m.dur));
  }
};

const params = new URLSearchParams(location.search);
const startId = params.get('only');
if (startId && document.getElementById('banner-' + startId)) {
  window.__activate(startId);
} else {
  for (const b of els) b.classList.add('active');
  document.body.style.cssText = 'display:flex;flex-wrap:wrap;gap:18px;padding:18px;align-items:flex-start';
}

document.fonts.ready.then(() => {
  window.__seek(0);
  document.body.dataset.ready = '1';
});`;

/* ------------------------------------------------------------- writing */

mkdirSync(join(here, "banner-video"), { recursive: true });

for (const [id, fmt] of Object.entries(formats)) {
  const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>telegUP — banner ${id}</title>
<style>${FONTS}${css}</style>
</head>
<body>
${creative(id, fmt)}
<script>${sceneScript}</script>
</body>
</html>`;
  writeFileSync(join(here, "banner-video", `${id}.html`), page, "utf8");
  console.log(`✓ banner-video/${id}.html  ${fmt.w}×${fmt.h} (${fmt.kind})`);
}

console.log(
  `\nart: ${artKeys.length ? artKeys.join(", ") : "MISSING → text-only"}; loop ${DUR / 1000} s → ` +
    `render with node trailer/capture-banner-video.mjs${only ? " " + only : ""}`,
);
