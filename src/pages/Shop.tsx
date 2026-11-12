import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { SHOP_ITEMS, SHOP_USERNAMES, BADGE_BY_ID, type PurchasedShopItem } from "../data/gifts";
import { useGame } from "../store/useGame";
import { StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";
import { Avatar } from "../components/profile/Cosmetics";

export default function Shop() {
  const stars = useGame((s) => s.stars);
  const profile = useGame((s) => s.profile);
  const shopItems = useGame((s) => s.shopItems);
  const buyUsername = useGame((s) => s.buyUsername);
  const buyShopItem = useGame((s) => s.buyShopItem);
  const toast = useGame((s) => s.toast);


  const [confirm, setConfirm] = useState<
    | { kind: "username"; username: string; price: number }
    | { kind: "item"; id: PurchasedShopItem; name: string; price: number }
    | null
  >(null);

  const handleBuy = () => {
    if (!confirm) return;
    if (confirm.kind === "username") {
      if (buyUsername(confirm.username, confirm.price)) {
        toast({ kind: "success", title: `@${confirm.username} — ваш`, message: "Юзернейм куплен" });
      } else {
        toast({ kind: "error", title: "Не удалось купить" });
      }
    } else if (buyShopItem(confirm.id, confirm.price)) {
      toast({ kind: "success", title: confirm.name, message: "Активировано" });
    } else {
      toast({ kind: "error", title: "Не удалось купить" });
    }
    setConfirm(null);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-neon/80">Telegram</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Апгрейд аккаунта</h1>
          <p className="mt-1 text-[12.5px] text-white/35">
            Юзернеймы, +888 и Premium — всё фейково, всё за звёзды.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
          <StarIcon className="size-4 text-neon" />
          <span className="text-[15px] font-extrabold tabular-nums">{stars.toLocaleString("ru-RU")}</span>
        </div>
      </header>

      {/* current account */}
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-neon/[0.06] to-transparent p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar src={profile.avatarUrl} nickname={profile.nickname} size={48} rounded="rounded-2xl" className="text-lg" />
            <div>
              <p className="text-[15px] font-extrabold">@{profile.nickname}</p>
              <p className="text-[11px] text-white/35">
                {profile.tier === "Premium" ? "⭐ Premium" : "Free"} ·{" "}
                {profile.anonymousNumber ? (
                  <span className="tabular-nums text-white/55">{profile.phoneNumber ?? "+888 ··· ···"}</span>
                ) : (
                  "без анонимного номера"
                )}
              </p>
              {profile.collectibleUsername && (
                <p className="text-[11px] font-bold text-sky-400">
                  а также @{profile.collectibleUsername}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profile.badges.map((b) => {
              const badge = BADGE_BY_ID[b];
              if (!badge) return null;
              return (
                <span
                  key={b}
                  className="rounded-lg border px-2 py-1 text-[10px] font-bold"
                  style={{ color: badge.color, borderColor: `${badge.color}55`, background: `${badge.color}18` }}
                >
                  {badge.label}
                </span>
              );
            })}
            {shopItems.map((id) => (
              <span key={id} className="rounded-lg border border-neon/25 bg-neon/10 px-2 py-1 text-[10px] font-bold text-neon">
                {SHOP_ITEMS.find((s) => s.id === id)?.name}
              </span>
            ))}
            {profile.purchasedUsernames.map((u) => (
              <span key={u} className="rounded-lg border border-violet/25 bg-violet/10 px-2 py-1 text-[10px] font-bold text-violet">
                @{u}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* usernames */}
      <section>
        <div className="mb-2.5 flex items-end justify-between">
          <h2 className="text-[14px] font-extrabold tracking-tight">Красивые юзернеймы</h2>
          <span className="text-[10.5px] text-white/25">{SHOP_USERNAMES.length} доступно</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {SHOP_USERNAMES.map((u) => {
            const owned = profile.purchasedUsernames.includes(u.username);
            const active = profile.nickname === u.username;
            const canBuy = stars >= u.price && !owned;
            return (
              <motion.div
                key={u.username}
                whileHover={{ y: -2 }}
                className={`flex flex-col justify-between rounded-2xl border p-3.5 transition-colors ${
                  active
                    ? "border-neon/40 bg-neon/[0.07]"
                    : owned
                      ? "border-white/6 bg-white/[0.015] opacity-60"
                      : "border-white/8 bg-white/[0.03]"
                }`}
              >
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/25">{u.tier}</p>
                  <p className="mt-0.5 truncate text-[15px] font-extrabold tracking-tight">@{u.username}</p>
                </div>
                <div className="mt-3">
                  <p className="mb-2 flex items-center gap-1 text-[11.5px] font-bold tabular-nums text-white/60">
                    <StarIcon className="size-3 text-neon" /> {u.price.toLocaleString("ru-RU")}
                  </p>
                  <Button
                    full
                    size="sm"
                    variant={active ? "outline" : canBuy ? "primary" : "ghost"}
                    disabled={owned || !canBuy}
                    onClick={() => setConfirm({ kind: "username", username: u.username, price: u.price })}
                  >
                    {active ? "Активен" : owned ? "Есть" : canBuy ? "Купить" : "Мало ★"}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* items */}
      <section>
        <h2 className="mb-2.5 text-[14px] font-extrabold tracking-tight">Telegram-плюшки</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {SHOP_ITEMS.map((item) => {
            const owned = shopItems.includes(item.id);
            const canBuy = stars >= item.price && !owned;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13.5px] font-extrabold tracking-tight">{item.name}</p>
                    {owned && (
                      <span className="shrink-0 rounded-md bg-neon/15 px-1.5 py-0.5 text-[9px] font-bold text-neon">
                        Куплено
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/30">{item.desc}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="mb-1.5 text-[12px] font-extrabold tabular-nums text-white/70">
                    {item.price.toLocaleString("ru-RU")} ★
                  </p>
                  <Button
                    size="sm"
                    variant={canBuy ? "violet" : "ghost"}
                    disabled={owned || !canBuy}
                    onClick={() => setConfirm({ kind: "item", id: item.id, name: item.name, price: item.price })}
                  >
                    {owned ? "Есть" : "Купить"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirm(null)}
            className="fixed inset-0 z-[95] grid place-items-center bg-black/80 p-5 backdrop-blur"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-white/10 bg-[#0f0f13] p-5 text-center"
            >
              <p className="text-[15px] font-extrabold">
                {confirm.kind === "username" ? `Купить @${confirm.username}?` : `Купить «${confirm.name}»?`}
              </p>
              <p className="mt-1 text-[12px] text-white/35">
                Спишется {confirm.price.toLocaleString("ru-RU")} ★. Это симуляция.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Отмена
                </Button>
                <Button variant="primary" onClick={handleBuy}>
                  Подтвердить
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}