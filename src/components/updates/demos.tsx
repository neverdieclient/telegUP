import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { GIFT_BY_ID, type Gift } from "../../data/gifts";
import { CheckMark } from "../ui/CheckMark";
import { GiftArt, StarIcon, TonIcon } from "../gifts/GiftArt";
import { EASE_OUT_EXPO, SPRING_SNAPPY, SPRING_SOFT } from "../../lib/motion";

/**
 * Живые мини-экраны для слайдшоу обновлений.
 *
 * Каждый демо — это не картинка с подписью, а настоящая сценка: подарок
 * улучшается, Premium-страница листается, номер покупается в TON-маркете,
 * закрепы меняются местами перетаскиванием. Всё на `transform`/`opacity`
 * (их рисует композитор, а не layout), поэтому даже на телефоне сцена идёт
 * ровно, без рывков.
 *
 * Сценарий задаётся списком «битов» — миллисекунд до следующего кадра. Так
 * демо повторяется само и не требует управления извне.
 */

type Beat = number[];

/** Машина шагов: живёт по таймеру, на последнем кадре начинает заново. */
function useBeat(beats: Beat): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setI((v) => (v + 1) % beats.length), beats[i]);
    return () => window.clearTimeout(timer);
  }, [i, beats]);
  return i;
}

/* --------------------------------------------------------------- shell */

function Screen({
  children,
  tone = "#a3ff12",
  badge,
}: {
  children: React.ReactNode;
  tone?: string;
  badge: string;
}) {
  return (
    <div className="relative h-[286px] w-full overflow-hidden rounded-[24px] border border-white/12 bg-[#07070b] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.95)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(120% 70% at 50% -10%, ${tone}26, transparent 62%)` }}
      />
      <span
        className="absolute left-3 top-3 z-20 rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-[0.14em]"
        style={{ background: `${tone}1f`, color: tone }}
      >
        {badge}
      </span>
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  );
}

function TopBar({ right }: { right: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-8 text-[10px] font-bold text-white/45">
      <span className="uppercase tracking-[0.16em]">telegUP</span>
      <span className="flex items-center gap-1 tabular-nums text-white/70">{right}</span>
    </div>
  );
}

/* ------------------------------------------------------------- upgrade */

const UP_BEATS: Beat = [1000, 760, 2500];

/** Коллекция с несколькими моделями: дешёвая модель → дорогая. */
function useUpgradePair(): { from: Gift | null; to: Gift | null; pool: Gift[] } {
  return useMemo(() => {
    const bySlug = new Map<string, Gift[]>();
    for (const g of Object.values(GIFT_BY_ID)) {
      if (g.kind !== "model") continue;
      const list = bySlug.get(g.slug) ?? [];
      list.push(g);
      bySlug.set(g.slug, list);
    }
    for (const list of bySlug.values()) {
      if (list.length < 4) continue;
      const sorted = [...list].sort((a, b) => a.stars - b.stars);
      return {
        from: sorted[Math.floor(sorted.length * 0.3)],
        to: sorted[sorted.length - 1],
        pool: sorted,
      };
    }
    return { from: null, to: null, pool: [] };
  }, []);
}

function UpgradeDemo() {
  const step = useBeat(UP_BEATS);
  const { from, to, pool } = useUpgradePair();
  const rolling = step === 1;
  const done = step === 2;
  const shown = done ? to : from;
  const balance = done ? 1155 : 1240;

  /** лента названий моделей, которая «прокручивается» во время ролла */
  const strip = (pool.length ? pool : from ? [from] : []).slice(0, 6);

  return (
    <Screen badge="апгрейд · 100%" tone="#a3ff12">
      <TopBar
        right={
          <>
            <StarIcon className="size-2.5" />
            <motion.span key={balance} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              {balance.toLocaleString("ru-RU")}
            </motion.span>
          </>
        }
      />

      <div className="flex flex-1 flex-col items-center justify-center px-3">
        <motion.div
          className="relative"
          animate={{ scale: rolling ? 0.94 : 1 }}
          transition={SPRING_SNAPPY}
        >
          <motion.div
            key={shown?.id ?? "none"}
            initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={SPRING_SOFT}
            className="grid place-items-center"
          >
            {shown && <GiftArt gift={shown} size={92} rounded="rounded-2xl" motion="idle" />}
          </motion.div>

          {/* кольцо «удача пошла» вокруг подарка на моменте выпадения */}
          {done && (
            <motion.span
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-neon/60"
              initial={{ scale: 0.7, opacity: 0.9 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
            />
          )}
        </motion.div>

        <div className="mt-2 h-9 w-full overflow-hidden text-center">
          {rolling ? (
            <motion.div
              animate={{ y: ["0%", "-66%"] }}
              transition={{ duration: 0.74, ease: "linear" }}
              className="will-change-transform"
            >
              {[...strip, ...strip.slice(0, 2)].map((m, i) => (
                <p
                  key={`${m.id}-${i}`}
                  className="h-4.5 truncate text-[11.5px] font-extrabold leading-[18px] text-white/60"
                >
                  {m.variant}
                </p>
              ))}
            </motion.div>
          ) : (
            <motion.p
              key={shown?.variant ?? "v"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING_SOFT}
              className="truncate text-[12.5px] font-black"
            >
              {shown?.variant}
              {done && (
                <span className="ml-1.5 rounded-md bg-neon/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-neon">
                  лучше
                </span>
              )}
            </motion.p>
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <motion.div
          animate={{ scale: rolling ? 0.96 : 1 }}
          transition={SPRING_SNAPPY}
          className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-[11.5px] font-black ${
            done
              ? "border-neon/30 bg-neon/10 text-neon"
              : "border-white/12 bg-white/[0.06] text-white/85"
          }`}
        >
          {done ? (
            <>
              <CheckMark kind="major" size={11} /> модель улучшена
            </>
          ) : (
            <>
              🎲 Улучшить · 85 <StarIcon className="size-2.5" />
            </>
          )}
        </motion.div>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------- premium */

const PREM_BEATS: Beat = [1400, 1400, 1000, 2600];
const PREM_PAGES = [
  { title: "4-й закреп", note: "на профиле вместо трёх", color: "#a3ff12" },
  { title: "+10% к продаже", note: "звёзд за каждый подарок", color: "#b45cff" },
  { title: "Значок и рамка", note: "видно в чате и топе", color: "#3b9dff" },
];

function PremiumDemo() {
  const step = useBeat(PREM_BEATS);
  const page = Math.min(step, PREM_PAGES.length - 1);
  const bought = step === 3;

  return (
    <Screen badge="premium" tone="#b45cff">
      <TopBar right={<span className="text-[9.5px] font-black text-violet">PREMIUM</span>} />

      <div className="px-3 pt-1">
        <p className="font-display text-[15px] font-black leading-tight">Telegram Premium</p>
        <p className="text-[10px] text-white/35">листай вкладки</p>
      </div>

      <div className="relative mt-1.5 flex-1 overflow-hidden">
        <motion.div
          className="flex h-full will-change-transform"
          animate={{ x: `-${page * 100}%` }}
          transition={SPRING_SOFT}
        >
          {PREM_PAGES.map((p) => (
            <div key={p.title} className="w-full shrink-0 px-3">
              <div
                className="flex h-full flex-col justify-center rounded-2xl border p-3"
                style={{ borderColor: `${p.color}33`, background: `${p.color}12` }}
              >
                <span
                  className="mb-2 inline-grid size-7 place-items-center rounded-lg text-[12px] font-black text-black"
                  style={{ background: p.color }}
                >
                  ★
                </span>
                <p className="text-[13.5px] font-black leading-tight">{p.title}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-white/45">{p.note}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="flex shrink-0 justify-center gap-1 pb-1.5 pt-1.5">
        {PREM_PAGES.map((p, i) => (
          <motion.span
            key={p.title}
            className="h-1 rounded-full"
            animate={{ width: i === page ? 16 : 5, opacity: i === page ? 1 : 0.35 }}
            transition={SPRING_SNAPPY}
            style={{ background: i === page ? p.color : "rgba(255,255,255,0.55)" }}
          />
        ))}
      </div>

      <div className="shrink-0 px-3 pb-2.5">
        <motion.div
          animate={{
            borderColor: bought ? "rgba(163,255,18,0.35)" : "rgba(255,255,255,0.12)",
            backgroundColor: bought ? "rgba(163,255,18,0.10)" : "rgba(255,255,255,0.05)",
            scale: step === 2 ? 0.96 : 1,
          }}
          transition={SPRING_SNAPPY}
          className="flex items-center justify-between rounded-xl border px-3 py-2"
        >
          {bought ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING_SOFT}
              className="flex items-center gap-1.5 text-[11px] font-black text-neon"
            >
              <CheckMark kind="major" size={11} /> активен до 14 дек
            </motion.div>
          ) : (
            <>
              <span className="text-[11px] font-bold text-white/70">1 месяц</span>
              <span className="flex items-center gap-1 text-[11.5px] font-black text-neon">
                999 <StarIcon className="size-2.5" />
              </span>
            </>
          )}
        </motion.div>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------ TON market */

const TON_BEATS: Beat = [1300, 1200, 1900];
const TON_ROWS = [
  { label: "+888 8 812 34 56", note: "анонимный", ton: 38.4, tone: "text-mythic" },
  { label: "@oleg", note: "короткий", ton: 24.6, tone: "text-legendary" },
  { label: "+888 9 701 22 08", note: "код 888", ton: 18.2, tone: "text-epic" },
];

function TonDemo() {
  const step = useBeat(TON_BEATS);
  const selected = step >= 1;
  const bought = step === 2;

  return (
    <Screen badge="TON-маркет" tone="#4aa8ff">
      <TopBar
        right={
          <>
            <TonIcon className="size-2.5" /> 12.40
          </>
        }
      />

      <div className="px-3">
        <p className="font-display text-[13.5px] font-black leading-tight">Юзернеймы и номера</p>
        <p className="text-[9px] text-white/35">50 + 50 лотов · ротация раз в час</p>
      </div>

      <div className="mt-1.5 shrink-0 space-y-1.5 px-3">
        {TON_ROWS.map((r, i) => {
          const dim = selected && i > 0;
          return (
            <motion.div
              key={r.label}
              animate={{
                opacity: dim ? 0.3 : 1,
                y: 0,
                borderColor: selected && i === 0 ? "rgba(74,168,255,0.5)" : "rgba(255,255,255,0.10)",
              }}
              initial={{ opacity: 0, y: 12 }}
              transition={{ ...SPRING_SOFT, delay: 0.04 * i }}
              className="flex items-center justify-between rounded-xl border bg-black/40 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className={`truncate text-[11px] font-extrabold tabular-nums ${r.tone}`}>{r.label}</p>
                <p className="text-[8.5px] text-white/30">{r.note}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-black tabular-nums text-white/80">
                {r.ton} <TonIcon className="size-2.5" />
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* шторка покупки */}
      <motion.div
        initial={false}
        animate={{ y: selected ? 0 : 90, opacity: selected ? 1 : 0 }}
        transition={SPRING_SOFT}
        className="shrink-0 rounded-t-2xl border-t border-white/12 bg-[#0d0d13] px-3 pb-2.5 pt-2 will-change-transform"
      >
        {bought ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_SOFT}
            className="flex items-center gap-2 py-1 text-[10.5px] font-black text-neon"
          >
            <CheckMark kind="major" size={11} /> номер куплен · он в профиле
          </motion.div>
        ) : (
          <>
            <p className="text-[9.5px] text-white/40">купить {TON_ROWS[0].label}</p>
            <div className="mt-1 flex items-center justify-between rounded-lg bg-[#4aa8ff] px-3 py-1.5 text-[11px] font-black text-black">
              <span>за 38.4 TON</span>
              <span>→</span>
            </div>
          </>
        )}
      </motion.div>
    </Screen>
  );
}

/* ----------------------------------------------------------------- pins */

const PIN_BEATS: Beat = [800, 900, 1100, 700];
/** Подарки на полке: индексы карточек в их нынешнем порядке. */
const PIN_ORDER = [
  [0, 1, 2, 3],
  [0, 1, 2, 3],
  [1, 2, 0, 3],
  [1, 2, 0, 3],
];

function PinDemo() {
  const step = useBeat(PIN_BEATS);
  const order = PIN_ORDER[step];
  const moving = step === 1 || step === 2;
  const gifts = useMemo(
    () =>
      Object.values(GIFT_BY_ID)
        .filter((g) => g.kind === "gift")
        .slice(0, 4),
    [],
  );

  return (
    <Screen badge="закрепы · перетащи" tone="#ff8f3d">
      <TopBar right={<span className="text-[9.5px] text-white/50">4 / 4</span>} />

      <div className="px-2.5 pt-1">
        {/* шапка профиля — чтобы полка закрепов читалась как настоящий экран */}
        <div className="flex items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-neon/80 to-emerald-500 text-[10px] font-black text-black">
            TG
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black leading-tight">
              @telegup_user
              <span className="ml-1 rounded bg-violet/25 px-1 py-px text-[7.5px] font-black uppercase tracking-wider text-violet">
                premium
              </span>
            </p>
            <p className="text-[8.5px] text-white/30">21 подарок · 4 закрепа</p>
          </div>
        </div>

        <p className="mt-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/35">Закреплённые</p>
        <div className="relative mt-1.5 h-[64px]">
          {gifts.map((g, slot) => {
            const pos = order.indexOf(slot);
            // тащим первую карточку: она приподнята и уезжает в третью ячейку
            const isDragged = slot === 0;
            const up = isDragged && (step === 1 || step === 2);
            return (
              <motion.div
                key={g.id}
                className="absolute left-0 top-0 grid size-[58px] place-items-center rounded-xl border border-white/12 bg-white/[0.05]"
                animate={{
                  x: pos * 63,
                  y: up ? -6 : 0,
                  scale: up ? 1.07 : 1,
                  zIndex: up ? 20 : 1,
                  boxShadow: up
                    ? "0 18px 34px -14px rgba(0,0,0,0.95)"
                    : "0 0 0 0 rgba(0,0,0,0)",
                }}
                transition={{ ...SPRING_SOFT, zIndex: { duration: 0 } }}
              >
                <GiftArt gift={g} size={42} rounded="rounded-lg" motion="hover" />
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 shrink-0 px-2.5">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/20">Все подарки</p>
        <div className="mt-1 flex gap-1">
          {gifts.map((g, i) => (
            <div
              key={`${g.id}-${i}`}
              className="grid h-8 flex-1 place-items-center rounded-lg border border-white/8 bg-white/[0.03]"
            >
              <GiftArt gift={g} size={22} rounded="rounded-md" motion="none" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <div className="shrink-0 px-3 pb-2.5">
        <motion.div
          animate={{ opacity: moving ? 1 : 0.55 }}
          transition={SPRING_SOFT}
          className="rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5"
        >
          <p className="text-[10px] font-bold text-white/70">
            {moving ? "отпусти — порядок сохранится" : "порядок на профиле теперь твой"}
          </p>
          <p className="mt-0.5 text-[8.5px] text-white/30">палец на подарке · любая ячейка</p>
        </motion.div>
      </div>
    </Screen>
  );
}

/* --------------------------------------------------------------- minimal */

const MIN_BEATS: Beat = [1200, 2200];

function MinimalDemo() {
  const step = useBeat(MIN_BEATS);
  const minimal = step === 1;

  return (
    <Screen badge="вид · минимал" tone="#8b5cf6">
      <TopBar right={<span className="text-[9.5px] text-white/40">{minimal ? "Минимал" : "Стекло"}</span>} />

      <div className="px-3 pt-1">
        <p className="font-display text-[14px] font-black leading-tight">Вид интерфейса</p>
        <p className="text-[9.5px] text-white/35">переключается в профиле</p>
      </div>

      <div className="flex flex-1 gap-2 px-3 pt-2">
        {[false, true].map((isMinimal) => {
          const active = isMinimal === minimal;
          return (
            <motion.div
              key={String(isMinimal)}
              animate={{ opacity: active ? 1 : 0.45, scale: active ? 1 : 0.93, y: active ? 0 : 6 }}
              transition={SPRING_SOFT}
              className={`relative flex-1 overflow-hidden rounded-2xl border p-2 ${
                isMinimal
                  ? "border-white/14 bg-[#08080b]"
                  : "border-white/22 bg-gradient-to-br from-white/[0.16] to-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[8.5px] font-black uppercase tracking-[0.14em] text-white/40">
                  {isMinimal ? "минимал" : "стекло"}
                </p>
                {active && <CheckMark kind="major" size={9} />}
              </div>

              {/* карточка подарка: в минимале — плоско, в стекле — с заливками */}
              <div
                className={`mt-1.5 flex items-center gap-1.5 rounded-xl p-1.5 ${
                  isMinimal ? "border border-white/10" : "border border-white/20 bg-white/[0.10]"
                }`}
              >
                <span
                  className={`size-6 shrink-0 rounded-lg ${
                    isMinimal ? "bg-white/[0.06] ring-1 ring-white/10" : "bg-gradient-to-br from-rose-400/70 to-violet/70"
                  }`}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className={`h-1.5 w-3/4 rounded-full ${isMinimal ? "bg-white/20" : "bg-white/45"}`} />
                  <div className={`h-1.5 w-1/2 rounded-full ${isMinimal ? "bg-white/10" : "bg-white/25"}`} />
                </div>
              </div>

              <div className="mt-1.5 space-y-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-4 rounded-md ${
                      isMinimal ? "border border-white/8 bg-transparent" : "border border-white/18 bg-white/[0.10]"
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="shrink-0 px-3 pb-3">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5">
          <span className="text-[10px] font-bold text-white/60">вид</span>
          <span className="relative flex h-5 w-9 items-center rounded-full bg-white/12 p-0.5">
            <motion.span
              className="block size-4 rounded-full bg-neon"
              animate={{ x: minimal ? 16 : 0 }}
              transition={SPRING_SNAPPY}
            />
          </span>
        </div>
      </div>
    </Screen>
  );
}

/* ---------------------------------------------------------------- export */

export const DEMOS = {
  upgrade: UpgradeDemo,
  premium: PremiumDemo,
  ton: TonDemo,
  pins: PinDemo,
  minimal: MinimalDemo,
} as const;

export type DemoId = keyof typeof DEMOS;