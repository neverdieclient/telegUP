import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useGame } from "../../store/useGame";
import { StarIcon } from "./GiftArt";
import { Button } from "../ui/Button";
import { LENGTH_ODDS, TIER_COLOR, USERNAME_BOX_PRICE } from "../../lib/usernameBox";

/**
 * The 500★ random-username lootbox.
 *
 * Lives in the inventory: pick it, pay 500★, get a generated Telegram-style
 * username of random length. The odds card states the honest chances.
 */
export function UsernameLootbox() {
  const stars = useGame((s) => s.stars);
  const openUsernameBox = useGame((s) => s.openUsernameBox);
  const setMainUsername = useGame((s) => s.setMainUsername);
  const toast = useGame((s) => s.toast);
  const [rolled, setRolled] = useState<{ username: string; tier: string; length: number } | null>(null);
  const [spinning, setSpinning] = useState(false);

  const roll = () => {
    if (stars < USERNAME_BOX_PRICE) {
      toast({ kind: "error", title: "Недостаточно звёзд", message: `Нужно ${USERNAME_BOX_PRICE} ★` });
      return;
    }
    setRolled(null);
    setSpinning(true);
    window.setTimeout(() => {
      const res = openUsernameBox();
      setSpinning(false);
      if (res) {
        setRolled(res);
        toast({ kind: "success", title: `@${res.username}`, message: "Юзернейм получен" });
      }
    }, 900);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-violet/25 bg-gradient-to-br from-violet/[0.13] via-transparent to-neon/[0.05] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-violet/80">Лутбокс</p>
          <p className="mt-0.5 text-[15px] font-extrabold tracking-tight">Случайный юзернейм</p>
          <p className="mt-0.5 max-w-[380px] text-[11px] leading-relaxed text-white/35">
            4–7 символов. Чем короче — тем дороже. Каждый юзернейм уникален для твоего аккаунта.
          </p>
        </div>
        <Button
          variant="violet"
          size="md"
          disabled={stars < USERNAME_BOX_PRICE || spinning}
          onClick={roll}
          icon={spinning ? undefined : <StarIcon className="size-3.5" />}
        >
          {spinning ? "Открываем…" : `Купить за ${USERNAME_BOX_PRICE}★`}
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {LENGTH_ODDS.map((l) => (
          <div key={l.length} className="rounded-xl border border-white/8 bg-black/30 px-2 py-1.5 text-center">
            <p className="text-[11px] font-extrabold tabular-nums text-white/70">{l.length} букв</p>
            <p className="text-[9.5px] text-white/30">{Math.round(l.chance * 100)}% хороший</p>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {spinning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 overflow-hidden rounded-2xl border border-white/8 bg-black/40 py-2"
          >
            <motion.div
              animate={{ x: ["0%", "-50%"] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
              className="flex w-[200%] gap-2"
            >
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="shrink-0 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1 text-[12px] font-bold text-white/25"
                >
                  @···
                </span>
              ))}
            </motion.div>
          </motion.div>
        )}

        {rolled && !spinning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex items-center justify-between rounded-2xl border border-neon/25 bg-neon/[0.07] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">Выпало</p>
              <p className="truncate text-[15px] font-black tracking-tight">@{rolled.username}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className="rounded-lg border px-2 py-0.5 text-[10px] font-bold"
                style={{
                  color: TIER_COLOR[rolled.tier as keyof typeof TIER_COLOR] ?? "#9aa0aa",
                  borderColor: `${TIER_COLOR[rolled.tier as keyof typeof TIER_COLOR] ?? "#9aa0aa"}55`,
                  background: `${TIER_COLOR[rolled.tier as keyof typeof TIER_COLOR] ?? "#9aa0aa"}18`,
                }}
              >
                {rolled.tier}
              </span>
              <button
                onClick={() => {
                  if (setMainUsername(rolled.username)) toast({ kind: "success", title: "Никнейм обновлён" });
                }}
                className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-bold text-white/70 hover:bg-white/5"
              >
                Поставить
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}