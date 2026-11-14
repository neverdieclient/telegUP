import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { CASES, DISCLAIMER, GIFTS } from "../data/gifts";
import { StarIcon } from "../components/gifts/GiftArt";
import { AdSlot } from "../components/AdSlot";

const MINIGAMES = ["Crash", "Mines", "PvP", "Dice", "Монетка", "Колесо", "Tower", "Hi-Lo"];

const STATS: [string, string][] = [
  [`${GIFTS.length.toLocaleString("ru-RU")}`, "подарков"],
  [`${CASES.length}`, "кейсов"],
  [`${MINIGAMES.length}`, "мини-игр"],
  ["24/7", "онлайн"],
];

type Floater = { label: string; x: number; y: number; size: number; delay: number; tilt: number; side: "l" | "r" };

const LEFT: Floater[] = [
  { label: "Plush Pepe", x: 4, y: 16, size: 34, delay: 0, tilt: -4, side: "l" },
  { label: "Heart Locket", x: 10, y: 34, size: 26, delay: 0.6, tilt: 3, side: "l" },
  { label: "Astral Shard", x: 2, y: 52, size: 22, delay: 1.2, tilt: -2, side: "l" },
  { label: "Lol Pop", x: 14, y: 70, size: 30, delay: 1.8, tilt: 5, side: "l" },
  { label: "Durov's Cap", x: 6, y: 86, size: 18, delay: 2.4, tilt: -3, side: "l" },
];

const RIGHT: Floater[] = [
  { label: "Homemade Cake", x: 4, y: 14, size: 30, delay: 0.3, tilt: 4, side: "r" },
  { label: "Eternal Rose", x: 11, y: 32, size: 24, delay: 0.9, tilt: -3, side: "r" },
  { label: "Gifts", x: 3, y: 50, size: 20, delay: 1.5, tilt: 2, side: "r" },
  { label: "Jackpot", x: 9, y: 68, size: 28, delay: 2.1, tilt: -5, side: "r" },
  { label: "Auction", x: 4, y: 85, size: 16, delay: 2.7, tilt: 3, side: "r" },
];

const FEATURES = [
  {
    title: "Кейсы и рулетка",
    text: "Полоса рулетки с честным взвешенным RNG. Бронза — легендарка — всё как в жизни.",
    icon: "M4 8h16v11H4Zm0 0V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1",
  },
  {
    title: "Апгрейд",
    text: "Кольцо шанса, стрелка, математика. 45% — это не «почти наверняка».",
    icon: "M12 3a9 9 0 1 1-9 9M12 3v9l6 3",
  },
  {
    title: "Маркет подарков",
    text: "Коллекционные подарки с реальными ценами Telegrams. Покупка — звёздами.",
    icon: "M4 7h16l-1.5 12.5H5.5ZM9 7a3 3 0 1 1 6 0",
  },
  {
    title: "Мини-игры",
    text: "Crash, Mines, Dice, Wheel и PvP против живых игроков.",
    icon: "M7 8h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 8Z",
  },
  {
    title: "Онлайн-профиль",
    text: "Юзернеймы, +888, Premium, галочки и топ игроков — всё в одном аккаунте.",
    icon: "M21 4L3 11l6 2.5M21 4l-3 16-6-4.5M9 13.5V19l3-2.5",
  },
  {
    title: "Прогресс в облаке",
    text: "Баланс, инвентарь и статистика синхронизируются с аккаунтом. Заходи с любого устройства.",
    icon: "M5 12a7 7 0 0 1 12-4.9M19 12a7 7 0 0 1-12 4.9M17 3v4h-4M7 21v-4h4",
  },
];

function FloatingWord({ f }: { f: Floater }) {
  return (
    <span
      className="absolute hidden select-none whitespace-nowrap font-display font-black uppercase tracking-tight text-white/[0.055] md:block"
      style={{
        [f.side === "l" ? "left" : "right"]: `${f.x}%`,
        top: `${f.y}%`,
        fontSize: `${f.size}px`,
        transform: `rotate(${f.tilt}deg)`,
        WebkitTextStroke: "1px rgba(255,255,255,0.05)",
        animation: `float ${6 + (f.delay % 3)}s ease-in-out ${f.delay}s infinite`,
        "--tilt": `${f.tilt}deg`,
      } as React.CSSProperties}
    >
      {f.label}
    </span>
  );
}

export default function Landing() {
  const reduce = useReducedMotion();

  return (
    <div className="grain relative min-h-dvh overflow-hidden bg-ink">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0 aurora opacity-90" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-[-14%] h-[560px] w-[820px] -translate-x-1/2 rounded-full bg-neon/[0.07] blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-30%] left-[-10%] h-[420px] w-[520px] rounded-full bg-violet/[0.10] blur-[120px]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-ink via-ink/70 to-transparent" />

      {/* nav */}
      <header className="relative z-20 mx-auto flex max-w-[1300px] items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg border border-neon/30 bg-neon/10">
            <svg viewBox="0 0 24 24" className="size-4 text-neon" fill="currentColor">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
            </svg>
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">
            teleg<span className="text-neon">UP</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#features"
            className="hidden rounded-xl px-3 py-2 text-[13px] font-semibold text-white/50 transition-colors hover:text-white sm:block"
          >
            Функции
          </a>
          <Link
            to="/app"
            className="rounded-xl bg-neon px-4 py-2 text-[13px] font-bold text-black transition-all hover:bg-[#b4ff41] hover:shadow-[0_0_30px_-6px_rgba(163,255,18,0.6)]"
          >
            Войти
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative z-10 flex min-h-[calc(100dvh-92px)] flex-col items-center justify-center px-4 pb-20">
        {[...LEFT, ...RIGHT].map((f) => (
          <FloatingWord key={f.label} f={f} />
        ))}

        <motion.div
          initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/55 backdrop-blur"
          >
            <span className="size-1.5 rounded-full bg-neon shadow-[0_0_10px_2px_rgba(163,255,18,0.8)]" />
            Онлайн-игра · Telegram-подарки
          </motion.div>

          <h1 className="brand-mark font-display text-[clamp(3.4rem,15vw,12rem)] font-black leading-[0.82] tracking-[-0.045em]">
            teleg<span className="brand-up">UP</span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-5 max-w-md text-balance-tight text-[15px] font-medium leading-relaxed text-white/45 md:text-[17px]"
          >
            Симулятор подарков. Кейсы, апгрейд, аукцион и маркет коллекционных
            подарков Telegram — в одном аккаунте.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.7 }}
            className="mt-9 flex w-full max-w-[360px] flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center"
          >
            <Link
              to="/app"
              className="group relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-neon px-8 text-[15px] font-extrabold tracking-tight text-black transition-all hover:shadow-[0_16px_60px_-14px_rgba(163,255,18,0.85)]"
            >
              <span className="relative z-10">Войти</span>
              <svg viewBox="0 0 24 24" className="relative z-10 size-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
              {!reduce && (
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              )}
            </Link>
            <a
              href="#features"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.035] px-8 text-[15px] font-bold text-white/80 backdrop-blur transition-all hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
            >
              Функции
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </a>
          </motion.div>

          {/* mini stats */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-center">
            {STATS.map(([v, l]) => (
              <div key={l}>
                <p className="font-display text-2xl font-black tabular-nums text-white/90">{v}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">{l}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* banner: the hero is where most visitors land, so the top slot sits
            right under it rather than pushing the headline down */}
        <AdSlot id="top" className="relative z-10 mt-10 hidden w-full max-w-[728px] md:block" />

        {/* scroll cue */}
        <motion.div
          animate={{ y: [0, 7, 0], opacity: [0.25, 0.6, 0.25] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="absolute bottom-8 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Scroll</span>
          <span className="h-8 w-px bg-gradient-to-b from-white/40 to-transparent" />
        </motion.div>
      </section>

      {/* features */}
      <section id="features" className="relative z-10 mx-auto max-w-[1200px] scroll-mt-16 px-5 pb-28 md:px-8">
        <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-neon/80">Функции</p>
            <h2 className="font-display text-[clamp(2rem,5vw,3.4rem)] font-black leading-none tracking-tight metal-text">
              Всё как в оригинале.
              <br />
              Только честнее.
            </h2>
          </div>
          <p className="max-w-sm text-[13.5px] leading-relaxed text-white/40">
            Полноценная песочница экономики подарков: кейсы, апгрейд и маркет.
            Прогресс синхронизируется с твоим аккаунтом.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.06, duration: 0.5 }}
              className="group relative overflow-hidden rounded-3xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-white/16 hover:bg-white/[0.055]"
            >
              <div className="absolute -right-10 -top-10 size-32 rounded-full bg-neon/[0.07] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
              <span className="mb-4 grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-neon">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={f.icon} />
                </svg>
              </span>
              <h3 className="mb-1.5 text-[15px] font-extrabold tracking-tight text-white/95">{f.title}</h3>
              <p className="text-[12.5px] leading-relaxed text-white/40">{f.text}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center gap-6 rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-transparent p-8 text-center">
          <StarIcon className="size-7 text-neon" />
          <h3 className="max-w-xl font-display text-2xl font-black tracking-tight metal-text md:text-3xl">
            Готов начать с 500 звёзд?
          </h3>
          <Link
            to="/app"
            className="inline-flex h-13 items-center gap-2 rounded-2xl bg-neon px-8 py-3.5 text-[14px] font-extrabold text-black transition-all hover:shadow-[0_16px_60px_-14px_rgba(163,255,18,0.85)]"
          >
            Открыть дашборд
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/6 px-5 py-8 text-center">
        <AdSlot id="footer" className="mb-6 w-full max-w-[320px]" />
        <p className="text-[12.5px] font-semibold text-white/35">{DISCLAIMER}</p>
        <p className="mt-1.5 text-[11px] text-white/20">
          telegUP — учебный проект. Не связан с Telegram, Fragment или VIRUS GAME BOT.
        </p>
      </footer>
    </div>
  );
}