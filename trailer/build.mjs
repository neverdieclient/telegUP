/**
 * Builds the telegUP promo trailer.
 *
 * - reads the real gift artwork from `public/gifts` and pins the frames as
 *   AVIF stills (VP8X webp files sometimes decode blank, AVIF is reliable);
 * - writes `trailer.html`, a self-contained slide-show that animates the
 *   scenes with the Web Animations API and exposes `window.__seek(ms)` so the
 *   frames can be captured deterministically;
 * - loads Montserrat/Manrope and the Cyrillic glyphs BASE64-inlined.
 *
 * Run `node trailer/build.mjs` then `node trailer/render.mjs`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const gifts = join(root, "public", "gifts");
const frames = join(here, "frames");
mkdirSync(frames, { recursive: true });

const FFMPEG = process.env.FFMPEG ??
  "C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe";

/* --------------------------------------------------------------- frames */

const wanted = [
  ["noupdate/Plush Pepe.webp", "pepe"],
  ["noupdate/Heart Locket.webp", "locket"],
  ["noupdate/Astral Shard.webp", "astral"],
  ["noupdate/Lol Pop.webp", "lolpop"],
  ["noupdate/Durov's Cap.webp", "durov"],
  ["noupdate/Homemade Cake.webp", "cake"],
  ["noupdate/Eternal Rose.webp", "rose"],
  ["noupdate/Magic Potion.webp", "potion"],
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

/* The artwork is a black-background square: blend it into the dark stage so
   no hard black box shows against the ring / lot rows. */
const artCss = `.art{display:block;mix-blend-mode:screen;filter:brightness(1.06) saturate(1.05);border-radius:18px}`;

/** artwork with a soft radial glow behind it (upgrade ring) */
const artGlow = (key, size) =>
  `<div style="position:relative;display:grid;place-items:center">` +
  `<div style="position:absolute;inset:-34%;border-radius:50%;background:radial-gradient(circle,rgba(163,255,18,.30),rgba(139,92,246,.14) 55%,transparent 72%)"></div>` +
  imgTag(key, size, "position:relative") +
  `</div>`;

const stageGifts = ["pepe", "locket", "astral", "lolpop", "durov", "cake", "rose", "potion"];

const cardPool = stageGifts.map((k, i) => `
  <div class="card" style="--i:${i};transform:translateX(${i * 240 - 840}px)">
    ${imgTag(k, 150)}
    <b>${["Plush Pepe", "Heart Locket", "Astral Shard", "Lol Pop", "Durov's Cap", "Homemade Cake", "Eternal Rose", "Magic Potion"][i]}</b>
  </div>`).join("");

const wheelPool = ["pepe", "locket", "astral", "lolpop", "durov", "cake", "rose", "potion", "pepe-gold", "shard-purple"]
  .map((k) => `<div class="slot">${imgTag(k, 150)}</div>`).join("");

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
/* the stage is scaled to the capture viewport (origin 0 0); the wrapper
   follows so a 16:9 viewport fills exactly with no letterboxing */
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
.title{font-family:D,M,sans-serif;font-weight:900;font-size:132px;line-height:.95;letter-spacing:-.03em}
.title.sm{font-size:96px}
.sub{font-weight:800;font-size:38px;line-height:1.3;color:rgba(255,255,255,.62);max-width:1000px}
.accent{color:#a3ff12}

/* ---------- woodmark ---------- */
#brand{text-align:center}
#brand .mark{position:relative;display:inline-block;margin-bottom:44px}
.logo{display:flex;align-items:center;justify-content:center;gap:26px}
.logo .bolt{width:104px;height:104px;border-radius:30px;display:grid;place-items:center;
  background:linear-gradient(145deg,#b7ff35,#7ac200);box-shadow:0 26px 70px rgba(163,255,18,.42)}
.logo .bolt svg{width:56px;height:56px;fill:#0b1206}
.logo .word{font-family:D,M,sans-serif;font-weight:900;font-size:164px;letter-spacing:-.045em;line-height:1}
.logo .word i{font-style:normal;background:linear-gradient(92deg,#a3ff12,#d9ff9b);-webkit-background-clip:text;
  background-clip:text;color:transparent}
#brand .tag{margin-top:26px;font-weight:800;font-size:40px;letter-spacing:.02em;color:rgba(255,255,255,.68)}
#brand .line{width:0;height:4px;margin:40px auto 0;border-radius:4px;
  background:linear-gradient(90deg,transparent,#a3ff12,transparent)}

/* ---------- stats ---------- */
.stats{display:flex;justify-content:center;gap:34px;margin-top:56px}
.stat{min-width:250px;padding:28px 34px;border-radius:28px;background:rgba(255,255,255,.045);
  border:1px solid rgba(255,255,255,.09);text-align:center}
.stat b{display:block;font-family:D,M,sans-serif;font-weight:900;font-size:66px;letter-spacing:-.02em}
.stat span{display:block;margin-top:6px;font-weight:800;font-size:22px;letter-spacing:.22em;
  text-transform:uppercase;color:rgba(255,255,255,.45)}

/* ---------- cases ---------- */
.split{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;align-items:center;
  padding:0 120px;gap:60px}
.wheel{position:relative;height:320px;overflow:hidden;border-radius:34px;
  border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.035);
  box-shadow:0 40px 120px rgba(0,0,0,.55)}
.wheel .row{position:absolute;top:50%;left:0;display:flex;gap:22px;transform:translate(0,-50%)}
.wheel .slot{flex:none;width:210px;height:240px;border-radius:26px;display:grid;place-items:center;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.wheel .needle{position:absolute;left:50%;top:0;bottom:0;width:4px;margin-left:-2px;
  background:linear-gradient(180deg,#a3ff12,rgba(163,255,18,.15));box-shadow:0 0 26px #a3ff12}
.wheel .fade{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(90deg,#0a0a0b 0%,transparent 18%,transparent 82%,#0a0a0b 100%)}

/* ---------- upgrade ---------- */
${artCss}
.ring{position:relative;width:520px;height:520px;border-radius:50%;
  background:conic-gradient(from 210deg,#a3ff12 0deg,rgba(163,255,18,.9) 190deg,rgba(163,255,18,.12) 190deg,rgba(163,255,18,.12) 300deg,#8b5cf6 300deg,#8b5cf6 360deg);
  padding:34px;box-shadow:0 40px 140px rgba(163,255,18,.18)}
.ring .inner{width:100%;height:100%;border-radius:50%;background:#0c0d0a;display:grid;place-items:center;
  border:1px solid rgba(255,255,255,.08)}
.ring .needle{position:absolute;left:50%;bottom:50%;width:8px;height:214px;margin-left:-4px;border-radius:8px;
  background:linear-gradient(180deg,#fff,#a3ff12);transform-origin:50% 100%;
  box-shadow:0 0 26px rgba(163,255,18,.8)}
.ring .hub{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
  background:#a3ff12;box-shadow:0 0 34px #a3ff12}
.chance{display:flex;align-items:center;gap:22px;margin-top:34px}
.chance .big{font-family:D,M,sans-serif;font-weight:900;font-size:88px;color:#a3ff12;letter-spacing:-.02em}
.chance .txt{font-weight:800;font-size:30px;line-height:1.25;color:rgba(255,255,255,.55)}

/* ---------- badges ---------- */
.badges{display:flex;flex-wrap:wrap;gap:26px;justify-content:center;margin-top:64px;max-width:1500px}
.badge{display:flex;align-items:center;gap:16px;padding:22px 34px;border-radius:999px;
  background:rgba(163,255,18,.09);border:1px solid rgba(163,255,18,.3);
  font-weight:800;font-size:32px;letter-spacing:.01em}
.badge .tick{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;
  background:#a3ff12;color:#081005;font-size:28px;font-weight:900}

/* ---------- auction ---------- */
.lots{display:flex;flex-direction:column;gap:20px;margin-top:44px}
.lot{display:flex;align-items:center;gap:22px;padding:18px 26px;border-radius:26px;
  background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)}
.lot .nm{flex:1;font-weight:800;font-size:32px}
.lot .pr{font-family:D,M,sans-serif;font-weight:900;font-size:34px;color:#a3ff12}
.lot .tm{font-weight:800;font-size:24px;color:rgba(255,255,255,.45);letter-spacing:.06em}

/* ---------- final ---------- */
.url{margin-top:44px;padding:26px 52px;border-radius:26px;display:inline-block;
  background:rgba(163,255,18,.1);border:1px solid rgba(163,255,18,.35);
  font-family:D,M,sans-serif;font-weight:900;font-size:52px;letter-spacing:-.01em;color:#d9ff9b}
.cta{display:flex;gap:20px;justify-content:center;margin-top:52px}
.cta div{padding:24px 46px;border-radius:22px;font-weight:800;font-size:31px}
.cta .p{background:#a3ff12;color:#081005;box-shadow:0 22px 60px rgba(163,255,18,.35)}
.cta .s{border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.75)}
.disc{position:absolute;left:0;right:0;bottom:56px;text-align:center;font-weight:800;font-size:24px;
  letter-spacing:.02em;color:rgba(255,255,255,.3)}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:0 120px;text-align:center;transform-origin:50% 45%}
</style>
</head>
<body>
<div id="fit"><div id="stage">
  <div class="glow g1" id="ga"></div>
  <div class="glow g2" id="gb"></div>
  <div class="glow g3" id="gc"></div>

  <section class="scene center" id="s1">
    <div id="brand">
      <div class="mark">
        <div class="logo" id="logo1">
          <span class="bolt"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg></span>
          <span class="word">teleg<i>UP</i></span>
        </div>
      </div>
      <p class="tag" id="tag">Симулятор подарков Telegram</p>
      <div class="line" id="line"></div>
      <div class="stats" id="stats">
        <div class="stat"><b>6 780</b><span>подарков</span></div>
        <div class="stat"><b>118</b><span>кейсов</span></div>
        <div class="stat"><b>8</b><span>мини-игр</span></div>
        <div class="stat"><b>24/7</b><span>онлайн</span></div>
      </div>
    </div>
  </section>

  <section class="scene" id="s2">
    <div class="split">
      <div>
        <p class="kicker">Кейсы</p>
        <h2 class="title sm" style="margin-top:22px">Крути<br><span class="accent">и выигрывай</span></h2>
        <p class="sub" style="margin-top:26px">Рулетка на реальных подарках Telegram.<br>От бронзы до легендарки — за один оборот.</p>
      </div>
      <div>
        <div class="wheel">
          <div class="row" id="row">${wheelPool}${wheelPool}</div>
          <div class="needle"></div>
          <div class="fade"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="scene" id="s3">
    <div class="split">
      <div style="display:flex;justify-content:center">
        <div class="ring">
          <div class="needle" id="needle"></div>
          <div class="inner">${artGlow("astral", 250)}</div>
          <div class="hub"></div>
        </div>
      </div>
      <div>
        <p class="kicker">Апгрейд</p>
        <h2 class="title sm" style="margin-top:22px">Улучши<br><span class="accent">модель</span></h2>
        <div class="chance">
          <div class="big" id="pct">0%</div>
          <div class="txt">шанс виден сразу —<br>без скрытых подкруток</div>
        </div>
      </div>
    </div>
  </section>

  <section class="scene center" id="s4">
    <p class="kicker">Проверено</p>
    <h2 class="title" style="margin-top:26px">Галочки, бейджи<br><span class="accent">и статусы</span></h2>
    <div class="badges">
      <div class="badge"><span class="tick">✓</span> Проверенный</div>
      <div class="badge"><span class="tick">✓</span> Premium</div>
      <div class="badge"><span class="tick">✓</span> Овнер</div>
      <div class="badge"><span class="tick">✓</span> Коллекционный</div>
    </div>
  </section>

  <section class="scene" id="s5">
    <div class="split">
      <div>
        <p class="kicker">Честность</p>
        <h2 class="title sm" style="margin-top:22px">Честный<br><span class="accent">RNG</span></h2>
        <p class="sub" style="margin-top:26px">Настоящая взвешенная случайность.<br>Проценты открыты игроку.</p>
      </div>
      <div>
        <div class="lots">
          <div class="lot">${imgTag("pepe", 92)}<span class="nm">Plush Pepe</span><span class="tm">10:00</span><span class="pr">5 000 ★</span></div>
          <div class="lot">${imgTag("durov", 92)}<span class="nm">Durov's Cap</span><span class="tm">07:12</span><span class="pr">2 400 ★</span></div>
          <div class="lot">${imgTag("astral", 92)}<span class="nm">Astral Shard</span><span class="tm">02:48</span><span class="pr">1 150 ★</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="scene center" id="s6">
    <div class="logo" style="margin-bottom:30px">
      <span class="bolt"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg></span>
      <span class="word" style="font-size:150px">teleg<i>UP</i></span>
    </div>
    <p class="tag" style="font-weight:800;font-size:38px;color:rgba(255,255,255,.65)">Заходи и забирай</p>
    <div class="url">neverdieclient.github.io/telegUP</div>
    <div class="cta"><div class="p">Играть бесплатно</div><div class="s">6 780 подарков</div></div>
    <p class="disc">Это игра. Все подарки вымышлены, реальный вывод средств невозможен.</p>
  </section>
</div></div>

<script>
const DUR = 26000;
const scenes = [
  { el: 's1', start: 0,     end: 4600 },
  { el: 's2', start: 4600,  end: 8600 },
  { el: 's3', start: 8600,  end: 12600 },
  { el: 's4', start: 12600, end: 16000 },
  { el: 's5', start: 16000, end: 19200 },
  { el: 's6', start: 19200, end: 26000 },
];
const $ = (id) => document.getElementById(id);
const stageEl = $('stage');
const EASE = 'cubic-bezier(.22,1,.36,1)';
const anims = [];
/* keep the logical start time: \`startTime\` is null while the animation is
   paused, so a seek would otherwise never leave frame 0 */
const animMeta = [];

/* Hiding is done with \`visibility\` as well as opacity: the frame grabber
   screenshots the page while several WAAPI timelines fight over the same
   element, so the inline style is the single source of truth. \`__seek\` shows
   the live scene again, hence this flag marks that the initial hide ran. */
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

// scene envelopes: fade in / out + a slow push
for (const s of scenes) {
  const el = $(s.el);
  const dur = s.end - s.start;
  a(el, [
    { opacity: 0, transform: 'scale(1.06)' },
    { opacity: 1, transform: 'scale(1)', offset: 0.10 },
    { opacity: 1, transform: 'scale(1.02)', offset: 0.92 },
    { opacity: 0, transform: 'scale(1.04)', offset: 0.985 },
    { opacity: 0, transform: 'scale(1.04)' },
  ], { duration: dur, delay: s.start, easing: 'linear' });
}

// 1 — brand
a($('tag'), [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 900, fill: 'backwards' });
a($('line'), [{ width: '0px' }, { width: '420px' }], { duration: 900, delay: 1200, fill: 'backwards' });
document.querySelectorAll('#stats .stat').forEach((el, i) => {
  a(el, [{ opacity: 0, transform: 'translateY(34px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 1750 + i * 190, fill: 'backwards' });
});
a($('logo1'), [{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 150, fill: 'backwards' });

// 2 — case wheel spins and settles
const row = $('row');
a(row, [
  { transform: 'translate(0,-50%)' },
  { transform: 'translate(-3180px,-50%)' },
], { duration: 3600, delay: 200, easing: 'cubic-bezier(.12,.72,.06,1)' });

// 3 — upgrade dial + percentage counter
a($('needle'), [
  { transform: 'rotate(-120deg)' },
  { transform: 'rotate(124deg)' },
], { duration: 3000, delay: 120, easing: 'cubic-bezier(.16,.84,.12,1)', fill: 'backwards' });
const pct = $('pct');
const ok = pct.animate([{ opacity: 1 }], { duration: 1, fill: 'both' });
ok.pause(); anims.push(ok);

// 4 — badges pop in
document.querySelectorAll('#s4 .badge').forEach((el, i) => {
  a(el, [{ opacity: 0, transform: 'translateY(30px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 12750 + i * 210, fill: 'backwards' });
});

// 5 — lots
document.querySelectorAll('#s5 .lot').forEach((el, i) => {
  a(el, [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 16100 + i * 220, fill: 'backwards' });
});

// 6 — finale
a(document.querySelector('#s6 .url'), [{ opacity: 0, transform: 'translateY(30px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 20200, fill: 'backwards' });
a(document.querySelector('#s6 .cta'), [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 20700, fill: 'backwards' });
a(document.querySelector('#s6 .disc'), [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 21400, fill: 'backwards' });

// glows drift, nothing depends on wall-clock
for (const g of ['ga', 'gb', 'gc']) {
  a($(g), [
    { transform: 'translate(0,0)' },
    { transform: 'translate(120px,80px)' },
    { transform: 'translate(-60px,140px)' },
  ], { duration: DUR, delay: 0, easing: 'ease-in-out' });
}

/* deterministic seek used by the frame grabber */
window.__seek = function (ms) {
  // scale the fixed 1920x1080 stage to the capture viewport so nothing is cut
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
  /* The delay is applied here and not in the timing: a paused animation with a
     future delay stays in the "before" phase and paints its first frame, which
     made late scenes invisible once the fill changed. Strip it once, after the
     animations exist, then seek to the local time. */
  if (!delayStripped) {
    delayStripped = true;
    for (const m of animMeta) {
      m.an.effect.updateTiming({ delay: 0, duration: m.dur, fill: 'both' });
    }
  }
  // only the scene(s) whose window contains \`ms\` may paint
  for (const s of scenes) {
    $(s.el).style.visibility = ms >= s.start && ms < s.end ? 'visible' : 'hidden';
  }
  // percentage readout follows the needle
  const needleMeta = animMeta.find(m => m.an.effect.target.id === 'needle');
  const d = needleMeta ? needleMeta.an : null;
  const p = d ? (d.currentTime || 0) / 3000 : 0;
  const eased = 1 - Math.pow(1 - p, 3);
  pct.textContent = Math.round(22 + eased * 56) + '%';
};

document.fonts.ready.then(() => {
  window.__seek(0);
  document.body.dataset.ready = '1';
});
</script>
</body>
</html>`;

/* AVIF bytes are not valid inside a data URL with `charset`; base64 is fine. */
writeFileSync(join(here, "trailer.html"), html, "utf8");
console.log("trailer.html written,", html.length, "bytes");