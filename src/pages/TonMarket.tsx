import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useGame } from "../store/useGame";
import {
  TON_LOTS,
  TON_TIER_META,
  TON_TOPUPS,
  TON_ROTATION_MS,
  starsForTon,
  tonLotsAt,
  tonRotation,
  tonRotationLeft,
  type TonItem,
} from "../data/store2";
import { claimTonItem, releaseTonItem, useTonClaims } from "../lib/tonMarket";
import { LIST_ITEM, SPRING_SOFT, SPRING_SNAPPY } from "../lib/motion";
import { TonIcon } from "../components/ui/TonIcon";
import { StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";

type Tab = "username" | "number";

/** «1 ч 12 мин» — сколько ждать нового прилавка. */
function untilRotation(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} мин`;
  return `${h} ч ${m} мин`;
}

const fmtTon = (ton: number) =>
  ton.toLocaleString("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/**
 * Таймер ротации живёт в своём компоненте.
 *
 * Если бы `left` был состоянием страницы, каждое обновление таймера
 * перерисовывало бы все 50 карточек прилавка — ровно в тот момент, когда
 * человек листает список. Так тикает только маленькая подпись и полоса.
 */
function RotationHint() {
  const [left, setLeft] = useState(() => tonRotationLeft());
  useEffect(() => {
    const t = window.setInterval(() => setLeft(tonRotationLeft()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <p className="text-[10.5px] text-white/30">
      лотов всего {TON_LOTS} · обновление через{" "}
      <span className="font-bold text-white/50">{untilRotation(left)}</span>
    </p>
  );
}

function RotationBar() {
  const [left, setLeft] = useState(() => tonRotationLeft());
  useEffect(() => {
    const t = window.setInterval(() => setLeft(tonRotationLeft()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  // scaleX, а не width: ширина пересчитывает layout каждый кадр, transform — нет
  return (
    <div className="h-1 overflow-hidden rounded-full bg-white/8">
      <motion.div
        className="h-full w-full origin-left rounded-full bg-gradient-to-r from-[#4aa8ff] to-[#7ad9ff]"
        initial={false}
        animate={{ scaleX: Math.max(0.015, Math.min(1, left / TON_ROTATION_MS)) }}
        transition={{ duration: 0.7, ease: "linear" }}
      />
    </div>
  );
}

/**
 * TON-маркет.
 *
 * Здесь происходит две вещи:
 *
 *  1. **Пополнение** — TON покупается за звёзды. Реальных денег в проекте нет,
 *     поэтому «пополнить» = обменять заработанные звёзды на TON.
 *  2. **Покупка** — юзернейм или номер за TON. Списывается сразу, вместе с
 *     выдачей.
 *
 * Прилавок пересобирается раз в час и одинаков у всех игроков (см. `tonLotsAt`),
 * поэтому «занят» — это не локальное украшение: лот, который уже чей-то, нельзя
 * купить ни сейчас, ни после ротации.
 */
export default function TonMarket() {
  const ton = useGame((s) => s.ton);
  const stars = useGame((s) => s.stars);
  const tonOwned = useGame((s) => s.tonOwned);
  const tonTaken = useGame((s) => s.tonTaken);
  const profile = useGame((s) => s.profile);
  const buyTon = useGame((s) => s.buyTon);
  const buyTonItem = useGame((s) => s.buyTonItem);
  const toast = useGame((s) => s.toast);

  // «занято» приходит с сервера — один запрос на страницу, не на карточку
  useTonClaims();

  const [tab, setTab] = useState<Tab>("username");
  const [confirm, setConfirm] = useState<TonItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // час ротации: пересобираем прилавок ровно тогда, когда он меняется.
  // `setHour` с тем же числом React игнорирует, поэтому раз в 15 секунд
  // перерисовки не происходит — список остаётся на месте.
  const [hour, setHour] = useState(() => tonRotation());

  useEffect(() => {
    const timer = window.setInterval(() => setHour(tonRotation()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const lots = useMemo(() => tonLotsAt(hour), [hour]);
  const items = useMemo(() => lots.filter((i) => i.kind === tab), [lots, tab]);

  const mine = useMemo(() => new Set(tonOwned), [tonOwned]);

  const stateOf = (item: TonItem): "mine" | "taken" | "free" => {
    if (mine.has(item.id)) return "mine";
    if (tonTaken[item.id]) return "taken";
    return "free";
  };

  /**
   * Покупка лота.
   *
   * Порядок важен: сначала спрашиваем сервер («никто не занял?»), только потом
   * списываем TON. Если списание почему-то не прошло, бронь снимается — иначе
   * лот остался бы занятым без покупки.
   */
  const buy = async (item: TonItem) => {
    if (busy) return;
    if (stateOf(item) !== "free") return;
    if (ton + 1e-9 < item.ton) {
      toast({
        kind: "error",
        title: "Не хватает TON",
        message: `Нужно ${fmtTon(item.ton)} TON — пополни за звёзды`,
      });
      return;
    }

    setBusy(item.id);
    const claimed = await claimTonItem(item.id, item.label, item.kind, item.ton);
    if (claimed === false) {
      setBusy(null);
      setConfirm(null);
      toast({
        kind: "error",
        title: "Уже занято",
        message: `${item.label} уже чей-то — выбери другой лот`,
      });
      return;
    }

    const res = buyTonItem(item);
    if (!res.ok && claimed === true) await releaseTonItem(item.id);
    setBusy(null);
    setConfirm(null);

    if (res.ok) {
      toast({ kind: "success", title: "Забрано", message: item.label });
      return;
    }
    toast({
      kind: "error",
      title:
        res.reason === "taken"
          ? "Уже занято"
          : res.reason === "ton"
            ? "Не хватает TON"
            : "Не получилось",
      message:
        res.reason === "taken"
          ? `${item.label} уже чей-то`
          : res.reason === "ton"
            ? "Пополни TON за звёзды"
            : "Попробуй другой лот",
    });
  };

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-3xl border border-white/8 bg-[linear-gradient(140deg,rgba(74,168,255,0.10),rgba(255,255,255,0.015))] p-5 md:p-6">
        <div className="pointer-events-none absolute -left-10 -top-16 size-56 rounded-full bg-[#4aa8ff]/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">вторая валюта</p>
            <h1 className="mt-2 flex items-center gap-2 font-display text-[28px] font-black leading-none tracking-tight">
              <TonIcon size={26} /> TON-маркет
            </h1>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-white/45">
              Юзернеймы и красивые номера продаются только за TON, а TON покупается за звёзды.
              Прилавок обновляется раз в час — и каждый лот существует в одном экземпляре.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">TON</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[20px] font-black tabular-nums">
                <TonIcon size={17} />
                {fmtTon(ton)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">звёзды</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[20px] font-black tabular-nums">
                <StarIcon className="size-4 text-neon" />
                {stars.toLocaleString("ru-RU")}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------- top-up */}
      <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[16px] font-black tracking-tight">Купить TON за звёзды</h2>
            <p className="text-[11.5px] text-white/35">
              Зачисление мгновенное. Чем больше пакет, тем дешевле TON в звёздах
            </p>
          </div>
          <span className="hidden rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/35 sm:block">
            320–400 ★ за TON
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TON_TOPUPS.map((t) => {
            const can = stars >= t.stars;
            return (
              <button
                key={t.id}
                disabled={!can || busy !== null}
                onClick={() => {
                  const res = buyTon(t.id);
                  toast(
                    res.ok
                      ? { kind: "success", title: "TON зачислен", message: `+${fmtTon(t.ton)} TON` }
                      : { kind: "error", title: "Не хватает звёзд", message: `Нужно ${t.stars.toLocaleString("ru-RU")} ★` },
                  );
                }}
                className={[
                  "relative rounded-2xl border p-3 text-left transition",
                  can
                    ? "border-white/8 bg-black/25 hover:border-[#4aa8ff]/40 hover:bg-[#4aa8ff]/[0.06]"
                    : "border-white/6 bg-black/15 opacity-55",
                ].join(" ")}
              >
                {t.badge && (
                  <span className="absolute right-2 top-2 text-[9px] font-bold uppercase tracking-wider text-[#4aa8ff]/80">
                    {t.badge}
                  </span>
                )}
                <TonIcon size={19} />
                <p className="mt-2 text-[17px] font-black tabular-nums leading-none">{fmtTon(t.ton)}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-white/35">
                  {t.stars.toLocaleString("ru-RU")}
                  <StarIcon className="size-2.5 text-neon" />
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ----------------------------------------------------------- tabs */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* подсветка таба — общая «плашка», которая переезжает пружиной */}
          <div className="relative flex gap-1 rounded-2xl border border-white/8 bg-black/30 p-1">
            {(
              [
                ["username", "Юзернеймы"],
                ["number", "Номера"],
              ] as [Tab, string][]
            ).map(([id, label]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`relative rounded-xl px-3.5 py-1.5 text-[11.5px] font-bold transition-colors ${
                    active ? "text-white" : "text-white/40 hover:text-white/75"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="ton-tab-pill"
                      className="absolute inset-0 rounded-xl bg-white/10"
                      transition={SPRING_SOFT}
                    />
                  )}
                  <span className="relative z-10">
                    {label}
                    <span className="ml-1.5 text-[9.5px] font-black text-white/30">
                      {lots.filter((i) => i.kind === id).length}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <RotationHint />
          {tab === "number" && (
            <p className="hidden text-[10.5px] text-white/25 sm:block">
              +888 — анонимный номер, самый дорогой
            </p>
          )}
        </div>

        <RotationBar />
      </div>

      {/* ----------------------------------------------------------- list */}
      <motion.div
        key={tab}
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.008 } } }}
        className="grid gap-2 sm:grid-cols-2"
      >
        {items.map((item) => {
          const meta = TON_TIER_META[item.tier];
          const state = stateOf(item);
          const affordable = ton + 1e-9 >= item.ton;
          return (
            <motion.div
              key={item.id}
              variants={LIST_ITEM}
              whileHover={state === "free" ? { y: -2 } : undefined}
              transition={SPRING_SOFT}
              className={[
                "flex items-center gap-3 rounded-2xl border p-3",
                state === "mine"
                  ? "border-neon/30 bg-neon/[0.06]"
                  : state === "taken"
                    ? "border-white/6 bg-black/20 opacity-60"
                    : "border-white/8 bg-white/[0.025]",
              ].join(" ")}
            >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-xl border"
                    style={{ borderColor: `${meta.color}44`, background: `${meta.color}14`, color: meta.color }}
                  >
                    {item.kind === "username" ? (
                      <span className="text-[15px] font-black">@</span>
                    ) : (
                      <TonIcon size={18} flat />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        "truncate text-[13.5px] font-extrabold tracking-tight",
                        state === "taken" ? "text-white/45 line-through" : "",
                      ].join(" ")}
                    >
                      {item.label}
                    </p>
                    <p className="truncate text-[10.5px] text-white/35">
                      <span style={{ color: meta.color }}>{meta.label}</span> · {item.note}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {state === "mine" ? (
                      <span className="rounded-md border border-neon/30 bg-neon/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neon">
                        твой
                      </span>
                    ) : state === "taken" ? (
                      <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/35">
                        занят
                      </span>
                    ) : (
                      <>
                        <p className="flex items-center justify-end gap-1 text-[13px] font-black tabular-nums">
                          <TonIcon size={12} />
                          {fmtTon(item.ton)}
                        </p>
                        <p className="text-[9.5px] text-white/25">
                          ≈ {starsForTon(item.ton).toLocaleString("ru-RU")} ★
                        </p>
                        <motion.button
                          disabled={busy !== null}
                          onClick={() => setConfirm(item)}
                          whileTap={{ scale: 0.94 }}
                          whileHover={{ scale: 1.04 }}
                          transition={SPRING_SNAPPY}
                          className={`mt-1 rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                            affordable
                              ? "bg-white/10 text-white/80 hover:bg-white/16"
                              : "border border-white/10 text-white/30"
                          }`}
                        >
                          {busy === item.id ? "…" : affordable ? "купить" : "мало TON"}
                        </motion.button>
                      </>
                    )}
                  </div>
                </motion.div>
          );
        })}
      </motion.div>

      <p className="rounded-2xl border border-white/6 bg-white/[0.02] p-3.5 text-[10.5px] leading-relaxed text-white/25">
        Купленный юзернейм появляется в профиле наравне с остальными, номер — в строке
        «анонимный номер». Занятый лот нельзя купить дважды: он остаётся за владельцем
        даже после обновления прилавка.
        {profile.purchasedUsernames.length > 0 && (
          <> У тебя уже есть: {profile.purchasedUsernames.map((u) => `@${u}`).join(", ")}.</>
        )}
      </p>

      {/* --------------------------------------------------------- confirm */}
      {confirm && (
        <div className="fixed inset-0 z-[96] grid place-items-center bg-black/82 p-4" onClick={() => !busy && setConfirm(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-3xl border border-white/10 bg-[#0c0c0f] p-5 text-center"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">покупка</p>
            <p className="mt-1.5 font-display text-[22px] font-black tracking-tight">{confirm.label}</p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[15px] font-extrabold tabular-nums">
              <TonIcon size={15} />
              {fmtTon(confirm.ton)}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/35">
              Спишется с баланса TON сразу, лот станет твоим навсегда. Если его успели
              забрать — ничего не спишется.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirm(null)}>
                Отмена
              </Button>
              <Button size="sm" disabled={busy !== null} onClick={() => void buy(confirm)}>
                {busy ? "Занимаем…" : "Купить"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-[9.5px] text-white/18">
        Ротация прилавка: {Math.round(TON_ROTATION_MS / 60_000)} мин · звёзды → TON → лоты
      </p>
    </div>
  );
}