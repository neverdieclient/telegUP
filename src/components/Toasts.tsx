import { AnimatePresence, motion } from "framer-motion";
import { useGame } from "../store/useGame";
import { GiftArt } from "./gifts/GiftArt";
import { GIFT_BY_ID, RARITY_META } from "../data/gifts";

export function ToastStack() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => {
          const gift = t.kind === "gift" ? GIFT_BY_ID[t.message ?? ""] : undefined;
          const meta = gift ? RARITY_META[gift.rarity] : null;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={() => dismiss(t.id)}
              className={[
                "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border px-3.5 py-3 backdrop-blur-2xl",
                gift
                  ? `border-white/10 bg-carbon/90 ${meta ? meta.glow : ""}`
                  : t.kind === "success"
                    ? "border-neon/30 bg-[#0f1a06]/90"
                    : t.kind === "error"
                      ? "border-mythic/35 bg-[#1a070c]/90"
                      : "border-white/12 bg-carbon/90",
              ].join(" ")}
            >
              {gift ? (
                <div
                  className="grid size-11 shrink-0 place-items-center rounded-xl"
                  style={{ background: `radial-gradient(circle at 50% 20%, ${gift.tint}44, #0e0e11)` }}
                >
                  <GiftArt gift={gift} size={34} rounded="rounded-lg" />
                </div>
              ) : (
                <span
                  className={[
                    "grid size-8 shrink-0 place-items-center rounded-lg text-sm font-black",
                    t.kind === "success"
                      ? "bg-neon/15 text-neon"
                      : t.kind === "error"
                        ? "bg-mythic/15 text-mythic"
                        : "bg-white/10 text-white/70",
                  ].join(" ")}
                >
                  {t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-white/95">{t.title}</p>
                {t.kind !== "gift" && t.message && (
                  <p className="truncate text-[11.5px] text-white/50">{t.message}</p>
                )}
                {gift && <p className={`text-[11.5px] font-semibold ${meta?.text}`}>{meta?.label} · +{gift.stars.toLocaleString("ru-RU")}★</p>}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}