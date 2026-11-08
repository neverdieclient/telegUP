import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useGame } from "../store/useGame";
import { GIFT_BY_ID, GIFTS, RARITY_META } from "../data/gifts";
import { GiftArt, StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";
import { onlineEnabled } from "../lib/supabase";
import { useAuth } from "../lib/players";
import {
  cancelAuction,
  closeAuction,
  fetchAuctions,
  listAuction,
  placeBid,
  type AuctionRow,
  type BidRow,
} from "../lib/players";
import { randInt } from "../lib/rng";

/* ------------------------------------------------------------------ local sim */

/**
 * Without a backend the auction still has to work, so lots live in
 * localStorage. They share the same shape as the Supabase rows, plus a
 * `cycle` marker used to rotate the house lots every 5 hours.
 */
const LS_KEY = "telegup:auction:v2";

/** How long a single bid holds the lot before the winner is paid out. */
const BID_WINDOW_MS = 10 * 60 * 1000;
/** House lots refresh this often. */
const CYCLE_MS = 5 * 60 * 60 * 1000;
/** How many house lots are on the block at once. */
const HOUSE_LOTS = 6;

type LocalLot = AuctionRow & { bids: BidRow[]; cycle?: number };

function readLocal(): LocalLot[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalLot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(lots: LocalLot[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(lots));
  } catch {
    /* quota — ignore */
  }
}

const HOUSE_SELLERS = [
  "@whale",
  "@pepeking",
  "@collector",
  "@durov_fan",
  "@giftgoat",
  "@tonholder",
  "@starkeeper",
  "@lootlord",
];

/**
 * Build a fresh batch of house lots: a mix of cheap and expensive gifts.
 * Prices are floored well below the gift value so bidding is actually worth
 * it, and every lot starts with no bids.
 */
function buildHouseLots(cycle: number): LocalLot[] {
  const now = Date.now();
  // three price tiers so the board always shows cheap → expensive
  const tiers = [
    GIFTS.filter((g) => g.stars >= 200 && g.stars <= 8_000),
    GIFTS.filter((g) => g.stars > 8_000 && g.stars <= 120_000),
    GIFTS.filter((g) => g.stars > 120_000),
  ];

  const picked: typeof GIFTS = [];
  const seen = new Set<string>();
  for (let i = 0; i < HOUSE_LOTS; i++) {
    const pool = tiers[i % tiers.length];
    if (!pool.length) continue;
    for (let attempt = 0; attempt < 12; attempt++) {
      const g = pool[randInt(pool.length)];
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      picked.push(g);
      break;
    }
  }

  return picked.map((gift, i) => {
    const start = Math.max(50, Math.round(gift.stars * (0.12 + Math.random() * 0.18)));
    return {
      id: -(cycle % 100_000) * 10 - i,
      seller_id: "house",
      seller_name: HOUSE_SELLERS[i % HOUSE_SELLERS.length],
      item_id: gift.id,
      item_name: gift.variant === "Gift" ? gift.name : `${gift.name} · ${gift.variant}`,
      item_kind: "gift",
      item_value: gift.stars,
      min_bid: start,
      buyout: Math.round(gift.stars * 0.85),
      top_bid: 0,
      top_bidder: null,
      top_bidder_name: null,
      sold: false,
      cancelled: false,
      // a lot stays open until someone bids; the 10-minute clock starts on the bid
      ends_at: new Date(now + CYCLE_MS).toISOString(),
      created_at: new Date(now).toISOString(),
      bids: [],
      cycle,
    };
  });
}

/**
 * Load local lots, rotating the house batch every 5 hours while keeping the
 * player's own lots and any lot they are currently winning.
 */
function ensureLocalLots(): LocalLot[] {
  const lots = readLocal();
  const cycle = Math.floor(Date.now() / CYCLE_MS);
  const house = lots.filter((l) => l.seller_id === "house");
  const users = lots.filter((l) => l.seller_id !== "house");
  const houseCycle = house[0]?.cycle ?? -1;
  if (house.length && houseCycle === cycle) return lots;

  const fresh = buildHouseLots(cycle);
  const next = [...users.filter((l) => !l.sold && !l.cancelled), ...fresh];
  writeLocal(next);
  return next;
}

/* ------------------------------------------------------------------ helpers */

function timeLeft(endsAt: string): { ms: number; label: string } {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return { ms: 0, label: "завершён" };
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const label =
    h > 0
      ? `${h}ч ${String(m).padStart(2, "0")}м`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return { ms, label };
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

const ME = "local";

/* ------------------------------------------------------------------ page */

type Tab = "live" | "mine" | "new";

export default function Auction() {
  const inventory = useGame((s) => s.inventory);
  const stars = useGame((s) => s.stars);
  const profile = useGame((s) => s.profile);
  const spendStars = useGame((s) => s.spendStars);
  const addStars = useGame((s) => s.addStars);
  const addItem = useGame((s) => s.addItem);
  const toast = useGame((s) => s.toast);
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("live");
  const [lots, setLots] = useState<LocalLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const settledRef = useRef<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (onlineEnabled) {
        const rows = (await fetchAuctions()) as LocalLot[];
        setLots(rows.map((r) => ({ ...r, bids: [] })));
      } else {
        setLots(ensureLocalLots());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 1s clock: drives the countdown and settles expired local bids
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      if (onlineEnabled) return;

      const now = Date.now();
      const current = readLocal();
      const expired = current.filter(
        (l) =>
          l.seller_id === "house" &&
          !l.sold &&
          !l.cancelled &&
          l.top_bidder === ME &&
          l.top_bid > 0 &&
          new Date(l.ends_at).getTime() <= now,
      );
      if (!expired.length) return;

      // the countdown hit zero and nobody outbid us — the gift is ours
      let next = current;
      for (const lot of expired) {
        const key = String(lot.id);
        if (settledRef.current.has(key)) continue;
        settledRef.current.add(key);
        if (lot.item_kind === "gift" && GIFT_BY_ID[lot.item_id]) addItem(lot.item_id, "market");
        next = next.map((l) => (l.id === lot.id ? { ...l, sold: true } : l));
        toast({ kind: "gift", title: "Лот твой!", message: `${lot.item_name} · ${fmt(lot.top_bid)} ★` });
      }
      writeLocal(next);
      setLots(next);
    }, 1000);
    return () => clearInterval(t);
  }, [addItem, toast]);

  const live = useMemo(
    () =>
      lots
        .filter((l) => !l.sold && !l.cancelled)
        .sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()),
    [lots],
  );
  const mine = useMemo(
    () => lots.filter((l) => l.seller_id === ME || l.seller_id === (user?.id ?? "\u0000")),
    [lots, user?.id],
  );

  /* ---- actions ---- */

  const bid = async (lot: LocalLot, amount: number) => {
    const minNext = Math.max(lot.min_bid, lot.top_bid + 1);
    if (amount < minNext) {
      toast({ kind: "error", title: "Ставка слишком низкая", message: `Минимум ${fmt(minNext)} ★` });
      return;
    }
    if (amount > stars) {
      toast({ kind: "error", title: "Недостаточно звёзд", message: `Нужно ${fmt(amount)} ★` });
      return;
    }
    if (lot.seller_id === ME) {
      toast({ kind: "error", title: "Свой лот", message: "Нельзя ставить на собственный лот" });
      return;
    }

    if (onlineEnabled) {
      const res = await placeBid(lot.id, amount);
      if (res.error) {
        toast({ kind: "error", title: "Ставка не принята", message: res.error });
        return;
      }
      await reload();
    } else {
      if (!spendStars(amount)) return;
      // an earlier local bid on this lot is refunded
      if (lot.top_bid > 0 && lot.top_bidder === ME) addStars(lot.top_bid);

      // first bid opens a 10-minute window; a later bid restarts it
      const ends = new Date(Date.now() + BID_WINDOW_MS).toISOString();
      const next = readLocal().map((l) =>
        l.id === lot.id
          ? {
              ...l,
              top_bid: amount,
              top_bidder: ME,
              top_bidder_name: `@${profile.nickname}`,
              ends_at: ends,
              bids: [
                {
                  id: Date.now(),
                  auction_id: l.id,
                  bidder_id: ME,
                  bidder_name: `@${profile.nickname}`,
                  amount,
                  created_at: new Date().toISOString(),
                },
                ...l.bids,
              ].slice(0, 20),
            }
          : l,
      );
      settledRef.current.delete(String(lot.id));
      writeLocal(next);
      setLots(next);
    }
    toast({
      kind: "gift",
      title: "Ставка принята",
      message: `${fmt(amount)} ★ · держим 10 минут, потом лот твой`,
    });
  };

  const buyout = async (lot: LocalLot) => {
    const price = lot.buyout ?? lot.min_bid;
    if (!spendStars(price)) {
      toast({ kind: "error", title: "Недостаточно звёзд", message: `Нужно ${fmt(price)} ★` });
      return;
    }
    if (lot.item_kind === "gift" && GIFT_BY_ID[lot.item_id]) addItem(lot.item_id, "market");
    if (onlineEnabled) await closeAuction(lot.id);
    else {
      const next = readLocal().map((l) =>
        l.id === lot.id ? { ...l, sold: true, top_bid: price, top_bidder: ME } : l,
      );
      writeLocal(next);
      setLots(next);
    }
    toast({ kind: "gift", title: "Куплено сразу", message: `${lot.item_name} · ${fmt(price)} ★` });
  };

  const cancel = async (lot: LocalLot) => {
    if (onlineEnabled) {
      const res = await cancelAuction(lot.id);
      if (res.error) {
        toast({ kind: "error", title: "Не вышло", message: res.error });
        return;
      }
      await reload();
    } else {
      const next = readLocal().map((l) =>
        l.id === lot.id ? { ...l, cancelled: true, sold: true } : l,
      );
      writeLocal(next);
      setLots(next);
    }
    if (lot.item_kind === "gift" && GIFT_BY_ID[lot.item_id]) addItem(lot.item_id, "admin");
    toast({ kind: "info", title: "Лот снят", message: "Предмет возвращён в инвентарь" });
  };

  const claimWin = async (lot: LocalLot) => {
    if (lot.item_kind === "gift" && GIFT_BY_ID[lot.item_id]) addItem(lot.item_id, "market");
    if (onlineEnabled) await closeAuction(lot.id);
    else {
      const next = readLocal().map((l) => (l.id === lot.id ? { ...l, sold: true } : l));
      writeLocal(next);
      setLots(next);
    }
    toast({ kind: "gift", title: "Лот выигран", message: lot.item_name });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-neon/80">Marketplace</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Аукцион</h1>
          <p className="mt-1 text-[12.5px] text-white/35">
            Ставка держит лот 10 минут · обновление витрины каждые 5 часов
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
          <StarIcon className="size-4 text-neon" />
          <span className="text-[15px] font-extrabold tabular-nums">{fmt(stars)}</span>
          <span className="text-[11px] text-white/30">баланс</span>
        </div>
      </header>

      <div className="flex gap-1.5">
        {(
          [
            ["live", "Лоты"],
            ["mine", "Мои лоты"],
            ["new", "Выставить"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-xl px-3.5 py-1.5 text-[11.5px] font-bold transition-colors ${
              tab === id ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <section>
          {loading ? (
            <div className="grid min-h-[30vh] place-items-center">
              <span className="size-7 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
            </div>
          ) : live.length === 0 ? (
            <p className="rounded-3xl border border-white/8 bg-white/[0.025] p-8 text-center text-[12.5px] text-white/30">
              Пока нет активных лотов. Выстави первый!
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {live.map((lot) => (
                <LotCard key={lot.id} lot={lot} onBid={bid} onBuyout={buyout} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "mine" && (
        <section className="space-y-3">
          {mine.length === 0 && (
            <p className="rounded-3xl border border-white/8 bg-white/[0.025] p-8 text-center text-[12.5px] text-white/30">
              Ты ещё ничего не выставил.
            </p>
          )}
          {mine.map((lot) => {
            const won = lot.top_bidder === ME || lot.top_bidder === user?.id;
            const ended = timeLeft(lot.ends_at).ms === 0;
            return (
              <div
                key={lot.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3"
              >
                <LotArt lot={lot} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-extrabold">{lot.item_name}</p>
                  <p className="text-[11px] text-white/35">
                    ставка {fmt(lot.top_bid || lot.min_bid)} ★ ·{" "}
                    {lot.top_bidder_name ? `лидер ${lot.top_bidder_name}` : "нет ставок"}
                  </p>
                </div>
                {ended && won ? (
                  <Button size="sm" onClick={() => claimWin(lot)}>
                    Забрать
                  </Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => cancel(lot)}>
                    Снять
                  </Button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "new" && (
        <NewLot
          inventory={inventory}
          onCreated={() => {
            setTab("mine");
            void reload();
          }}
        />
      )}

      <p className="text-center text-[10px] leading-relaxed text-white/20">
        Оплата только звёздами ★. Это игра — реальный вывод средств невозможен.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function LotArt({ lot, size = 64 }: { lot: LocalLot; size?: number }) {
  const gift = lot.item_kind === "gift" ? GIFT_BY_ID[lot.item_id] : undefined;
  if (gift) return <GiftArt gift={gift} size={size} rounded="rounded-xl" />;
  return (
    <div
      className="grid place-items-center rounded-xl bg-white/5 font-display text-base font-black text-white/60"
      style={{ width: size, height: size }}
    >
      {lot.item_kind === "username" ? "@" : "#"}
    </div>
  );
}

function LotCard({
  lot,
  onBid,
  onBuyout,
}: {
  lot: LocalLot;
  onBid: (lot: LocalLot, amount: number) => void;
  onBuyout: (lot: LocalLot) => void;
}) {
  const [amount, setAmount] = useState("");
  const left = timeLeft(lot.ends_at);
  const minNext = Math.max(lot.min_bid, lot.top_bid + 1);
  const gift = lot.item_kind === "gift" ? GIFT_BY_ID[lot.item_id] : undefined;
  // a lot is "live" once the first bid started its 10-minute clock
  const started = lot.top_bid > 0;
  const mine = lot.top_bidder === ME;

  return (
    <motion.article
      layout
      className="flex flex-col gap-3 rounded-3xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-transparent p-3"
    >
      <div className="flex items-start gap-3">
        <LotArt lot={lot} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-extrabold tracking-tight">{lot.item_name}</p>
          <p className="text-[10.5px] text-white/30">продавец {lot.seller_name}</p>
          {gift && (
            <p className={`mt-0.5 text-[10.5px] font-bold ${RARITY_META[gift.rarity].text}`}>
              {RARITY_META[gift.rarity].label} · {fmt(gift.stars)} ★
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-display text-[15px] font-black tabular-nums text-neon">
            {fmt(lot.top_bid || lot.min_bid)}
          </p>
          <p className="text-[9.5px] uppercase tracking-[0.12em] text-white/25">★ ставка</p>
        </div>
      </div>

      <div
        className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-[10.5px] font-bold ${
          started
            ? mine
              ? "border-neon/30 bg-neon/[0.08] text-neon"
              : "border-mythic/25 bg-mythic/[0.08] text-mythic"
            : "border-white/8 bg-black/30 text-white/35"
        }`}
      >
        <span>
          {started
            ? mine
              ? "Ты лидер · лот твой через"
              : `Лидер ${lot.top_bidder_name ?? "?"} · осталось`
            : "Ждёт первой ставки"}
        </span>
        {started && <span className="tabular-nums">{left.label}</span>}
      </div>

      {left.ms > 0 ? (
        <div className="flex gap-1.5">
          <input
            inputMode="numeric"
            placeholder={`от ${fmt(minNext)}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-[12.5px] font-bold tabular-nums outline-none placeholder:text-white/20 focus:border-neon/40"
          />
          <Button size="sm" onClick={() => onBid(lot, Number(amount) || minNext)}>
            Ставка
          </Button>
        </div>
      ) : (
        <p className="rounded-xl bg-white/5 py-2 text-center text-[11px] font-bold text-white/35">Лот завершён</p>
      )}

      {lot.buyout != null && left.ms > 0 && (
        <button
          onClick={() => onBuyout(lot)}
          className="rounded-xl border border-violet/30 bg-violet/10 py-2 text-[11.5px] font-bold text-violet hover:bg-violet/20"
        >
          Купить сразу · {fmt(lot.buyout)} ★
        </button>
      )}
    </motion.article>
  );
}

function NewLot({
  inventory,
  onCreated,
}: {
  inventory: ReturnType<typeof useGame.getState>["inventory"];
  onCreated: () => void;
}) {
  const profile = useGame((s) => s.profile);
  const removeItem = useGame((s) => s.removeItem);
  const toast = useGame((s) => s.toast);
  const { user } = useAuth();
  const [picked, setPicked] = useState<string | null>(null);
  const [minBid, setMinBid] = useState("");
  const [buyout, setBuyout] = useState("");
  const [busy, setBusy] = useState(false);

  const item = useMemo(() => inventory.find((i) => i.id === picked) ?? null, [inventory, picked]);
  const gift = item ? GIFT_BY_ID[item.giftId] : undefined;

  useEffect(() => {
    if (gift) setMinBid(String(Math.max(1, Math.round(gift.stars * 0.7))));
  }, [gift]);

  const submit = async () => {
    if (!item || !gift) return;
    setBusy(true);
    try {
      // player lots stay open until the first bid starts the 10-minute clock
      const ends = new Date(Date.now() + CYCLE_MS).toISOString();
      if (onlineEnabled) {
        if (!user) {
          toast({ kind: "error", title: "Нужен аккаунт" });
          return;
        }
        const res = await listAuction({
          sellerId: user.id,
          sellerName: `@${profile.nickname}`,
          itemId: gift.id,
          itemName: gift.variant === "Gift" ? gift.name : `${gift.name} · ${gift.variant}`,
          itemKind: "gift",
          itemValue: gift.stars,
          minBid: Number(minBid) || Math.max(1, Math.round(gift.stars * 0.7)),
          buyout: Number(buyout) || null,
          hours: 24,
        });
        if (res.error) {
          toast({ kind: "error", title: "Не вышло", message: res.error });
          return;
        }
      } else {
        const lots = ensureLocalLots();
        const lot: LocalLot = {
          id: Date.now(),
          seller_id: ME,
          seller_name: `@${profile.nickname}`,
          item_id: gift.id,
          item_name: gift.variant === "Gift" ? gift.name : `${gift.name} · ${gift.variant}`,
          item_kind: "gift",
          item_value: gift.stars,
          min_bid: Number(minBid) || Math.max(1, Math.round(gift.stars * 0.7)),
          buyout: Number(buyout) || null,
          top_bid: 0,
          top_bidder: null,
          top_bidder_name: null,
          sold: false,
          cancelled: false,
          ends_at: ends,
          created_at: new Date().toISOString(),
          bids: [],
        };
        writeLocal([lot, ...lots]);
      }
      // escrow: the item leaves the inventory while it is on the block
      removeItem(item.id);
      setPicked(null);
      setMinBid("");
      setBuyout("");
      toast({ kind: "gift", title: "Лот выставлен", message: gift.name });
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
        <p className="text-[12.5px] font-bold text-white/85">Выбери предмет из инвентаря</p>
        {inventory.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-white/30">Инвентарь пуст — открой кейс или купи подарок.</p>
        ) : (
          <div className="mt-3 grid max-h-[280px] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
            {inventory.map((it) => {
              const g = GIFT_BY_ID[it.giftId];
              if (!g) return null;
              return (
                <button
                  key={it.id}
                  onClick={() => setPicked(it.id)}
                  className={`rounded-2xl border p-1.5 transition ${
                    picked === it.id
                      ? "border-neon/60 bg-neon/10"
                      : "border-white/8 bg-black/30 hover:border-white/20"
                  }`}
                >
                  <GiftArt gift={g} size={52} rounded="rounded-xl" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/30">Старт, ★</span>
          <input
            inputMode="numeric"
            value={minBid}
            onChange={(e) => setMinBid(e.target.value.replace(/\D/g, ""))}
            className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[12.5px] font-bold tabular-nums outline-none focus:border-neon/40"
          />
        </label>
        <label className="block">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/30">
            Выкуп, ★ (необяз.)
          </span>
          <input
            inputMode="numeric"
            value={buyout}
            onChange={(e) => setBuyout(e.target.value.replace(/\D/g, ""))}
            placeholder="—"
            className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[12.5px] font-bold tabular-nums outline-none placeholder:text-white/20 focus:border-neon/40"
          />
        </label>
      </div>

      <Button full size="lg" disabled={!item || busy} onClick={submit} icon={<StarIcon className="size-4" />}>
        {busy ? "Выставляем…" : "Выставить лот"}
      </Button>
      <p className="text-center text-[10px] text-white/20">
        Лот ждёт первую ставку. После неё начинается 10-минутный отсчёт.
      </p>
    </section>
  );
}