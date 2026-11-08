import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { GIFTS, RARITY_META, RARITY_ORDER, type Rarity } from "../data/gifts";
import { useGame } from "../store/useGame";
import { GiftArt, StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";

type Filter = "all" | Rarity;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  ...RARITY_ORDER.map((r) => ({ id: r as Filter, label: RARITY_META[r].label })),
];

const TABS = [
  { id: "gift", label: "Подарки" },
  { id: "model", label: "Модели" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Market() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addItem = useGame((s) => s.addItem);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"price" | "priceDesc" | "name">("price");
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("gift");
  const [collection, setCollection] = useState<string>("all");

  const list = useMemo(() => {
    let out = GIFTS.filter((g) => g.kind === tab);
    if (filter !== "all") out = out.filter((g) => g.rarity === filter);
    if (collection !== "all") out = out.filter((g) => g.slug === collection);
    out = [...out].sort((a, b) =>
      sort === "price" ? a.stars - b.stars : sort === "priceDesc" ? b.stars - a.stars : a.variant.localeCompare(b.variant),
    );
    return out;
  }, [filter, sort, tab, collection]);

  const collections = useMemo(() => {
    const slugs = new Set(GIFTS.filter((g) => g.kind === tab).map((g) => g.slug));
    return [...slugs].sort();
  }, [tab]);

  const buy = (id: string) => {
    const gift = GIFTS.find((g) => g.id === id);
    if (!gift) return;
    if (stars < gift.stars) {
      toast({ kind: "error", title: "Мало звёзд", message: `Нужно ${gift.stars.toLocaleString("ru-RU")} ★` });
      return;
    }
    setBusy(id);
    window.setTimeout(() => {
      if (spendStars(gift.stars)) {
        addItem(gift.id, "market");
        bumpStat("marketBuys");
        toast({ kind: "gift", title: gift.name, message: `−${gift.stars.toLocaleString("ru-RU")} ★` });
      }
      setBusy(null);
    }, 320);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-neon/80">Market</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Маркет подарков</h1>
          <p className="mt-1 text-[12.5px] text-white/35">
            {GIFTS.length.toLocaleString("ru-RU")} реальных предметов Telegram · цены в TON справочные
          </p>
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
            onClick={() => {
              setTab(t.id);
              setCollection("all");
            }}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-colors ${
              tab === t.id ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/75"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-white/8 bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${
                filter === f.id ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/75"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="max-w-[190px] rounded-xl border border-white/8 bg-black/40 px-2.5 py-1.5 text-[11.5px] font-bold text-white/60 outline-none"
          >
            <option value="all">Все коллекции</option>
            {collections.map((s) => (
              <option key={s} value={s}>
                {GIFTS.find((g) => g.slug === s)?.name ?? s}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              setSort((s) => (s === "price" ? "priceDesc" : s === "priceDesc" ? "name" : "price"))
            }
            className="rounded-xl border border-white/8 px-3 py-1.5 text-[11.5px] font-bold text-white/50 hover:text-white"
          >
            {sort === "price" ? "дешевле ↑" : sort === "priceDesc" ? "дороже ↓" : "по имени"}
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.slice(0, 300).map((g, i) => {
          const meta = RARITY_META[g.rarity];
          const canBuy = stars >= g.stars;
          return (
            <motion.article
              key={g.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.012, 0.25), duration: 0.3 }}
              className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-white/[0.025] transition-transform duration-300 hover:-translate-y-1 ${meta.ring}`}
            >
              <div
                className="relative grid h-[112px] place-items-center overflow-hidden"
                style={{ background: `radial-gradient(120% 105% at 50% 5%, ${g.tint}2e, #0e0e12 72%)` }}
              >
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.08, rotate: -2 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                >
                  <GiftArt gift={g} size={72} rounded="rounded-xl" />
                </motion.div>
                <span className={`absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider ${meta.chip}`}>
                  {meta.label}
                </span>
                {g.ton > 0 && (
                  <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[8.5px] font-bold tabular-nums text-white/55 backdrop-blur">
                    {g.ton.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} TON
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col p-2.5">
                <h3 className="truncate text-[12px] font-extrabold tracking-tight">{g.name}</h3>
                <p className="truncate text-[10px] text-white/35">{g.variant === "Gift" ? "Коллекционный подарок" : g.variant}</p>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-white/25">{g.rarityPct > 0 ? `${g.rarityPct}%` : "gift"}</span>
                  <span className="flex items-center gap-0.5 text-[12px] font-extrabold tabular-nums text-neon/90">
                    {g.stars.toLocaleString("ru-RU")}
                    <StarIcon className="size-2.5" />
                  </span>
                </div>

                <Button
                  full
                  size="sm"
                  className="mt-2"
                  variant={canBuy ? "primary" : "ghost"}
                  disabled={!canBuy || busy === g.id}
                  onClick={() => buy(g.id)}
                >
                  {busy === g.id ? "Покупка…" : canBuy ? "Купить" : "Мало ★"}
                </Button>
              </div>
            </motion.article>
          );
        })}
      </section>

      {list.length > 300 && (
        <p className="text-center text-[11px] text-white/25">
          Показано 300 из {list.length.toLocaleString("ru-RU")} — выберите коллекцию или редкость, чтобы сузить.
        </p>
      )}

      <p className="rounded-2xl border border-white/6 bg-white/[0.02] p-3.5 text-center text-[10.5px] leading-relaxed text-white/25">
        Цены в TON взяты из реального Fragment-подобного маркета и приведены для атмосферы. Покупка идёт за
        локальные звёзды и не создаёт никаких обязательств.
      </p>
    </div>
  );
}