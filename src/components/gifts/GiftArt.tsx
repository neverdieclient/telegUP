import { motion } from "framer-motion";
import { useState } from "react";
import type { Gift, Rarity } from "../../data/gifts";
import { RARITY_META } from "../../data/gifts";

/* --------------------------------------------------------- gift artwork */

/**
 * Real Telegram gift artwork.
 * Models / symbols / gifts use the scraped .webp files.
 */
export function GiftArt({
  gift,
  size = 96,
  rounded = "rounded-2xl",
  className = "",
}: {
  gift: Gift;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const meta = RARITY_META[gift.rarity];

  if (gift.image && !failed) {
    return (
      <div
        className={`relative grid place-items-center overflow-hidden ${rounded} ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={gift.image}
          alt={`${gift.name} — ${gift.variant}`}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
          style={{ filter: `drop-shadow(0 8px 18px ${meta.text.includes("mythic") ? "rgba(255,61,110,.35)" : "rgba(0,0,0,.55)"})` }}
        />
      </div>
    );
  }

  // fallback: monogram on the accent gradient
  return (
    <div
      className={`relative grid place-items-center overflow-hidden ${rounded} ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(110% 90% at 50% 20%, ${gift.tint}55, #131317 72%)`,
      }}
    >
      <span className="font-display font-black" style={{ fontSize: size * 0.34, color: gift.tint }}>
        {gift.variant.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- thumbs */

export function GiftThumb({ gift, size = 92 }: { gift: Gift; size?: number }) {
  const meta = RARITY_META[gift.rarity];
  return (
    <div
      className={`relative grid place-items-center rounded-2xl border ${meta.ring}`}
      style={{ background: `radial-gradient(120% 90% at 50% 15%, ${gift.tint}33, transparent 70%), #121216` }}
    >
      <GiftArt gift={gift} size={size} />
    </div>
  );
}

export function RarityChip({ rarity, className = "" }: { rarity: Rarity; className?: string }) {
  const meta = RARITY_META[rarity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.chip} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

/* ---------------------------------------------------------------- icons */

export function StarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.6l2.9 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.7 6.1 20.8l1.2-6.6L2.4 9.6l6.7-.9L12 2.6Z" />
    </svg>
  );
}

export function TonIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4.5 4h15a1 1 0 0 1 .86 1.5l-7.5 13.2a1 1 0 0 1-1.72 0L3.64 5.5A1 1 0 0 1 4.5 4Zm5.1 2L12 10.9 14.4 6h-4.8Z" />
    </svg>
  );
}

export function AnimatedNumber({ value }: { value: number }) {
  return (
    <motion.span key={value} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {value.toLocaleString("ru-RU")}
    </motion.span>
  );
}