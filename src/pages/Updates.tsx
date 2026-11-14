import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHANGELOG, TAG_META, type ChangelogEntry, type ChangelogRelease } from "../data/changelog";
import { GIFT_BY_ID } from "../data/gifts";
import { DEMOS } from "../components/updates/demos";
import { CheckMark } from "../components/ui/CheckMark";
import { GiftArt, StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";
import { useGame } from "../store/useGame";
import { useOwner } from "../lib/useOwner";
import { IS_DEV_CHANNEL } from "../lib/channel";

/**
 * «Обновления» — the readable changelog plus a TikTok-style vertical slideshow
 * that plays the release highlights one card at a time with smooth, springy
 * transitions. Deliberately silent about the admin console.
 *
 * The slideshow is pure DOM + framer-motion (no video file needed), so it
 * stays crisp on any screen and needs no extra hosting.
 *
 * Как устроен выпуск 1.5: вместо одной карточки на релиз собирается лента
 * сторис — обложка, кадр на каждую фишку и финальный «канал» с кнопкой.
 * Кадры листаются свайпом, шкала сверху — как у сторис в телеге/тиктоке.
 */

const SLIDE_MS = 3800;
/** кадр с живой демкой играет дольше: сценке нужно время доехать до финала */
const DEMO_MS = 6400;
/** how many entries become their own story frame before the rest are merged */
const MAX_STORY_ENTRIES = 4;

/**
 * Черновик следующего выпуска. Живёт только на dev-канале и только для
 * владельца: это рабочий блокнот, а не анонс. В ленту и в слайдшоу пункты не
 * попадают, пока версия не выйдет настоящим релизом в CHANGELOG.
 */
const DEV_DRAFT = {
  version: "2.1",
  entries: [
    "Аукцион: лоты с живой ставкой и таймером в шапке",
    "Профиль: витрина подарков на выбор — 3 или 6 слотов",
    "Рынок: фильтр по цене и редкости, сохранённые поиски",
    "Звёзды: ежедневная серия входов с растущим бонусом",
  ],
};

type Frame =
  | { kind: "cover"; release: ChangelogRelease }
  | { kind: "feature"; release: ChangelogRelease; entry: ChangelogEntry; index: number }
  | { kind: "more"; release: ChangelogRelease; entries: ChangelogEntry[] }
  | { kind: "channel"; release: ChangelogRelease };

function releaseToFrames(release: ChangelogRelease): Frame[] {
  const frames: Frame[] = [{ kind: "cover", release }];
  const rest: ChangelogEntry[] = [];
  // Кадр получает каждая фишка с демкой — иначе анимированный экран некуда
  // поставить. Обычные пункты показываются, пока в ленте есть место.
  let shown = 0;
  for (const entry of release.entries) {
    if (entry.demo || shown < MAX_STORY_ENTRIES) {
      frames.push({ kind: "feature", release, entry, index: shown });
      shown++;
    } else {
      rest.push(entry);
    }
  }
  if (rest.length) frames.push({ kind: "more", release, entries: rest });
  frames.push({ kind: "channel", release });
  return frames;
}

const ACCENTS = ["#a3ff12", "#b45cff", "#3b9dff", "#ff8f3d"];
const accentOf = (i: number) => ACCENTS[i % ACCENTS.length];

/* ------------------------------------------------------------- backdrop */

function Backdrop({ accent }: { accent: string }) {
  return (
    <>
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            `radial-gradient(120% 80% at 20% 0%, ${accent}33 0%, #08080c 62%)`,
            `radial-gradient(120% 80% at 80% 25%, #b45cff40 0%, #08080c 62%)`,
            `radial-gradient(120% 85% at 40% 100%, #3b9dff38 0%, #08080c 62%)`,
            `radial-gradient(120% 80% at 20% 0%, ${accent}33 0%, #08080c 62%)`,
          ],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute rounded-full blur-[70px]"
          style={{
            width: 170 + i * 70,
            height: 170 + i * 70,
            left: `${10 + i * 30}%`,
            top: `${8 + i * 24}%`,
            background: ["#8b5cf6", accent, "#3b9dff"][i],
            opacity: 0.16,
          }}
          animate={{ x: [0, 34, -22, 0], y: [0, -26, 20, 0], scale: [1, 1.14, 0.92, 1] }}
          transition={{ duration: 12 + i * 4, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {/* film grain: a cheap feel of texture, still just one div */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />
    </>
  );
}

/* ---------------------------------------------------------------- frames */

function FrameShell({
  release,
  children,
  accent,
  watermark = true,
}: {
  release: ChangelogRelease;
  children: React.ReactNode;
  accent: string;
  watermark?: boolean;
}) {
  return (
    <div className="relative flex h-full w-full flex-col justify-end overflow-hidden">
      <Backdrop accent={accent} />
      {/* a big faded version of the release number — like a cover title */}
      <span className="pointer-events-none absolute right-2 top-2 font-display text-[120px] font-black leading-none text-white/[0.04]">
        {release.version.replace(".", "")}
      </span>

      <div className="relative flex h-full flex-col p-6 pb-20">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-white/10 px-2 py-1 text-[10.5px] font-black tracking-wider text-white/80">
            v{release.version}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-white/40">
            telegUP
            <CheckMark kind="major" size={12} />
          </span>
        </div>
        <div className="flex-1" />
        {children}
        {watermark && (
          <p className="mt-5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/20">
            свайп ↑↓ · тап — пауза
          </p>
        )}
      </div>
    </div>
  );
}

function CoverFrame({ release }: { release: ChangelogRelease }) {
  return (
    <FrameShell release={release} accent={accentOf(0)}>
      <motion.span
        initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="mb-3 inline-grid size-11 place-items-center rounded-2xl bg-neon text-[18px] font-black text-black shadow-[0_14px_36px_-14px_rgba(163,255,18,0.9)]"
      >
        ★
      </motion.span>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="text-[11px] font-black uppercase tracking-[0.22em] text-neon/90"
      >
        {release.date}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 190, damping: 22 }}
        className="mt-2 font-display text-[34px] font-black leading-[1.03] tracking-tight"
      >
        {release.title}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.28 }}
        className="mt-3 max-w-[32ch] text-[13px] leading-relaxed text-white/55"
      >
        {release.summary}
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-4 flex gap-1.5"
      >
        {release.entries.slice(0, 6).map((e, i) => (
          <span
            key={i}
            className="h-1.5 rounded-full"
            style={{
              width: 24 + i * 6,
              background: TAG_META[e.tag].color,
              opacity: 0.35 + i * 0.1,
            }}
          />
        ))}
      </motion.div>
    </FrameShell>
  );
}

function FeatureFrame({
  release,
  entry,
  index,
}: {
  release: ChangelogRelease;
  entry: ChangelogEntry;
  index: number;
}) {
  const tag = TAG_META[entry.tag];
  const accent = accentOf(index + 1);
  const Demo = entry.demo ? DEMOS[entry.demo] : null;
  const gift = useMemo(() => {
    const list = Object.values(GIFT_BY_ID);
    return list[(index * 37) % Math.max(list.length, 1)];
  }, [index]);

  // Кадр с живой демкой: сценка сверху, подпись снизу и без огромной цифры —
  // экран важнее, чем «01». Текст здесь чуть мельче, чтобы не обрезался.
  if (Demo) {
    return (
      <FrameShell release={release} accent={accent}>
        <motion.div
          initial={{ opacity: 0, y: 26, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 220, damping: 25 }}
          className="mb-3 w-full will-change-transform"
        >
          <Demo />
        </motion.div>

        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-display text-[15px] font-black tabular-nums text-white/35">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider"
            style={{ background: `${tag.color}26`, color: tag.color }}
          >
            {tag.label}
          </span>
        </div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, type: "spring", stiffness: 220, damping: 26 }}
          className="max-w-full font-display text-[16.5px] font-black leading-[1.22] tracking-tight text-white"
        >
          {entry.text}
        </motion.p>
      </FrameShell>
    );
  }

  return (
    <FrameShell release={release} accent={accent}>
      {gift && (
        <motion.div
          initial={{ opacity: 0, y: 30, rotate: 10, scale: 0.7 }}
          animate={{ opacity: 1, y: 0, rotate: -5, scale: 1 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 170, damping: 16 }}
          className="pointer-events-none mb-5 ml-auto w-[132px] rounded-2xl border border-white/12 bg-white/[0.06] p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-sm"
        >
          <div
            className="grid place-items-center overflow-hidden rounded-xl py-2.5"
            style={{ background: `radial-gradient(120% 105% at 50% 5%, ${gift.tint}44, #0b0b10 75%)` }}
          >
            <GiftArt gift={gift} size={84} rounded="rounded-lg" motion="idle" />
          </div>
          <div className="mt-1.5 flex items-center justify-between px-0.5">
            <span className="truncate text-[10px] font-extrabold text-white/80">{gift.name}</span>
            <span className="flex items-center gap-0.5 text-[10px] font-black tabular-nums text-neon">
              {gift.stars.toLocaleString("ru-RU")}
              <StarIcon className="size-2" />
            </span>
          </div>
        </motion.div>
      )}

      {/* oversize number: the «1/4» beat of a story */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 24 }}
        className="mb-2 flex items-end gap-3"
      >
        <span className="font-display text-[58px] font-black leading-none tracking-tighter text-white/90">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className="mb-1.5 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
          style={{ background: `${tag.color}26`, color: tag.color }}
        >
          {tag.label}
        </span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ delay: 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-full font-display text-[22px] font-black leading-tight tracking-tight text-white"
      >
        {entry.text}
      </motion.p>
    </FrameShell>
  );
}

function MoreFrame({ release, entries }: { release: ChangelogRelease; entries: ChangelogEntry[] }) {
  return (
    <FrameShell release={release} accent={accentOf(4)}>
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/40">и ещё</p>
      <ul className="mt-3 space-y-2.5">
        {entries.map((e, i) => {
          const tag = TAG_META[e.tag];
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.07, type: "spring", stiffness: 220, damping: 26 }}
              className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur"
            >
              <span
                className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
                style={{ background: `${tag.color}22`, color: tag.color }}
              >
                {tag.label}
              </span>
              <span className="text-[12.5px] font-semibold leading-snug text-white/85">{e.text}</span>
            </motion.li>
          );
        })}
      </ul>
    </FrameShell>
  );
}

function ChannelFrame({ release }: { release: ChangelogRelease }) {
  return (
    <FrameShell release={release} accent="#3b9dff" watermark={false}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="flex items-center gap-3"
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-neon to-[#7bd400] text-[22px] font-black text-black shadow-[0_16px_40px_-18px_rgba(163,255,18,0.9)]">
          ★
        </span>
        <div>
          <p className="flex items-center gap-1.5 text-[18px] font-black tracking-tight">
            telegUP
            <CheckMark kind="major" size={16} />
          </p>
          <p className="text-[11.5px] text-white/40">Официальный канал · обновления и фиксы</p>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="mt-4 max-w-[30ch] text-[13.5px] leading-relaxed text-white/65"
      >
        Всё, что вышло в обновлении {release.version} — уже в игре. Дальше будет больше.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
        className="mt-4 flex flex-col gap-2"
      >
        <ChannelLink />
      </motion.div>
    </FrameShell>
  );
}

/** Filled in when the channel gets a public link; a plain hint until then. */
const CHANNEL_URL = "";

function ChannelLink() {
  if (!CHANNEL_URL) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 px-3.5 py-3 text-[11.5px] font-bold text-white/45 backdrop-blur">
        Апдейты и фиксы публикуем в канале — вкладка «Канал»
      </div>
    );
  }
  return (
    <a
      href={CHANNEL_URL}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-2xl border border-neon/30 bg-neon/10 px-3.5 py-3 text-[12.5px] font-extrabold text-neon backdrop-blur transition-colors hover:bg-neon/15"
    >
      Перейти в канал
      <span>→</span>
    </a>
  );
}

/* ------------------------------------------------------------------ player */

/** Часы для «статус-бара» макета — как на локскрине iPhone. */
function hmNow() {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function Slideshow({ onClose, startIndex = 0 }: { onClose: () => void; startIndex?: number }) {
  const frames = useMemo(() => CHANGELOG.flatMap(releaseToFrames), []);
  const [current, setCurrent] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  /** время тикает само, сцену не перерисовывает */
  const [clock, setClock] = useState(hmNow);

  useEffect(() => {
    const t = window.setInterval(() => setClock(hmNow()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      setCurrent((c) => {
        const next = c + dir;
        if (next < 0) return frames.length - 1;
        if (next >= frames.length) return 0;
        return next;
      });
    },
    [frames.length],
  );

  // сколько кадр висит на экране: у демки свой, более длинный такт
  const frame = frames[current];
  const frameMs = frame.kind === "feature" && frame.entry.demo ? DEMO_MS : SLIDE_MS;

  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => go(1), frameMs);
    return () => window.clearTimeout(t);
  }, [current, paused, go, frameMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const releaseIndex = CHANGELOG.findIndex((r) => r.version === frame.release.version);
  const inRelease = frames
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.release.version === frame.release.version);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-sm sm:p-6"
    >
      {/* На телефоне — во весь экран, на десктопе — макет айфона со сторис */}
      <div className="relative h-full w-full sm:h-[min(880px,94vh)] sm:w-[404px]">
        {/* кнопки корпуса: только у макета */}
        <span className="pointer-events-none absolute -left-[3px] top-[136px] hidden h-8 w-[3px] rounded-l-[2px] bg-white/15 sm:block" />
        <span className="pointer-events-none absolute -left-[3px] top-[188px] hidden h-14 w-[3px] rounded-l-[2px] bg-white/15 sm:block" />
        <span className="pointer-events-none absolute -left-[3px] top-[256px] hidden h-14 w-[3px] rounded-l-[2px] bg-white/15 sm:block" />
        <span className="pointer-events-none absolute -right-[3px] top-[200px] hidden h-20 w-[3px] rounded-r-[2px] bg-white/15 sm:block" />

        <div className="absolute inset-0 bg-[#08080c] sm:rounded-[54px] sm:bg-[#0f0f13] sm:p-[11px] sm:shadow-[0_60px_140px_-40px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.12)]">
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#08080c] sm:rounded-[44px]">
            {/* статус-бар iOS: часы, сеть, батарея */}
            <div className="relative z-30 hidden shrink-0 items-center justify-between px-7 pb-1 pt-3 text-[11.5px] font-bold text-white/85 sm:flex">
              <span className="tabular-nums tracking-tight">{clock}</span>
              <span className="flex items-center gap-1.5">
                <span className="flex items-end gap-[2px]">
                  {[3, 5, 7, 9].map((h) => (
                    <span key={h} className="w-[2.5px] rounded-sm bg-white/85" style={{ height: h }} />
                  ))}
                </span>
                <svg width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden="true">
                  <path d="M1 4.2a9.5 9.5 0 0 1 13 0" stroke="white" strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M3.6 6.9a5.8 5.8 0 0 1 7.8 0" stroke="white" strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="7.5" cy="9.4" r="1.1" fill="white" fillOpacity="0.85" />
                </svg>
                <span className="flex items-center gap-[2px]">
                  <span className="relative block h-[10px] w-[19px] rounded-[3px] border border-white/50 p-[1.5px]">
                    <span className="block h-full w-[74%] rounded-[1px] bg-white/85" />
                  </span>
                  <span className="block h-[4px] w-[1.5px] rounded-r-sm bg-white/50" />
                </span>
              </span>
            </div>

            {/* шапка сторис как в телеге: полоски прогресса, аватар, ник, крестик */}
            <div className="relative z-30 shrink-0 px-2 pt-2">
              <div className="flex gap-1">
                {CHANGELOG.map((r, i) => (
                  <div key={r.version} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/15">
                    {i < releaseIndex && <div className="h-full w-full bg-white/70" />}
                    {i === releaseIndex && (
                      <div className="flex h-full w-full gap-1">
                        {inRelease.map(({ i: globalIdx }) => (
                          <div key={globalIdx} className="h-full flex-1 overflow-hidden rounded-full bg-white/20">
                            {globalIdx < current && <div className="h-full w-full bg-white" />}
                            {globalIdx === current && (
                              <motion.div
                                key={`${current}-${paused}`}
                                className="h-full bg-white"
                                initial={{ width: "0%" }}
                                animate={{ width: paused ? "35%" : "100%" }}
                                transition={{ duration: paused ? 0.2 : frameMs / 1000, ease: "linear" }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2 px-1">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-neon to-[#7bd400] text-[13px] font-black text-black">
                  ★
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[11.5px] font-extrabold text-white">
                    telegUP
                    <CheckMark kind="major" size={11} />
                  </p>
                  <p className="truncate text-[9.5px] font-semibold text-white/45">
                    обновления · v{frame.release.version}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-[13px] text-white/70 backdrop-blur transition-colors hover:bg-white/20 hover:text-white"
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              className="relative flex-1 overflow-hidden"
              onClick={() => setPaused((p) => !p)}
              onPointerDown={(e) => {
                startX.current = e.clientX;
                startY.current = e.clientY;
              }}
              onPointerUp={(e) => {
                const dx = startX.current === null ? 0 : e.clientX - startX.current;
                const dy = startY.current === null ? 0 : e.clientY - startY.current;
                startX.current = null;
                startY.current = null;
                if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
                else if (Math.abs(dy) > 64) go(dy < 0 ? 1 : -1);
              }}
            >
              <AnimatePresence initial={false}>
                <motion.div
                  key={current}
                  initial={{ y: "100%", opacity: 0, scale: 0.94 }}
                  animate={{ y: "0%", opacity: 1, scale: 1 }}
                  exit={{ y: "-28%", opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 190, damping: 26, mass: 0.9 }}
                  className="absolute inset-0"
                >
                  {frame.kind === "cover" && <CoverFrame release={frame.release} />}
                  {frame.kind === "feature" && (
                    <FeatureFrame release={frame.release} entry={frame.entry} index={frame.index} />
                  )}
                  {frame.kind === "more" && <MoreFrame release={frame.release} entries={frame.entries} />}
                  {frame.kind === "channel" && <ChannelFrame release={frame.release} />}
                </motion.div>
              </AnimatePresence>

              {paused && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="grid size-16 place-items-center rounded-full bg-black/50 text-2xl backdrop-blur">▶</span>
                </div>
              )}
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-6 pb-5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                className="grid size-10 place-items-center rounded-full bg-white/10 text-white/70 backdrop-blur hover:bg-white/20"
                aria-label="Назад"
              >
                ↑
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPaused((p) => !p);
                }}
                className="grid size-10 place-items-center rounded-full bg-white/10 text-white/70 backdrop-blur hover:bg-white/20"
                aria-label="Пауза"
              >
                {paused ? "▶" : "❚❚"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                className="grid size-10 place-items-center rounded-full bg-white/10 text-white/70 backdrop-blur hover:bg-white/20"
                aria-label="Дальше"
              >
                ↓
              </button>
            </div>

            {/* home indicator */}
            <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-30 hidden h-1 w-28 -translate-x-1/2 rounded-full bg-white/40 sm:block" />
          </div>
        </div>

        {/* dynamic island поверх экрана */}
        <div className="pointer-events-none absolute left-1/2 top-[22px] z-40 hidden h-[27px] w-[106px] -translate-x-1/2 rounded-full bg-black sm:block" />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------- page */

const SEEN_KEY = "telegup.updates.seen";

export default function Updates() {
  const [show, setShow] = useState(false);
  const toast = useGame((s) => s.toast);
  const { isOwner } = useOwner();
  // черновик — только на dev-сборке и только владельцу: игроку он не нужен
  const draft = IS_DEV_CHANNEL && isOwner;
  const totalEntries = CHANGELOG.reduce((n, r) => n + r.entries.length, 0);
  const latest = CHANGELOG[0];

  // first visit after a new release opens the slideshow by itself — like a
  // fresh story banner in a messenger; «seen» is per account so a shared
  // browser still shows the story to the next player
  const onlineUserId = useGame((s) => s.onlineUserId);
  const seenKey = onlineUserId ? `${SEEN_KEY}.${onlineUserId}` : SEEN_KEY;
  const [seen, setSeen] = useState(() => localStorage.getItem(seenKey) ?? "");
  const fresh = latest && seen !== latest.version;

  useEffect(() => {
    if (!fresh) return;
    setShow(true);
    localStorage.setItem(seenKey, latest.version);
    setSeen(latest.version);
  }, [fresh, latest, seenKey]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-neon/[0.10] via-white/[0.03] to-transparent p-5">
        <div className="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full bg-neon/20 blur-[64px]" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-neon/80">Updates</p>
            <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Обновления</h1>
            <p className="mt-1 text-[12.5px] text-white/35">
              {CHANGELOG.length} релизов · {totalEntries} изменений
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setShow(true);
              toast({ kind: "info", title: "Слайдшоу", message: "Тапни, чтобы поставить на паузу" });
            }}
          >
            ▶ Слайдшоу
          </Button>
        </div>

        {/* poster of the newest release — the same look as the story cover */}
        <button
          onClick={() => setShow(true)}
          className="relative mt-4 flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b10] p-3 text-left transition-transform hover:-translate-y-0.5"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{ background: "radial-gradient(120% 140% at 15% 0%, #a3ff1233 0%, transparent 58%)" }}
          />
          <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-neon/15 font-display text-[20px] font-black text-neon">
            {latest.version.split(".")[0]}
          </span>
          <div className="relative min-w-0 flex-1">
            <p className="truncate text-[13px] font-extrabold tracking-tight">{latest.title}</p>
            <p className="truncate text-[11px] text-white/35">{latest.summary}</p>
          </div>
          <span className="relative shrink-0 rounded-xl bg-white/10 px-2.5 py-1.5 text-[11px] font-black text-white/80">
            ▶ смотреть
          </span>
        </button>
      </header>

      {draft && (
        <section className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 text-[13.5px] font-extrabold tracking-tight text-white/85">
              Черновик {DEV_DRAFT.version}
              <span className="rounded-md border border-white/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white/45">
                dev
              </span>
            </p>
            <span className="shrink-0 text-[10px] font-bold text-white/25">видно только владельцу</span>
          </div>
          <ul className="mt-3 space-y-2">
            {DEV_DRAFT.entries.map((text) => (
              <li key={text} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-white/55">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-neon/70" />
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-white/28">
            В ленту и в слайдшоу пункты попадут только после релиза — сейчас их видит один владелец.
          </p>
        </section>
      )}

      {CHANGELOG.map((release, ri) => (
        <motion.section
          key={release.version}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: ri * 0.04, type: "spring", stiffness: 200, damping: 26 }}
          className="overflow-hidden rounded-3xl border border-white/8 bg-white/[0.025]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/6 px-4 py-3">
            <div>
              <p className="flex items-center gap-2 text-[14px] font-extrabold tracking-tight">
                {release.title}
                <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9.5px] font-black text-white/50">
                  v{release.version}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-white/30">{release.summary}</p>
            </div>
            <span className="shrink-0 text-[10.5px] font-bold text-white/25">{release.date}</span>
          </div>
          <ul className="divide-y divide-white/5">
            {release.entries.map((e, i) => {
              const tag = TAG_META[e.tag];
              return (
                <li key={i} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span
                    className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
                    style={{ background: `${tag.color}1e`, color: tag.color }}
                  >
                    {tag.label}
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-white/70">{e.text}</span>
                </li>
              );
            })}
          </ul>
        </motion.section>
      ))}

      <AnimatePresence>{show && <Slideshow onClose={() => setShow(false)} />}</AnimatePresence>
    </div>
  );
}