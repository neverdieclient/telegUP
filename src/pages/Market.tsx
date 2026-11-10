import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { RARITY_META, RARITY_ORDER, SHOP_ITEMS, type Gift, type Rarity } from "../data/gifts";
import { isPurchasable } from "../data/customGifts";
import { builtInArt, formatLeft, loadDrops, type LiveDrop } from "../data/drops";
import { modelOptions } from "../lib/rng";
import { useAllGifts, useCustomGiftRows, useGiftIndex } from "../lib/useCatalog";
import { useIsOwnerEmail } from "../lib/useIsOwnerEmail";
import { useLiveDrops } from "../data/drops";
import { useBoost } from "../lib/starBoost";
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

/**
 * Nicer, more expensive versions of a gift — every real model of the same
 * collectible that is worth at least as much as the base item. A plain gift
 * opens the full model list of its collection, so clicking any gift always
 * shows something better to buy.
 */
function upgradedOptions(gift: Gift): Gift[] {
  const models = modelOptions(gift).filter((m) => m.id !== gift.id);
  return models
    .filter((m) => m.stars >= gift.stars)
    .sort((a, b) => a.stars - b.stars);
}

/**
 * The live limited drop — a gift the owner picked and framed as «Лимитед».
 * While the countdown runs it can be bought; once it ends the shelf turns
 * grey and says the drop is over, but the gift itself stays in the catalogue.
 */
function LiveDropShelf({ drop, onBuy }: { drop: LiveDrop; onBuy: (gift: Gift) => void }) {
  const gift = drop.gift;
  const art = gift?.image ?? builtInArt(drop.slug);
  const ended = drop.phase === "ended";
  const scheduled = drop.phase === "scheduled";

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className={`relative overflow-hidden rounded-3xl border p-4 ${
        ended
          ? "border-white/8 bg-white/[0.015]"
          : "border-[#ff5c8a]/30 bg-gradient-to-br from-[#ff5c8a]/[0.12] via-white/[0.02] to-transparent"
      }`}
    >
      {!ended && (
        <motion.div
          className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full bg-[#ff5c8a]/25 blur-[64px]"
          animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0.85, 0.55] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="relative flex items-center gap-3.5">
        <div className="relative grid size-16 shrink-0 place-items-center rounded-2xl bg-black/35">
          {art ? (
            <img src={art} alt="" className={`size-14 object-contain ${ended ? "opacity-40 grayscale" : ""}`} />
          ) : (
            <span className="text-[26px]">{ended ? "🔒" : "🎁"}</span>
          )}
          {!ended && (
            <motion.span
              className="absolute -right-1 -top-1 rounded-md bg-[#ff5c8a] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white shadow-lg"
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              limited
            </motion.span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-black uppercase tracking-[0.18em] text-[#ff5c8a]/80">
            Лимитед-дроп
          </p>
          <p className="truncate text-[15px] font-extrabold tracking-tight">
            {gift?.name ?? drop.label ?? drop.slug}
          </p>
          <p className="mt-0.5 text-[11px] text-white/40">
            {ended
              ? "Дроп завершён — подарок больше не продаётся"
              : scheduled
                ? "Скоро начнётся"
                : drop.ends_at
                  ? `Осталось ${formatLeft(drop.msLeft)}`
                  : null}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {!ended && gift && (
            <p className="mb-1.5 flex items-center justify-end gap-0.5 text-[13px] font-extrabold tabular-nums text-neon">
              {gift.stars.toLocaleString("ru-RU")}
              <StarIcon className="size-3" />
            </p>
          )}
          <Button
            size="sm"
            variant={ended ? "outline" : "primary"}
            disabled={ended || !gift}
            onClick={() => gift && onBuy(gift)}
          >
            {ended ? "Завершён" : "Купить"}
          </Button>
        </div>
      </div>

      {!ended && (
        <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-black/40">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#ff5c8a] to-[#ffb199]"
            initial={{ width: "100%" }}
            animate={{ width: drop.ends_at ? `${Math.max(0, Math.min(100, (drop.msLeft / (24 * 3600_000)) * 100))}%` : "100%" }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}
    </motion.section>
  );
}

/**
 * Telegram Premium — moved here from the retired «Апгрейд» tab.
 *
 * A single card: buy once, get the star by the avatar, the Premium badge and
 * the case discount. Buying is the same store action the shop used.
 */
function PremiumSection() {
  const stars = useGame((s) => s.stars);
  const profile = useGame((s) => s.profile);
  const shopItems = useGame((s) => s.shopItems);
  const buyShopItem = useGame((s) => s.buyShopItem);
  const toast = useGame((s) => s.toast);
  const [ask, setAsk] = useState(false);

  const item = SHOP_ITEMS.find((s) => s.kind === "premium");
  if (!item) return null;

  const owned = shopItems.includes(item.id) || profile.tier === "Premium";
  const canBuy = !owned && stars >= item.price;

  const confirm = () => {
    if (buyShopItem(item.id, item.price)) {
      toast({ kind: "success", title: "Telegram Premium", message: "Активировано" });
    } else {
      toast({ kind: "error", title: "Не удалось купить" });
    }
    setAsk(false);
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#ffcc33]/25 bg-gradient-to-br from-[#ffcc33]/[0.10] via-white/[0.02] to-transparent p-4">
      <div className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-[#ffcc33]/20 blur-[60px]" />
      <div className="relative flex items-center gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#ffdf7a] to-[#ffb800] text-[20px] shadow-[0_14px_36px_-16px_rgba(255,204,51,0.95)]">
          ⭐
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[14.5px] font-extrabold tracking-tight">
            {item.name}
            {owned && (
              <span className="rounded-md bg-neon/15 px-1.5 py-0.5 text-[9px] font-bold text-neon">
                Куплено
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/35">{item.desc}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="mb-1.5 text-[12px] font-extrabold tabular-nums text-[#ffcc33]/90">
            {item.price.toLocaleString("ru-RU")} ★
          </p>
          <Button
            size="sm"
            variant={owned ? "outline" : canBuy ? "primary" : "ghost"}
            disabled={owned || !canBuy}
            onClick={() => setAsk(true)}
          >
            {owned ? "Есть" : canBuy ? "Купить" : "Мало ★"}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {ask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAsk(false)}
            className="fixed inset-0 z-[95] grid place-items-center bg-black/80 p-5 backdrop-blur"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-white/10 bg-[#0f0f13] p-5 text-center"
            >
              <p className="text-[15px] font-extrabold">Купить «{item.name}»?</p>
              <p className="mt-1 text-[12px] text-white/35">
                Спишется {item.price.toLocaleString("ru-RU")} ★. Это симуляция.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setAsk(false)}>
                  Отмена
                </Button>
                <Button variant="primary" onClick={confirm}>
                  Подтвердить
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default function Market() {
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addItem = useGame((s) => s.addItem);
  const bumpStat = useGame((s) => s.bumpStat);
  const toast = useGame((s) => s.toast);

  // built-in + owner-made gifts behave identically here
  const GIFTS = useAllGifts();
  const owner = useIsOwnerEmail();
  const customRows = useCustomGiftRows();

  /** A custom gift hidden from this visitor must not be buyable either. */
  const lockedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const r of customRows) if (!isPurchasable(r, owner)) set.add(r.slug);
    return set;
  }, [customRows, owner]);

  const giftIndex = useGiftIndex();
  const drops = useLiveDrops(giftIndex);
  const boost = useBoost();

  useEffect(() => {
    void loadDrops();
  }, []);

  /** The drop currently on air (Live), or the most recent one if none is. */
  const activeDrop = useMemo(() => {
    const live = drops.find((d) => d.phase === "live");
    if (live) return live;
    return drops.find((d) => d.phase === "scheduled") ?? drops[0] ?? null;
  }, [drops]);

  /** slug → ended drop: those gifts stay listed but cannot be bought again. */
  const endedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const d of drops) if (d.phase === "ended") set.add(d.slug);
    return set;
  }, [drops]);

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"price" | "priceDesc" | "name">("price");
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("gift");
  const [collection, setCollection] = useState<string>("all");
  const [detail, setDetail] = useState<Gift | null>(null);

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

  const buy = (gift: Gift) => {
    if (lockedSlugs.has(gift.slug)) {
      toast({ kind: "error", title: "Недоступно", message: "Этот подарок может купить только владелец" });
      return;
    }
    if (endedSlugs.has(gift.slug)) {
      toast({ kind: "error", title: "Лимитед-дроп завершён", message: "Этот подарок больше не продаётся" });
      return;
    }
    if (stars < gift.stars) {
      toast({ kind: "error", title: "Мало звёзд", message: `Нужно ${gift.stars.toLocaleString("ru-RU")} ★` });
      return;
    }
    setBusy(gift.id);
    window.setTimeout(() => {
      if (spendStars(gift.stars)) {
        addItem(gift.id, "market");
        bumpStat("marketBuys");
        toast({ kind: "gift", title: gift.name, message: `−${gift.stars.toLocaleString("ru-RU")} ★` });
      }
      setBusy(null);
    }, 320);
  };

  const detailModels = useMemo(() => (detail ? upgradedOptions(detail) : []), [detail]);

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

      {/* «двойные звёзды» — live, owner-switched payout boost */}
      <AnimatePresence>
        {boost.live && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative overflow-hidden rounded-2xl border border-[#ffd64d]/30 bg-gradient-to-r from-[#ffd64d]/[0.14] via-transparent to-[#ffb199]/[0.10] px-4 py-2.5"
          >
            <motion.div
              className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/12 to-transparent"
              animate={{ x: ["-120%", "360%"] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
            />
            <div className="relative flex items-center gap-2.5">
              <motion.span
                className="text-[17px]"
                animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.12, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                ⚡
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-extrabold tracking-tight text-[#ffe9a3]">
                  Двойные звёзды ×{Number(boost.multiplier.toFixed(2))}
                  {boost.title ? ` · ${boost.title}` : ""}
                </p>
                <p className="text-[10.5px] text-white/40">
                  {boost.msLeft > 0
                    ? `Ещё ${Math.floor(boost.msLeft / 60000)} мин — продажи и кейсы платят больше`
                    : "Пока владелец не выключит — продажи и кейсы платят больше"}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeDrop && <LiveDropShelf key={activeDrop.id} drop={activeDrop} onBuy={buy} />}
      </AnimatePresence>

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
            const locked = lockedSlugs.has(g.slug);
            const dropEnded = endedSlugs.has(g.slug);
            const dropLive = activeDrop?.phase === "live" && activeDrop.slug === g.slug;
            const canBuy = !locked && !dropEnded && stars >= g.stars;
          return (
            <motion.article
              key={g.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.012, 0.25), duration: 0.3 }}
              className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-white/[0.025] transition-transform duration-300 hover:-translate-y-1 ${meta.ring}`}
            >
              <button
                onClick={() => setDetail(g)}
                className="relative grid h-[112px] place-items-center overflow-hidden text-left"
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
                {(dropLive || dropEnded) && (
                  <span
                    className={`absolute bottom-2 left-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider ${
                      dropEnded ? "bg-black/70 text-white/40" : "bg-[#ff5c8a] text-white shadow-lg"
                    }`}
                  >
                    {dropEnded ? "🔒 дроп закрыт" : "limited"}
                  </span>
                )}
                {g.ton > 0 && (
                  <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[8.5px] font-bold tabular-nums text-white/55 backdrop-blur">
                    {g.ton.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} TON
                  </span>
                )}
              </button>

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

                <div className="mt-2 flex gap-1.5">
                  <Button
                    full
                    size="sm"
                    variant={canBuy ? "primary" : "ghost"}
                    disabled={!canBuy || busy === g.id}
                    onClick={() => buy(g)}
                  >
                    {busy === g.id ? "Покупка…" : locked ? "Недоступно" : dropEnded ? "Дроп закрыт" : canBuy ? "Купить" : "Мало ★"}
                  </Button>
                </div>
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

      <PremiumSection />

      {/* gift detail: the same gift, but with its nicer (more expensive) models */}
      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDetail(null)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0f0f13] p-4 sm:rounded-3xl sm:p-5"
            >
              <div className="flex items-start gap-4">
                <div
                  className="grid shrink-0 place-items-center rounded-2xl border border-white/8 p-3"
                  style={{ background: `radial-gradient(120% 105% at 50% 5%, ${detail.tint}33, #0e0e12 72%)` }}
                >
                  <GiftArt gift={detail} size={92} rounded="rounded-2xl" motion="idle" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-xl font-black tracking-tight">{detail.name}</h2>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${RARITY_META[detail.rarity].chip}`}>
                      {RARITY_META[detail.rarity].label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-white/40">{detail.variant === "Gift" ? "Коллекционный подарок" : detail.variant}</p>
                  <p className="mt-2 flex items-center gap-1 text-[18px] font-black tabular-nums text-neon">
                    {detail.stars.toLocaleString("ru-RU")} <StarIcon className="size-3.5" />
                  </p>
                  <Button
                    size="sm"
                    className="mt-2"
                    variant={!lockedSlugs.has(detail.slug) && !endedSlugs.has(detail.slug) && stars >= detail.stars ? "primary" : "ghost"}
                    disabled={
                      lockedSlugs.has(detail.slug) ||
                      endedSlugs.has(detail.slug) ||
                      stars < detail.stars ||
                      busy === detail.id
                    }
                    onClick={() => buy(detail)}
                  >
                    {busy === detail.id
                      ? "Покупка…"
                      : lockedSlugs.has(detail.slug)
                        ? "Недоступно"
                        : endedSlugs.has(detail.slug)
                          ? "Дроп закрыт"
                          : stars >= detail.stars
                            ? "Купить базовый"
                            : "Мало ★"}
                  </Button>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="shrink-0 rounded-xl border border-white/10 px-2.5 py-1 text-[12px] font-bold text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-[13px] font-extrabold tracking-tight">Улучшенные модели</h3>
                  <span className="rounded-md border border-violet/30 bg-violet/10 px-1.5 py-0.5 text-[9.5px] font-bold text-violet">
                    {detailModels.length}
                  </span>
                </div>
                {detailModels.length === 0 ? (
                  <p className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-center text-[11.5px] text-white/30">
                    Для этого подарка нет более дорогих моделей — это его топ-версия.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {detailModels.map((m) => {
                      const locked = lockedSlugs.has(m.slug);
                      const canBuy = !locked && stars >= m.stars;
                      const meta = RARITY_META[m.rarity];
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col items-center rounded-2xl border bg-black/25 p-2 ${meta.ring}`}
                        >
                          <div
                            className="grid w-full place-items-center rounded-xl"
                            style={{ background: `radial-gradient(120% 100% at 50% 5%, ${m.tint}2a, transparent 72%)` }}
                          >
                            <GiftArt gift={m} size={54} rounded="rounded-lg" />
                          </div>
                          <p className="mt-1.5 w-full truncate text-center text-[9.5px] font-bold text-white/70">{m.variant}</p>
                          <p className="flex items-center gap-0.5 text-[10.5px] font-extrabold tabular-nums text-neon/90">
                            {m.stars.toLocaleString("ru-RU")}
                            <StarIcon className="size-2.5" />
                          </p>
                          <Button
                            full
                            size="sm"
                            className="mt-1.5"
                            variant={canBuy ? "violet" : "ghost"}
                            disabled={!canBuy || busy === m.id}
                            onClick={() => buy(m)}
                          >
                            {busy === m.id ? "…" : locked ? "Недоступно" : canBuy ? "Купить" : "Мало ★"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
