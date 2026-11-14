import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useGame } from "../store/useGame";
import { COMBO_PACKS, PREMIUM_PLANS, STAR_PACKS, type PremiumPlanId } from "../data/store2";
import { CheckMark } from "../components/ui/CheckMark";
import { StarIcon, GiftArt } from "../components/gifts/GiftArt";
import { TonIcon } from "../components/ui/TonIcon";
import { Button } from "../components/ui/Button";
import { useGiftIndex } from "../lib/useCatalog";

/** Days left, rounded up, or 0 when there is no subscription. */
function daysLeft(until: number | null) {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 86_400_000));
}

/** «3 TON» / «0.4 TON» без хвоста нулей. */
const fmtTon = (ton: number) =>
  ton.toLocaleString("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/**
 * Premium, звёзды и наборы.
 *
 * Никаких рублей: у всего две цены — в звёздах и в TON. Звёзды игрок
 * зарабатывает в игре, TON покупает за звёзды, поэтому любая покупка здесь —
 * это списание внутренней валюты в тот же миг, когда приходит товар. Экран
 * показывает ту же цену, которую спишет store (`salePrice` / `discountTon`),
 * — то есть с учётом скидки владельца, если она включена.
 */
export default function Premium() {
  const premiumUntil = useGame((s) => s.premiumUntil);
  const premiumPlan = useGame((s) => s.premiumPlan);
  const purchases = useGame((s) => s.purchases);
  const stars = useGame((s) => s.stars);
  const ton = useGame((s) => s.ton);
  const buyPremium = useGame((s) => s.buyPremium);
  const buyStars = useGame((s) => s.buyStars);
  const buyCombo = useGame((s) => s.buyCombo);
  const toast = useGame((s) => s.toast);
  const gifts = useGiftIndex();

  const [busy, setBusy] = useState<string | null>(null);

  const left = daysLeft(premiumUntil);
  const active = left > 0;
  const currentPlan = premiumPlan ? PREMIUM_PLANS.find((p) => p.id === premiumPlan) : null;

  /** Один обработчик на все покупки: единый текст ошибок и единый тост. */
  const run = (key: string, action: () => { ok: boolean; reason?: string }, success: string) => {
    setBusy(key);
    const res = action();
    setBusy(null);
    if (res.ok) {
      toast({ kind: "success", title: "Готово", message: success });
      return;
    }
    toast({
      kind: "error",
      title: res.reason === "ton" ? "Не хватает TON" : "Не хватает звёзд",
      message:
        res.reason === "ton"
          ? "Пополни TON за звёзды в TON-маркете"
          : "Заработай звёзды в кейсах и удаче дня",
    });
  };

  const premium = (id: PremiumPlanId, pay: "stars" | "ton") => {
    const plan = PREMIUM_PLANS.find((p) => p.id === id);
    if (!plan) return;
    run(`${id}:${pay}`, () => buyPremium(id, pay), `Premium · ${plan.name}`);
  };

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- header */}
      <header className="relative overflow-hidden rounded-3xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] p-5 md:p-7">
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-violet), transparent 70%)" }}
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
              telegUP <span className="text-white/15">·</span> подписка
            </p>
            <h1 className="mt-2 flex items-center gap-2 font-display text-[28px] font-black leading-none tracking-tight md:text-[34px]">
              Premium
              <CheckMark kind="premium" size={22} />
            </h1>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-white/45">
              Галочка, больше звёзд с каждого подарка, четвёртый закреплённый подарок
              и весь минималистичный облик сайта. Платить можно звёздами или TON.
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              {active ? (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neon/70">активна</p>
                  <p className="mt-0.5 text-[17px] font-black tabular-nums">
                    {left} {left === 1 ? "день" : left < 5 ? "дня" : "дней"}
                  </p>
                  <p className="text-[10.5px] text-white/35">
                    {currentPlan?.name} · до{" "}
                    {new Date(premiumUntil ?? 0).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">статус</p>
                  <p className="mt-0.5 text-[17px] font-black">Бесплатный</p>
                  <p className="text-[10.5px] text-white/35">подписка не подключена</p>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">баланс</p>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] font-black tabular-nums">
                <StarIcon className="size-3.5 text-neon" />
                {stars.toLocaleString("ru-RU")}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] font-black tabular-nums text-[#4aa8ff]">
                <TonIcon size={13} />
                {fmtTon(ton)}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------- plans */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-black tracking-tight">Тарифы</h2>
            <p className="text-[11.5px] text-white/35">
              {active
                ? "Продление добавляет дни к остатку — ничего не сгорает"
                : "Подписка гаснет сама, когда кончается срок"}
            </p>
          </div>
          <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
            звёзды или TON
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {PREMIUM_PLANS.map((plan, i) => {
            const best = plan.id === "season";
            const canStars = stars >= plan.stars;
            const canTon = ton + 1e-9 >= plan.ton;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className={[
                  "relative flex flex-col rounded-3xl border p-4",
                  best ? "border-neon/35 bg-neon/[0.055]" : "border-white/8 bg-white/[0.025]",
                ].join(" ")}
              >
                {plan.badge && (
                  <span
                    className={[
                      "absolute right-3 top-3 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                      best ? "bg-neon text-black" : "bg-white/10 text-white/55",
                    ].join(" ")}
                  >
                    {plan.badge}
                  </span>
                )}
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">{plan.name}</p>

                <div className="mt-2 flex items-end gap-3">
                  <p className="flex items-baseline gap-1">
                    <span className="font-display text-[28px] font-black leading-none tracking-tight tabular-nums">
                      {plan.stars.toLocaleString("ru-RU")}
                    </span>
                    <StarIcon className="size-3.5 self-center text-neon" />
                  </p>
                  <p className="flex items-baseline gap-1 pb-0.5 text-white/40">
                    <span className="text-[16px] font-black tabular-nums">{fmtTon(plan.ton)}</span>
                    <TonIcon size={12} />
                  </p>
                </div>
                <p className="mt-1 text-[10.5px] text-white/30">
                  {plan.days} дней · ≈ {Math.round(plan.stars / Math.max(1, plan.days / 30)).toLocaleString("ru-RU")}{" "}
                  ★ в месяц
                </p>

                <ul className="mt-3 flex-1 space-y-1.5">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex gap-2 text-[11.5px] leading-snug text-white/55">
                      <span className={best ? "text-neon" : "text-white/30"}>✓</span>
                      {perk}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    variant={best ? "primary" : "ghost"}
                    disabled={!canStars || busy !== null}
                    onClick={() => premium(plan.id, "stars")}
                  >
                    {plan.stars.toLocaleString("ru-RU")} ★
                  </Button>
                  <Button
                    size="sm"
                    variant="violet"
                    disabled={!canTon || busy !== null}
                    onClick={() => premium(plan.id, "ton")}
                  >
                    {fmtTon(plan.ton)} TON
                  </Button>
                </div>
                <p className="mt-1 text-center text-[9.5px] text-white/22">
                  {active ? "Продлить" : "Подключить"} · без автосписаний
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------- star packs */}
      <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-black tracking-tight">Звёзды</h2>
            <p className="text-[11.5px] text-white/35">
              Паки за TON — звёзды зачисляются мгновенно, скидка владельца учитывается
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-extrabold tabular-nums">
            <StarIcon className="size-3.5 text-neon" />
            {stars.toLocaleString("ru-RU")}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STAR_PACKS.map((pack) => {
            const can = ton + 1e-9 >= pack.ton;
            return (
              <button
                key={pack.id}
                disabled={!can || busy !== null}
                onClick={() =>
                  run(`stars:${pack.id}`, () => buyStars(pack.id), `${pack.stars.toLocaleString("ru-RU")} ★`)
                }
                className={[
                  "group relative rounded-2xl border p-3 text-left transition",
                  can
                    ? "border-white/8 bg-black/25 hover:border-neon/35 hover:bg-neon/[0.05]"
                    : "border-white/6 bg-black/15 opacity-55",
                ].join(" ")}
              >
                {pack.badge && (
                  <span className="absolute right-2 top-2 text-[9px] font-bold uppercase tracking-wider text-neon/70">
                    {pack.badge}
                  </span>
                )}
                <StarIcon className="size-5 text-neon" />
                <p className="mt-2 text-[17px] font-black tabular-nums leading-none">
                  {pack.stars.toLocaleString("ru-RU")}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-white/35">
                  <TonIcon size={11} />
                  {fmtTon(pack.ton)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------- combos */}
      <section>
        <div className="mb-3">
          <h2 className="font-display text-[17px] font-black tracking-tight">Наборы подарков</h2>
          <p className="text-[11.5px] text-white/35">
            Дешевле, чем собирать по одному. Подарки из набора нельзя продать или передать —
            зато улучшать можно как обычные
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {COMBO_PACKS.map((pack) => {
            const canStars = stars >= pack.stars;
            const canTon = ton + 1e-9 >= pack.ton;
            return (
              <div key={pack.id} className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-[14px] font-extrabold tracking-tight">{pack.name}</h3>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-white/40">{pack.summary}</p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block font-display text-[19px] font-black leading-none tabular-nums">
                      {pack.stars.toLocaleString("ru-RU")} ★
                    </span>
                    <span className="mt-1 block text-[10px] text-white/30">
                      или {fmtTon(pack.ton)} TON
                    </span>
                  </p>
                </div>

                <div className="mt-3 flex gap-1.5">
                  {pack.giftIds.map((giftId) => {
                    const gift = gifts[giftId];
                    return (
                      <span
                        key={giftId}
                        title={gift?.name}
                        className="grid size-12 place-items-center rounded-xl border border-white/8 bg-black/30"
                      >
                        {gift ? <GiftArt gift={gift} size={38} /> : <span className="text-[9px] text-white/25">?</span>}
                      </span>
                    );
                  })}
                  <span className="ml-auto self-center rounded-lg border border-neon/25 bg-neon/10 px-2 py-1 text-[10.5px] font-extrabold text-neon">
                    +{pack.bonus.toLocaleString("ru-RU")}★
                  </span>
                </div>

                <p className="mt-2 text-[10px] text-white/25">
                  ≈ {pack.worthStars.toLocaleString("ru-RU")}★ ценности внутри
                </p>

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canStars || busy !== null}
                    onClick={() => run(`combo:${pack.id}:stars`, () => buyCombo(pack.id, "stars"), pack.name)}
                  >
                    За {pack.stars.toLocaleString("ru-RU")} ★
                  </Button>
                  <Button
                    size="sm"
                    variant="violet"
                    disabled={!canTon || busy !== null}
                    onClick={() => run(`combo:${pack.id}:ton`, () => buyCombo(pack.id, "ton"), pack.name)}
                  >
                    За {fmtTon(pack.ton)} TON
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------- receipts */}
      {purchases.length > 0 && (
        <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-4">
          <h2 className="mb-2 font-display text-[15px] font-black tracking-tight">Покупки</h2>
          <div className="divide-y divide-white/[0.06]">
            {purchases.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold">{p.label}</p>
                  <p className="text-[10px] text-white/30">
                    {new Date(p.at).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white/55">
                  {p.paid.stars > 0 && (
                    <>
                      {p.paid.stars.toLocaleString("ru-RU")}
                      <StarIcon className="size-2.5 text-neon" />
                    </>
                  )}
                  {p.paid.ton > 0 && (
                    <>
                      {fmtTon(p.paid.ton)}
                      <TonIcon size={10} />
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="rounded-2xl border border-white/6 bg-white/[0.02] p-3.5 text-center text-[10.5px] leading-relaxed text-white/25">
        Это не Telegram и не официальный магазин Telegram. Подписка, звёзды и TON — внутренняя
        валюта сайта, реальными деньгами ничего не продаётся.{" "}
        <Link to="/app/updates" className="text-white/40 underline decoration-white/20 hover:text-white/70">
          Что нового в 2.0
        </Link>
      </p>
    </div>
  );
}