import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useGame, FORTUNE_COOLDOWN_MS, FORTUNE_PRIZES } from "../store/useGame";
import { StarIcon } from "./gifts/GiftArt";
import { Button } from "./ui/Button";

/** "2 ч 14 мин" / "5 мин 12 с" from a millisecond budget. */
function formatLeft(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин ${s} с`;
  return `${s} с`;
}

/**
 * «Удача дня» — the free earner that replaced the tap-clicker.
 *
 * No stake: one spin per cooldown window, worth a small random amount of
 * stars. It keeps a small income flowing for a patient player without giving
 * away the staked mini-games for free.
 */
export function FortuneGame() {
  const stars = useGame((s) => s.stars);
  const spinFortune = useGame((s) => s.spinFortune);
  const toast = useGame((s) => s.toast);

  const [readyIn, setReadyIn] = useState(() => useGame.getState().fortuneReadyIn());
  const [prize, setPrize] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);

  // keep the countdown ticking while the page is open
  useEffect(() => {
    const tick = () => setReadyIn(useGame.getState().fortuneReadyIn());
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);

  const ready = readyIn <= 0;

  const onSpin = () => {
    if (!ready || spinning) return;
    setSpinning(true);
    setPrize(null);
    // a short reel so the result feels earned rather than instant
    let ticks = 0;
    const reel = window.setInterval(() => {
      setPrize(FORTUNE_PRIZES[Math.floor(Math.random() * FORTUNE_PRIZES.length)]);
      ticks++;
      if (ticks > 12) {
        window.clearInterval(reel);
        const won = spinFortune();
        setPrize(won || FORTUNE_PRIZES[0]);
        setSpinning(false);
        setReadyIn(useGame.getState().fortuneReadyIn());
        if (won > 0) {
          toast({ kind: "success", title: "Удача дня!", message: `+${won.toLocaleString("ru-RU")} ★` });
        }
      }
    }, 70);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/8 bg-white/[0.028] p-5 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-0 opacity-60 grid-bg" />
      <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-legendary/15 blur-3xl" />

      <div className="relative flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-extrabold tracking-tight">Удача дня</h2>
          <p className="text-[11.5px] text-white/35">Бесплатный спин раз в {formatCooldown(FORTUNE_COOLDOWN_MS)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">Баланс</p>
          <p className="text-[13px] font-extrabold tabular-nums text-neon">
            {stars.toLocaleString("ru-RU")}★
          </p>
        </div>
      </div>

      <div className="relative mt-4 flex flex-col items-center">
        <motion.div
          animate={spinning ? { rotate: [0, -4, 4, -4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.35, repeat: spinning ? Infinity : 0 }}
          className="grid size-40 place-items-center rounded-full border border-legendary/25 bg-gradient-to-b from-legendary/[0.16] to-transparent shadow-[0_0_60px_-16px_rgba(255,204,51,0.55)] sm:size-44"
        >
          <span className="pointer-events-none absolute inset-0 rounded-full border border-white/5" />
          <AnimatePresence mode="wait">
            <motion.div
              key={prize ?? "idle"}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col items-center"
            >
              <StarIcon
                className={`size-12 drop-shadow-[0_0_18px_rgba(255,204,51,0.7)] ${
                  prize && !spinning ? "text-legendary" : "text-white/30"
                }`}
              />
              <p
                className={`mt-1.5 text-[17px] font-black tabular-nums ${
                  prize && !spinning ? "text-legendary" : "text-white/30"
                }`}
              >
                {prize ? `+${prize}` : "?"}
              </p>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <div className="mt-4 w-full max-w-xs">
          {ready ? (
            <Button full size="lg" variant="violet" onClick={onSpin} disabled={spinning}>
              {spinning ? "Крутится…" : "Испытать удачу · бесплатно"}
            </Button>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/30 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                Следующий спин
              </p>
              <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-white/70">
                через {formatLeft(readyIn)}
              </p>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[10.5px] leading-relaxed text-white/30">
          Призы от {FORTUNE_PRIZES[0]}★ до {FORTUNE_PRIZES[FORTUNE_PRIZES.length - 1].toLocaleString("ru-RU")}★ ·
          без ставки, просто заходи
        </p>
      </div>
    </div>
  );
}

function formatCooldown(ms: number) {
  const h = Math.round(ms / 3_600_000);
  return `${h} ч`;
}
