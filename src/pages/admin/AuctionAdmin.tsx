import { useCallback, useEffect, useMemo, useState } from "react";
import { useGame } from "../../store/useGame";
import { RARITY_META, type Gift } from "../../data/gifts";
import { useAllGifts, useGiftIndex } from "../../lib/useCatalog";
import { GiftArt, StarIcon } from "../../components/gifts/GiftArt";
import { Button } from "../../components/ui/Button";
import {
  fetchOwnerAuctions,
  ownerCancelAuction,
  ownerCreateAuction,
  ownerUpdateAuction,
  type AuctionRow,
} from "../../lib/players";
import { onlineEnabled } from "../../lib/supabase";

/**
 * Owner panel: «Аукцион».
 *
 * Puts ANY catalogue gift (custom gifts included) on the block — the way the
 * Telegram market runs gift auctions: pick a starting price, an optional
 * instant-buyout, and how long the lot runs.
 *
 * A lot can also be scheduled: until its start time it is visible to everyone
 * but closed — the card shows «скоро», bids and buyout are refused.
 *
 * This is the house side and lives next to the ordinary player auctions at
 * `/app/auction`; it does not replace them.
 */

const field =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] font-bold tabular-nums text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40";
const label = "text-[10px] font-bold uppercase tracking-[0.14em] text-white/30";

const MIN_HOURS = [
  { label: "5 мин", value: 5 },
  { label: "30 мин", value: 30 },
  { label: "1 ч", value: 60 },
  { label: "3 ч", value: 180 },
  { label: "12 ч", value: 720 },
  { label: "24 ч", value: 1440 },
];

const START_IN = [
  { label: "сразу", value: 0 },
  { label: "5 мин", value: 5 },
  { label: "30 мин", value: 30 },
  { label: "1 ч", value: 60 },
  { label: "3 ч", value: 180 },
  { label: "24 ч", value: 1440 },
];

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** "1ч 23м 05с" until `iso`, or null once it is in the past. */
function leftLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${String(m).padStart(2, "0")}м`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Only the plain collectible gifts — one per collection. Models are the
 * "upgrades" of a gift and never go on the block on their own.
 */
function baseGifts(list: Gift[]): Gift[] {
  return list.filter((g) => g.kind === "gift");
}

const giftTitle = (g: Gift) => (g.variant === "Gift" ? g.name : `${g.name} · ${g.variant}`);

export function AuctionAdmin() {
  const catalogue = useAllGifts();
  const allGifts = useMemo(() => baseGifts(catalogue), [catalogue]);
  const toast = useGame((s) => s.toast);
  const byId = useGiftIndex();

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const [start, setStart] = useState("");
  const [buyout, setBuyout] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [startIn, setStartIn] = useState(0);
  const [caption, setCaption] = useState("");

  const [lots, setLots] = useState<AuctionRow[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const gift = useMemo(() => allGifts.find((g) => g.id === picked) ?? null, [allGifts, picked]);

  /** name search over the whole catalogue, cheapest → dearest */
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...allGifts].sort((a, b) => a.stars - b.stars).slice(0, 120);
    }
    const words = q.split(/\s+/).filter(Boolean);
    return allGifts
      .filter((g) => {
        const hay = `${g.name} ${g.variant} ${g.slug}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => a.stars - b.stars)
      .slice(0, 120);
  }, [allGifts, query]);

  const loadLots = useCallback(async () => {
    setLoadingLots(true);
    try {
      if (!onlineEnabled) {
        setLots([]);
        return;
      }
      setLots(await fetchOwnerAuctions());
    } finally {
      setLoadingLots(false);
    }
  }, []);

  useEffect(() => {
    void loadLots();
  }, [loadLots]);

  // countdowns on the lot rows need a clock
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // defaults follow the pick: start at ~70% of the gift value, no buyout
  useEffect(() => {
    if (!gift) return;
    setStart(String(Math.max(1, Math.round(gift.stars * 0.7))));
    setBuyout("");
  }, [gift]);

  const pickedName = gift ? giftTitle(gift) : "";

  const create = async () => {
    if (!gift) {
      toast({ kind: "error", title: "Выбери подарок" });
      return;
    }
    const startBid = Number(start) || 0;
    const buy = Number(buyout) || 0;
    if (startBid < 1) {
      toast({ kind: "error", title: "Нужна стартовая цена", message: "Минимум 1 ★" });
      return;
    }
    if (buy > 0 && buy <= startBid) {
      toast({
        kind: "error",
        title: "Выкуп ниже старта",
        message: "Выкуп должен быть больше стартовой цены",
      });
      return;
    }
    if (!onlineEnabled) {
      toast({ kind: "error", title: "Нужен онлайн", message: "Лоты дома живут на сервере" });
      return;
    }

    setBusy(true);
    const res = await ownerCreateAuction({
      itemId: gift.id,
      itemName: pickedName,
      itemKind: "gift",
      itemValue: gift.stars,
      minBid: startBid,
      buyout: buy > 0 ? buy : null,
      minutes,
      startInMinutes: startIn,
      label: caption,
    });
    setBusy(false);
    if (res.error) {
      toast({ kind: "error", title: "Не вышло", message: res.error });
      return;
    }
    toast({
      kind: "gift",
      title: startIn > 0 ? "Аукцион запланирован" : "Лот выставлен",
      message:
        startIn > 0
          ? `${pickedName} · откроется через ${startIn} мин`
          : `${pickedName} · старт ${fmt(startBid)} ★`,
    });
    setPicked(null);
    setCaption("");
    await loadLots();
  };

  const cancel = async (lot: AuctionRow) => {
    setBusy(true);
    const res = await ownerCancelAuction(lot.id);
    setBusy(false);
    if (res.error) {
      toast({ kind: "error", title: "Не вышло", message: res.error });
      return;
    }
    toast({ kind: "info", title: "Лот снят", message: lot.item_name });
    await loadLots();
  };

  const extend = async (lot: AuctionRow, addMinutes: number) => {
    const openAt = lot.starts_at ? new Date(lot.starts_at).getTime() : 0;
    const base = openAt > Date.now() ? openAt : Date.now();
    const left = Math.max(1, Math.ceil((new Date(lot.ends_at).getTime() - base) / 60_000));
    const startInTail =
      openAt > Date.now() ? Math.max(0, Math.ceil((openAt - Date.now()) / 60_000)) : null;
    setBusy(true);
    const res = await ownerUpdateAuction(lot.id, {
      minBid: lot.min_bid,
      buyout: lot.buyout,
      minutes: left + addMinutes,
      startInMinutes: startInTail,
    });
    setBusy(false);
    if (res.error) {
      toast({ kind: "error", title: "Не вышло", message: res.error });
      return;
    }
    toast({ kind: "success", title: "Продлён", message: `+${addMinutes} мин` });
    await loadLots();
  };

  const open = lots.filter((l) => !l.sold && !l.cancelled);
  const upcoming = open.filter((l) => l.starts_at && new Date(l.starts_at).getTime() > Date.now());
  const live = open.filter((l) => !l.starts_at || new Date(l.starts_at).getTime() <= Date.now());
  const done = lots.filter((l) => l.sold || l.cancelled).slice(0, 8);

  return (
    <div className="space-y-4">
      {/* ---------------- pick a gift ---------------- */}
      <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
        <p className="text-[12.5px] font-bold text-white/85">Любой подарок по названию</p>
        <p className="mt-0.5 text-[10.5px] text-white/25">
          Базовые подарки коллекций — без моделей и улучшений.
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Plush Pepe, Durov, Heart…"
          className={`mt-2 ${field}`}
        />
        <div className="mt-2 grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6">
          {found.map((g) => (
            <button
              key={g.id}
              onClick={() => setPicked(g.id)}
              title={giftTitle(g)}
              className={`flex flex-col items-center rounded-xl border p-1.5 transition ${
                picked === g.id
                  ? "border-neon/60 bg-neon/10"
                  : `${RARITY_META[g.rarity].ring} bg-black/30 hover:border-white/25`
              }`}
            >
              <GiftArt gift={g} size={38} rounded="rounded-lg" />
              <p className="mt-1 w-full truncate text-center text-[8.5px] font-bold text-white/60">
                {g.variant === "Gift" ? g.name : g.variant}
              </p>
              <p className="text-[8px] font-bold tabular-nums text-neon/70">{fmt(g.stars)} ★</p>
            </button>
          ))}
          {!found.length && (
            <p className="col-span-4 py-6 text-center text-[11px] text-white/25 sm:col-span-6">
              Ничего не нашлось — попробуй другое название
            </p>
          )}
        </div>
      </section>

      {/* ---------------- lot settings ---------------- */}
      <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
        <div className="flex items-center gap-2.5">
          {gift ? (
            <>
              <GiftArt gift={gift} size={42} rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-extrabold">{pickedName}</p>
                <p className={`text-[10.5px] font-bold ${RARITY_META[gift.rarity].text}`}>
                  {RARITY_META[gift.rarity].label} · {fmt(gift.stars)} ★
                </p>
              </div>
              <button
                onClick={() => setPicked(null)}
                className="rounded-lg px-2 py-1 text-[10.5px] font-bold text-white/35 hover:bg-white/5 hover:text-white/60"
              >
                сбросить
              </button>
            </>
          ) : (
            <p className="text-[11.5px] text-white/30">Выбери подарок выше — он уйдёт на аукцион.</p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className={label}>Старт, ★</p>
            <input
              inputMode="numeric"
              value={start}
              onChange={(e) => setStart(e.target.value.replace(/\D/g, ""))}
              placeholder="1 000"
              className={`mt-1 ${field}`}
            />
          </div>
          <div>
            <p className={label}>Выкуп, ★ (необяз.)</p>
            <input
              inputMode="numeric"
              value={buyout}
              onChange={(e) => setBuyout(e.target.value.replace(/\D/g, ""))}
              placeholder="—"
              className={`mt-1 ${field}`}
            />
          </div>
        </div>

        <p className={`mt-3 ${label}`}>Сколько идёт аукцион</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {MIN_HOURS.map((t) => (
            <button
              key={t.value}
              onClick={() => setMinutes(t.value)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                minutes === t.value
                  ? "border-neon/40 bg-neon/10 text-white"
                  : "border-white/8 text-white/45 hover:border-white/20"
              }`}
            >
              {t.label}
            </button>
          ))}
          <input
            inputMode="numeric"
            value={MIN_HOURS.some((t) => t.value === minutes) ? "" : String(minutes)}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))}
            placeholder="свои мин"
            className="w-24 rounded-lg border border-white/8 bg-black/40 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white/80 outline-none placeholder:text-white/20 focus:border-neon/40"
          />
        </div>

        <p className={`mt-3 ${label}`}>Когда открыть</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {START_IN.map((t) => (
            <button
              key={t.value}
              onClick={() => setStartIn(t.value)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                startIn === t.value
                  ? "border-violet/50 bg-violet/15 text-white"
                  : "border-white/8 text-white/45 hover:border-white/20"
              }`}
            >
              {t.label}
            </button>
          ))}
          <input
            inputMode="numeric"
            value={START_IN.some((t) => t.value === startIn) ? "" : String(startIn)}
            onChange={(e) => setStartIn(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
            placeholder="свои мин"
            className="w-24 rounded-lg border border-white/8 bg-black/40 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white/80 outline-none placeholder:text-white/20 focus:border-neon/40"
          />
        </div>

        {startIn > 0 && (
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Подпись на карточке, напр. «Скоро · золотой Durov»"
            className={`mt-3 ${field.replace("tabular-nums", "")}`}
          />
        )}

        <p className="mt-2 text-[10px] leading-relaxed text-white/25">
          {startIn > 0
            ? `Лот будет виден всем сразу, но купить и поставить нельзя — откроется через ${startIn} мин и пойдёт ${minutes} мин.`
            : `Лот откроется сразу. После первой ставки у лота будет 30 минут, как у обычных аукционов.`}
        </p>

        <Button
          full
          className="mt-3"
          size="sm"
          variant={startIn > 0 ? "violet" : "primary"}
          disabled={!gift || busy}
          onClick={create}
          icon={<StarIcon className="size-4" />}
        >
          {busy ? "Сохраняю…" : startIn > 0 ? "Запланировать аукцион" : "Выставить лот"}
        </Button>
      </section>

      {/* ---------------- my house lots ---------------- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-bold text-white/85">
            Мои лоты <span className="text-white/30">{open.length}</span>
          </p>
          <button
            onClick={() => void loadLots()}
            className="rounded-lg px-2 py-1 text-[10.5px] font-bold text-white/35 hover:bg-white/5 hover:text-white/60"
          >
            обновить
          </button>
        </div>

        {loadingLots && <p className="py-3 text-center text-[11px] text-white/25">Загружаю…</p>}
        {!loadingLots && !open.length && (
          <p className="rounded-xl border border-white/8 bg-white/[0.02] py-4 text-center text-[11px] text-white/25">
            Пока нет лотов — выставь первый выше.
          </p>
        )}

        {[...upcoming, ...live].map((lot) => {
          const startsIn = leftLabel(lot.starts_at);
          const endsIn = leftLabel(lot.ends_at);
          const g = byId[lot.item_id];
          return (
            <div
              key={lot.id}
              className={`flex flex-wrap items-center gap-2.5 rounded-xl border p-2.5 ${
                startsIn ? "border-violet/30 bg-violet/[0.06]" : "border-white/8 bg-white/[0.025]"
              }`}
            >
              {g ? (
                <GiftArt gift={g} size={38} rounded="rounded-lg" />
              ) : (
                <div className="grid size-[38px] place-items-center rounded-lg bg-white/5 text-[13px]">★</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-extrabold">{lot.item_name}</p>
                <p className="text-[10.5px] tabular-nums text-white/35">
                  {startsIn ? (
                    <span className="font-bold text-violet">скоро · через {startsIn}</span>
                  ) : (
                    <>
                      до конца {endsIn ?? "завершён"} ·{" "}
                      {lot.top_bid > 0 ? `лидер ${lot.top_bidder_name ?? "?"}` : "нет ставок"}
                    </>
                  )}
                </p>
                <p className="text-[10px] tabular-nums text-white/25">
                  старт {fmt(lot.min_bid)} ★{lot.buyout ? ` · выкуп ${fmt(lot.buyout)} ★` : ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  disabled={busy}
                  onClick={() => void extend(lot, 60)}
                  className="rounded-lg border border-white/10 px-2 py-1 text-[10.5px] font-bold text-white/55 hover:border-white/25 hover:text-white disabled:opacity-40"
                >
                  +1ч
                </button>
                <button
                  disabled={busy}
                  onClick={() => void cancel(lot)}
                  className="rounded-lg border border-mythic/30 bg-mythic/10 px-2 py-1 text-[10.5px] font-bold text-mythic hover:bg-mythic/20 disabled:opacity-40"
                >
                  Снять
                </button>
              </div>
            </div>
          );
        })}

        {!!done.length && (
          <p className="pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/20">завершённые</p>
        )}
        {done.map((lot) => (
          <div
            key={lot.id}
            className="flex items-center gap-2.5 rounded-xl border border-white/6 bg-white/[0.012] p-2 opacity-55"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-bold">{lot.item_name}</p>
              <p className="text-[10px] text-white/35">
                {lot.sold ? "продан" : "снят"} ·{" "}
                {lot.top_bid > 0 ? `${fmt(lot.top_bid)} ★ · ${lot.top_bidder_name ?? "?"}` : "без ставок"}
              </p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}