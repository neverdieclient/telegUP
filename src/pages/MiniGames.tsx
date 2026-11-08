import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { GIFT_BY_ID, RARITY_META } from "../data/gifts";
import { rand, randInt, rollRarity } from "../lib/rng";
import { useGame } from "../store/useGame";
import { StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";

/* ============================ CRASH ============================ */

function CrashGame() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [bet, setBet] = useState(100);
  const [running, setRunning] = useState(false);
  const [cashed, setCashed] = useState(false);
  const [mult, setMult] = useState(1);
  const [crashAt, setCrashAt] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const raf = useRef<number>(0);
  const startRef = useRef(0);
  const crashRef = useRef(2);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const start = () => {
    if (running) return;
    if (!spendStars(bet)) {
      toast({ kind: "error", title: "Мало звёзд" });
      return;
    }
    // heavy-tailed crash point
    const r = rand();
    const point = Math.max(1.01, +(0.99 / Math.max(0.001, 1 - r)).toFixed(2));
    crashRef.current = point;
    setCrashAt(null);
    setCashed(false);
    setMult(1);
    setRunning(true);
    startRef.current = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const m = Math.max(1, Math.pow(1.072, elapsed * 4));
      if (m >= crashRef.current) {
        setMult(crashRef.current);
        setRunning(false);
        setCrashAt(crashRef.current);
        setHistory((h) => [+crashRef.current.toFixed(2), ...h].slice(0, 8));
        toast({ kind: "error", title: `Краш на x${crashRef.current.toFixed(2)}`, message: "Ставка потеряна" });
        return;
      }
      setMult(m);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const cashOut = () => {
    if (!running || cashed) return;
    cancelAnimationFrame(raf.current);
    const won = Math.floor(bet * mult);
    addStars(won);
    setRunning(false);
    setCashed(true);
    setCrashAt(null);
    bumpStat("crashWins");
    toast({ kind: "success", title: `Забрал x${mult.toFixed(2)}`, message: `+${won.toLocaleString("ru-RU")} ★` });
  };

  const points = useMemo(() => {
    const pts: string[] = [];
    const max = Math.max(2, Math.min(crashAt ?? mult, 10));
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const m = 1 + (max - 1) * Math.pow(t, 1.6);
      pts.push(`${t * 100},${100 - ((m - 1) / (max - 1)) * 88}`);
    }
    return pts.join(" ");
  }, [mult, crashAt]);

  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-extrabold tracking-tight">Crash</h3>
          <p className="text-[11px] text-white/30">Забери до краша</p>
        </div>
        <div className="flex gap-1">
          {history.slice(0, 5).map((h, i) => (
            <span
              key={`${h}-${i}`}
              className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-bold ${
                h >= 2 ? "bg-neon/15 text-neon" : "bg-mythic/15 text-mythic"
              }`}
            >
              x{h}
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-[190px] overflow-hidden rounded-2xl border border-white/6 bg-[#0a0a0d]">
        <div className="absolute inset-0 opacity-40 grid-bg" />
        {running || crashAt ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
            <defs>
              <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={crashAt ? "#ff3d6e" : "#a3ff12"} stopOpacity=".35" />
                <stop offset="1" stopColor="#0a0a0d" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`0,100 ${points} 100,100`} fill="url(#crashFill)" />
            <polyline
              points={points}
              fill="none"
              stroke={crashAt ? "#ff3d6e" : "#a3ff12"}
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/15">готов?</p>
          </div>
        )}
        <div className="absolute inset-0 grid place-items-center">
          <motion.p
            key={crashAt ? "crash" : "live"}
            animate={{ scale: running ? [1, 1.03, 1] : 1 }}
            transition={{ duration: 0.6, repeat: running ? Infinity : 0 }}
            className={`font-display text-4xl font-black tabular-nums ${
              crashAt ? "text-mythic" : cashed ? "text-neon" : "text-white"
            }`}
          >
            x{(crashAt ?? mult).toFixed(2)}
          </motion.p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <StarIcon className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/25" />
          <input
            type="number"
            min={1}
            value={bet}
            disabled={running}
            onChange={(e) => setBet(Math.max(1, Math.min(stars, Number(e.target.value) || 1)))}
            className="h-10 w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-[13px] font-bold tabular-nums outline-none focus:border-neon/40"
          />
        </div>
        {running ? (
          <Button variant="primary" className="min-w-[130px]" onClick={cashOut}>
            Забрать {(bet * mult).toFixed(0)}★
          </Button>
        ) : (
          <Button className="min-w-[130px]" onClick={start} disabled={stars < bet}>
            Ставка {bet.toLocaleString("ru-RU")}
          </Button>
        )}
      </div>
      <div className="mt-2 flex gap-1.5">
        {[...[1000, 10_000, 100_000, 1_000_000].filter((v) => v <= stars), stars].map((v, i, arr) => (
          <button
            key={i}
            disabled={running}
            onClick={() => setBet(Math.max(1, v))}
            className="rounded-lg border border-white/8 px-2 py-1 text-[10px] font-bold text-white/40 hover:text-white disabled:opacity-30"
          >
            {i === arr.length - 1 ? "ALL IN" : v.toLocaleString("ru-RU")}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================ MINES ============================ */

function MinesGame() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [bet, setBet] = useState(100);
  const [mineCount, setMineCount] = useState(3);
  const [mines, setMines] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [active, setActive] = useState(false);
  const [dead, setDead] = useState(false);

  const start = () => {
    if (!spendStars(bet)) {
      toast({ kind: "error", title: "Мало звёзд" });
      return;
    }
    const s = new Set<number>();
    while (s.size < mineCount) s.add(randInt(25));
    setMines(s);
    setOpened(new Set());
    setActive(true);
    setDead(false);
  };

  const multiplier = useMemo(() => {
    if (opened.size === 0) return 1;
    let m = 1;
    for (let i = 0; i < opened.size; i++) {
      m *= (25 - i) / (25 - mineCount - i);
    }
    return m * 0.97;
  }, [opened.size, mineCount]);

  const reveal = (i: number) => {
    if (!active || dead || opened.has(i)) return;
    if (mines.has(i)) {
      setDead(true);
      setActive(false);
      setOpened((o) => new Set(o).add(i));
      toast({ kind: "error", title: "Мина!", message: `-${bet.toLocaleString("ru-RU")} ★` });
      return;
    }
    const next = new Set(opened).add(i);
    setOpened(next);
    if (next.size === 25 - mineCount) {
      const won = Math.floor(bet * multiplier);
      addStars(won);
      setActive(false);
      bumpStat("minesWins");
      toast({ kind: "success", title: "Поле очищено!", message: `+${won.toLocaleString("ru-RU")} ★` });
    }
  };

  const cashOut = () => {
    if (!active || opened.size === 0) return;
    const won = Math.floor(bet * multiplier);
    addStars(won);
    setActive(false);
    bumpStat("minesWins");
    toast({ kind: "success", title: `Забрал x${multiplier.toFixed(2)}`, message: `+${won.toLocaleString("ru-RU")} ★` });
  };

  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-extrabold tracking-tight">Mines</h3>
          <p className="text-[11px] text-white/30">5×5 · {mineCount} мин</p>
        </div>
        <p className={`text-[15px] font-extrabold tabular-nums ${multiplier > 1 ? "text-neon" : "text-white/30"}`}>
          x{multiplier.toFixed(2)}
        </p>
      </div>

      <div className="mx-auto grid max-w-[300px] grid-cols-5 gap-1.5">
        {Array.from({ length: 25 }, (_, i) => {
          const isOpen = opened.has(i);
          const isMine = (dead || !active) && mines.has(i) && opened.size > 0;
          return (
            <motion.button
              key={i}
              onClick={() => reveal(i)}
              disabled={!active}
              whileHover={active ? { y: -2 } : undefined}
              whileTap={active ? { scale: 0.94 } : undefined}
              className={[
                "grid aspect-square place-items-center rounded-xl border text-[15px] font-bold transition-colors",
                isOpen && !mines.has(i)
                  ? "border-neon/30 bg-neon/12 text-neon"
                  : isOpen && mines.has(i)
                    ? "border-mythic/40 bg-mythic/18 text-mythic"
                    : isMine
                      ? "border-white/5 bg-white/[0.02] text-white/20"
                      : "border-white/8 bg-white/[0.05] text-transparent hover:bg-white/[0.1]",
              ].join(" ")}
            >
              {isOpen && !mines.has(i) ? "★" : (isOpen || isMine) && mines.has(i) ? "✸" : "•"}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <input
          type="number"
          min={1}
          value={bet}
          disabled={active}
          onChange={(e) => setBet(Math.max(1, Number(e.target.value) || 1))}
          className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-[13px] font-bold tabular-nums outline-none focus:border-neon/40"
        />
        <select
          value={mineCount}
          disabled={active}
          onChange={(e) => setMineCount(Number(e.target.value))}
          className="h-10 rounded-xl border border-white/10 bg-black/40 px-2 text-[12px] font-bold outline-none"
        >
          {[1, 3, 5, 10].map((n) => (
            <option key={n} value={n} className="bg-[#121212]">
              {n} мин
            </option>
          ))}
        </select>
        {active ? (
          <Button onClick={cashOut} disabled={opened.size === 0}>
            Забрать
          </Button>
        ) : (
          <Button onClick={start} disabled={stars < bet}>
            Играть
          </Button>
        )}
      </div>
    </div>
  );
}

/* ============================ PVP ============================ */

type PvpItem = { name: string; stars: number; color: string; rarity: keyof typeof RARITY_META };

function makeBotItem(): PvpItem {
  const rarity = rollRarity({ common: 0.4, rare: 0.33, epic: 0.19, legendary: 0.07, mythic: 0.01 });
  const pool = Object.values(GIFT_BY_ID).filter((g) => g.rarity === rarity);
  const g = pool[randInt(pool.length)];
  return { name: g.name, stars: g.stars, color: g.tint, rarity: g.rarity };
}

function PvpGame() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [bet, setBet] = useState(500);
  const [you, setYou] = useState<PvpItem | null>(null);
  const [bot, setBot] = useState<PvpItem | null>(null);
  const [phase, setPhase] = useState<"idle" | "spin" | "done">("idle");
  const [verdict, setVerdict] = useState<"win" | "lose" | "draw" | null>(null);

  const play = () => {
    if (phase === "spin") return;
    if (!spendStars(bet)) {
      toast({ kind: "error", title: "Мало звёзд" });
      return;
    }
    setPhase("spin");
    setVerdict(null);
    setYou(null);
    setBot(null);

    let ticks = 0;
    const int = window.setInterval(() => {
      setYou(makeBotItem());
      setBot(makeBotItem());
      ticks++;
      if (ticks > 14) {
        window.clearInterval(int);
        const a = makeBotItem();
        const b = makeBotItem();
        setYou(a);
        setBot(b);
        setPhase("done");
        if (a.stars > b.stars) {
          addStars(bet * 2);
          bumpStat("pvpWins");
          setVerdict("win");
          toast({ kind: "success", title: "Победа в PvP", message: `+${(bet * 2).toLocaleString("ru-RU")} ★` });
        } else if (a.stars < b.stars) {
          bumpStat("pvpLosses");
          setVerdict("lose");
          toast({ kind: "error", title: "Поражение", message: `-${bet.toLocaleString("ru-RU")} ★` });
        } else {
          addStars(bet);
          setVerdict("draw");
          toast({ kind: "info", title: "Ничья", message: "Ставка возвращена" });
        }
      }
    }, 120);
  };

  const Card = ({ item, side }: { item: PvpItem | null; side: "you" | "bot" }) => (
    <div className="flex-1">
      <p className="mb-1.5 text-center text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/30">
        {side === "you" ? "Ты" : "Бот"}
      </p>
      <motion.div
        animate={phase === "spin" ? { scale: [1, 1.03, 1] } : {}}
        transition={{ duration: 0.12, repeat: phase === "spin" ? Infinity : 0 }}
        className={`flex h-[92px] flex-col items-center justify-center rounded-2xl border px-2 text-center ${
          item ? RARITY_META[item.rarity].ring : "border-white/8"
        }`}
        style={{
          background: item
            ? `radial-gradient(120% 120% at 50% 0%, ${item.color}33, #0e0e12)`
            : "linear-gradient(180deg,#141419,#0d0d10)",
        }}
      >
        {item ? (
          <>
            <p className="w-full truncate text-[11.5px] font-extrabold">{item.name}</p>
            <p className={`text-[10px] font-bold ${RARITY_META[item.rarity].text}`}>
              {item.stars.toLocaleString("ru-RU")}★
            </p>
          </>
        ) : (
          <span className="text-[10px] font-bold text-white/20">—</span>
        )}
      </motion.div>
    </div>
  );

  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
      <div className="mb-3">
        <h3 className="text-[14px] font-extrabold tracking-tight">PvP · 1 vs Бот</h3>
        <p className="text-[11px] text-white/30">У кого подарок дороже — забирает банк</p>
      </div>

      <div className="flex items-stretch gap-2">
        <Card item={you} side="you" />
        <div className="flex flex-col items-center justify-center">
          <span className="font-display text-lg font-black text-white/20">VS</span>
        </div>
        <Card item={bot} side="bot" />
      </div>

      <AnimatePresence>
        {verdict && phase === "done" && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-2.5 text-center text-[12px] font-extrabold ${
              verdict === "win" ? "text-neon" : verdict === "lose" ? "text-mythic" : "text-white/50"
            }`}
          >
            {verdict === "win" ? "Ты забрал банк" : verdict === "lose" ? "Бот забрал банк" : "Ничья"}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <input
          type="number"
          min={1}
          value={bet}
          disabled={phase === "spin"}
          onChange={(e) => setBet(Math.max(1, Number(e.target.value) || 1))}
          className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-[13px] font-bold tabular-nums outline-none focus:border-neon/40"
        />
        <Button onClick={play} disabled={phase === "spin" || stars < bet} className="min-w-[110px]">
          {phase === "spin" ? "…" : "В бой"}
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-white/20">
        Выигрыш ×2. При ничьей ставка возвращается.
      </p>
    </div>
  );
}

/* ============================ SHARED ============================ */

function BetPanel({
  bet,
  setBet,
  stars,
  max = 1_000_000,
}: {
  bet: number;
  setBet: (n: number) => void;
  stars: number;
  max?: number;
}) {
  const presets = [100, 1_000, 10_000, 100_000, 500_000].filter((p) => p <= max);
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Ставка</p>
        <p className="text-[10.5px] tabular-nums text-white/30">{stars.toLocaleString("ru-RU")} ★ доступно</p>
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          type="number"
          min={1}
          max={max}
          value={bet}
          onChange={(e) => setBet(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[13px] font-bold tabular-nums text-white outline-none focus:border-neon/40"
        />
        <div className="flex gap-1">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setBet(p)}
              className="rounded-lg border border-white/8 px-2 text-[10.5px] font-bold tabular-nums text-white/45 hover:text-white"
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setBet(Math.min(max, stars))}
            className="rounded-lg border border-neon/25 px-2 text-[10.5px] font-bold text-neon/80 hover:text-neon"
          >
            max
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ DICE ============================ */

function DiceGame() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [bet, setBet] = useState(100);
  const [over, setOver] = useState(true);
  const [target, setTarget] = useState(50);
  const [roll, setRoll] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<number[]>([]);

  // chance = 0.95 for exact 50/50, shrinking as the window narrows
  const chance = over ? (100 - target) * 0.95 : target * 0.95;
  const multiplier = chance > 0 ? 100 / chance : 0;

  const play = () => {
    if (rolling) return;
    if (!spendStars(bet)) {
      toast({ kind: "error", title: "Мало звёзд" });
      return;
    }
    setRolling(true);
    setRoll(null);
    const value = Math.round(rand() * 9999) / 100; // 0.00 – 99.99
    window.setTimeout(() => {
      const win = over ? value > target : value < target;
      setRoll(value);
      setRolling(false);
      setHistory((h) => [value, ...h].slice(0, 10));
      if (win) {
        addStars(Math.round(bet * multiplier));
        bumpStat("diceWins");
        toast({ kind: "success", title: `${value.toFixed(2)} — победа`, message: `×${multiplier.toFixed(2)}` });
      } else {
        toast({ kind: "error", title: `${value.toFixed(2)} — мимо`, message: `−${bet.toLocaleString("ru-RU")} ★` });
      }
    }, 900);
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-transparent p-5">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">Выпало</p>
          <motion.p
            key={roll ?? "idle"}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`font-display text-5xl font-black tabular-nums ${
              roll === null ? "text-white/25" : (over ? roll > target : roll < target) ? "text-neon" : "text-mythic"
            }`}
          >
            {rolling ? "…" : roll === null ? "--.--" : roll.toFixed(2)}
          </motion.p>
          <p className="mt-1 text-[11.5px] text-white/35">
            {over ? `больше ${target}` : `меньше ${target}`} · ×{multiplier.toFixed(2)}
          </p>
        </div>

        <div className="mt-4 flex gap-1.5">
          {[
            [true, "Больше"],
            [false, "Меньше"],
          ].map(([v, l]) => (
            <button
              key={l as string}
              onClick={() => setOver(v as boolean)}
              className={`flex-1 rounded-xl border py-2 text-[12px] font-bold transition-colors ${
                over === v ? "border-neon/40 bg-neon/10 text-neon" : "border-white/8 text-white/40"
              }`}
            >
              {l as string}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-[10.5px] font-bold tabular-nums text-white/35">
            <span>2</span>
            <span className="text-white/70">{target}</span>
            <span>98</span>
          </div>
          <input
            type="range"
            min={2}
            max={98}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="mt-1 w-full accent-neon"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {history.map((h, i) => (
            <span
              key={`${h}-${i}`}
              className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums ${
                h > 50 ? "bg-neon/10 text-neon/80" : "bg-mythic/10 text-mythic/80"
              }`}
            >
              {h.toFixed(1)}
            </span>
          ))}
        </div>
      </div>

      <BetPanel bet={bet} setBet={setBet} stars={stars} />
      <Button full size="lg" onClick={play} disabled={rolling || stars < bet}>
        {rolling ? "Бросок…" : `Играть · ×${multiplier.toFixed(2)}`}
      </Button>
    </div>
  );
}

/* ============================ COINFLIP ============================ */

function CoinflipGame() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [bet, setBet] = useState(100);
  const [pick, setPick] = useState<"h" | "t">("h");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<"h" | "t" | null>(null);

  const play = () => {
    if (flipping) return;
    if (!spendStars(bet)) {
      toast({ kind: "error", title: "Мало звёзд" });
      return;
    }
    setFlipping(true);
    const outcome: "h" | "t" = rand() < 0.5 ? "h" : "t";
    window.setTimeout(() => {
      setResult(outcome);
      setFlipping(false);
      if (outcome === pick) {
        addStars(bet * 2);
        bumpStat("coinflipWins");
        toast({ kind: "success", title: "Выигрыш", message: `+${bet.toLocaleString("ru-RU")} ★` });
      } else {
        toast({ kind: "error", title: "Проигрыш", message: `−${bet.toLocaleString("ru-RU")} ★` });
      }
    }, 1100);
  };

  return (
    <div className="space-y-3">
      <div className="grid place-items-center rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-transparent p-7">
        <motion.div
          animate={flipping ? { rotateY: [0, 720, 1440], scale: [1, 1.08, 1] } : { rotateY: 0, scale: 1 }}
          transition={flipping ? { duration: 1.1, ease: "easeInOut" } : { duration: 0.2 }}
          className="grid size-32 place-items-center rounded-full border border-legendary/30 bg-[radial-gradient(circle_at_35%_25%,rgba(255,204,51,0.35),rgba(20,20,24,0.95)_70%)] shadow-[0_24px_60px_-30px_rgba(255,204,51,0.7)]"
        >
          <span className="font-display text-4xl font-black text-legendary">
            {flipping ? "?" : result === "h" ? "О" : result === "t" ? "Р" : "★"}
          </span>
        </motion.div>
        <p className="mt-4 text-[12px] text-white/40">
          {flipping ? "Монета крутится…" : result === null ? "Выбери сторону и бросай" : result === "h" ? "Орёл" : "Решка"}
        </p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ["h", "Орёл"],
            ["t", "Решка"],
          ] as ["h" | "t", string][]
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setPick(v)}
            className={`flex-1 rounded-xl border py-2.5 text-[12.5px] font-bold transition-colors ${
              pick === v ? "border-legendary/40 bg-legendary/10 text-legendary" : "border-white/8 text-white/40"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <BetPanel bet={bet} setBet={setBet} stars={stars} />
      <Button full size="lg" variant="violet" onClick={play} disabled={flipping || stars < bet}>
        {flipping ? "Бросок…" : "Подбросить · ×2"}
      </Button>
    </div>
  );
}

/* ============================ WHEEL ============================ */

const WHEEL: { mult: number; weight: number; color: string }[] = [
  { mult: 0, weight: 46, color: "#5b5b66" },
  { mult: 1.2, weight: 24, color: "#3b9dff" },
  { mult: 1.6, weight: 15, color: "#b45cff" },
  { mult: 2.2, weight: 8, color: "#ffb300" },
  { mult: 3, weight: 4, color: "#ff3d6e" },
  { mult: 5, weight: 2, color: "#a3ff12" },
  { mult: 10, weight: 1, color: "#ffffff" },
];

function WheelGame() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [bet, setBet] = useState(100);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<number | null>(null);

  const totalWeight = WHEEL.reduce((a, w) => a + w.weight, 0);
  const slice = 360 / WHEEL.length;

  const spin = () => {
    if (spinning) return;
    if (!spendStars(bet)) {
      toast({ kind: "error", title: "Мало звёзд" });
      return;
    }
    setSpinning(true);
    setWon(null);

    let r = rand() * totalWeight;
    let idx = 0;
    for (let i = 0; i < WHEEL.length; i++) {
      r -= WHEEL[i].weight;
      if (r <= 0) {
        idx = i;
        break;
      }
    }

    const targetCenter = idx * slice + slice / 2;
    const turns = 5 + randInt(2);
    const finalAngle = turns * 360 + (360 - targetCenter);
    setAngle(finalAngle);

    window.setTimeout(() => {
      setSpinning(false);
      const prize = WHEEL[idx];
      setWon(prize.mult);
      if (prize.mult > 0) {
        addStars(Math.round(bet * prize.mult));
        bumpStat("wheelWins");
        toast({ kind: "success", title: `×${prize.mult}`, message: `+${Math.round(bet * prize.mult).toLocaleString("ru-RU")} ★` });
      } else {
        toast({ kind: "error", title: "Пусто", message: "Попробуй ещё" });
      }
    }, 3600);
  };

  return (
    <div className="space-y-3">
      <div className="grid place-items-center rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-transparent p-5">
        <div className="relative size-[260px]">
          <motion.div
            className="absolute inset-0 rounded-full"
            animate={{ rotate: angle }}
            transition={{ duration: 3.5, ease: [0.1, 0.8, 0.1, 1] }}
            style={{
              background: `conic-gradient(${WHEEL.map((w, i) => `${w.color} ${i * slice}deg ${(i + 1) * slice}deg`).join(",")})`,
              boxShadow: "inset 0 0 0 10px #0b0b0e, 0 24px 60px -30px rgba(0,0,0,1)",
            }}
          >
            {WHEEL.map((w, i) => (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 origin-bottom text-[11px] font-black"
                style={{
                  transform: `translate(-50%, -100%) rotate(${i * slice + slice / 2}deg)`,
                  transformOrigin: "50% 100%",
                  marginTop: 22,
                  color: i === WHEEL.length - 1 ? "#111" : "#fff",
                  textShadow: "0 1px 2px rgba(0,0,0,.6)",
                }}
              >
                ×{w.mult}
              </span>
            ))}
          </motion.div>
          <div className="pointer-events-none absolute left-1/2 top-[-6px] -translate-x-1/2">
            <svg viewBox="0 0 16 18" className="size-4 fill-neon drop-shadow-[0_0_8px_rgba(163,255,18,0.8)]">
              <path d="M8 18 0 0h16Z" />
            </svg>
          </div>
          <div className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#0b0b0e] text-[10px] font-black text-white/60">
            {won === null ? "SPIN" : won === 0 ? "0" : `×${won}`}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-white/30">
          Шансы: {WHEEL.map((w) => `×${w.mult} — ${Math.round((w.weight / totalWeight) * 100)}%`).join(" · ")}
        </p>
      </div>

      <BetPanel bet={bet} setBet={setBet} stars={stars} />
      <Button full size="lg" onClick={spin} disabled={spinning || stars < bet}>
        {spinning ? "Крутится…" : "Крутить колесо"}
      </Button>
    </div>
  );
}

/* ============================ TOWER ============================ */

const TOWER_LEVELS = 8;

function TowerGame() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [bet, setBet] = useState(100);
  const [active, setActive] = useState(false);
  const [level, setLevel] = useState(0);
  const [losingCells, setLosingCells] = useState<number[]>([]);
  const [history, setHistory] = useState<{ level: number; cell: number }[]>([]);

  const multiplierAt = (l: number) => Math.pow(1.32, l + 1);

  const begin = () => {
    if (active) return;
    if (!spendStars(bet)) {
      toast({ kind: "error", title: "Мало звёзд" });
      return;
    }
    setActive(true);
    setLevel(0);
    setLosingCells([]);
    setHistory([]);
  };

  const step = (cell: number) => {
    if (!active) return;
    const lose = randInt(3);
    if (cell === lose) {
      setActive(false);
      setLosingCells([cell]);
      toast({ kind: "error", title: "Мина на этаже", message: `Сгорело ${bet.toLocaleString("ru-RU")} ★` });
      return;
    }
    const next = level + 1;
    setLevel(next);
    setHistory((h) => [...h, { level: next, cell }]);
    if (next >= TOWER_LEVELS) {
      const prize = Math.round(bet * multiplierAt(next - 1));
      addStars(prize);
      bumpStat("towerWins");
      setActive(false);
      toast({ kind: "success", title: "Дошёл до вершины!", message: `+${prize.toLocaleString("ru-RU")} ★` });
    }
  };

  const cashout = () => {
    if (!active || level === 0) return;
    const prize = Math.round(bet * multiplierAt(level - 1));
    addStars(prize);
    bumpStat("towerWins");
    setActive(false);
    toast({ kind: "success", title: "Забрал выигрыш", message: `+${prize.toLocaleString("ru-RU")} ★` });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-transparent p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">
            Этаж {level}/{TOWER_LEVELS}
          </p>
          <p className="text-[13px] font-extrabold tabular-nums text-neon">
            {active ? `×${multiplierAt(Math.max(0, level - 1)).toFixed(2)}` : "—"}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-1.5">
          {Array.from({ length: TOWER_LEVELS }, (_, i) => {
            const reached = i < level;
            const isNext = active && i === level;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-right text-[9.5px] font-bold tabular-nums text-white/25">{i + 1}</span>
                <div className="grid flex-1 grid-cols-3 gap-1.5">
                  {[0, 1, 2].map((cell) => {
                    const picked = history.find((h) => h.level === i + 1)?.cell === cell && reached;
                    const boom = !active && losingCells.includes(cell) && i === level;
                    return (
                      <button
                        key={cell}
                        disabled={!isNext}
                        onClick={() => step(cell)}
                        className={`h-9 rounded-lg border text-[11px] font-black transition-all ${
                          picked
                            ? "border-neon/50 bg-neon/20 text-neon"
                            : boom
                              ? "border-mythic/60 bg-mythic/25 text-mythic"
                              : isNext
                                ? "border-white/15 bg-white/[0.05] text-white/40 hover:-translate-y-0.5 hover:border-neon/40 hover:text-neon"
                                : "border-white/5 bg-black/20 text-white/10"
                        }`}
                      >
                        {picked ? "✓" : boom ? "✕" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BetPanel bet={bet} setBet={setBet} stars={stars} />
      <div className="grid grid-cols-2 gap-2">
        <Button full onClick={begin} disabled={active || stars < bet} variant={active ? "ghost" : "primary"}>
          {active ? "В игре…" : "Начать"}
        </Button>
        <Button full variant="violet" onClick={cashout} disabled={!active || level === 0}>
          Забрать
        </Button>
      </div>
      <p className="text-center text-[10.5px] text-white/25">На каждом этаже 1 из 3 клеток — мина. ×1.32 за этаж.</p>
    </div>
  );
}

/* ============================ HI-LO ============================ */

function HiLoGame() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [bet, setBet] = useState(100);
  const [card, setCard] = useState(() => randInt(13) + 1);
  const [streak, setStreak] = useState(0);
  const [pot, setPot] = useState(0);
  const [busy, setBusy] = useState(false);

  const multiplier = Math.pow(1.85, streak);

  const start = () => {
    if (!spendStars(bet)) {
      toast({ kind: "error", title: "Мало звёзд" });
      return;
    }
    setStreak(1);
    setPot(bet);
    setCard(randInt(13) + 1);
  };

  const guess = (higher: boolean) => {
    if (busy || streak === 0) return;
    setBusy(true);
    const next = randInt(13) + 1;
    // equal ranks push: retry once for clean resolution
    const diff = next === card ? (rand() < 0.5 ? 1 : -1) : next - card;
    const win = higher ? diff > 0 : diff < 0;
    window.setTimeout(() => {
      setCard(next);
      setBusy(false);
      if (win) {
        setStreak((s) => s + 1);
        setPot((p) => Math.round(p * 1.85));
        toast({ kind: "success", title: "Верно!", message: `Банк ${Math.round(pot * 1.85).toLocaleString("ru-RU")} ★` });
      } else {
        setStreak(0);
        setPot(0);
        toast({ kind: "error", title: "Не угадал", message: "Ставка сгорела" });
      }
    }, 500);
  };

  const cashout = () => {
    if (streak === 0) return;
    addStars(pot);
    bumpStat("diceWins");
    toast({ kind: "success", title: "Забрал банк", message: `+${pot.toLocaleString("ru-RU")} ★` });
    setStreak(0);
    setPot(0);
  };

  return (
    <div className="space-y-3">
      <div className="grid place-items-center rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.045] to-transparent p-6">
        <motion.div
          key={card}
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          className="grid h-40 w-28 place-items-center rounded-2xl border border-white/15 bg-white text-black shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]"
        >
          <span className="font-display text-4xl font-black">{card}</span>
        </motion.div>
        <div className="mt-4 flex gap-4 text-center">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/25">стрик</p>
            <p className="text-[15px] font-extrabold tabular-nums">{streak}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/25">банк</p>
            <p className="text-[15px] font-extrabold tabular-nums text-neon">{pot.toLocaleString("ru-RU")} ★</p>
          </div>
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/25">множитель</p>
            <p className="text-[15px] font-extrabold tabular-nums text-violet">×{multiplier.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <BetPanel bet={bet} setBet={setBet} stars={stars} />
      {streak === 0 ? (
        <Button full size="lg" onClick={start} disabled={stars < bet}>
          Раздать карту
        </Button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Button full onClick={() => guess(false)} disabled={busy}>
            Ниже
          </Button>
          <Button full variant="violet" onClick={() => guess(true)} disabled={busy}>
            Выше
          </Button>
          <Button full variant="ghost" onClick={cashout} disabled={busy}>
            Забрать
          </Button>
        </div>
      )}
      <p className="text-center text-[10.5px] text-white/25">
        Карты от 1 до 13. Каждое угаданное — ×1.85. Не угадал — банк сгорает.
      </p>
    </div>
  );
}

/* ============================ PAGE ============================ */

const TABS = [
  { id: "crash", label: "Crash" },
  { id: "mines", label: "Mines" },
  { id: "pvp", label: "PvP" },
  { id: "dice", label: "Dice" },
  { id: "coinflip", label: "Монетка" },
  { id: "wheel", label: "Колесо" },
  { id: "tower", label: "Tower" },
  { id: "hilo", label: "Hi-Lo" },
] as const;

export default function MiniGames() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("crash");
  const stars = useGame((s) => s.stars);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-legendary">Arcade</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Мини-игры</h1>
          <p className="mt-1 text-[12.5px] text-white/35">Ставки на звёзды. Всё происходит локально.</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
          <StarIcon className="size-4 text-neon" />
          <span className="text-[15px] font-extrabold tabular-nums">{stars.toLocaleString("ru-RU")}</span>
        </div>
      </header>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-xl px-4 py-2 text-[12.5px] font-bold transition-colors ${
              tab === t.id ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/75"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="max-w-2xl"
        >
          {tab === "crash" && <CrashGame />}
          {tab === "mines" && <MinesGame />}
          {tab === "pvp" && <PvpGame />}
          {tab === "dice" && <DiceGame />}
          {tab === "coinflip" && <CoinflipGame />}
          {tab === "wheel" && <WheelGame />}
          {tab === "tower" && <TowerGame />}
          {tab === "hilo" && <HiLoGame />}
        </motion.div>
      </AnimatePresence>

      <p className="max-w-2xl rounded-2xl border border-white/6 bg-white/[0.02] p-3.5 text-[10.5px] leading-relaxed text-white/25">
        Это игра. Все подарки вымышлены, реальный вывод средств невозможен.
        Игры не используют реальные деньги и не связаны с Telegram.
      </p>
    </div>
  );
}