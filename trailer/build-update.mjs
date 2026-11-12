/**
 * Builds the telegUP UPDATE trailer (short, ~14s), in the exact visual style
 * of the original promo but about the latest changes.
 *
 * - same fonts, palette, glow field and deterministic `window.__seek(ms)` API;
 * - scenes cut on the beat of «ella — суперфреш (bass boosted)» (BPM 110);
 * - reads real gift artwork from `public/gifts` and inlines AVIF stills.
 *
 * Run `node trailer/build-update.mjs`, then serve + capture + render.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const gifts = join(root, "public", "gifts");
const frames = join(here, "frames");

const FFMPEG = process.env.FFMPEG ??
  "C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe";

/* --------------------------------------------------------------- frames */

const wanted = [
  ["noupdate/Hanging Star.webp", "star"],        // fortune / stars
  ["noupdate/Star Notepad.webp", "notepad"],
  ["noupdate/Plush Pepe.webp", "pepe"],
  ["noupdate/Heart Locket.webp", "locket"],
  ["noupdate/Astral Shard.webp", "astral"],
  ["noupdate/Durov's Cap.webp", "durov"],        // owner / admin vibe
  ["noupdate/Diamond Ring.webp", "ring"],
  ["noupdate/Gem Signet.webp", "signet"],
  ["noupdate/Eternal Rose.webp", "rose"],
  ["models/plushpepe/Princess.webp", "pepe-gold"],
  ["models/astralshard/Amethyst.webp", "shard-purple"],
];

const frameMap = {};
for (const [rel, key] of wanted) {
  const src = join(gifts, rel);
  if (!existsSync(src)) {
    console.warn("missing", rel);
    continue;
  }
  const out = join(frames, `${key}.avif`);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", src, "-vf", "scale=512:-2", "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "38", out]);
  frameMap[key] = out;
}

/* ------------------------------------------------------------- the page */

const b64 = (p) => readFileSync(p).toString("base64");
const fontManrope = b64(join(here, "fonts", "manrope-cyr.woff2"));
const fontManropeLat = b64(join(here, "fonts", "manrope-lat.woff2"));
const fontMont = b64(join(here, "fonts", "montserrat800.woff2"));

const imgTag = (key, size, extra = "") =>
  `<img class="art" src="data:image/avif;base64,${b64(frameMap[key])}" style="width:${size}px;height:${size}px;${extra}" alt="">`;

const artCss = `.art{display:block;mix-blend-mode:screen;filter:brightness(1.06) saturate(1.05);border-radius:18px}`;

const artGlow = (key, size) =>
  `<div style="position:relative;display:grid;place-items:center">` +
  `<div style="position:absolute;inset:-34%;border-radius:50%;background:radial-gradient(circle,rgba(163,255,18,.32),rgba(139,92,246,.15) 55%,transparent 72%)"></div>` +
  imgTag(key, size, "position:relative") +
  `</div>`;

/* timeline: 14s cut, scenes land on the drop (12.0s of the song) + beats.
   1 beat = 60/110 = 0.5455s. Scene change points are whole beats apart. */
const DUR = 14000;
const scenes = [
  { el: "s1", start: 0,     end: 1900 },
  { el: "s2", start: 1900,  end: 5700 },
  { el: "s3", start: 5700,  end: 10400 },
  { el: "s4", start: 10400, end: 14000 },
];

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
@font-face{font-family:M;src:url(data:font/woff2;base64,${fontManrope}) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:M;src:url(data:font/woff2;base64,${fontManropeLat}) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:D;src:url(data:font/woff2;base64,${fontMont}) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
html{overflow:hidden;background:#070708}
body{position:relative;width:1920px;height:1080px;overflow:hidden;background:#070708;
  font-family:M,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
#fit{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0}
#stage{position:relative;width:1920px;height:1080px;overflow:hidden;
  background:radial-gradient(120% 80% at 50% 0%,#141a0d 0%,#0a0a0b 55%,#070708 100%)}
.glow{position:absolute;border-radius:50%;filter:blur(120px);opacity:.55}
.g1{width:900px;height:900px;left:-260px;top:-320px;background:#a3ff12}
.g2{width:820px;height:820px;right:-260px;bottom:-340px;background:#8b5cf6}
.g3{width:520px;height:520px;left:52%;top:40%;background:#a3ff12;opacity:.22}
.scene{position:absolute;inset:0;opacity:1;will-change:transform,opacity}

/* ---------- shared type ---------- */
.kicker{display:inline-flex;align-items:center;gap:16px;font-weight:800;font-size:26px;
  letter-spacing:.30em;text-transform:uppercase;color:rgba(163,255,18,.9)}
.kicker::before{content:'';width:54px;height:3px;background:#a3ff12;border-radius:3px}
.kicker.big{font-size:34px}
.title{font-family:D,M,sans-serif;font-weight:900;font-size:132px;line-height:.95;letter-spacing:-.03em}
.title.sm{font-size:96px}
.sub{font-weight:800;font-size:38px;line-height:1.3;color:rgba(255,255,255,.62);max-width:1000px}
.accent{color:#a3ff12}
.accent.v{color:#b28cff}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:0 120px;text-align:center;transform-origin:50% 45%}
.split{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;align-items:center;
  padding:0 130px;gap:60px}

/* ---------- logo ---------- */
.logo{display:flex;align-items:center;justify-content:center;gap:26px}
.logo .bolt{width:104px;height:104px;border-radius:30px;display:grid;place-items:center;
  background:linear-gradient(145deg,#b7ff35,#7ac200);box-shadow:0 26px 70px rgba(163,255,18,.42)}
.logo .bolt svg{width:56px;height:56px;fill:#0b1206}
.logo .word{font-family:D,M,sans-serif;font-weight:900;font-size:164px;letter-spacing:-.045em;line-height:1}
.logo .word i{font-style:normal;background:linear-gradient(92deg,#a3ff12,#d9ff9b);-webkit-background-clip:text;
  background-clip:text;color:transparent}
.pill{margin-top:30px;display:inline-block;padding:16px 40px;border-radius:999px;font-weight:900;font-size:38px;
  letter-spacing:.04em;background:rgba(163,255,18,.12);border:1px solid rgba(163,255,18,.4);color:#dcffa0}

/* ---------- fortune (Удача дня) ---------- */
.coin{position:relative;width:420px;height:420px;border-radius:50%;
  display:grid;place-items:center;
  background:radial-gradient(circle at 38% 32%,rgba(255,225,120,.35),rgba(255,190,40,.10) 52%,transparent 70%);
  box-shadow:0 40px 140px rgba(255,190,40,.28),inset 0 0 0 2px rgba(255,205,60,.5)}
.coin .halo{position:absolute;inset:8%;border-radius:50%;border:2px dashed rgba(255,205,60,.35)}
.prize{font-family:D,M,sans-serif;font-weight:900;font-size:96px;color:#ffd94a;letter-spacing:-.02em;
  text-shadow:0 10px 40px rgba(255,190,40,.5)}
.free{margin-top:34px;display:inline-flex;align-items:center;gap:18px;padding:20px 42px;border-radius:22px;
  font-weight:900;font-size:40px;background:#a3ff12;color:#0a1305;box-shadow:0 22px 60px rgba(163,255,18,.4)}

/* ---------- sync fix (stars hold) ---------- */
.cards{display:flex;gap:26px;margin-top:46px}
.mcard{width:330px;padding:30px;border-radius:28px;background:rgba(255,255,255,.045);
  border:1px solid rgba(255,255,255,.10);text-align:left}
.mcard .lbl{font-weight:800;font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.42)}
.mcard .val{font-family:D,M,sans-serif;font-weight:900;font-size:74px;letter-spacing:-.02em;margin-top:10px}
.mcard.ok{border-color:rgba(163,255,18,.45);background:rgba(163,255,18,.08)}
.mcard.ok .val{color:#b7ff35}
.mcard .tick{color:#b7ff35;font-size:30px;font-weight:900}
.arrow{display:flex;align-items:center;font-size:56px;color:rgba(163,255,18,.8)}

/* ---------- final ---------- */
.url{margin-top:42px;padding:26px 52px;border-radius:26px;display:inline-block;
  background:rgba(163,255,18,.1);border:1px solid rgba(163,255,18,.35);
  font-family:D,M,sans-serif;font-weight:900;font-size:50px;letter-spacing:-.01em;color:#d9ff9b}
.cta{display:flex;gap:20px;justify-content:center;margin-top:46px}
.cta div{padding:24px 46px;border-radius:22px;font-weight:800;font-size:31px}
.cta .p{background:#a3ff12;color:#081005;box-shadow:0 22px 60px rgba(163,255,18,.35)}
.cta .s{border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.75)}
.disc{position:absolute;left:0;right:0;bottom:52px;text-align:center;font-weight:800;font-size:24px;
  letter-spacing:.02em;color:rgba(255,255,255,.3)}
</style>
</head>
<body>
<div id="fit"><div id="stage">
  <div class="glow g1" id="ga"></div>
  <div class="glow g2" id="gb"></div>
  <div class="glow g3" id="gc"></div>

  <section class="scene center" id="s1">
    <div class="logo" id="logo1">
      <span class="bolt"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg></span>
      <span class="word">teleg<i>UP</i></span>
    </div>
    <div class="pill" id="updatePill">ОБНОВЛЕНИЕ · ноябрь</div>
  </section>

  <section class="scene" id="s2">
    <div class="split">
      <div>
        <p class="kicker big">Новое · бесплатно</p>
        <h2 class="title sm" style="margin-top:22px">Удача<br><span class="accent">дня</span></h2>
        <p class="sub" style="margin-top:26px">Спин раз в 4 часа.<br>Без ставки — просто заходи и забирай.</p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center">
        <div class="coin" id="coin">
          <div class="halo"></div>
          ${artGlow("star", 240)}
        </div>
        <div class="free" id="prizeBox">+150 ★ <span style="font-size:26px;opacity:.65">бесплатно</span></div>
      </div>
    </div>
  </section>

  <section class="scene center" id="s3">
    <p class="kicker big">Фиксы</p>
    <h2 class="title sm" style="margin-top:22px">Прогресс больше<br><span class="accent">не пропадает</span></h2>
    <p class="sub" style="margin-top:22px;text-align:center">Звёзды, знаки и бейджи держатся —<br>и подтягиваются на любом устройстве.</p>
    <div class="cards">
      <div class="mcard" id="cNew"><div class="lbl">Звёзды</div><div class="val" id="cNewVal">1 807</div></div>
      <div class="arrow" id="arr">→</div>
      <div class="mcard ok" id="cHold"><div class="lbl">Держатся <span class="tick">✓</span></div><div class="val" id="cHoldVal">1 807</div></div>
    </div>
  </section>

  <section class="scene center" id="s4">
    <div class="logo" style="margin-bottom:26px">
      <span class="bolt"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg></span>
      <span class="word" style="font-size:150px">teleg<i>UP</i></span>
    </div>
    <div class="url" id="finalUrl">neverdieclient.github.io/telegUP</div>
    <div class="cta" id="finalCta"><div class="p">Играть бесплатно</div><div class="s">уже на сайте</div></div>
    <p class="disc">Это игра. Все подарки вымышлены, реальный вывод средств невозможен.</p>
  </section>
</div></div>

<script>
const DUR = ${DUR};
const scenes = ${JSON.stringify(scenes)};
const $ = (id) => document.getElementById(id);
const stageEl = $('stage');
const EASE = 'cubic-bezier(.22,1,.36,1)';
const anims = [];
const animMeta = [];

let scenesHidden = false;
let delayStripped = false;
function hideScenes() {
  if (scenesHidden) return;
  scenesHidden = true;
  for (const s of scenes) $(s.el).style.visibility = 'hidden';
}
hideScenes();

function a(el, frames, opts) {
  if (!el) return;
  const an = el.animate(frames, Object.assign({ fill: 'both', easing: EASE }, opts));
  an.pause();
  anims.push(an);
  animMeta.push({ an, delay: Number(opts?.delay) || 0, dur: Number(opts?.duration) || 0 });
  return an;
}

// scene envelopes — quick punches because the cut is short and loud
for (const s of scenes) {
  const el = $(s.el);
  const dur = s.end - s.start;
  a(el, [
    { opacity: 0, transform: 'scale(1.09)' },
    { opacity: 1, transform: 'scale(1)', offset: 0.08 },
    { opacity: 1, transform: 'scale(1.03)', offset: 0.9 },
    { opacity: 0, transform: 'scale(1.05)', offset: 0.99 },
    { opacity: 0, transform: 'scale(1.05)' },
  ], { duration: dur, delay: s.start, easing: 'linear' });
}

// 1 — logo + update pill
a($('logo1'), [{ opacity: 0, transform: 'scale(.82)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 60, fill: 'backwards' });
a($('updatePill'), [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 560, fill: 'backwards' });

// 2 — fortune coin spins in, prize pops
a($('coin'), [{ opacity: 0, transform: 'scale(.6) rotate(-18deg)' }, { opacity: 1, transform: 'none' }], { duration: 720, delay: 1950, fill: 'backwards' });
a($('coin').querySelector('.halo'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(150deg)' }], { duration: 3400, delay: 1950 });
a($('prizeBox'), [{ opacity: 0, transform: 'translateY(26px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 2600, fill: 'backwards' });

// 3 — sync fix: numbers stay put, both cards lock ✓
a($('cNew'), [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 5800, fill: 'backwards' });
a($('arr'), [{ opacity: 0, transform: 'translateX(-20px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 6250, fill: 'backwards' });
a($('cHold'), [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 6600, fill: 'backwards' });

// 4 — finale
a($('finalUrl'), [{ opacity: 0, transform: 'translateY(28px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: 10500, fill: 'backwards' });
a($('finalCta'), [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 11050, fill: 'backwards' });
a(document.querySelector('#s4 .disc'), [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 11700, fill: 'backwards' });

// glows drift
for (const g of ['ga', 'gb', 'gc']) {
  a($(g), [
    { transform: 'translate(0,0)' },
    { transform: 'translate(120px,80px)' },
    { transform: 'translate(-60px,140px)' },
  ], { duration: DUR, delay: 0, easing: 'ease-in-out' });
}

/* deterministic seek used by the frame grabber */
window.__seek = function (ms) {
  if (!stageEl._fit) {
    const fitEl = stageEl.parentElement;
    const k = Math.max(innerWidth / 1920, innerHeight / 1080);
    const tf = 'scale(' + k + ')';
    stageEl.style.transformOrigin = '0 0';
    stageEl.style.transform = tf;
    fitEl.style.transform = tf;
    stageEl._fit = true;
  }
  hideScenes();
  for (const m of animMeta) {
    const local = ms - m.delay;
    m.an.currentTime = Math.max(0, Math.min(local, m.dur));
  }
  if (!delayStripped) {
    delayStripped = true;
    for (const m of animMeta) {
      m.an.effect.updateTiming({ delay: 0, duration: m.dur, fill: 'both' });
    }
  }
  for (const s of scenes) {
    $(s.el).style.visibility = ms >= s.start && ms < s.end ? 'visible' : 'hidden';
  }
  // keep the counter readouts truthful at any seek point
  const m3 = animMeta.find(m => m.an.effect.target && m.an.effect.target.id === 'cNew');
  // (values are static 1 807; no per-frame math needed)
};

document.fonts.ready.then(() => {
  window.__seek(0);
  document.body.dataset.ready = '1';
});
</script>
</body>
</html>`;

writeFileSync(join(here, "update.html"), html, "utf8");
console.log("update.html written,", html.length, "bytes");
