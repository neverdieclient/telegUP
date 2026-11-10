import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useGame } from "../../store/useGame";
import { Button } from "../../components/ui/Button";
import { StarIcon } from "../../components/gifts/GiftArt";
import {
  boostLabel,
  formatBoostLeft,
  getStarEvent,
  loadStarEvent,
  startBoost,
  stopBoost,
  subscribeStarEvent,
  useBoost,
} from "../../lib/starBoost";

/**
 * Owner panel: «Двойные звёзды».
 *
 * A payout multiplier for a fixed stretch of time — or until it is switched
 * off. It scales everything a player EARNS (sales, case drops, daily fortune,
 * bonus grants), never the wallet they already have, and it is off the moment
 * the deadline passes even if nobody presses stop.
 */
export function BoostPanel() {
  const toast = useGame((s) => s.toast);
  const boost = useBoost();
  /** the stored row, so the pickers show what is actually live */
  const event = useSyncExternalStore(subscribeStarEvent, getStarEvent, getStarEvent);
  const active = !event.closed;

  const [mult, setMult] = useState(2);
  const [minutes, setMinutes] = useState<number | null>(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadStarEvent(true);
  }, []);

  // when something is already running, seed the pickers with it so «изменить»
  // shows the current settings instead of resetting to defaults
  useEffect(() => {
    if (!active) return;
    setMult(event.multiplier / 100);
    setMinutes(null);
  }, [active, event.multiplier]);

  const start = async () => {
    setBusy(true);
    const res = await startBoost({ multiplier: mult, minutes });
    setBusy(false);
    if (res.error) {
      toast({ kind: "error", title: "Не вышло", message: res.error });
      return;
    }
    toast({ kind: "success", title: `Звёзды ${boostLabel(mult)}`, message: minutes ? `на ${minutes} мин` : "до ручного выключения" });
  };

  const stop = async () => {
    setBusy(true);
    const res = await stopBoost();
    setBusy(false);
    if (res.error) toast({ kind: "error", title: "Не вышло", message: res.error });
    else toast({ kind: "success", title: "Бонус выключен" });
  };

  const MULTS = [1.5, 2, 3, 5];
  const TIMES: { label: string; value: number | null }[] = [
    { label: "30 мин", value: 30 },
    { label: "1 час", value: 60 },
    { label: "3 часа", value: 180 },
    { label: "24 часа", value: 1440 },
    { label: "до выключения", value: null },
  ];

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border p-4 ${
        boost.live
          ? "border-[#ffd64d]/40 bg-gradient-to-br from-[#ffd64d]/[0.10] to-transparent"
          : "border-white/8 bg-white/[0.025]"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13.5px] font-extrabold tracking-tight">Двойные звёзды</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/30">
            Включай когда хочешь и выключай когда хочешь. Умножает всё, что игроки зарабатывают:
            продажи, кейсы, фортуну, бонусы.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-[#ffd64d]/30 bg-[#ffd64d]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ffd64d]">
          boost
        </span>
      </div>

      {/* status */}
      <div
        className={`mb-3 rounded-2xl border px-3 py-2.5 ${
          boost.live ? "border-[#ffd64d]/35 bg-[#ffd64d]/[0.08]" : "border-white/8 bg-black/25"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-extrabold">
              {boost.live ? (
                <span className="inline-flex items-center gap-1.5">
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  >
                    ●
                  </motion.span>
                  Активно {boostLabel(boost.multiplier)}
                </span>
              ) : (
                "Выключено"
              )}
            </p>
            <p className="mt-0.5 text-[10.5px] text-white/40">
              {boost.live
                ? boost.msLeft > 0
                  ? `осталось ${formatBoostLeft(boost.msLeft)}`
                  : "до ручного выключения"
                : "игроки видят обычные звёзды"}
            </p>
          </div>
          <span className="flex items-center gap-0.5 text-[13px] font-extrabold tabular-nums text-neon">
            <StarIcon className="size-3" />
            {boost.live ? boostLabel(boost.multiplier) : "×1"}
          </span>
        </div>
      </div>

      {active ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void stop()}>
              {busy ? "…" : "Выключить"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void start()}>
              {busy ? "…" : `Изменить на ×${mult}`}
            </Button>
          </div>
          <div className="space-y-2 opacity-70">
            <div>
              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Множитель</p>
              <div className="flex flex-wrap gap-1.5">
                {MULTS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMult(m)}
                    className={`rounded-xl border px-3 py-1 text-[11.5px] font-bold tabular-nums transition-colors ${
                      mult === m
                        ? "border-[#ffd64d]/50 bg-[#ffd64d]/15 text-white"
                        : "border-white/8 text-white/40 hover:text-white/70"
                    }`}
                  >
                    ×{m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Новая длительность</p>
              <div className="flex flex-wrap gap-1.5">
                {TIMES.map((t) => (
                  <button
                    key={String(t.value)}
                    onClick={() => setMinutes(t.value)}
                    className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      minutes === t.value
                        ? "border-[#ffd64d]/50 bg-[#ffd64d]/15 text-white"
                        : "border-white/8 text-white/40 hover:text-white/70"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Множитель</p>
            <div className="flex flex-wrap gap-1.5">
              {MULTS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMult(m)}
                  className={`rounded-xl border px-3 py-1 text-[11.5px] font-bold tabular-nums transition-colors ${
                    mult === m
                      ? "border-[#ffd64d]/50 bg-[#ffd64d]/15 text-white"
                      : "border-white/8 text-white/40 hover:text-white/70"
                  }`}
                >
                  ×{m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Длительность</p>
            <div className="flex flex-wrap gap-1.5">
              {TIMES.map((t) => (
                <button
                  key={String(t.value)}
                  onClick={() => setMinutes(t.value)}
                  className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    minutes === t.value
                      ? "border-[#ffd64d]/50 bg-[#ffd64d]/15 text-white"
                      : "border-white/8 text-white/40 hover:text-white/70"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Button full size="sm" variant="primary" disabled={busy} onClick={() => void start()}>
            {busy ? "…" : `Включить ×${mult}`}
          </Button>
        </div>
      )}
    </section>
  );
}