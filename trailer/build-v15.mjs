/**
 * Builds the telegUP v1.5 UPDATE video (auctions in the market) in the same
 * visual language as the promo trailer: dark glow field, lime accent, real
 * gift artwork from `public/gifts`, deterministic `window.__seek(ms)`.
 *
 * Timeline (16.5s):
 *   0.0  cover      «Обновление 1.5 · Аукционы в маркете»
 *   2.3  tabs       Маркет → вкладка «Аукцион»
 *   5.6  live lot   лот идёт, ставка и выкуп
 *   8.9  soon lot   «скоро» + таймер до открытия
 *   11.8 sold       лот закрылся, подарок улетел победителю
 *   14.0 channel    финал: канал
 *
 * Run `node trailer/build-v15.mjs`, then serve + capture + ffmpeg.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const gifts = join(root, "public", "gifts");
const frames = join(here, "frames");

const FFMPEG =
  process.env.FFMPEG ??
  "C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe";

mkdirSync(frames, { recursive: true });

/* --------------------------------------------------------------- artwork */

const wanted = [
  ["noupdate/Hanging Star.webp", "star"],
  ["noupdate/Plush Pepe.webp", "pepe"],
  ["noupdate/Heart Locket.webp", "locket"],
  ["noupdate/Astral Shard.webp", "shard"],
  ["noupdate/Diamond Ring.webp", "ring"],
  ["noupdate/Eternal Rose.webp", "rose"],
];

const frameMap = {};
for (const [rel, key] of wanted) {
  const src = join(gifts, rel);
  if (!existsSync(src)) {
    console.warn("missing", rel);
    continue;
  }
  const out = join(frames, `${key}.avif`);
  execFileSync(FFMPEG, [
    "-y", "-loglevel", "error", "-i", src,
    "-vf", "scale=512:-2",
    "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "38", out,
  ]);
  frameMap[key] = out;
}

const b64 = (p) => readFileSync(p).toString("base64");
const fontCyr = b64(join(here, "fonts", "manrope-cyr.woff2"));
const fontLat = b64(join(here, "fonts", "manrope-lat.woff2"));
const fontMont = b64(join(here, "fonts", "montserrat800.woff2"));

const art = (key, size) =>
  `<img class="art" src="data:image/avif;base64,${b64(frameMap[key])}" style="width:${size}px;height:${size}px" alt="">`;

const artGlow = (key, size, tint = "163,255,18") =>
  `<div class="glowwrap"><div class="halo" style="background:radial-gradient(circle,rgba(${tint},.40),rgba(139,92,246,.16) 55%,transparent 72%)"></div>${art(key, size)}</div>`;

/* -------------------------------------------------------------- timeline */

const DUR = 16500;
const scenes = [
  { el: "s1", start: 0, end: 2300 },
  { el: "s2", start: 2300, end: 5600 },
  { el: "s3", start: 5600, end: 8900 },
  { el: "s4", start: 8900, end: 11800 },
  { el: "s5", start: 11800, end: 14000 },
  { el: "s6", start: 14000, end: 16500 },
];

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
@font-face{font-family:M;src:url(data:font/woff2;base64,${fontCyr}) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:M;src:url(data:font/woff2;base64,${fontLat}) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:D;src:url(data:font/woff2;base64,${fontMont}) format('woff2')}
*{box-sizing:border-box;margin:0;padding:0}
html{overflow:hidden;background:#070708}
body{position:relative;width:1920px;height:1080px;overflow:hidden;font-family:M,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
#stage{position:relative;width:1920px;height:1080px;overflow:hidden;
  background:radial-gradient(120% 80% at 50% 0%,#141a0d 0%,#0a0a0b 55%,#070708 100%)}
.glow{position:absolute;border-radius:50%;filter:blur(130px);opacity:.5}
.g1{width:900px;height:900px;left:-280px;top:-340px;background:#a3ff12}
.g2{width:860px;height:860px;right:-280px;bottom:-360px;background:#8b5cf6}
.g3{width:560px;height:560px;left:50%;top:38%;background:#3b9dff;opacity:.20}
.scene{position:absolute;inset:0}

/* ---------- type ---------- */
.kicker{display:inline-flex;align-items:center;gap:16px;font-weight:800;font-size:26px;
  letter-spacing:.30em;text-transform:uppercase;color:rgba(163,255,18,.9)}
.kicker::before{content:'';width:54px;height:3px;background:#a3ff12;border-radius:3px}
.kicker.big{font-size:32px}
.title{font-family:D,M,sans-serif;font-weight:900;font-size:130px;line-height:.94;letter-spacing:-.03em}
.title.sm{font-size:94px}
.title.xs{font-size:78px}
.sub{font-weight:800;font-size:36px;line-height:1.32;color:rgba(255,255,255,.60)}
.accent{color:#a3ff12}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:0 120px;text-align:center}
.split{position:absolute;inset:0;display:grid;grid-template-columns:1.05fr .95fr;align-items:center;
  padding:0 130px;gap:60px}
.glowwrap{position:relative;display:grid;place-items:center}
.halo{position:absolute;inset:-32%;border-radius:50%}
.art{display:block;position:relative;mix-blend-mode:screen;filter:brightness(1.06) saturate(1.05);border-radius:20px}

/* ---------- logo ---------- */
.logo{display:flex;align-items:center;justify-content:center;gap:26px}
.logo .bolt{width:104px;height:104px;border-radius:30px;display:grid;place-items:center;
  background:linear-gradient(145deg,#b7ff35,#7ac200);box-shadow:0 26px 70px rgba(163,255,18,.42)}
.logo .bolt svg{width:56px;height:56px;fill:#0b1206}
.logo .word{font-family:D,M,sans-serif;font-weight:900;font-size:160px;letter-spacing:-.045em;line-height:1}
.logo .word i{font-style:normal;background:linear-gradient(92deg,#a3ff12,#d9ff9b);-webkit-background-clip:text;
  background-clip:text;color:transparent}
.pill{margin-top:34px;display:inline-block;padding:16px 42px;border-radius:999px;font-weight:900;font-size:36px;
  letter-spacing:.04em;background:rgba(163,255,18,.12);border:1px solid rgba(163,255,18,.4);color:#dcffa0}

/* ---------- market tabs ---------- */
.win{width:1180px;border-radius:34px;background:rgba(255,255,255,.045);
  border:1px solid rgba(255,255,255,.10);padding:30px 34px;box-shadow:0 60px 160px -60px rgba(0,0,0,.9)}
.tabs{display:flex;gap:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);
  border-radius:20px;padding:8px}
.tab{flex:1;text-align:center;padding:18px 0;border-radius:14px;font-weight:900;font-size:27px;
  color:rgba(255,255,255,.45);letter-spacing:-.01em}
.tab.on{background:#a3ff12;color:#0a1305;box-shadow:0 18px 44px -18px rgba(163,255,18,.85)}
.lots{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:22px}
.lot{position:relative;border-radius:24px;border:1px solid rgba(255,255,255,.09);
  background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015));padding:18px}
.lot .top{display:flex;justify-content:space-between;align-items:center;font-size:17px;font-weight:800;
  color:rgba(255,255,255,.4)}
.lot .badge{padding:6px 12px;border-radius:999px;font-size:15px;font-weight:900;letter-spacing:.06em;
  background:rgba(163,255,18,.16);color:#b7ff35;border:1px solid rgba(163,255,18,.35)}
.lot .badge.soon{background:rgba(59,157,255,.16);color:#8cc6ff;border-color:rgba(59,157,255,.38)}
.lot .nm{margin-top:8px;font-weight:900;font-size:23px;letter-spacing:-.01em}
.lot .pr{margin-top:4px;font-family:D,M,sans-serif;font-weight:900;font-size:34px;color:#e9ffc2}
.lot .pr span{font-size:18px;opacity:.55;font-family:M,sans-serif}

/* ---------- live auction ---------- */
.bid{display:flex;gap:18px;margin-top:40px}
.btn{padding:24px 44px;border-radius:20px;font-weight:900;font-size:30px}
.btn.p{background:#a3ff12;color:#081005;box-shadow:0 22px 60px rgba(163,255,18,.35)}
.btn.s{border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.78)}
.stars{display:flex;align-items:center;gap:10px;font-family:D,M,sans-serif;font-weight:900;font-size:52px;color:#b7ff35}

/* ---------- soon ---------- */
.timer{display:flex;gap:16px;margin-top:38px;justify-content:center}
.tcell{width:150px;padding:22px 0;border-radius:22px;background:rgba(59,157,255,.10);
  border:1px solid rgba(59,157,255,.32);text-align:center}
.tcell b{display:block;font-family:D,M,sans-serif;font-weight:900;font-size:56px;color:#9cccff}
.tcell i{font-style:normal;font-weight:800;font-size:18px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.35)}
.note{margin-top:26px;font-weight:800;font-size:26px;color:rgba(255,255,255,.42)}

/* ---------- sold ---------- */
.tick{width:150px;height:150px;border-radius:50%;display:grid;place-items:center;font-size:76px;color:#0a1305;
  background:linear-gradient(145deg,#b7ff35,#7ac200);box-shadow:0 30px 90px -20px rgba(163,255,18,.7)}

/* ---------- finale ---------- */
.ch{display:flex;align-items:center;gap:22px;margin-top:44px;padding:24px 34px;border-radius:28px;
  background:rgba(163,255,18,.09);border:1px solid rgba(163,255,18,.35)}
.ch .av{width:96px;height:96px;border-radius:26px;display:grid;place-items:center;font-size:42px;color:#0a1305;
  background:linear-gradient(145deg,#b7ff35,#7ac200)}
.ch .nm{display:flex;align-items:center;gap:12px;font-weight:900;font-size:40px;letter-spacing:-.02em}
.ch .nm b{width:26px;height:26px;border-radius:50%;background:#3b9dff;display:grid;place-items:center;font-size:16px;color:#fff}
.ch .ds{font-weight:800;font-size:22px;color:rgba(255,255,255,.42);margin-top:4px}
.disc{position:absolute;left:0;right:0;bottom:46px;text-align:center;font-weight:800;font-size:23px;
  color:rgba(255,255,255,.28)}
</style>
</head>
<body>
<div id="stage">
  <div class="glow g1" id="ga"></div>
  <div class="glow g2" id="gb"></div>
  <div class="glow g3" id="gc"></div>

  <!-- 1 · cover -->
  <section class="scene center" id="s1">
    <div class="logo" id="logo1">
      <span class="bolt"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg></span>
      <span class="word">teleg<i>UP</i></span>
    </div>
    <div class="pill" id="p1">ОБНОВЛЕНИЕ · v1.5</div>
    <h2 class="title sm" style="margin-top:34px" id="t1">Аукционы <span class="accent">в маркете</span></h2>
  </section>

  <!-- 2 · market tabs -->
  <section class="scene center" id="s2">
    <p class="kicker big" id="k2">Новая вкладка</p>
    <div class="win" id="win2" style="margin-top:34px">
      <div class="tabs">
        <div class="tab" id="tabG">Подарки</div>
        <div class="tab" id="tabM">Модели</div>
        <div class="tab" id="tabA">Аукцион</div>
      </div>
      <div class="lots" id="lots2">
        <div class="lot">
          <div class="top"><span>лот #412</span><span class="badge">ИДЁТ</span></div>
          ${artGlow("pepe", 210)}
          <div class="nm">Plush Pepe</div>
          <div class="pr">1 240 ★</div>
        </div>
        <div class="lot">
          <div class="top"><span>лот #413</span><span class="badge soon">СКОРО</span></div>
          ${artGlow("locket", 210, "59,157,255")}
          <div class="nm">Heart Locket</div>
          <div class="pr">860 ★</div>
        </div>
        <div class="lot">
          <div class="top"><span>лот #414</span><span class="badge">ИДЁТ</span></div>
          ${artGlow("shard", 210)}
          <div class="nm">Astral Shard</div>
          <div class="pr">2 100 ★</div>
        </div>
      </div>
    </div>
  </section>

  <!-- 3 · live lot -->
  <section class="scene" id="s3">
    <div class="split">
      <div>
        <p class="kicker big">Идёт сейчас</p>
        <h2 class="title xs" style="margin-top:20px">Ставка<br><span class="accent">или выкуп</span></h2>
        <p class="sub" style="margin-top:26px">Перебьют — звёзды<br>сразу вернутся тебе.</p>
        <div class="bid">
          <div class="btn p" id="b3a">Поставить</div>
          <div class="btn s" id="b3b">Выкупить</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center">
        <div id="art3">${artGlow("pepe", 420)}</div>
        <div class="stars" id="price3" style="margin-top:26px">1 240 ★ <span style="font-size:22px;color:rgba(255,255,255,.4);font-family:M">ваша ставка</span></div>
      </div>
    </div>
  </section>

  <!-- 4 · upcoming -->
  <section class="scene center" id="s4">
    <p class="kicker big" style="color:rgba(140,198,255,.9)" id="k4">Плашка «скоро»</p>
    <h2 class="title sm" style="margin-top:22px">Торги видны<br><span style="color:#9cccff">заранее</span></h2>
    <div class="timer" id="clock">
      <div class="tcell"><b id="th">00</b><i>час</i></div>
      <div class="tcell"><b id="tm">04</b><i>мин</i></div>
      <div class="tcell"><b id="ts">12</b><i>сек</i></div>
    </div>
    <p class="note" id="note4">до открытия · купить и поставить пока нельзя</p>
  </section>

  <!-- 5 · sold -->
  <section class="scene center" id="s5">
    <div class="tick" id="tick5">✓</div>
    <h2 class="title sm" style="margin-top:34px">Лот закрылся<br><span class="accent">сам</span></h2>
    <p class="sub" style="margin-top:24px;text-align:center;max-width:1200px">Подарок ушёл победителю, ставка — продавцу.<br>С доски лот пропадает.</p>
  </section>

  <!-- 6 · channel -->
  <section class="scene center" id="s6">
    <div class="logo" style="margin-bottom:20px">
      <span class="bolt"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg></span>
      <span class="word" style="font-size:140px">teleg<i>UP</i></span>
    </div>
    <div class="ch" id="ch6">
      <span class="av">★</span>
      <div>
        <div class="nm">telegUP <b>✓</b></div>
        <div class="ds">Официальный канал · обновления и фиксы</div>
      </div>
    </div>
    <p class="sub" id="cta6" style="margin-top:34px;font-size:32px">Все апдейты и фиксы — во вкладке «Канал»</p>
    <p class="disc">Это игра. Все подарки вымышлены, реальный вывод средств невозможен.</p>
  </section>
</div>

<script>
const DUR = ${DUR};
const scenes = ${JSON.stringify(scenes)};
const $ = (id) => document.getElementById(id);
const EASE = 'cubic-bezier(.22,1,.36,1)';
const anims = [], animMeta = [];

let hidden = false;
function hideScenes(){ if(hidden) return; hidden = true; for(const s of scenes) $(s.el).style.visibility='hidden'; }
hideScenes();

function a(el, frames, opts){
  if(!el) return;
  const an = el.animate(frames, Object.assign({fill:'both', easing:EASE}, opts));
  an.pause();
  // bake the delay into the seek math, not into the animation: an animation
  // with a delay still spends its first 'delay' ms in the «before» phase
  const delay = Number(opts?.delay) || 0;
  an.effect.updateTiming({ delay: 0, duration: Number(opts?.duration) || 0, fill: 'both' });
  anims.push(an);
  animMeta.push({an, delay, dur:Number(opts?.duration)||0});
  return an;
}
const up = (el, dur, delay, extra={}) => a(el,[{opacity:0,transform:'translateY(30px)'},{opacity:1,transform:'none'}],Object.assign({duration:dur,delay,fill:'backwards'},extra));
const pop = (el, dur, delay) => a(el,[{opacity:0,transform:'scale(.72)'},{opacity:1,transform:'none'}],{duration:dur,delay,fill:'backwards'});

// scene envelopes
for(const s of scenes){
  a($(s.el), [
    {opacity:0, transform:'scale(1.07)'},
    {opacity:1, transform:'scale(1)', offset:.09},
    {opacity:1, transform:'scale(1.02)', offset:.92},
    {opacity:0, transform:'scale(1.04)'},
  ], {duration: s.end-s.start, delay: s.start, easing:'linear'});
}

// 1 cover
a($('logo1'),[{opacity:0,transform:'scale(.84)'},{opacity:1,transform:'none'}],{duration:620,delay:60,fill:'backwards'});
up($('p1'),520,520);
up($('t1'),680,850);

// 2 tabs
up($('k2'),480,2400);
a($('win2'),[{opacity:0,transform:'translateY(40px) scale(.97)'},{opacity:1,transform:'none'}],{duration:660,delay:2600,fill:'backwards'});
a($('tabA'),[
  {background:'rgba(0,0,0,0)', color:'rgba(0,0,0,0)'},
  {background:'#a3ff12', color:'#0a1305'},
],{duration:420,delay:3450,fill:'backwards'});
a($('tabA'),[{transform:'scale(1)'},{transform:'scale(1.06)'},{transform:'scale(1)'}],{duration:420,delay:3450});
a($('lots2'),[{opacity:0,transform:'translateY(26px)'},{opacity:1,transform:'none'}],{duration:560,delay:3750,fill:'backwards'});

// 3 live lot
up($('s3 .kicker'),480,5700);
a($('s3 .title'),[{opacity:0,transform:'translateY(34px)'},{opacity:1,transform:'none'}],{duration:620,delay:5850,fill:'backwards'});
up($('s3 .sub'),520,6050);
a($('art3'),[{opacity:0,transform:'scale(.7) rotate(-8deg)'},{opacity:1,transform:'none'}],{duration:740,delay:5900,fill:'backwards'});
up($('price3'),520,6550);
pop($('b3a'),460,6900);
pop($('b3b'),460,7080);

// 4 soon
up($('k4'),460,9000);
a($('s4 .title'),[{opacity:0,transform:'translateY(34px)'},{opacity:1,transform:'none'}],{duration:620,delay:9200,fill:'backwards'});
a($('clock'),[{opacity:0,transform:'translateY(30px) scale(.95)'},{opacity:1,transform:'none'}],{duration:640,delay:9550,fill:'backwards'});
up($('note4'),480,9950);

// 5 sold
a($('tick5'),[{opacity:0,transform:'scale(.5) rotate(-16deg)'},{opacity:1,transform:'none'}],{duration:640,delay:11950,fill:'backwards'});
a($('s5 .title'),[{opacity:0,transform:'translateY(34px)'},{opacity:1,transform:'none'}],{duration:620,delay:12200,fill:'backwards'});
up($('s5 .sub'),520,12500);

// 6 channel
a($('s6 .logo'),[{opacity:0,transform:'scale(.86)'},{opacity:1,transform:'none'}],{duration:600,delay:14100,fill:'backwards'});
a($('ch6'),[{opacity:0,transform:'translateY(28px) scale(.96)'},{opacity:1,transform:'none'}],{duration:620,delay:14450,fill:'backwards'});
up($('cta6'),520,14900);
a($('s6 .disc'),[{opacity:0},{opacity:1}],{duration:600,delay:15300,fill:'backwards'});

// glows drift
for(const g of ['ga','gb','gc']){
  a($(g),[{transform:'translate(0,0)'},{transform:'translate(140px,90px)'},{transform:'translate(-70px,150px)'}],
    {duration:DUR,delay:0,easing:'ease-in-out'});
}

/* deterministic seek for the frame grabber */
window.__seek = function(ms){
  // scale the 1920x1080 stage into whatever viewport we are rendered in
  const k = Math.max(innerWidth / 1920, innerHeight / 1080);
  const stageEl = $('stage');
  stageEl.style.transformOrigin = '0 0';
  stageEl.style.transform = 'scale(' + k + ')';
  hideScenes();
  for(const m of animMeta){
    const local = ms - m.delay;
    m.an.currentTime = Math.max(0, Math.min(local, m.dur));
  }
  for(const s of scenes){
    $(s.el).style.visibility = ms >= s.start && ms < s.end ? 'visible' : 'hidden';
  }
  // countdown ticks down honestly inside its scene
  const t = Math.max(0, Math.min(252, Math.round((11800 - ms) / 100))); // 00:04:12 → 00:00:00
  $('tm').textContent = String(Math.floor(t / 60)).padStart(2, '0');
  $('ts').textContent = String(t % 60).padStart(2, '0');
};

document.fonts.ready.then(() => {
  window.__seek(0);
  document.body.dataset.ready = '1';
});
</script>
</body>
</html>`;

writeFileSync(join(here, "v15.html"), html, "utf8");
console.log("v15.html written,", html.length, "bytes");