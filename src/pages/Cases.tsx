import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCaseStrip, rollCase, rollLuck, rollStarDrop, type RolledItem } from "../lib/rng";
import { CASES, FREE_CASE_CASE_ID, FREE_CASE_MAX_STARS, RARITY_META, casePool, type Case, type Gift } from "../data/gifts";
import { useGame } from "../store/useGame";
import { GiftArt, RarityChip, StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";

const ITEM_W = 132;
const ITEM_GAP = 10;
const STEP = ITEM_W + ITEM_GAP;
const STRIP_LEN = 64;
const WINNER_INDEX = 54;

function formatCountdown(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useCountdown(readyAt: () => number) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return readyAt();
}

/** Pie-style odds bar. */
function OddsBar({ odds }: { odds: Case["odds"] }) {
  const entries = (Object.entries(odds) as [keyof typeof odds, number][]).filter(([, v]) => v > 0);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      {entries.map(([r, v]) => (
        <span key={r} className={`h-full ${RARITY_META[r].text.replace("text-", "bg-")}`} style={{ width: `${v * 100}%` }} />
      ))}
    </div>
  );
}

function CaseCard({ c, onOpen, disabled }: { c: Case; onOpen: () => void; disabled: boolean }) {
  const covers = c.covers.filter(Boolean);
  const pool = useMemo(() => casePool(c), [c]);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/8 bg-white/[0.028] backdrop-blur-sm transition-colors hover:border-white/18"
    >
      <div
        className="relative h-[124px] overflow-hidden"
        style={{
          background: `radial-gradient(120% 120% at 50% 115%, ${c.glow}, transparent 65%), linear-gradient(180deg,#15151a,#0d0d10)`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: "linear-gradient(45deg, transparent 46%, rgba(255,255,255,0.6) 50%, transparent 54%)",
            backgroundSize: "18px 18px",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center gap-1 px-3">
          {covers.length ? (
            covers.slice(0, 3).map((src, i) => (
              <motion.img
                key={src + i}
                src={src}
                alt=""
                animate={{ y: [0, i % 2 === 0 ? -5 : 5, 0] }}
                transition={{ duration: 4.5 + i * 0.6, repeat: Infinity, ease: "easeInOut" }}
                className="size-16 object-contain drop-shadow-[0_14px_22px_rgba(0,0,0,0.65)]"
                style={{ zIndex: 3 - i, marginInline: -6 }}
              />
            ))
          ) : (
            <svg viewBox="0 0 120 120" className="size-24" fill="none">
              <rect x="14" y="36" width="92" height="62" rx="12" fill="#1b1b21" stroke={c.accent} strokeWidth="2" />
              <rect x="14" y="36" width="92" height="20" rx="8" fill={c.accent} opacity=".9" />
              <path d="M60 56v30M46 71h28" stroke={c.accent} strokeWidth="5" strokeLinecap="round" opacity=".85" />
            </svg>
          )}
        </div>
        <span className="absolute left-3 top-3 rounded-full border border-white/12 bg-black/45 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white/70 backdrop-blur">
          {c.tag}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-[14.5px] font-extrabold tracking-tight">{c.name}</h3>
        <p className="mb-2 mt-0.5 line-clamp-2 min-h-[32px] text-[11px] leading-relaxed text-white/35">{c.desc}</p>

        <OddsBar odds={c.odds} />
        <div className="mb-3 mt-2 flex flex-wrap gap-1">
          {(Object.entries(c.odds) as [keyof typeof c.odds, number][])
            .filter(([, v]) => v > 0)
            .map(([r, v]) => (
              <span key={r} className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${RARITY_META[r].chip}`}>
                {(v * 100).toFixed(v < 0.1 ? 1 : 0)}%
              </span>
            ))}
          <span className="ml-auto rounded-md border border-white/8 px-1.5 py-0.5 text-[9px] font-bold text-white/30">
            {pool.length} предметов
          </span>
        </div>

        <Button
          full
          size="md"
          variant={c.category === "premium" ? "violet" : "primary"}
          onClick={onOpen}
          disabled={disabled}
          icon={<StarIcon className="size-3.5" />}
          className="mt-auto"
        >
          {c.price.toLocaleString("ru-RU")}
        </Button>
      </div>
    </motion.div>
  );
}

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "price", label: "Ценовые" },
  { id: "event", label: "Тематические" },
  { id: "premium", label: "High roller" },
  { id: "free", label: "Бесплатный" },
] as const;

export default function Cases() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addItem = useGame((s) => s.addItem);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);
  const claimFreeCaseCooldown = useGame((s) => s.claimFreeCaseCooldown);
  const freeCaseReadyAt = useGame((s) => s.freeCaseReadyAt);
  const luckBoost = useGame((s) => s.admin.luckBoost);
  const payout = useGame((s) => s.admin.payoutMultiplier);
  const freeCases = useGame((s) => s.admin.freeCases);

  const [strip, setStrip] = useState<RolledItem[] | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ gift: Gift; stars: number } | null>(null);
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const offsetRef = useRef(0);
  // the reel mounts above the grid, so a spin scrolls it into view — otherwise
  // the player has to scroll up themselves to watch the roll
  const reelAnchorRef = useRef<HTMLDivElement | null>(null);
  const freeMs = useCountdown(freeCaseReadyAt);
  const freeReady = freeMs === 0;

  const freeCase = useMemo(() => CASES.find((c) => c.id === FREE_CASE_CASE_ID) ?? CASES[0], []);
  // the free case has its own banner above, so it never appears in the grid
  const paidCases = useMemo(() => CASES.filter((c) => c.id !== FREE_CASE_CASE_ID), []);
  const visible = useMemo(
    () => (filter === "all" ? paidCases : paidCases.filter((c) => c.category === filter)),
    [filter, paidCases],
  );

  const runSpin = useCallback(
    (c: Case, free: boolean) => {
      if (spinning) return;
      if (free) {
        if (!freeReady) {
          toast({ kind: "error", title: "Кулдаун", message: "Бесплатный кейс ещё недоступен" });
          return;
        }
      } else if (!freeCases && !spendStars(c.price)) {
        toast({ kind: "error", title: "Недостаточно звёзд", message: `Нужно ${c.price.toLocaleString("ru-RU")} ★` });
        return;
      }

      const winner = rollCase(c, luckBoost ? 0.45 : 0, free ? FREE_CASE_MAX_STARS : Infinity);
      // frequent, small star drops; the free case keeps the same 10,000 ★ ceiling
      const starWin = luckBoost ? rollLuck(0.45) : rollStarDrop();
      const newStrip = buildCaseStrip(c, winner, WINNER_INDEX, STRIP_LEN);

      setActiveCase(c);
      setResult(null);
      setStrip(newStrip);
      setSpinning(true);
      offsetRef.current = -(WINNER_INDEX * STEP + ITEM_W / 2);

      // the reel block is inserted above the case grid: bring it to the top of
      // the screen right away so the roll is visible without scrolling by hand
      window.requestAnimationFrame(() => {
        const el = reelAnchorRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });

      window.setTimeout(() => {
        addItem(winner.id, free ? "free" : "case");
        if (starWin > 0) addStars(starWin);
        bumpStat("casesOpened");
        if (free) claimFreeCaseCooldown();
        setSpinning(false);
        setResult({ gift: winner, stars: starWin });
      }, 6200);
    },
    [addItem, addStars, bumpStat, claimFreeCaseCooldown, freeCases, freeReady, spinning, spendStars, toast],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-neon/80">Casino</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Кейсы</h1>
          <p className="mt-1 text-[12.5px] text-white/35">
            {CASES.length} кейсов · рулетка · реальные подарки Telegram
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
          <StarIcon className="size-4 text-neon" />
          <span className="text-[15px] font-extrabold tabular-nums">{stars.toLocaleString("ru-RU")}</span>
          <span className="text-[11px] text-white/30">доступно</span>
        </div>
      </header>

      {payout !== 100 && (
        <div className="rounded-2xl border border-mythic/30 bg-mythic/10 px-4 py-2 text-[11.5px] font-bold text-mythic">
          Админ-множитель выплат активен: ×{(payout / 100).toFixed(2)}
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl border border-neon/20 bg-gradient-to-r from-neon/[0.09] via-transparent to-violet/[0.07] p-4 md:p-5">
        <div className="pointer-events-none absolute -left-10 -top-16 size-48 rounded-full bg-neon/15 blur-[70px]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-neon/25 bg-neon/10">
              <svg viewBox="0 0 24 24" className="size-6 text-neon" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M4 8h16v11H4Zm0 0V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1M12 9v4" />
              </svg>
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">Бесплатный кейс</h2>
              <p className="text-[11.5px] text-white/40">
                {freeReady ? "Доступен прямо сейчас" : `Следующий через ${formatCountdown(freeMs)}`}
              </p>
            </div>
          </div>
          <Button size="md" onClick={() => runSpin(freeCase, true)} disabled={!freeReady || spinning} variant={freeReady ? "primary" : "ghost"}>
            {freeReady ? "Забрать бесплатно" : "Кулдаун"}
          </Button>
        </div>
      </div>

      {/* anchor for the auto-scroll when a spin starts — it must exist before
          the reel section mounts, otherwise the target position shifts while
          the section is still animating its height */}
      <div ref={reelAnchorRef} aria-hidden className="h-0 scroll-mt-4" />

      <AnimatePresence>
        {strip && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0c0c0f]">
              <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5">
                <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-white/40">{activeCase?.name} кейс</p>
                <button
                  onClick={() => {
                    if (!spinning) {
                      setStrip(null);
                      setResult(null);
                    }
                  }}
                  disabled={spinning}
                  className="text-[11px] font-bold text-white/30 hover:text-white/70 disabled:opacity-30"
                >
                  Скрыть
                </button>
              </div>

              <div className="relative h-[168px] overflow-hidden">
                <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-24 bg-gradient-to-r from-[#0c0c0f] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-24 bg-gradient-to-l from-[#0c0c0f] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 -translate-x-1/2">
                  <div className="h-full w-0.5 bg-neon shadow-[0_0_18px_3px_rgba(163,255,18,0.55)]" />
                  <div className="absolute -top-0 left-1/2 size-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-neon" />
                  <div className="absolute -bottom-0 left-1/2 size-0 -translate-x-1/2 border-x-[6px] border-b-[8px] border-x-transparent border-b-neon" />
                </div>

                <motion.div
                  className="absolute top-1/2 flex -translate-y-1/2 gap-2.5 pl-2 will-change-transform"
                  style={{ left: "50%" }}
                  initial={{ x: 0 }}
                  animate={{ x: offsetRef.current }}
                  transition={{ duration: 6, ease: [0.08, 0.82, 0.12, 1] }}
                >
                  {strip.map((entry) => {
                    const meta = RARITY_META[entry.gift.rarity];
                    return (
                      <div
                        key={entry.id}
                        className={`relative flex h-[140px] shrink-0 flex-col items-center justify-center rounded-xl border bg-gradient-to-b ${meta.ring} ${meta.gradient} from-white/[0.03] to-transparent`}
                        style={{ width: ITEM_W }}
                      >
                        <div
                          className="absolute inset-x-0 bottom-0 h-16 rounded-b-xl opacity-40"
                          style={{ background: `radial-gradient(80% 100% at 50% 100%, ${entry.gift.tint}55, transparent)` }}
                        />
                        <GiftArt gift={entry.gift} size={62} rounded="rounded-lg" />
                        <p className="relative mt-1.5 max-w-[110px] truncate px-1 text-[10.5px] font-bold text-white/75">
                          {entry.gift.variant === "Gift" ? entry.gift.name : entry.gift.variant}
                        </p>
                        <p className={`relative text-[9.5px] font-bold ${meta.text}`}>{meta.label}</p>
                      </div>
                    );
                  })}
                </motion.div>
              </div>

              <AnimatePresence>
                {result && !spinning && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-2 border-t border-white/6 px-4 py-5 text-center"
                  >
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/35">Выпало</p>
                    <motion.div
                      initial={{ scale: 0.7, rotate: -6 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${RARITY_META[result.gift.rarity].ring} ${RARITY_META[result.gift.rarity].glow}`}
                      style={{ background: `linear-gradient(120deg, ${result.gift.tint}22, transparent)` }}
                    >
                      <GiftArt gift={result.gift} size={46} rounded="rounded-xl" />
                      <div className="text-left">
                        <p className="text-[14.5px] font-extrabold tracking-tight">
                          {result.gift.name}
                          {result.gift.variant !== "Gift" && <span className="text-white/40"> · {result.gift.variant}</span>}
                        </p>
                        <p className={`text-[11px] font-bold ${RARITY_META[result.gift.rarity].text}`}>
                          {RARITY_META[result.gift.rarity].label} · {result.gift.stars.toLocaleString("ru-RU")} ★
                        </p>
                      </div>
                    </motion.div>
                    {result.stars > 0 && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.15, type: "spring", stiffness: 320, damping: 20 }}
                        className="flex items-center gap-2 rounded-full border border-neon/30 bg-neon/10 px-3 py-1.5"
                      >
                        <StarIcon className="size-3.5 text-neon" />
                        <span className="text-[12.5px] font-extrabold text-neon">+{result.stars} ★ бонус</span>
                      </motion.div>
                    )}
                    <p className="text-[11px] text-white/25">Добавлено в инвентарь</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? paidCases.length : paidCases.filter((c) => c.category === f.id).length;
          if (!count) return null;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                filter === f.id ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {f.label} <span className="text-white/25">{count}</span>
            </button>
          );
        })}
      </div>

      {/* scroll-synced heading: swipe the names, the grid below follows */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar rounded-2xl border border-white/8 bg-white/[0.02] p-2">
        {visible.map((c, i) => (
          <button
            key={c.id}
            onClick={() => document.getElementById(`case-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
            style={{ borderColor: `${c.accent}44` }}
          >
            <span className="grid size-5 place-items-center rounded-md text-[10px] font-black" style={{ background: `${c.accent}22`, color: c.accent }}>
              {i + 1}
            </span>
            <span className="text-[11.5px] font-extrabold tracking-tight text-white/80">{c.name}</span>
            <span className="text-[10.5px] font-bold tabular-nums" style={{ color: c.accent }}>
              {c.price.toLocaleString("ru-RU")} ★
            </span>
          </button>
        ))}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((c) => (
          <div key={c.id} id={`case-${c.id}`} className="scroll-mt-24">
            <CaseCard c={c} disabled={spinning || stars < c.price} onOpen={() => runSpin(c, false)} />
          </div>
        ))}
      </section>

      <div className="rounded-2xl border border-white/7 bg-white/[0.02] p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">Редкости</p>
        <div className="flex flex-wrap gap-2">
          {(["common", "rare", "epic", "legendary", "mythic"] as const).map((r) => (
            <RarityChip key={r} rarity={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
