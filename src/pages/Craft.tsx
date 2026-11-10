import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GIFT_BY_ID } from "../data/gifts";
import { useGame } from "../store/useGame";
import { GiftArt, RarityChip, StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";

/**
 * Крафт — merge 2–4 copies of one collectible into a better one.
 *
 * Rules:
 *   • all inputs must be the same collectible (same slug);
 *   • the inputs are always consumed;
 *   • more inputs → higher success chance (2→40 %, 3→60 %, 4→80 %);
 *   • on success you get a better model of that collectible, or — when it has
 *     no better model — a random gift of a higher rarity.
 */
export default function Craft() {
  const inventory = useGame((s) => s.inventory);
  const craftItems = useGame((s) => s.craftItems);
  const toast = useGame((s) => s.toast);

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<
    | { kind: "win"; giftId: string }
    | { kind: "burn" }
    | { kind: "error"; message: string }
    | null
  >(null);

  /** inventory grouped by collectible, only groups with ≥ 2 items */
  const groups = useMemo(() => {
    const map = new Map<string, { slug: string; ids: string[] }>();
    for (const item of inventory) {
      const gift = GIFT_BY_ID[item.giftId];
      if (!gift) continue;
      const entry = map.get(gift.slug) ?? { slug: gift.slug, ids: [] };
      entry.ids.push(item.id);
      map.set(gift.slug, entry);
    }
    return [...map.values()]
      .filter((g) => g.ids.length >= 2)
      .sort((a, b) => b.ids.length - a.ids.length);
  }, [inventory]);

  const activeGroup = useMemo(() => {
    if (!picked.length) return null;
    const first = inventory.find((i) => i.id === picked[0]);
    return first ? GIFT_BY_ID[first.giftId]?.slug ?? null : null;
  }, [picked, inventory]);

  const pickCount = picked.length;
  const winChance = pickCount >= 2 ? Math.round((0.4 + (pickCount - 2) * 0.2) * 100) : 0;

  const toggle = (slug: string, id: string) => {
    setResult(null);
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      // only one collectible at a time, max 4 items
      const sameGroup = cur.filter((x) => {
        const it = inventory.find((i) => i.id === x);
        return it && GIFT_BY_ID[it.giftId]?.slug === slug;
      });
      if (sameGroup.length !== cur.length) return [id];
      if (cur.length >= 4) return cur;
      return [...cur, id];
    });
  };

  const craft = () => {
    if (pickCount < 2) {
      setResult({ kind: "error", message: "Возьми хотя бы 2 предмета одной модели" });
      return;
    }
    const res = craftItems(picked);
    setPicked([]);
    if (res.ok) {
      setResult({ kind: "win", giftId: res.item.giftId });
      toast({ kind: "success", title: "Крафт удался!", message: GIFT_BY_ID[res.item.giftId]?.variant ?? "" });
    } else if (res.reason === "burned") {
      setResult({ kind: "burn" });
      toast({ kind: "error", title: "Не вышло", message: "Предметы сгорели" });
    } else if (res.reason === "too-few") {
      setResult({ kind: "error", message: "Нужно минимум 2 предмета" });
    } else if (res.reason === "mismatch") {
      setResult({ kind: "error", message: "Только одна модель за раз, максимум 4" });
    } else {
      setResult({ kind: "error", message: "Предмет не найден" });
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-black tracking-tight">Крафт</h1>
        <p className="text-[12px] text-white/40">
          Объедини 2–4 подарка одной модели в один — получше. Больше предметов, выше шанс.
        </p>
      </header>

      {/* result banner */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`overflow-hidden rounded-3xl border p-5 ${
              result.kind === "win"
                ? "border-neon/40 bg-neon/[0.06]"
                : result.kind === "burn"
                  ? "border-mythic/35 bg-mythic/[0.06]"
                  : "border-white/12 bg-white/[0.03]"
            }`}
          >
            {result.kind === "win" && (
              <div className="flex items-center gap-4">
                <GiftArt gift={GIFT_BY_ID[result.giftId]} size={84} celebrate />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neon/80">Получено</p>
                  <p className="mt-1 text-[16px] font-extrabold tracking-tight">
                    {GIFT_BY_ID[result.giftId]?.variant}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <RarityChip rarity={GIFT_BY_ID[result.giftId].rarity} />
                    <span className="text-[12px] font-extrabold tabular-nums text-neon">
                      {GIFT_BY_ID[result.giftId].stars.toLocaleString("ru-RU")}★
                    </span>
                  </div>
                </div>
              </div>
            )}
            {result.kind === "burn" && (
              <p className="text-[13px] font-bold text-mythic">Не повезло — предметы сгорели. Попробуй ещё.</p>
            )}
            {result.kind === "error" && (
              <p className="text-[13px] font-bold text-white/70">{result.message}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {groups.length === 0 ? (
        <div className="rounded-3xl border border-white/8 bg-white/[0.028] p-8 text-center backdrop-blur-xl">
          <StarIcon className="mx-auto size-10 text-white/15" />
          <p className="mt-3 text-[14px] font-extrabold">Нечего крафтить</p>
          <p className="mt-1 text-[12px] text-white/40">
            Нужно минимум 2 подарка одной модели. Открой кейсы или купи в маркете.
          </p>
          <Link to="/app/cases" className="mt-4 inline-block">
            <Button size="sm">К кейсам</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* groups */}
          <div className="space-y-3">
            {groups.map((g) => {
              const first = GIFT_BY_ID[inventory.find((i) => i.id === g.ids[0])!.giftId];
              const isActive = activeGroup === g.slug;
              return (
                <section
                  key={g.slug}
                  className={`rounded-3xl border p-4 backdrop-blur-xl transition-colors ${
                    isActive ? "border-neon/40 bg-neon/[0.04]" : "border-white/8 bg-white/[0.028]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GiftArt gift={first} size={44} rounded="rounded-xl" />
                      <div>
                        <p className="text-[14px] font-extrabold tracking-tight">{first.variant}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <RarityChip rarity={first.rarity} />
                          <span className="text-[11px] text-white/40">{g.ids.length} шт.</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setPicked(isActive ? [] : g.ids.slice(0, 4))}
                      className="rounded-xl border border-white/12 px-3 py-1.5 text-[11px] font-bold text-white/60 hover:border-white/25 hover:text-white"
                    >
                      {isActive ? "снять" : "выбрать"}
                    </button>
                  </div>

                  {/* item chips */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {g.ids.map((id) => {
                      const on = picked.includes(id);
                      const item = inventory.find((i) => i.id === id)!;
                      const gift = GIFT_BY_ID[item.giftId];
                      return (
                        <button
                          key={id}
                          onClick={() => toggle(g.slug, id)}
                          className={`rounded-xl border p-1.5 transition-all ${
                            on ? "border-neon/60 bg-neon/12" : "border-white/8 bg-white/[0.02] hover:border-white/20"
                          }`}
                          title={gift.variant}
                        >
                          <GiftArt gift={gift} size={34} rounded="rounded-md" motion="none" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* craft panel */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-3xl border border-white/8 bg-white/[0.028] p-5 backdrop-blur-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Сборка</p>

              <div className="mt-3 flex min-h-[56px] flex-wrap items-center gap-1.5 rounded-2xl border border-dashed border-white/12 bg-black/25 p-2">
                {picked.length === 0 && (
                  <span className="px-2 text-[11.5px] text-white/30">Выбери 2–4 предмета</span>
                )}
                {picked.map((id) => {
                  const item = inventory.find((i) => i.id === id);
                  const gift = item ? GIFT_BY_ID[item.giftId] : null;
                  if (!gift) return null;
                  return (
                    <button key={id} onClick={() => setPicked((c) => c.filter((x) => x !== id))}>
                      <GiftArt gift={gift} size={40} rounded="rounded-lg" motion="none" />
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3 py-2.5">
                <span className="text-[12px] text-white/50">Шанс успеха</span>
                <span
                  className={`text-[16px] font-black tabular-nums ${
                    pickCount >= 2 ? "text-neon" : "text-white/25"
                  }`}
                >
                  {pickCount >= 2 ? `${winChance}%` : "—"}
                </span>
              </div>

              <Button
                full
                size="lg"
                className="mt-3"
                disabled={pickCount < 2}
                onClick={craft}
                icon={<StarIcon className="size-4" />}
              >
                Скрафтить
              </Button>

              <p className="mt-2 text-center text-[10.5px] leading-relaxed text-white/30">
                Предметы расходуются всегда. При неудаче они сгорают.{" "}
                {activeGroup && `Модель: ${GIFT_BY_ID[inventory.find((i) => i.id === picked[0])?.giftId ?? ""]?.variant}`}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
