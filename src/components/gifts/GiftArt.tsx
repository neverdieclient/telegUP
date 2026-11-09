import { motion } from "framer-motion";
import { useState } from "react";
import type { Gift, Rarity } from "../../data/gifts";
import { RARITY_META } from "../../data/gifts";

/* --------------------------------------------------------- gift artwork */

/** How lively the artwork is. `none` freezes it (lists, tables, admin screens). */
export type GiftMotion = "none" | "hover" | "idle";

/** Per-rarity flavour: float amplitude and glow strength. */
const FLAVOUR: Record<Rarity, { bob: string; halo: string; rays: boolean }> = {
  common: { bob: "3.2s", halo: "6.4s", rays: false },
  rare: { bob: "4.1s", halo: "5.6s", rays: false },
  epic: { bob: "4.4s", halo: "4.8s", rays: false },
  legendary: { bob: "4.8s", halo: "4.2s", rays: true },
  mythic: { bob: "5.2s", halo: "3.4s", rays: true },
};

/**
 * Real Telegram gift artwork, animated.
 *
 * Everything is CSS-only so it stays cheap on phones: the image bobs on its
 * own, a halo pulses behind it in the rarity colour and a highlight sweeps
 * across once every few seconds. `motion="hover"` (the default in grids) only
 * runs all of that while the card is hovered/focused — but a small idle bob is
 * always on so a grid still feels alive.
 */
export function GiftArt({
  gift,
  size = 96,
  rounded = "rounded-2xl",
  className = "",
  motion: alive = "hover",
  /**
   * `celebrate` plays a one-shot pop + burst, used when a gift drops out of a
   * case or a wheel. It is a plain flag so callers can just flip a boolean.
   */
  celebrate = false,
}: {
  gift: Gift;
  size?: number;
  rounded?: string;
  className?: string;
  motion?: GiftMotion;
  celebrate?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const meta = RARITY_META[gift.rarity];
  const flavour = FLAVOUR[gift.rarity];
  const animated = alive !== "none";

  const halo = (
    <>
      {/* rarity halo — reads well even at 30px */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[-12%] rounded-full"
        style={{
          background: `radial-gradient(closest-side, ${meta.hex}55, ${meta.hex}18 55%, transparent 76%)`,
          animation: animated ? `giftHalo ${flavour.halo} ease-in-out infinite` : undefined,
          filter: size >= 64 ? "blur(6px)" : undefined,
          opacity: animated ? undefined : 0.3,
        }}
      />
      {/* slow rotating rays for the top two rarities */}
      {flavour.rays && animated && size >= 56 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[-18%] rounded-full opacity-[0.16]"
          style={{
            background: `conic-gradient(from 0deg, ${meta.hex}00 0deg, ${meta.hex} 18deg, ${meta.hex}00 36deg, ${meta.hex}00 90deg, ${meta.hex} 108deg, ${meta.hex}00 126deg, ${meta.hex}00 180deg, ${meta.hex} 198deg, ${meta.hex}00 216deg, ${meta.hex}00 270deg, ${meta.hex} 288deg, ${meta.hex}00 306deg)`,
            animation: "giftRays 18s linear infinite",
            maskImage: "radial-gradient(closest-side, transparent 42%, #000 60%, transparent 86%)",
            WebkitMaskImage: "radial-gradient(closest-side, transparent 42%, #000 60%, transparent 86%)",
          }}
        />
      )}
    </>
  );

  // the diagonal white sweep looked like a dirty smear over the artwork, so
  // it is gone: motion is now only the float, halo and (for top rarities) rays

  const wrapperProps = celebrate
    ? { style: { animation: "giftPop 520ms cubic-bezier(.34,1.56,.64,1) both" } as React.CSSProperties }
    : {};

  if (gift.image && !failed) {
    return (
      <div
        className={`group relative grid shrink-0 place-items-center ${rounded} ${className}`}
        style={{ width: size, height: size }}
        data-gift-motion={animated ? gift.rarity : undefined}
        {...wrapperProps}
      >
        <div className="relative grid size-full place-items-center">
          {halo}
          <img
            src={gift.image}
            alt={`${gift.name} — ${gift.variant}`}
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className={`relative h-full w-full object-contain ${
              alive === "hover" ? "group-hover:scale-[1.06]" : ""
            } transition-transform duration-300`}
            style={{
              filter: `drop-shadow(0 8px 18px ${gift.rarity === "mythic" ? "rgba(255,61,110,.35)" : "rgba(0,0,0,.55)"})`,
              animation: animated ? `giftBob ${flavour.bob} ease-in-out infinite` : undefined,
              willChange: animated ? "transform" : undefined,
            }}
          />
        </div>
      </div>
    );
  }

  // fallback: monogram on the accent gradient
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden ${rounded} ${className}`}
      data-gift-motion={animated ? gift.rarity : undefined}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(110% 90% at 50% 20%, ${gift.tint}55, #131317 72%)`,
      }}
      {...wrapperProps}
    >
      {halo}
      <span
        className="relative font-display font-black"
        style={{
          fontSize: size * 0.34,
          color: gift.tint,
          animation: animated ? `giftBob ${flavour.bob} ease-in-out infinite` : undefined,
        }}
      >
        {gift.variant.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- thumbs */

export function GiftThumb({
  gift,
  size = 92,
  motion = "hover",
}: {
  gift: Gift;
  size?: number;
  motion?: GiftMotion;
}) {
  const meta = RARITY_META[gift.rarity];
  return (
    <div
      className={`relative grid place-items-center rounded-2xl border ${meta.ring}`}
      style={{ background: `radial-gradient(120% 90% at 50% 15%, ${gift.tint}33, transparent 70%), #121216` }}
    >
      <GiftArt gift={gift} size={size} motion={motion} />
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