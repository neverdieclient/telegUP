import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { GIFTS, RARITY_META, type Gift } from "../data/gifts";
import { useAllGifts, useGiftIndex } from "../lib/useCatalog";
import { boostedChance, chance, rand } from "../lib/rng";
import { useGame } from "../store/useGame";
import { GiftArt, StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";

type Phase = "idle" | "spinning" | "win" | "lose";

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 134;
/**
 * Compact needle: a short head that sits just inside the ring band.
 * Successive versions kept shrinking it — it now stops well short of the
 * hub so it reads as a small pointer rather than a long spoke.
 */
const NEEDLE_LEN = R - 46;

/**
 * Payout odds: pure fair roll, no house edge.
 * Chance = value of the source divided by value of the target, so a 2×
 * upgrade is a true 50/50 and the shown percent is exactly the real odds.
 */
const HOUSE_EDGE = 1.0;

function calcChance(from: Gift, to: Gift) {
  const raw = (from.stars / to.stars) * 100;
  return Math.min(95, Math.max(0.4, raw * HOUSE_EDGE));
}

/** Preset multipliers: target value = source value × mult, chance = 100 / mult. */
const PRESETS = [1.5, 2, 3, 5, 8, 10, 25, 50, 100] as const;

function presetChance(mult: number) {
  return Math.min(95, Math.max(0.4, (100 / mult) * HOUSE_EDGE));
}

function formatMult(mult: number) {
  return `×${Number.isInteger(mult) ? mult : mult.toFixed(1)}`;
}

/** Closest real gift to `value` stars, for building preset upgrades. */
function nearestGift(value: number, excludeId?: string, pool: Gift[] = GIFTS): Gift | null {
  let best: Gift | null = null;
  let bestDiff = Infinity;
  for (const g of pool) {
    if (g.id === excludeId) continue;
    const diff = Math.abs(g.stars - value) / value;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = g;
    }
  }
  return best;
}

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function arcPath(fraction: number) {
  const f = Math.min(0.9999, Math.max(0.0001, fraction));
  const [sx, sy] = polar(R, 0);
  const [ex, ey] = polar(R, f * 360);
  const large = f > 0.5 ? 1 : 0;
  return `M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`;
}

function GiftPick({
  gift,
  title,
  onClick,
  caption,
  disabled,
  value,
}: {
  gift: Gift | null;
  title?: string;
  onClick?: () => void;
  caption: string;
  disabled?: boolean;
  value: string | number | null;
}) {
  const meta = gift ? RARITY_META[gift.rarity] : null;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "group relative flex w-full flex-col overflow-hidden rounded-3xl border p-3.5 text-left transition-all duration-300",
        gift
          ? "border-neon/40 bg-neon/[0.06] shadow-[0_0_50px_-24px_rgba(163,255,18,0.9)]"
          : "border-white/8 bg-white/[0.028] hover:border-white/18 hover:bg-white/[0.05]",
        disabled ? "cursor-default opacity-90" : "",
      ].join(" ")}
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">{caption}</p>

      <div
        className="relative grid h-[104px] place-items-center overflow-hidden rounded-2xl border border-white/6"
        style={{
          background: gift
            ? `radial-gradient(120% 100% at 50% 0%, ${gift.tint}30, #0f0f13 70%)`
            : "linear-gradient(180deg,#141419,#0d0d10)",
        }}
      >
        {gift ? (
          <motion.div whileHover={{ scale: 1.06 }} transition={{ type: "spring", stiffness: 300 }}>
            <GiftArt gift={gift} size={74} rounded="rounded-xl" />
          </motion.div>
        ) : (
          <svg viewBox="0 0 24 24" className="size-8 text-white/15" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-extrabold tracking-tight">{title ?? gift?.name ?? "Выбрать"}</p>
          <p className={`truncate text-[10.5px] font-bold ${meta ? meta.text : "text-white/25"}`}>
            {gift ? (gift.variant === "Gift" ? meta!.label : `${meta!.label} · ${gift.variant}`) : "не выбран"}
          </p>
        </div>
        {value !== null && (
          <p className="shrink-0 text-[12px] font-extrabold tabular-nums text-white/80">
            {typeof value === "number" ? value.toLocaleString("ru-RU") : value}★
          </p>
        )}
      </div>
    </button>
  );
}

export default function UpgradePage() {
  const inventory = useGame((s) => s.inventory);
  const GIFT_BY_ID = useGiftIndex();
  const GIFTS = useAllGifts();
  const removeItem = useGame((s) => s.removeItem);
  const addItem = useGame((s) => s.addItem);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);
  const alwaysWin = useGame((s) => s.admin.alwaysWinUpgrade);
  /** owner-granted luck: 100 = honest odds, 200 = ×2, 10000 = ×100 */
  const luckBoost = useGame((s) => s.admin.upgradeLuck);

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>("");
  const [presetMult, setPresetMult] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [angle, setAngle] = useState(-90);
  const [pickerOpen, setPickerOpen] = useState<"source" | "target" | null>(null);

  /** Target-picker filters: rarity, price band and a free-text search. */
  const [pickRarity, setPickRarity] = useState<"all" | "common" | "rare" | "epic" | "legendary" | "mythic">("all");
  const [pickBand, setPickBand] = useState<"all" | "small" | "mid" | "big" | "huge">("all");
  const [pickQuery, setPickQuery] = useState("");

  const sourceItem = inventory.find((i) => i.id === sourceId) ?? null;
  const source = sourceItem ? GIFT_BY_ID[sourceItem.giftId] : null;
  const target = targetId ? GIFT_BY_ID[targetId] ?? null : null;

  const baseChance = useMemo(
    () => (presetMult ? presetChance(presetMult) : source && target ? calcChance(source, target) : 0),
    [presetMult, source, target],
  );
  /**
   * What the wheel actually rolls: the honest chance scaled by the player's
   * luck boost. Everything below (arc, label, roll) reads this one value, so
   * the displayed percentage can never disagree with the outcome.
   */
  const chancePct = boostedChance(baseChance, luckBoost);
  const targetStars = source && presetMult ? Math.round(source.stars * presetMult) : 0;
  const canSpin =
    !!source &&
    (presetMult ? !!target : !!target) &&
    phase !== "spinning" &&
    (presetMult ? true : !!target && target.stars > source.stars);

  /** Pick a multiplier: snap the target to the real gift closest to it. */
  const applyPreset = (mult: number) => {
    if (!source) {
      toast({ kind: "info", title: "Сначала выбери подарок", message: "Множитель считается от его цены" });
      return;
    }
    setPresetMult(mult);
    setPhase("idle");
    const idea = nearestGift(source.stars * mult, source.id, GIFTS);
    if (idea) setTargetId(idea.id);
    else setTargetId("");
  };

  const suggestions = useMemo(() => {
    const base = source ? source.stars : 50;
    return [...GIFTS]
      .filter((g) => g.stars > base && g.stars <= base * 12)
      .sort((a, b) => a.stars - b.stars)
      .slice(0, 14);
  }, [source]);

  /** Price bands for the target picker, tuned so "small & expensive" is one tap. */
  const BANDS: { id: "all" | "small" | "mid" | "big" | "huge"; label: string; min: number; max: number }[] = [
    { id: "all", label: "Все", min: 0, max: Infinity },
    { id: "small", label: "Маленькие дорогие", min: 8_000, max: 60_000 },
    { id: "mid", label: "Средние", min: 60_000, max: 250_000 },
    { id: "big", label: "Большие", min: 250_000, max: 1_000_000 },
    { id: "huge", label: "Гиганты", min: 1_000_000, max: Infinity },
  ];

  /**
   * Targets for the picker: everything worth more than the source (so the
   * upgrade can actually win), narrowed by the active filters.
   */
  const targetList = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    const band = BANDS.find((b) => b.id === pickBand)!;
    return [...GIFTS]
      .filter((g) => (source ? g.stars > source.stars : true))
      .filter((g) => (pickRarity === "all" ? true : g.rarity === pickRarity))
      .filter((g) => g.stars >= band.min && g.stars <= band.max)
      .filter((g) => (q ? `${g.name} ${g.variant}`.toLowerCase().includes(q) : true))
      .sort((a, b) => a.stars - b.stars);
  }, [source, pickRarity, pickBand, pickQuery]);

  const doUpgrade = () => {
    if (!sourceItem || !target || !source) return;
    if (!presetMult && target.stars <= source.stars) {
      toast({ kind: "error", title: "Неверная цель", message: "Цель должна быть дороже исходника" });
      return;
    }

    const success = alwaysWin || chance(chancePct);
    const landing = success
      ? rand() * (chancePct / 100) * 360
      : (chancePct / 100) * 360 + rand() * (360 - (chancePct / 100) * 360);
    const turns = 4 + Math.floor(rand() * 2);
    const finalAngle = turns * 360 + landing;

    setPhase("spinning");
    setAngle(finalAngle);

    window.setTimeout(() => {
      removeItem(sourceItem.id);
      if (success) {
        addItem(target.id, "upgrade");
        bumpStat("upgradesWon");
        setPhase("win");
        toast({ kind: "success", title: "Апгрейд успешен!", message: `${source.variant} → ${target.variant}` });
      } else {
        bumpStat("upgradesLost");
        setPhase("lose");
        toast({ kind: "error", title: "Предмет сгорел", message: source.variant });
      }
      setSourceId(null);
      setTargetId("");
    }, 4400);
  };

  const sourcePicker = pickerOpen === "source";
  const targetPicker = pickerOpen === "target";

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-violet">Upgrade</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Апгрейд</h1>
          <p className="mt-1 text-[12.5px] text-white/35">
            Обменяй подарок на более дорогой. Провал — предмет сгорает.
          </p>
        </div>
        {alwaysWin && (
          <span className="inline-flex items-center gap-2 self-start rounded-xl border border-mythic/30 bg-mythic/10 px-3 py-2 text-[11px] font-bold text-mythic">
            <span className="size-1.5 animate-pulse rounded-full bg-mythic" />
            ADMIN: 100% win
          </span>
        )}
        {!alwaysWin && luckBoost > 100 && (
          <span className="inline-flex items-center gap-2 self-start rounded-xl border border-neon/35 bg-neon/10 px-3 py-2 text-[11px] font-bold text-neon">
            <span className="size-1.5 animate-pulse rounded-full bg-neon" />
            Бонус удачи: шанс ×{luckBoost / 100}
          </span>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px_1fr]">
        <GiftPick
          caption="Твой подарок"
          gift={source}
          value={source ? source.stars : null}
          onClick={() => setPickerOpen("source")}
          disabled={phase === "spinning"}
        />

        <div className="relative flex flex-col items-center justify-center rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-transparent p-4 backdrop-blur-xl">
          <div className="relative" style={{ width: SIZE * 0.94, height: SIZE * 0.94 }}>
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
              <defs>
                <linearGradient id="winGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#a3ff12" />
                  <stop offset="1" stopColor="#4ade80" />
                </linearGradient>
                <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1f1f25" strokeWidth="22" />
              <path
                d={arcPath(chancePct / 100)}
                fill="none"
                stroke="url(#winGrad)"
                strokeWidth="22"
                strokeLinecap="round"
                filter={phase === "win" ? "url(#ringGlow)" : undefined}
                opacity={chancePct > 0 ? 1 : 0.2}
              />
              <circle cx={CX} cy={CY} r={R - 22} fill="none" stroke="#ffffff10" strokeWidth="1" />
              <circle cx={CX} cy={CY} r={R + 22} fill="none" stroke="#ffffff08" strokeWidth="1" />
            </svg>

            <motion.div
              className="absolute inset-0"
              animate={{ rotate: phase === "idle" ? 0 : angle }}
              transition={phase === "spinning" ? { duration: 4.2, ease: [0.08, 0.85, 0.1, 1] } : { duration: 0 }}
              style={{ transformOrigin: "50% 50%" }}
            >
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2">
                {/* compact tapered needle: sits inside the ring band, never pierces the hub */}
                <svg
                  width="16"
                  height={NEEDLE_LEN + 2}
                  viewBox={`0 0 16 ${NEEDLE_LEN + 2}`}
                  className="absolute left-1/2 top-0 -translate-x-1/2 overflow-visible"
                  style={{ filter: "drop-shadow(0 0 5px rgba(255,255,255,0.5))" }}
                >
                  <defs>
                    <linearGradient id="needleShaft" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
                      <stop offset="1" stopColor="#ffffff" stopOpacity="0.5" />
                    </linearGradient>
                  </defs>
                  {/* slim arrowhead */}
                  <path d={`M8 0 L12.4 9 L8 6.8 L3.6 9 Z`} fill="#ffffff" />
                  {/* hairline shaft */}
                  <path
                    d={`M6.9 8.4 L9.1 8.4 L8.4 ${NEEDLE_LEN} L7.6 ${NEEDLE_LEN} Z`}
                    fill="url(#needleShaft)"
                  />
                </svg>
              </div>
            </motion.div>

            <div className="absolute inset-0 grid place-items-center">
              <div className="flex size-[128px] flex-col items-center justify-center rounded-full border border-white/10 bg-[#0c0c0f]/95 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_50px_-20px_rgba(0,0,0,1)]">
                <AnimatePresence mode="wait">
                  {phase === "win" || phase === "lose" ? (
                    <motion.div
                      key={phase}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center"
                    >
                      <span className={`font-display text-2xl font-black ${phase === "win" ? "text-neon" : "text-mythic"}`}>
                        {phase === "win" ? "WIN" : "LOST"}
                      </span>
                      <span className="text-[10px] text-white/30">{phase === "win" ? "подарок получен" : "предмет сгорел"}</span>
                    </motion.div>
                  ) : (
                    <motion.div key="pct" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
                      <span className="font-display text-[34px] font-black leading-none tabular-nums text-white">
                        {chancePct.toFixed(1)}
                        <span className="text-lg text-white/40">%</span>
                      </span>
                      <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/30">шанс</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <Button full size="lg" variant="violet" className="mt-4" disabled={!canSpin} onClick={doUpgrade}>
            {phase === "spinning" ? "Крутится…" : "Апгрейд"}
          </Button>

          <div className="mt-3 w-full">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/25">множитель</span>
              {presetMult !== null && (
                <button
                  onClick={() => setPresetMult(null)}
                  className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-white/30 hover:text-white/70"
                >
                  сбросить
                </button>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {PRESETS.map((m) => {
                const on = presetMult === m;
                return (
                  <button
                    key={m}
                    onClick={() => applyPreset(m)}
                    disabled={phase === "spinning"}
                    className={[
                      "flex flex-col items-center rounded-xl border py-1.5 transition-all disabled:opacity-40",
                      on
                        ? "border-neon/45 bg-neon/[0.12] shadow-[0_0_24px_-12px_rgba(163,255,18,0.9)]"
                        : "border-white/8 bg-white/[0.025] hover:border-white/18 hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <span className={`text-[11.5px] font-extrabold tabular-nums ${on ? "text-neon" : "text-white/70"}`}>
                      {formatMult(m)}
                    </span>
                    <span className={`text-[9px] font-bold tabular-nums ${on ? "text-neon/70" : "text-white/25"}`}>
                      {presetChance(m) >= 10 ? `${Math.round(presetChance(m))}%` : `${presetChance(m).toFixed(1)}%`}
                    </span>
                  </button>
                );
              })}
            </div>
            {presetMult !== null && source && (
              <p className="mt-1.5 text-center text-[10px] tabular-nums text-white/30">
                цель ≈ {targetStars.toLocaleString("ru-RU")}★
                {target ? ` · «${target.variant}»` : ""}
              </p>
            )}
          </div>

          {source && target && target.stars <= source.stars && presetMult === null && (
            <p className="mt-2 text-center text-[11px] text-mythic/80">Цель должна быть дороже</p>
          )}
          {!source && <p className="mt-2 text-center text-[11px] text-white/30">Выбери подарок слева</p>}
        </div>

        <GiftPick
          caption="Желаемый подарок"
          gift={target}
          value={target ? target.stars : null}
          onClick={() => setPickerOpen("target")}
          disabled={phase === "spinning"}
        />
      </div>

      <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-extrabold tracking-tight">Быстрый множитель</h2>
          <span className="text-[11px] text-white/30">выбери ×— и цель подберётся сама</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {PRESETS.map((m) => {
            const on = presetMult === m;
            const ch = presetChance(m);
            return (
              <button
                key={m}
                onClick={() => applyPreset(m)}
                className={[
                  "relative flex flex-col items-center gap-0.5 overflow-hidden rounded-2xl border p-2.5 transition-all",
                  on
                    ? "border-neon/45 bg-neon/[0.1] shadow-[0_0_30px_-14px_rgba(163,255,18,0.9)]"
                    : "border-white/7 bg-black/25 hover:border-white/18 hover:bg-white/[0.05]",
                ].join(" ")}
              >
                <span className={`font-display text-[16px] font-black tabular-nums ${on ? "text-neon" : "text-white/80"}`}>
                  {formatMult(m)}
                </span>
                <span className={`text-[9.5px] font-bold tabular-nums ${on ? "text-neon/70" : "text-white/30"}`}>
                  {ch >= 10 ? `${Math.round(ch)}%` : `${ch.toFixed(1)}%`}
                </span>
                {source && (
                  <span className="text-[8.5px] tabular-nums text-white/20">
                    {(source.stars * m).toLocaleString("ru-RU")}★
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-extrabold tracking-tight">Быстрый выбор цели</h2>
          <span className="text-[11px] text-white/30">шанс считается автоматически</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
          {suggestions.map((g) => {
            const ch = source ? calcChance(source, g) : null;
            return (
              <button
                key={g.id}
                onClick={() => {
                  setTargetId(g.id);
                  setPresetMult(null);
                }}
                className={[
                  "flex flex-col items-center gap-1 rounded-xl border p-2 transition-all",
                  targetId === g.id && presetMult === null
                    ? "border-neon/40 bg-neon/[0.07]"
                    : "border-white/6 bg-black/25 hover:border-white/15",
                ].join(" ")}
              >
                <GiftArt gift={g} size={36} rounded="rounded-lg" />
                <p className="w-full truncate text-center text-[9.5px] font-bold text-white/60">{g.variant}</p>
                <p className="text-[9px] font-bold tabular-nums text-white/35">
                  {ch !== null ? `${ch.toFixed(1)}%` : `${g.stars.toLocaleString("ru-RU")}★`}
                </p>
              </button>
            );
          })}
          {!suggestions.length && <p className="col-span-full py-6 text-center text-[11.5px] text-white/25">Выбери исходник — подскажем цели</p>}
        </div>
      </section>

      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPickerOpen(null)}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="h-[74dvh] w-full max-w-2xl overflow-hidden rounded-t-3xl border border-white/10 bg-[#0c0c0f] sm:h-auto sm:max-h-[80dvh] sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <h3 className="text-[14px] font-extrabold">{sourcePicker ? "Выбери свой подарок" : "Выбери цель"}</h3>
                <button onClick={() => setPickerOpen(null)} className="text-[12px] font-bold text-white/40 hover:text-white">
                  Закрыть
                </button>
              </div>
              <div className="max-h-[64dvh] overflow-y-auto p-4">
                {targetPicker && (
                  <div className="mb-3 space-y-2">
                    <input
                      value={pickQuery}
                      onChange={(e) => setPickQuery(e.target.value)}
                      placeholder="Поиск по названию…"
                      className="h-9 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[12.5px] outline-none placeholder:text-white/20 focus:border-neon/40"
                    />
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                      {BANDS.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => setPickBand(b.id)}
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-[10.5px] font-bold transition-colors ${
                            pickBand === b.id ? "bg-white/12 text-white" : "text-white/35 hover:bg-white/5"
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                      {(["all", "common", "rare", "epic", "legendary", "mythic"] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setPickRarity(r)}
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-[10.5px] font-bold transition-colors ${
                            pickRarity === r
                              ? "bg-white/12 text-white"
                              : r === "all"
                                ? "text-white/35 hover:bg-white/5"
                                : `${RARITY_META[r].text} opacity-60 hover:opacity-100`
                          }`}
                        >
                          {r === "all" ? "Вся редкость" : RARITY_META[r].label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/25">Найдено: {targetList.length}</p>
                  </div>
                )}
                {sourcePicker && inventory.length === 0 && (
                  <div className="py-16 text-center">
                    <p className="text-[13px] font-bold text-white/50">Инвентарь пуст</p>
                    <p className="mt-1 text-[11.5px] text-white/25">Открой кейс, чтобы получить подарок</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {(sourcePicker
                    ? inventory.map((i) => ({ key: i.id, gift: GIFT_BY_ID[i.giftId] }))
                    : targetPicker
                      ? targetList.slice(0, 120).map((g) => ({ key: g.id, gift: g }))
                      : []
                  )
                    .filter((x) => x.gift)
                    .map(({ key, gift }) => {
                      const meta = RARITY_META[gift.rarity];
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            if (sourcePicker) setSourceId(key);
                            else setTargetId(gift.id);
                            setPresetMult(null);
                            setPhase("idle");
                            setPickerOpen(null);
                          }}
                          className={`flex flex-col items-center gap-1 rounded-2xl border p-2.5 transition-all hover:-translate-y-0.5 ${meta.ring} hover:bg-white/[0.06]`}
                          style={{ background: `linear-gradient(180deg, ${gift.tint}18, rgba(255,255,255,0.02))` }}
                        >
                          <GiftArt gift={gift} size={48} rounded="rounded-lg" />
                          <p className="w-full truncate text-center text-[10.5px] font-bold text-white/75">{gift.variant}</p>
                          <p className="w-full truncate text-center text-[8.5px] text-white/30">{gift.name}</p>
                          <p className={`text-[9.5px] font-bold ${meta.text}`}>{gift.stars.toLocaleString("ru-RU")} ★</p>
                        </button>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-start gap-2.5 rounded-2xl border border-white/7 bg-white/[0.02] p-3.5">
        <StarIcon className="mt-0.5 size-4 shrink-0 text-white/25" />
        <p className="text-[11px] leading-relaxed text-white/30">
          Шанс = стоимость исходника / стоимость цели — честный рандом без комиссии. Например, ×2 — это
          ровно 50 на 50. Внутри одной коллекции модели апгрейдятся друг в друга, как в Telegram.
          {alwaysWin && " Режим администратора включён: любой апгрейд проходит."}
        </p>
      </div>
    </div>
  );
}