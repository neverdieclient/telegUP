import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHANGELOG, TAG_META, type ChangelogRelease } from "../data/changelog";
import { CheckMark } from "../components/ui/CheckMark";
import { Button } from "../components/ui/Button";
import { useGame } from "../store/useGame";

/**
 * «Обновления» — the readable changelog plus a TikTok-style vertical slideshow
 * that plays the release highlights one card at a time with smooth, springy
 * transitions. Deliberately silent about the admin console.
 *
 * The slideshow is pure DOM + framer-motion (no video file needed), so it
 * stays crisp on any screen and needs no extra hosting.
 */

const SLIDE_MS = 3400;

type Slide = { release: ChangelogRelease; index: number; total: number };

function releaseToSlides(): Slide[] {
  return CHANGELOG.map((release, index) => ({
    release,
    index,
    total: CHANGELOG.length,
  }));
}

/* ----------------------------------------------------------------- slides */

function SlideCard({ slide, active }: { slide: Slide; active: boolean }) {
  const { release, index, total } = slide;
  const [entryIdx, setEntryIdx] = useState(0);

  // cycle through the entries so the card keeps moving while it is on screen
  useEffect(() => {
    if (!active) return;
    setEntryIdx(0);
    const per = Math.max(900, Math.floor(SLIDE_MS / Math.max(release.entries.length, 1)));
    const timer = window.setInterval(() => {
      setEntryIdx((i) => (i + 1) % release.entries.length);
    }, per);
    return () => window.clearInterval(timer);
  }, [active, release.entries.length]);

  const entry = release.entries[entryIdx];
  const tag = TAG_META[entry.tag];

  return (
    <div className="relative flex h-full w-full flex-col justify-end overflow-hidden">
      {/* animated gradient backdrop */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            "radial-gradient(120% 80% at 20% 0%, #4c1d95 0%, #0a0a0f 60%)",
            "radial-gradient(120% 80% at 80% 20%, #1e3a8a 0%, #0a0a0f 60%)",
            "radial-gradient(120% 80% at 40% 100%, #14532d 0%, #0a0a0f 60%)",
            "radial-gradient(120% 80% at 20% 0%, #4c1d95 0%, #0a0a0f 60%)",
          ],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
      />

      {/* drifting orbs */}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute rounded-full blur-[70px]"
          style={{
            width: 180 + i * 60,
            height: 180 + i * 60,
            left: `${18 + i * 30}%`,
            top: `${10 + i * 22}%`,
            background: ["#8b5cf6", "#a3ff12", "#3b9dff"][i],
            opacity: 0.18,
          }}
          animate={{ x: [0, 30, -20, 0], y: [0, -24, 18, 0], scale: [1, 1.12, 0.94, 1] }}
          transition={{ duration: 12 + i * 4, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      <div className="relative p-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 220, damping: 26 }}
          className="flex items-center gap-2"
        >
          <span className="rounded-lg bg-white/10 px-2 py-1 text-[10.5px] font-black tracking-wider text-white/80">
            v{release.version}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-white/40">
            telegUP
            <CheckMark kind="major" size={12} />
          </span>
        </motion.div>

        <motion.h2
          key={release.version + "-title"}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, type: "spring", stiffness: 200, damping: 24 }}
          className="mt-2 font-display text-[26px] font-black leading-tight tracking-tight"
        >
          {release.title}
        </motion.h2>

        <motion.p
          className="mt-1.5 max-w-[34ch] text-[12.5px] leading-relaxed text-white/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          {release.summary}
        </motion.p>

        {/* rotating highlight */}
        <div className="mt-5 min-h-[76px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={entryIdx}
              initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -18, filter: "blur(6px)" }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-white/10 bg-black/35 p-3.5 backdrop-blur-md"
            >
              <span
                className="rounded-md px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider"
                style={{ background: `${tag.color}22`, color: tag.color }}
              >
                {tag.label}
              </span>
              <p className="mt-2 text-[13.5px] font-semibold leading-snug text-white/90">
                {entry.text}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* progress dots */}
        <div className="mt-4 flex gap-1">
          {release.entries.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i === entryIdx ? "bg-white/80" : "bg-white/15"
              }`}
            />
          ))}
        </div>

        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/25">
          {index + 1} / {total}
        </p>
      </div>
    </div>
  );
}

function Slideshow({ onClose }: { onClose: () => void }) {
  const slides = useMemo(releaseToSlides, []);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const go = useCallback(
    (dir: 1 | -1) => {
      setCurrent((c) => {
        const next = c + dir;
        if (next < 0) return slides.length - 1;
        if (next >= slides.length) return 0;
        return next;
      });
    },
    [slides.length],
  );

  useEffect(() => {
    if (paused) return;
    timer.current = window.setTimeout(() => go(1), SLIDE_MS);
    return () => window.clearTimeout(timer.current);
  }, [current, paused, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "ArrowRight") go(1);
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const slide = slides[current];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black"
    >
      {/* phone-shaped stage on desktop, full-bleed on mobile */}
      <div className="relative mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-[#0a0a0f] sm:my-6 sm:h-[calc(100%-3rem)] sm:rounded-[28px] sm:border sm:border-white/10">
        {/* top progress bar */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-2 pt-2">
          {slides.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
              {i < current && <div className="h-full w-full bg-white/80" />}
              {i === current && (
                <motion.div
                  key={`${current}-${paused}`}
                  className="h-full bg-white"
                  initial={{ width: "0%" }}
                  animate={{ width: paused ? "40%" : "100%" }}
                  transition={{ duration: paused ? 0.2 : SLIDE_MS / 1000, ease: "linear" }}
                />
              )}
            </div>
          ))}
        </div>

        {/* close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-5 z-30 grid size-8 place-items-center rounded-full bg-black/50 text-white/70 backdrop-blur hover:text-white"
          aria-label="Закрыть"
        >
          ✕
        </button>

        {/* tap zones: pause on tap, but let the card animate */}
        <div
          className="relative flex-1 overflow-hidden"
          onClick={() => setPaused((p) => !p)}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={current}
              initial={{ y: "100%", opacity: 0, scale: 0.96 }}
              animate={{ y: "0%", opacity: 1, scale: 1 }}
              exit={{ y: "-30%", opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 190, damping: 26, mass: 0.9 }}
              className="absolute inset-0"
            >
              <SlideCard slide={slide} active={!paused} />
            </motion.div>
          </AnimatePresence>

          {paused && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="grid size-16 place-items-center rounded-full bg-black/50 text-2xl backdrop-blur">
                ▶
              </span>
            </div>
          )}
        </div>

        {/* bottom controls */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-6 pb-5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="grid size-10 place-items-center rounded-full bg-white/10 text-white/70 backdrop-blur hover:bg-white/20"
          >
            ↑
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPaused((p) => !p);
            }}
            className="grid size-10 place-items-center rounded-full bg-white/10 text-white/70 backdrop-blur hover:bg-white/20"
          >
            {paused ? "▶" : "❚❚"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="grid size-10 place-items-center rounded-full bg-white/10 text-white/70 backdrop-blur hover:bg-white/20"
          >
            ↓
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------- page */

export default function Updates() {
  const [show, setShow] = useState(false);
  const toast = useGame((s) => s.toast);
  const totalEntries = CHANGELOG.reduce((n, r) => n + r.entries.length, 0);

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
      </header>

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