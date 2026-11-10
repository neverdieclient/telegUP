import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useGiftIndex } from "../../lib/useCatalog";
import { useGame } from "../../store/useGame";
import { Button } from "../../components/ui/Button";
import { StarIcon } from "../../components/gifts/GiftArt";
import {
  closeDrop,
  dropsError,
  formatLeft,
  loadDrops,
  openDrop,
  subscribeDrops,
  useLiveDrops,
} from "../../data/drops";
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
 * Owner panel: «Лимитед-дроп».
 *
 * Pick any gift (a built-in Telegram collection or one the owner minted), set
 * how long it stays buyable, and press start. While it runs the gift wears a
 * limited frame in the market; when the timer runs out the gift stays in the
 * catalogue but its buy button locks. Nothing deletes player inventory.
 */
export function DropPanel() {
  const toast = useGame((s) => s.toast);
  const index = useGiftIndex();
  const drops = useLiveDrops(index);
  const error = useSyncExternalStore(subscribeDrops, dropsError, dropsError);

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ slug: string; name: string; image: string | null } | null>(null);
  const [hours, setHours] = useState<number | null>(24);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadDrops(true);
  }, []);

  // built-in collections plus owner-made gifts, gift level only
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: { slug: string; name: string; image: string | null }[] = [];
    for (const g of Object.values(index)) {
      if (g.kind !== "gift" || seen.has(g.slug)) continue;
      seen.add(g.slug);
      out.push({ slug: g.slug, name: g.name, image: g.image });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [index]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 12);
    return candidates.filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q)).slice(0, 24);
  }, [query, candidates]);

  const active = drops.find((d) => d.phase === "live" || d.phase === "scheduled") ?? null;

  const start = async () => {
    if (!picked) {
      toast({ kind: "error", title: "Выбери подарок" });
      return;
    }
    setBusy(true);
    const res = await openDrop(picked.slug, { hours, label: picked.name });
    setBusy(false);
    if (res.error) {
      toast({ kind: "error", title: "Не вышло", message: res.error });
      return;
    }
    toast({
      kind: "success",
      title: "Лимитед-дроп запущен",
      message: hours ? `${picked.name} · ${hours} ч` : `${picked.name} · бессрочно`,
    });
  };

  const finish = async () => {
    if (!active) return;
    setBusy(true);
    const res = await closeDrop(active.id);
    setBusy(false);
    if (res.error) toast({ kind: "error", title: "Не вышло", message: res.error });
    else toast({ kind: "success", title: "Дроп закрыт", message: "Подарок больше не продаётся" });
  };

  const HOURS: { label: string; value: number | null }[] = [
    { label: "6 ч", value: 6 },
    { label: "12 ч", value: 12 },
    { label: "1 день", value: 24 },
    { label: "3 дня", value: 72 },
    { label: "7 дней", value: 168 },
    { label: "без срока", value: null },
  ];

  return (
    <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13.5px] font-extrabold tracking-tight">Лимитед-дроп</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/30">
            Выбери подарок и сделай его лимитным. Пока идёт время — его можно купить, после — он
            остаётся в каталоге, но купить нельзя.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-[#ff5c8a]/30 bg-[#ff5c8a]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ff5c8a]">
          drop
        </span>
      </div>

      {error && (
        <p className="mb-2 rounded-xl border border-mythic/30 bg-mythic/10 px-3 py-2 text-[11px] font-bold text-mythic">
          {error}. Запусти `supabase/live-drops.sql`.
        </p>
      )}

      {/* current drop */}
      {active && (
        <div className="mb-3 rounded-2xl border border-[#ff5c8a]/25 bg-[#ff5c8a]/[0.06] p-3">
          <div className="flex items-center gap-2.5">
            {active.gift?.image ? (
              <img src={active.gift.image} alt="" className="size-10 shrink-0 object-contain" />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-black/40 text-[16px]">🎁</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-extrabold">
                {active.gift?.name ?? active.label ?? active.slug}
              </p>
              <p className="text-[10.5px] text-white/40">
                {active.phase === "scheduled"
                  ? "ещё не начался"
                  : active.ends_at
                    ? `осталось ${formatLeft(active.msLeft)}`
                    : "без ограничения"}
              </p>
            </div>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void finish()}>
              Закончить
            </Button>
          </div>
        </div>
      )}

      {/* picker */}
      <div className="space-y-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти подарок по названию…"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
        />

        {picked && (
          <div className="flex items-center gap-2 rounded-xl border border-neon/30 bg-neon/[0.06] px-2.5 py-2">
            {picked.image ? (
              <img src={picked.image} alt="" className="size-8 object-contain" />
            ) : (
              <span className="grid size-8 place-items-center rounded-md bg-black/40">🎁</span>
            )}
            <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold">{picked.name}</span>
            <button
              onClick={() => setPicked(null)}
              className="text-[11px] font-bold text-white/40 hover:text-white"
            >
              сменить
            </button>
          </div>
        )}

        {!picked && (
          <div className="grid max-h-[188px] grid-cols-4 gap-1.5 overflow-y-auto rounded-xl border border-white/8 bg-black/25 p-2 sm:grid-cols-6">
            {found.map((c) => (
              <button
                key={c.slug}
                onClick={() => setPicked(c)}
                className="flex flex-col items-center rounded-lg border border-white/8 p-1.5 hover:border-neon/40 hover:bg-white/5"
              >
                {c.image ? (
                  <img src={c.image} alt="" className="size-8 object-contain" />
                ) : (
                  <span className="grid size-8 place-items-center text-[15px]">🎁</span>
                )}
                <span className="mt-0.5 w-full truncate text-center text-[8.5px] font-bold text-white/55">
                  {c.name}
                </span>
              </button>
            ))}
            {!found.length && (
              <p className="col-span-4 py-5 text-center text-[11px] text-white/25 sm:col-span-6">
                Ничего не найдено
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {HOURS.map((h) => (
            <button
              key={String(h.value)}
              onClick={() => setHours(h.value)}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                hours === h.value
                  ? "border-[#ff5c8a]/50 bg-[#ff5c8a]/15 text-white"
                  : "border-white/8 text-white/40 hover:text-white/70"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        <Button full size="sm" variant="primary" disabled={busy || !picked} onClick={() => void start()}>
          {busy ? "…" : active ? "Заменить активный дроп" : "Запустить дроп"}
        </Button>
      </div>

      {/* history */}
      {drops.length > 1 && (
        <div className="mt-3">
          <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">История</p>
          <div className="space-y-1">
            {drops
              .filter((d) => d.id !== active?.id)
              .slice(0, 6)
              .map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-lg border border-white/6 bg-black/20 px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-white/60">
                    {d.gift?.name ?? d.label ?? d.slug}
                  </span>
                  <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-white/25">
                    {d.phase === "ended" ? "завершён" : d.phase === "live" ? "идёт" : "ожидание"}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

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
      toast({ kind: "error", title: "Не вышло", message: res.error + " · запусти supabase/live-drops.sql" });
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