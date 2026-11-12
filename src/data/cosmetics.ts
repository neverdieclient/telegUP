/**
 * Profile cosmetics the owner can hand out.
 *
 * Everything here is purely visual and lives on the `profiles` row
 * (`name_gradient`, `badge_glow`, `profile_banner`), so the rest of the app —
 * the leaderboard, the public player card, chat — renders the same thing from
 * the same data without knowing who granted it.
 *
 * Three independent slots:
 *
 *   name_gradient  the nickname is painted with a preset gradient
 *   badge_glow     the account's badges pulse with a soft halo
 *   profile_banner the header of the player card gets a wide banner
 *
 * Ids are stored as text. An unknown id renders as "no cosmetic", so a preset
 * that is removed later degrades to the plain look instead of breaking.
 */

export type NameGradientId =
  | "aurora"
  | "sunset"
  | "ice"
  | "gold"
  | "neon"
  | "candy"
  | "toxic"
  | "royal";

export type BadgeGlowId = "soft" | "neon" | "fire" | "ice" | "gold" | "rainbow";

export type ProfileBannerId =
  | "grid"
  | "aurora"
  | "starfield"
  | "waves"
  | "ember"
  | "matrix"
  | "bloom"
  | "chrome";

export type NameGradient = {
  id: NameGradientId;
  label: string;
  /** CSS `background-image` for the text itself */
  background: string;
  /** solid colour used as the fallback / glow tint */
  tint: string;
  /** true → the gradient slowly slides across the text */
  animated?: boolean;
};

export type BadgeGlow = {
  id: BadgeGlowId;
  label: string;
  /** box-shadow colour while pulsing */
  color: string;
};

export type ProfileBanner = {
  id: ProfileBannerId;
  label: string;
  /** CSS `background` for the banner strip */
  background: string;
  /**
   * Extra layer drawn above the base — a tiled pattern or a soft light pass.
   * Kept as a plain CSS background so no assets have to be shipped.
   */
  overlay?: string;
  /** darker text/pill base, so the nickname stays readable on bright banners */
  ink: string;
};

/* ------------------------------------------------------------------ names */

export const NAME_GRADIENTS: NameGradient[] = [
  {
    id: "aurora",
    label: "Аврора",
    background: "linear-gradient(95deg, #a3ff12 0%, #38d6ff 45%, #a78bfa 100%)",
    tint: "#7fe8c0",
    animated: true,
  },
  {
    id: "sunset",
    label: "Закат",
    background: "linear-gradient(95deg, #ffb43d 0%, #ff5d7a 50%, #b23cff 100%)",
    tint: "#ff7a8f",
  },
  {
    id: "ice",
    label: "Лёд",
    background: "linear-gradient(95deg, #dff3ff 0%, #8fc3e8 40%, #6d8bff 100%)",
    tint: "#a9d8ff",
  },
  {
    id: "gold",
    label: "Золото",
    background: "linear-gradient(95deg, #fff3b0 0%, #ffc93d 35%, #b47b16 65%, #ffdf7a 100%)",
    tint: "#ffcb52",
    animated: true,
  },
  {
    id: "neon",
    label: "Неон",
    background: "linear-gradient(95deg, #00ffd0 0%, #2bff88 50%, #b6ff2e 100%)",
    tint: "#3affc4",
    animated: true,
  },
  {
    id: "candy",
    label: "Карамель",
    background: "linear-gradient(95deg, #ff9ecd 0%, #c79bff 50%, #7fd8ff 100%)",
    tint: "#ffa8d4",
  },
  {
    id: "toxic",
    label: "Токсин",
    background: "linear-gradient(95deg, #d6ff3d 0%, #6bff8f 45%, #14e0a8 100%)",
    tint: "#b6ff4d",
    animated: true,
  },
  {
    id: "royal",
    label: "Роял",
    background: "linear-gradient(95deg, #b18cff 0%, #6d3fd1 45%, #ff6ec7 100%)",
    tint: "#a480ff",
    animated: true,
  },
];

export const NAME_GRADIENT_BY_ID = Object.fromEntries(
  NAME_GRADIENTS.map((g) => [g.id, g]),
) as Record<NameGradientId, NameGradient>;

/* ----------------------------------------------------------------- badges */

export const BADGE_GLOWS: BadgeGlow[] = [
  { id: "soft", label: "Мягкое", color: "#ffffff" },
  { id: "neon", label: "Неон", color: "#a3ff12" },
  { id: "fire", label: "Огонь", color: "#ff7a3d" },
  { id: "ice", label: "Лёд", color: "#7ad4ff" },
  { id: "gold", label: "Золото", color: "#ffcb52" },
  { id: "rainbow", label: "Радуга", color: "#ff5dc8" },
];

export const BADGE_GLOW_BY_ID = Object.fromEntries(
  BADGE_GLOWS.map((g) => [g.id, g]),
) as Record<BadgeGlowId, BadgeGlow>;

/* ---------------------------------------------------------------- banners */

export const PROFILE_BANNERS: ProfileBanner[] = [
  {
    id: "grid",
    label: "Сетка",
    background: "linear-gradient(120deg, #14210c 0%, #0b1410 55%, #08100f 100%)",
    overlay:
      "linear-gradient(rgba(163,255,18,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(163,255,18,0.11) 1px, transparent 1px)",
    ink: "rgba(6,10,4,0.55)",
  },
  {
    id: "aurora",
    label: "Аврора",
    background:
      "radial-gradient(120% 140% at 8% 0%, rgba(163,255,18,0.28) 0%, transparent 55%), radial-gradient(110% 130% at 92% 20%, rgba(139,92,246,0.35) 0%, transparent 60%), radial-gradient(90% 120% at 55% 110%, rgba(56,214,255,0.25) 0%, transparent 65%), #0a0c14",
    ink: "rgba(5,6,12,0.5)",
  },
  {
    id: "starfield",
    label: "Звёзды",
    background: "radial-gradient(90% 130% at 25% 0%, #1b1636 0%, #0a0a14 60%, #05050a 100%)",
    overlay:
      "radial-gradient(1.2px 1.2px at 20% 30%, rgba(255,255,255,0.85), transparent 100%), radial-gradient(1px 1px at 65% 55%, rgba(255,255,255,0.6), transparent 100%), radial-gradient(1.4px 1.4px at 82% 22%, rgba(190,200,255,0.8), transparent 100%), radial-gradient(1px 1px at 42% 78%, rgba(255,255,255,0.5), transparent 100%)",
    ink: "rgba(4,4,10,0.55)",
  },
  {
    id: "waves",
    label: "Волны",
    background:
      "repeating-linear-gradient(115deg, rgba(56,214,255,0.10) 0px, rgba(56,214,255,0.10) 2px, transparent 2px, transparent 22px), linear-gradient(140deg, #06202e 0%, #07131f 55%, #040a11 100%)",
    ink: "rgba(2,10,16,0.55)",
  },
  {
    id: "ember",
    label: "Угли",
    background:
      "radial-gradient(110% 150% at 15% 120%, rgba(255,122,61,0.45) 0%, transparent 60%), radial-gradient(100% 130% at 85% 110%, rgba(255,61,110,0.32) 0%, transparent 55%), #15080a",
    ink: "rgba(12,4,6,0.55)",
  },
  {
    id: "matrix",
    label: "Матрица",
    background: "linear-gradient(160deg, #07130a 0%, #040b06 60%, #020503 100%)",
    overlay:
      "repeating-linear-gradient(180deg, rgba(163,255,18,0.16) 0px, rgba(163,255,18,0.16) 1px, transparent 1px, transparent 7px), repeating-linear-gradient(90deg, rgba(163,255,18,0.07) 0px, rgba(163,255,18,0.07) 1px, transparent 1px, transparent 11px)",
    ink: "rgba(2,8,3,0.6)",
  },
  {
    id: "bloom",
    label: "Цветение",
    background:
      "radial-gradient(100% 140% at 20% 0%, rgba(255,158,205,0.35) 0%, transparent 60%), radial-gradient(110% 140% at 90% 30%, rgba(199,155,255,0.35) 0%, transparent 60%), #120914",
    ink: "rgba(10,4,12,0.5)",
  },
  {
    id: "chrome",
    label: "Хром",
    background:
      "linear-gradient(115deg, #1b1d24 0%, #2a2d38 18%, #12141a 38%, #3a3e4c 58%, #15171d 78%, #262932 100%)",
    ink: "rgba(8,9,12,0.5)",
  },
];

export const PROFILE_BANNER_BY_ID = Object.fromEntries(
  PROFILE_BANNERS.map((b) => [b.id, b]),
) as Record<ProfileBannerId, ProfileBanner>;

/* ---------------------------------------------------------------- helpers */

export function nameGradient(id: string | null | undefined): NameGradient | null {
  if (!id) return null;
  return (NAME_GRADIENT_BY_ID as Record<string, NameGradient | undefined>)[id] ?? null;
}

export function badgeGlow(id: string | null | undefined): BadgeGlow | null {
  if (!id) return null;
  return (BADGE_GLOW_BY_ID as Record<string, BadgeGlow | undefined>)[id] ?? null;
}

export function profileBanner(id: string | null | undefined): ProfileBanner | null {
  if (!id) return null;
  return (PROFILE_BANNER_BY_ID as Record<string, ProfileBanner | undefined>)[id] ?? null;
}