import { useEffect, useMemo, useState } from "react";
import { useGame } from "../../store/useGame";
import { useGiftIndex } from "../../lib/useCatalog";
import { GiftArt } from "../gifts/GiftArt";
import { BADGE_BY_ID, type BadgeId } from "../../data/gifts";
import { badgeGlow, nameGradient, profileBanner } from "../../data/cosmetics";

/**
 * Shared cosmetics renderer.
 *
 * The owner sets three independent slots on `profiles` (nickname gradient,
 * badge glow, header banner) and *everybody* who opens the player card has to
 * see the same thing. Keeping the drawing here — instead of in each screen —
 * is what makes "я вижу, значит и другие видят" true instead of hopeful.
 */

/**
 * The player's picture.
 *
 * Every screen used to paint the first letter of the nickname instead; this is
 * the single place that decides between the uploaded picture and that letter,
 * so an avatar shows up in the header, the dashboard, the shop, the leaderboard,
 * the chat and the inventory picker all at once.
 *
 * `src` is the public storage URL (`profiles.avatar_url`). No avatar — or an
 * image that fails to load — silently falls back to the letter, never to a
 * broken-image icon.
 */
export function Avatar({
  src,
  nickname,
  size = 48,
  rounded = "rounded-2xl",
  className = "",
  ring = false,
}: {
  src?: string | null;
  nickname: string;
  size?: number;
  rounded?: string;
  className?: string;
  /** draws the violet gradient border used on the profile header */
  ring?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  // a new url deserves a new attempt, even if the previous one failed
  useEffect(() => setBroken(false), [src]);

  const showImage = Boolean(src) && !broken;
  const inner = (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-violet to-[#3f2299] font-display font-black ${rounded} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={`@${nickname}`}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : (
        nickname.slice(0, 1).toUpperCase()
      )}
    </span>
  );

  if (!ring) return inner;

  return (
    <span className="inline-grid shrink-0 place-items-center rounded-[24px] bg-gradient-to-br from-neon/70 via-violet/70 to-rare/60 p-[2px]">
      {inner}
    </span>
  );
}

/** Nickname text painted with a preset gradient (falls back to plain white). */
export function GradientNick({
  nickname,
  gradient,
  className = "",
  withAt = false,
}: {
  nickname: string;
  gradient: string | null | undefined;
  className?: string;
  withAt?: boolean;
}) {
  const preset = nameGradient(gradient);
  const label = withAt ? `@${nickname}` : nickname;

  if (!preset) return <span className={className}>{label}</span>;

  return (
    <span
      data-cosmetic-motion={preset.animated ? "" : undefined}
      className={`inline-block bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage: preset.background,
        backgroundSize: preset.animated ? "200% 100%" : undefined,
        animation: preset.animated ? "nameGradientSlide 6s linear infinite" : undefined,
        WebkitBackgroundClip: "text",
      }}
    >
      {label}
    </span>
  );
}

/** Badge pill that pulses with a coloured halo when a glow preset is set. */
export function GlowBadge({
  badgeId,
  glow,
  size = "sm",
}: {
  badgeId: string;
  glow: string | null | undefined;
  size?: "sm" | "md";
}) {
  const badge = BADGE_BY_ID[badgeId as BadgeId];
  const preset = badgeGlow(glow);
  if (!badge) return null;

  const hue = preset?.id === "rainbow";

  return (
    <span
      data-cosmetic-motion={preset ? "" : undefined}
      className={`rounded-full border font-bold ${
        size === "md" ? "px-2.5 py-1 text-[10.5px]" : "px-2 py-0.5 text-[9.5px]"
      }`}
      style={{
        color: badge.color,
        borderColor: `${badge.color}55`,
        background: `${badge.color}18`,
        ...(preset
          ? {
              // the ring uses the badge's own colour, the outer halo the preset
              boxShadow: `0 0 0 1px ${badge.color}33`,
              ["--glow" as string]: `${preset.color}66`,
              animation: hue
                ? "badgeGlowPulse 2.6s ease-in-out infinite, badgeGlowHue 6s linear infinite"
                : "badgeGlowPulse 2.6s ease-in-out infinite",
            }
          : {}),
      }}
    >
      {badge.label}
    </span>
  );
}

/** Banner strip behind a player card header. Renders nothing without a preset. */
export function ProfileBannerLayer({ banner }: { banner: string | null | undefined }) {
  const preset = profileBanner(banner);
  if (!preset) return null;

  const drifting = preset.id === "starfield" || preset.id === "matrix" || preset.id === "waves";

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        data-cosmetic-motion={drifting ? "" : undefined}
        className="absolute inset-0"
        style={{
          backgroundImage: preset.overlay
            ? `${preset.overlay}, ${preset.background}`
            : preset.background,
          backgroundSize:
            preset.id === "starfield"
              ? "180px 180px, 140px 140px, 220px 220px, 160px 160px, auto"
              : preset.id === "grid" || preset.id === "matrix"
                ? "22px 22px, 22px 22px, auto"
                : undefined,
          animation: drifting ? "bannerDrift 24s linear infinite" : undefined,
        }}
      />
      {/* keeps the nickname readable on bright banners */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${preset.ink}, rgba(0,0,0,0.75) 100%)`,
        }}
      />
    </div>
  );
}

/**
 * The pinned gifts of the *current* player, read straight from their saved
 * inventory — so the profile page shows the same strip everyone else sees on
 * the public card instead of quietly hiding it.
 */
export function useMyPinnedGifts(limit = 3) {
  const inventory = useGame((s) => s.inventory);
  const GIFT_BY_ID = useGiftIndex();

  return useMemo(
    () =>
      inventory
        .filter((i) => i.pinned && GIFT_BY_ID[i.giftId])
        .sort((a, b) => (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0))
        .slice(0, limit)
        .map((i) => GIFT_BY_ID[i.giftId]),
    [inventory, GIFT_BY_ID, limit],
  );
}

/** A pinned strip used on both the own profile and the public card. */
export function PinnedStrip({ giftIds }: { giftIds: string[] }) {
  const GIFT_BY_ID = useGiftIndex();
  const gifts = giftIds.map((id) => GIFT_BY_ID[id]).filter(Boolean);
  if (!gifts.length) return null;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-neon/80">
        <PinGlyph /> закреплено
      </p>
      <div className="grid grid-cols-3 gap-2">
        {gifts.map((g) => (
          <div
            key={g.id}
            className="flex flex-col items-center rounded-xl border border-neon/20 bg-neon/[0.04] p-1.5"
          >
            <GiftArt gift={g} size={38} rounded="rounded-lg" />
            <p className="mt-1 w-full truncate text-center text-[8.5px] font-bold text-white/70">
              {g.variant === "Gift" ? g.name : g.variant}
            </p>
            <p className="text-[8.5px] font-bold tabular-nums text-neon/70">
              {g.stars.toLocaleString("ru-RU")}★
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 4h6l-1 6 4 4H6l4-4-1-6Z" strokeLinejoin="round" />
      <path d="M12 14v6" strokeLinecap="round" />
    </svg>
  );
}