import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGame } from "../store/useGame";
import { GIFT_BY_ID } from "../data/gifts";
import { useGiftIndex } from "../lib/useCatalog";
import {
  auctionClosesIn,
  auctionOpensIn,
  nextBid,
  shortLeft,
  useLiveAuctions,
} from "../lib/auctions";
import { placeBid, type AuctionRow } from "../lib/players";
import { onlineEnabled } from "../lib/supabase";
import { GiftArt, StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";

/**
 * Market · «Аукционы».
 *
 * The owner puts gifts on the block from the admin panel; they show up here
 * as cards in the shop — a live lot with a bid box, or an upcoming auction
 * that is still closed but already visible («скоро»). Every gift can be
 * auctioned this way, including owner-made ones.
 */

const fmt = (n: number) => n.toLocaleString("ru-RU");

export function MarketAuctions() {
  const lots = useLiveAuctions();
  const [detail, setDetail] = useState<AuctionRow | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!onlineEnabled || !lots.length) return null;

  const open = lots
    .filter((l) => !l.sold && !l.cancelled)
    .sort((a, b) => {
      const ao = auctionOpensIn(a);
      const bo = auctionOpensIn(b);
      // upcoming first (soonest to open), then the shortest time to close
      if (ao > 0 || bo > 0) {
        if (ao === 0) return 1;
        if (bo === 0) return -1;
        return ao - bo;
      }
      return auctionClosesIn(a) - auctionClosesIn(b);
    });

  if (!open.length) return null;

  const upcoming = open.filter((l) => auctionOpensIn(l) > 0).length;

  return (
    <section className="space-y-2.5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-violet/80">Auction</p>
          <h2 className="mt-0.5 font-display text-xl font-black tracking-tight">Аукционы</h2>
        </div>
        {upcoming > 0 && (
          <span className="rounded-lg border border-violet/30 bg-violet/10 px-2 py-1 text-[10px] font-bold text-violet">
            скоро · {upcoming}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {open.map((lot) => (
          <AuctionCard
            key={lot.id}
            lot={lot}
            onOpen={() => setDetail(lot)}
          />
        ))}
      </div>

      <AuctionSheet lot={detail} onClose={() => setDetail(null)} />
    </section>
  );
}

function AuctionCard({
  lot,
  onOpen,
}: {
  lot: AuctionRow;
  onOpen: () => void;
}) {
  const byId = useGiftIndex();
  const gift = byId[lot.item_id];
  const opens = auctionOpensIn(lot);
  const closes = auctionClosesIn(lot);
  const upcoming = opens > 0;

  return (
    <motion.article
      layout
      className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-white/[0.025] transition-transform duration-300 hover:-translate-y-1 ${
        upcoming ? "border-violet/35" : "border-white/10"
      }`}
    >
      <button onClick={onOpen} className="relative grid h-[112px] place-items-center overflow-hidden text-left">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 105% at 50% 5%, ${
              gift ? gift.tint : "#8b5cf6"
            }2e, #0e0e12 72%)`,
          }}
        />
        <span className="absolute left-2 top-2 rounded-md border border-violet/40 bg-violet/15 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-violet">
          аукцион
        </span>
        {upcoming && (
          <span className="absolute right-2 top-2 animate-pulse rounded-md bg-violet px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-white shadow-[0_8px_24px_-8px_rgba(139,92,246,0.9)]">
            скоро
          </span>
        )}
        <div className={`relative ${upcoming ? "opacity-80" : ""}`}>
          {gift ? (
            <GiftArt gift={gift} size={72} rounded="rounded-xl" />
          ) : (
            <div className="grid size-[72px] place-items-center rounded-xl bg-white/5 text-2xl">★</div>
          )}
        </div>
      </button>

      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="truncate text-[12px] font-extrabold tracking-tight">{lot.item_name}</h3>
        <p className="truncate text-[10px] text-white/35">
          {upcoming ? (lot.lot_label || "предстоящий аукцион") : lot.top_bidder_name ? `лидер ${lot.top_bidder_name}` : "нет ставок"}
        </p>

        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-white/25">
            {lot.top_bid > 0 ? "ставка" : "старт"}
          </span>
          <span className="flex items-center gap-0.5 text-[12px] font-extrabold tabular-nums text-neon/90">
            {fmt(lot.top_bid || lot.min_bid)}
            <StarIcon className="size-2.5" />
          </span>
        </div>

        <div
          className={`mt-2 flex items-center justify-between rounded-lg px-2 py-1 text-[9.5px] font-bold tabular-nums ${
            upcoming ? "bg-violet/10 text-violet" : "bg-black/30 text-white/45"
          }`}
        >
          <span>{upcoming ? "откроется" : "до конца"}</span>
          <span>{upcoming ? shortLeft(opens) : shortLeft(closes)}</span>
        </div>

        <Button
          full
          size="sm"
          className="mt-2"
          variant={upcoming ? "ghost" : "violet"}
          onClick={onOpen}
        >
          {upcoming ? "Подробнее" : "Ставить"}
        </Button>
      </div>
    </motion.article>
  );
}

function AuctionSheet({
  lot,
  onClose,
}: {
  lot: AuctionRow | null;
  onClose: () => void;
}) {
  const byId = useGiftIndex();
  const stars = useGame((s) => s.stars);
  const spendStars = useGame((s) => s.spendStars);
  const addItem = useGame((s) => s.addItem);
  const toast = useGame((s) => s.toast);
  const [amount, setAmount] = useState("");

  useEffect(() => setAmount(""), [lot?.id]);

  if (!lot) return null;

  const gift = byId[lot.item_id] ?? GIFT_BY_ID[lot.item_id];
  const opens = auctionOpensIn(lot);
  const closes = auctionClosesIn(lot);
  const upcoming = opens > 0;
  const ended = closes === 0;
  const min = nextBid(lot);

  const bid = async () => {
    const value = Number(amount) || min;
    if (value < min) {
      toast({ kind: "error", title: "Ставка слишком низкая", message: `Минимум ${fmt(min)} ★` });
      return;
    }
    if (value > stars) {
      toast({ kind: "error", title: "Недостаточно звёзд", message: `Нужно ${fmt(value)} ★` });
      return;
    }
    const res = await placeBid(lot.id, value);
    if (res.error) {
      toast({ kind: "error", title: "Ставка не принята", message: res.error });
      return;
    }
    toast({ kind: "gift", title: "Ставка принята", message: `${fmt(value)} ★ · держим 30 минут` });
    onClose();
  };

  const buyout = () => {
    const price = lot.buyout;
    if (!price) return;
    if (!spendStars(price)) {
      toast({ kind: "error", title: "Недостаточно звёзд", message: `Нужно ${fmt(price)} ★` });
      return;
    }
    if (gift) addItem(gift.id, "market");
    void placeBid(lot.id, price);
    toast({ kind: "gift", title: "Куплено сразу", message: `${lot.item_name} · ${fmt(price)} ★` });
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#0f0f13] p-4 sm:rounded-3xl sm:p-5"
        >
          <div className="flex items-start gap-3.5">
            <div
              className="grid shrink-0 place-items-center rounded-2xl border border-white/8 p-2.5"
              style={{ background: `radial-gradient(120% 105% at 50% 5%, ${gift ? gift.tint : "#8b5cf6"}33, #0e0e12 72%)` }}
            >
              {gift ? (
                <GiftArt gift={gift} size={78} rounded="rounded-2xl" motion="idle" />
              ) : (
                <div className="grid size-[78px] place-items-center text-2xl">★</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-violet/40 bg-violet/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet">
                  аукцион
                </span>
                {upcoming && (
                  <span className="animate-pulse rounded-md bg-violet px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                    скоро
                  </span>
                )}
              </div>
              <h2 className="mt-1 truncate font-display text-lg font-black tracking-tight">{lot.item_name}</h2>
              <p className="text-[11px] text-white/35">
                {gift && gift.variant !== "Gift" ? gift.variant : `сейчас ${fmt(lot.min_bid)} ★`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-xl border border-white/10 px-2.5 py-1 text-[12px] font-bold text-white/40 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-2.5 py-2">
              <p className="text-[9.5px] uppercase tracking-[0.12em] text-white/25">
                {lot.top_bid > 0 ? "текущая ставка" : "старт"}
              </p>
              <p className="flex items-center gap-0.5 font-extrabold tabular-nums text-neon">
                {fmt(lot.top_bid || lot.min_bid)} <StarIcon className="size-3" />
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-2.5 py-2">
              <p className="text-[9.5px] uppercase tracking-[0.12em] text-white/25">
                {upcoming ? "откроется через" : "до конца"}
              </p>
              <p className={`font-extrabold tabular-nums ${upcoming ? "text-violet" : "text-white/80"}`}>
                {upcoming ? shortLeft(opens) : ended ? "завершён" : shortLeft(closes)}
              </p>
            </div>
          </div>

          {lot.lot_label && <p className="mt-2 text-[11px] text-white/40">{lot.lot_label}</p>}

          {upcoming ? (
            <p className="mt-3 rounded-xl border border-violet/25 bg-violet/[0.07] px-3 py-2.5 text-center text-[11px] font-bold leading-relaxed text-violet/90">
              Предстоящий аукцион. Купить и поставить нельзя, пока лот не откроется — следи за ним в маркете.
            </p>
          ) : ended ? (
            <p className="mt-3 rounded-xl bg-white/5 py-2.5 text-center text-[11.5px] font-bold text-white/35">
              Лот завершён
            </p>
          ) : (
            <>
              <div className="mt-3 flex gap-1.5">
                <input
                  inputMode="numeric"
                  placeholder={`от ${fmt(min)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-[12.5px] font-bold tabular-nums outline-none placeholder:text-white/20 focus:border-neon/40"
                />
                <Button size="sm" onClick={() => void bid()} className="h-10">
                  Ставка
                </Button>
              </div>
              {lot.buyout != null && (
                <button
                  onClick={buyout}
                  className="mt-2 w-full rounded-xl border border-violet/30 bg-violet/10 py-2 text-[11.5px] font-bold text-violet hover:bg-violet/20"
                >
                  Купить сразу · {fmt(lot.buyout)} ★
                </button>
              )}
              <p className="mt-2 text-center text-[10px] leading-relaxed text-white/20">
                Ставка держит лот 30 минут · не перебили — подарок твой
              </p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}