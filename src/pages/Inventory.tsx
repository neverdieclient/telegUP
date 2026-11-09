import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BADGE_BY_ID, GIFT_BY_ID, RARITY_META, RARITY_ORDER, SHOP_USERNAMES, type Gift, type Rarity } from "../data/gifts";
import { useGame } from "../store/useGame";
import { GiftArt, RarityChip, StarIcon } from "../components/gifts/GiftArt";
import { UsernameLootbox } from "../components/gifts/UsernameLootbox";
import { Button } from "../components/ui/Button";
import { chance, modelUpgradeChance, modelTargets, MODEL_BANDS, type ModelBand } from "../lib/rng";
import { sendGift, searchPlayers, type PlayerRow } from "../lib/players";
import { onlineEnabled } from "../lib/supabase";

type Filter = "all" | Rarity;
type Sort = "new" | "value" | "name";

const SOURCE_LABEL: Record<string, string> = {
  case: "кейс",
  market: "маркет",
  upgrade: "апгрейд",
  free: "бонус",
  admin: "admin",
  pvp: "pvp",
  mines: "mines",
  crash: "crash",
  dice: "dice",
  wheel: "wheel",
  coinflip: "coinflip",
  tower: "tower",
  craft: "крафт",
};

export default function Inventory() {
  const inventory = useGame((s) => s.inventory);
  const sellItem = useGame((s) => s.sellItem);
  const sellAll = useGame((s) => s.sellAll);
  const giftItem = useGame((s) => s.giftItem);
  const upgradeItemModel = useGame((s) => s.upgradeItemModel);
  const loseItemOnUpgrade = useGame((s) => s.loseItemOnUpgrade);
  const toast = useGame((s) => s.toast);
  const profile = useGame((s) => s.profile);
  const setMainUsername = useGame((s) => s.setMainUsername);
  const setCollectibleUsername = useGame((s) => s.setCollectibleUsername);
  const sellUsername = useGame((s) => s.sellUsername);

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [band, setBand] = useState<ModelBand | "all">("all");
  const [modelTargetId, setModelTargetId] = useState<string | null>(null);

  // ---- gift recipient picker ----
  const onlineUserId = useGame((s) => s.onlineUserId);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftQuery, setGiftQuery] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [found, setFound] = useState<PlayerRow[]>([]);
  const [recipient, setRecipient] = useState<PlayerRow | null>(null);

  useEffect(() => {
    if (!giftOpen || !onlineEnabled) return;
    const q = giftQuery.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchPlayers(q, 8).then((rows) => setFound(rows.filter((r) => r.id !== onlineUserId)));
    }, 300);
    return () => window.clearTimeout(t);
  }, [giftOpen, giftQuery, onlineUserId]);

  const list = useMemo(() => {
    let out = inventory.filter((i) => GIFT_BY_ID[i.giftId]);
    if (filter !== "all") out = out.filter((i) => GIFT_BY_ID[i.giftId].rarity === filter);
    out = [...out].sort((a, b) => {
      if (sort === "new") return b.acquiredAt - a.acquiredAt;
      if (sort === "value") return GIFT_BY_ID[b.giftId].stars - GIFT_BY_ID[a.giftId].stars;
      return GIFT_BY_ID[a.giftId].variant.localeCompare(GIFT_BY_ID[b.giftId].variant);
    });
    return out;
  }, [inventory, filter, sort]);

  const totalValue = useMemo(
    () => inventory.reduce((acc, i) => acc + (GIFT_BY_ID[i.giftId]?.stars ?? 0), 0),
    [inventory],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of inventory) {
      const r = GIFT_BY_ID[i.giftId]?.rarity;
      if (r) map[r] = (map[r] ?? 0) + 1;
    }
    return map;
  }, [inventory]);

  const active = selected ? inventory.find((i) => i.id === selected) ?? null : null;
  const activeGift = active ? GIFT_BY_ID[active.giftId] ?? null : null;

  /** Every nicer model of the selected gift, cheapest first. */
  const targets = useMemo(() => (activeGift ? modelTargets(activeGift) : []), [activeGift]);

  const bandTargets = useMemo(() => {
    if (!activeGift || band === "all") return targets;
    const cfg = MODEL_BANDS.find((b) => b.id === band);
    if (!cfg) return targets;
    return targets.filter((t) => t.stars >= activeGift.stars * cfg.mult);
  }, [targets, band, activeGift]);

  const target: Gift | null =
    (modelTargetId && targets.find((t) => t.id === modelTargetId)) || bandTargets[0] || null;

  const targetChance = activeGift && target ? modelUpgradeChance(activeGift, target) : 0;

  const openModelUpgrade = () => {
    setBand("all");
    setModelTargetId(targets[0]?.id ?? null);
    setModelOpen(true);
  };

  const doModelUpgrade = () => {
    if (!active || !activeGift || !target) return;
    const won = chance(targetChance);
    if (won) {
      upgradeItemModel(active.id, target.id);
      toast({
        kind: "success",
        title: `${activeGift.name}: ${target.variant}`,
        message: `Модель улучшена · ${target.stars.toLocaleString("ru-RU")} ★`,
      });
      setSelected(null);
    } else {
      loseItemOnUpgrade(active.id);
      toast({
        kind: "error",
        title: "Модель не выпала",
        message: "Предмет сгорел — так работает честный RNG",
      });
      setSelected(null);
    }
    setModelOpen(false);
  };

  const openGiftPicker = () => {
    setGiftQuery("");
    setGiftMessage("");
    setFound([]);
    setRecipient(null);
    setGiftOpen(true);
  };

  const confirmGift = async () => {
    if (!active || !activeGift || !recipient) return;
    const res = await sendGift({
      fromId: onlineUserId ?? "local",
      fromName: profile.nickname,
      toId: recipient.id,
      toName: recipient.nickname || recipient.username,
      giftId: activeGift.id,
      giftName: activeGift.name,
      giftStars: activeGift.stars,
      message: giftMessage.trim() || undefined,
    });
    if (res.error) {
      toast({ kind: "error", title: "Не отправлено", message: res.error });
      return;
    }
    giftItem(active.id);
    toast({
      kind: "gift",
      title: `Подарок для @${recipient.nickname || recipient.username}`,
      message: `${activeGift.name} отправлен`,
    });
    setGiftOpen(false);
    setSelected(null);
  };

  const doSell = (id: string) => {
    const gain = sellItem(id);
    if (gain > 0) {
      toast({ kind: "success", title: `+${gain.toLocaleString("ru-RU")} ★`, message: "Подарок продан" });
      setSelected(null);
    }
  };

  const doSellAll = () => {
    const { count, stars } = sellAll();
    setConfirmAll(false);
    if (!count) {
      toast({ kind: "info", title: "Инвентарь пуст" });
      return;
    }
    toast({
      kind: "success",
      title: `Продано ${count} шт.`,
      message: `+${stars.toLocaleString("ru-RU")} ★`,
    });
  };

  const usernames = profile.purchasedUsernames;
  const collectibleOptions = usernames.filter((u) => u !== profile.nickname);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-rare">Storage</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Инвентарь</h1>
          <p className="mt-1 text-[12.5px] text-white/35">
            {inventory.length} предметов · {totalValue.toLocaleString("ru-RU")} ★ суммарно
          </p>
        </div>
        <Button
          variant={inventory.length ? "danger" : "ghost"}
          onClick={() => setConfirmAll(true)}
          disabled={!inventory.length}
          icon={<StarIcon className="size-3.5" />}
        >
          Продать всё · {totalValue.toLocaleString("ru-RU")} ★
        </Button>
      </header>

      {/* 500★ random-username lootbox */}
      <UsernameLootbox />

      {/* profile usernames */}
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.05] to-transparent p-4 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-violet/15 blur-[70px]" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">Основной юзернейм</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-display text-xl font-black tracking-tight">@{profile.nickname}</p>
              {profile.badges.map((b) => {
                const badge = BADGE_BY_ID[b];
                if (!badge) return null;
                return (
                  <span
                    key={b}
                    className="rounded-full border px-2 py-0.5 text-[9.5px] font-bold"
                    style={{ color: badge.color, borderColor: `${badge.color}55`, background: `${badge.color}18` }}
                  >
                    {badge.label}
                  </span>
                );
              })}
            </div>
            {profile.collectibleUsername && (
              <p className="mt-1 text-[12px] font-bold text-white/45">
                второй ник: <span className="text-violet">@{profile.collectibleUsername}</span>
              </p>
            )}
            {profile.phoneNumber && (
              <p className="mt-0.5 text-[11px] tabular-nums text-white/30">{profile.phoneNumber}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                Переключить основной
              </span>
              <select
                value={profile.nickname}
                onChange={(e) => setMainUsername(e.target.value)}
                disabled={!usernames.length}
                className="w-full min-w-[150px] rounded-xl border border-white/10 bg-black/40 px-2.5 py-2 text-[12px] font-bold text-white/80 outline-none disabled:opacity-40"
              >
                {usernames.length === 0 && <option value={profile.nickname}>@{profile.nickname}</option>}
                {usernames.map((u) => (
                  <option key={u} value={u}>
                    @{u}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                Второй (коллекционный)
              </span>
              <select
                value={profile.collectibleUsername ?? ""}
                onChange={(e) => setCollectibleUsername(e.target.value || null)}
                disabled={!collectibleOptions.length}
                className="w-full min-w-[150px] rounded-xl border border-white/10 bg-black/40 px-2.5 py-2 text-[12px] font-bold text-violet outline-none disabled:opacity-40"
              >
                <option value="">— нет —</option>
                {collectibleOptions.map((u) => (
                  <option key={u} value={u}>
                    @{u}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {usernames.length === 0 && (
          <p className="relative mt-2 text-[11px] text-white/30">
            Купи юзернейм в{" "}
            <Link to="/app/shop" className="font-bold text-neon hover:underline">
              магазине
            </Link>
            , чтобы переключаться между никами. Второй ник — отдельный слот, как в Telegram.
          </p>
        )}
      </section>

      {/* owned usernames — sell back */}
      {usernames.length > 0 && (
        <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-[13.5px] font-extrabold tracking-tight">Мои юзернеймы</h2>
            <span className="text-[10.5px] text-white/25">{usernames.length} шт.</span>
          </div>
          <div className="space-y-2">
            {usernames.map((u) => {
              const active = u === profile.nickname;
              const shopPrice = SHOP_USERNAMES.find((s) => s.username === u)?.price;
              const value = Math.round((shopPrice ?? 800) * 0.6);
              return (
                <div
                  key={u}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 ${
                    active ? "border-neon/30 bg-neon/[0.05]" : "border-white/8 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-extrabold">@{u}</p>
                    <p className="text-[10.5px] text-white/30">
                      {active ? "активный ник" : profile.collectibleUsername === u ? "второй ник" : "свободен"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1 text-[11.5px] font-bold tabular-nums text-neon">
                      <StarIcon className="size-3" /> {value.toLocaleString("ru-RU")}
                    </span>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={active}
                      onClick={() => {
                        if (sellUsername(u, value)) {
                          toast({ kind: "success", title: `@${u} продан`, message: `+${value.toLocaleString("ru-RU")} ★` });
                        }
                      }}
                    >
                      {active ? "В игре" : "Продать"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-white/25">Продать можно любой ник, кроме активного. Выплата — 60% цены.</p>
        </section>
      )}

      {/* filters */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-white/8 bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {(["all", ...RARITY_ORDER] as Filter[]).map((f) => {
            const label = f === "all" ? "Все" : RARITY_META[f].label;
            const count = f === "all" ? inventory.length : counts[f] ?? 0;
            if (f !== "all" && !count) return null;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${
                  filter === f ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/75"
                }`}
              >
                {label} <span className="text-white/25">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ["new", "новые"],
              ["value", "дорогие"],
              ["name", "имя"],
            ] as [Sort, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`rounded-xl px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${
                sort === k ? "bg-white/10 text-white" : "text-white/35 hover:text-white/70"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      {list.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 py-20 text-center">
          <p className="text-[14px] font-bold text-white/45">Тут пока пусто</p>
          <p className="mt-1 text-[11.5px] text-white/25">Открой кейс или купи подарок на маркете</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/app/cases">
              <Button size="sm">К кейсам</Button>
            </Link>
            <Link to="/app/market">
              <Button size="sm" variant="ghost">
                На маркет
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((item, i) => {
            const gift = GIFT_BY_ID[item.giftId];
            const meta = RARITY_META[gift.rarity];
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.01, 0.2), duration: 0.28 }}
                onClick={() => setSelected(item.id)}
                className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-white/[0.025] text-left transition-transform duration-300 hover:-translate-y-1 ${meta.ring}`}
              >
                <div
                  className="relative grid h-[108px] place-items-center overflow-hidden"
                  style={{ background: `radial-gradient(120% 105% at 50% 5%, ${gift.tint}2e, #0e0e12 72%)` }}
                >
                  <GiftArt gift={gift} size={70} rounded="rounded-xl" />
                  <span className={`absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider ${meta.chip}`}>
                    {meta.label}
                  </span>
                  <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[8.5px] font-bold text-white/45 backdrop-blur">
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                </div>
                <div className="p-2.5">
                  <h3 className="truncate text-[12px] font-extrabold tracking-tight">{gift.name}</h3>
                  <p className="truncate text-[10px] text-white/35">
                    {gift.variant === "Gift" ? "коллекционный подарок" : gift.variant}
                  </p>
                  <p className="mt-1.5 flex items-center gap-0.5 text-[12px] font-extrabold tabular-nums text-neon/90">
                    {gift.stars.toLocaleString("ru-RU")}
                    <StarIcon className="size-2.5" />
                  </p>
                </div>
              </motion.button>
            );
          })}
        </section>
      )}

      {/* item sheet */}
      <AnimatePresence>
        {active && activeGift && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-[#0c0c0f] sm:rounded-3xl"
            >
              <div
                className="relative grid h-44 place-items-center"
                style={{ background: `radial-gradient(120% 100% at 50% 0%, ${activeGift.tint}33, #0c0c0f 72%)` }}
              >
                <GiftArt gift={activeGift} size={104} rounded="rounded-2xl" />
                <button
                  onClick={() => setSelected(null)}
                  className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/40 text-white/50 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[18px] font-extrabold tracking-tight">{activeGift.name}</h3>
                    <p className="truncate text-[12px] text-white/40">
                      {activeGift.variant === "Gift" ? "коллекционный подарок" : activeGift.variant}
                    </p>
                  </div>
                  <RarityChip rarity={activeGift.rarity} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["стоимость", `${activeGift.stars.toLocaleString("ru-RU")} ★`],
                    ["TON", activeGift.ton > 0 ? activeGift.ton.toLocaleString("ru-RU") : "—"],
                    ["тираж", activeGift.supply > 0 ? activeGift.supply.toLocaleString("ru-RU") : "∞"],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-white/7 bg-white/[0.025] px-2.5 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">{l}</p>
                      <p className="truncate text-[12px] font-extrabold tabular-nums text-white/85">{v}</p>
                    </div>
                  ))}
                </div>

                <p className="mt-3 line-clamp-3 text-[11px] leading-relaxed text-white/30">{activeGift.desc}</p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button full variant="primary" onClick={() => doSell(active.id)} icon={<StarIcon className="size-3.5" />}>
                    Продать
                  </Button>
                  <Button
                    full
                    variant="ghost"
                    onClick={openGiftPicker}
                  >
                    Подарить
                  </Button>
                </div>

                {targets.length > 0 ? (
                  <Button
                    full
                    variant="violet"
                    className="mt-2"
                    onClick={openModelUpgrade}
                    disabled={modelOpen}
                  >
                    ✨ Улучшить модель · {targets.length} вариантов
                  </Button>
                ) : (
                  <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-center text-[10.5px] text-white/30">
                    это топ-модель — выше некуда
                  </p>
                )}

                <Link to="/app/upgrade" onClick={() => setSelected(null)} className="mt-2 block">
                  <Button full variant="ghost" size="sm">
                    Апгрейд на другой подарок
                  </Button>
                </Link>

                {modelOpen && targets.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-violet/25 bg-violet/[0.06] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet/70">
                        Другая модель
                      </p>
                      <button
                        onClick={() => setModelOpen(false)}
                        className="text-[11px] font-bold text-white/35 hover:text-white"
                      >
                        свернуть
                      </button>
                    </div>

                    <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                      <button
                        onClick={() => {
                          setBand("all");
                          setModelTargetId(targets[0]?.id ?? null);
                        }}
                        className={`shrink-0 rounded-lg px-2 py-1 text-[10.5px] font-bold ${
                          band === "all" ? "bg-white/12 text-white" : "text-white/35 hover:text-white/70"
                        }`}
                      >
                        все
                      </button>
                      {MODEL_BANDS.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => {
                            setBand(b.id);
                            setModelTargetId(null);
                          }}
                          className={`shrink-0 rounded-lg px-2 py-1 text-[10.5px] font-bold ${
                            band === b.id ? "bg-white/12 text-white" : "text-white/35 hover:text-white/70"
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-2 grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto">
                      {bandTargets.map((t) => {
                        const on = target?.id === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setModelTargetId(t.id)}
                            className={`rounded-xl border p-1.5 text-center transition-colors ${
                              on
                                ? "border-violet/60 bg-violet/15"
                                : "border-white/8 bg-white/[0.02] hover:border-white/20"
                            }`}
                          >
                            <GiftArt gift={t} size={34} rounded="rounded-md" />
                            <p className="mt-1 truncate text-[9px] font-bold text-white/70">{t.variant}</p>
                            <p className="text-[9px] tabular-nums text-neon/80">{t.stars.toLocaleString("ru-RU")}</p>
                          </button>
                        );
                      })}
                    </div>

                    {target && (
                      <div className="mt-2.5 flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-extrabold">{target.variant}</p>
                          <p className="text-[9.5px] tabular-nums text-white/35">
                            {activeGift.stars.toLocaleString("ru-RU")} → {target.stars.toLocaleString("ru-RU")} ★
                          </p>
                        </div>
                        <p className="text-[14px] font-black tabular-nums text-violet">
                          {targetChance.toFixed(2)}%
                        </p>
                      </div>
                    )}

                    <Button full className="mt-2" size="sm" onClick={doModelUpgrade} disabled={!target}>
                      Улучшить модель
                    </Button>
                    <p className="mt-1.5 text-center text-[9.5px] leading-relaxed text-white/25">
                      При неудаче предмет сгорает — честный взвешенный RNG
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* gift recipient picker */}
      <AnimatePresence>
        {giftOpen && activeGift && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setGiftOpen(false)}
            className="fixed inset-0 z-[96] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-[#0c0c0f] sm:rounded-3xl"
            >
              <div className="flex items-center gap-3 border-b border-white/8 p-4">
                <GiftArt gift={activeGift} size={44} rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-extrabold tracking-tight">Подарить «{activeGift.name}»</h3>
                  <p className="text-[11px] text-white/35">
                    {activeGift.variant === "Gift" ? "коллекционный подарок" : activeGift.variant} ·{" "}
                    {activeGift.stars.toLocaleString("ru-RU")} ★
                  </p>
                </div>
                <button
                  onClick={() => setGiftOpen(false)}
                  className="grid size-8 place-items-center rounded-full bg-black/40 text-white/50 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Кому отправить</p>
                <input
                  value={giftQuery}
                  onChange={(e) => {
                    setGiftQuery(e.target.value);
                    setRecipient(null);
                  }}
                  placeholder="@username или ник"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] font-semibold outline-none placeholder:text-white/20 focus:border-neon/40"
                />

                {!onlineEnabled && (
                  <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[10.5px] leading-relaxed text-white/30">
                    Онлайн не подключён — подарок уйдёт в локальную симуляцию.
                  </p>
                )}

                {giftQuery.trim().length >= 2 && found.length === 0 && onlineEnabled && (
                  <p className="mt-2 px-1 text-[11px] text-white/30">Никого не нашли</p>
                )}

                {found.length > 0 && (
                  <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                    {found.map((p) => {
                      const on = recipient?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setRecipient(p)}
                          className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                            on ? "border-neon/50 bg-neon/10" : "border-white/8 bg-white/[0.02] hover:border-white/20"
                          }`}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/8 text-[12px] font-black uppercase text-white/70">
                            {(p.nickname || p.username || "?").slice(0, 1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-extrabold">@{p.nickname || p.username}</span>
                            <span className="block truncate text-[10px] text-white/30">
                              {p.inventory_value.toLocaleString("ru-RU")} ★ инвентарь · {p.items} шт.
                            </span>
                          </span>
                          {on && <span className="text-[10px] font-bold text-neon">выбран</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {recipient && (
                  <div className="mt-2 rounded-xl border border-neon/25 bg-neon/[0.06] px-3 py-2 text-[11px] text-white/60">
                    Получатель: <span className="font-bold text-neon">@{recipient.nickname || recipient.username}</span>
                  </div>
                )}

                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                  Сообщение <span className="normal-case tracking-normal text-white/20">(необязательно)</span>
                </p>
                <input
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value.slice(0, 120))}
                  placeholder="С днём рождения!"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-neon/40"
                />

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="ghost" full onClick={() => setGiftOpen(false)}>
                    Отмена
                  </Button>
                  <Button variant="primary" full onClick={confirmGift} disabled={!recipient} icon={<StarIcon className="size-3.5" />}>
                    Отправить
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* sell all confirm */}
      <AnimatePresence>
        {confirmAll && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmAll(false)}
            className="fixed inset-0 z-[95] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0d0d11] p-5 text-center"
            >
              <h3 className="text-[16px] font-extrabold tracking-tight">Продать всё?</h3>
              <p className="mt-1 text-[12px] text-white/40">
                {inventory.length} предметов уйдут за{" "}
                <span className="font-bold text-neon">{totalValue.toLocaleString("ru-RU")} ★</span>. Отменить нельзя.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="ghost" full onClick={() => setConfirmAll(false)}>
                  Отмена
                </Button>
                <Button variant="danger" full onClick={doSellAll}>
                  Продать
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}