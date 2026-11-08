import type { Case, Gift, Rarity } from "../data/gifts";
import { GIFTS, RARITY_ORDER, casePool } from "../data/gifts";

/**
 * Cryptographically-seeded uniform float in [0, 1).
 * Falls back to Math.random on old browsers.
 */
export function rand(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    // 2^32 divisor keeps the result in [0, 1)
    return buf[0] / 4294967296;
  }
  return Math.random();
}

export function randInt(maxExclusive: number): number {
  return Math.floor(rand() * maxExclusive);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)];
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Weighted random pick. Returns undefined only for an empty list.
 * Weights do not need to sum to 1 — they are normalized internally.
 */
export function weightedPick<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((acc, item) => acc + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0];

  let roll = rand() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/** Roll a rarity from case odds. */
export function rollRarity(odds: Record<Rarity, number>): Rarity {
  const total = RARITY_ORDER.reduce((acc, r) => acc + odds[r], 0);
  let roll = rand() * total;
  for (const rarity of RARITY_ORDER) {
    roll -= odds[rarity];
    if (roll < 0) return rarity;
  }
  return "common";
}

/** Roll a full gift out of a case: rarity first, then weight inside the rarity. */
export function rollCase(c: Case, luckBoost = 0): Gift {
  const pool = casePool(c);
  let rarity = rollRarity(c.odds);

  // optional admin "luck" nudge: re-roll low tiers upward
  if (luckBoost > 0 && rand() < luckBoost && (rarity === "common" || rarity === "rare")) {
    rarity = rarity === "common" ? "epic" : "legendary";
  }

  // walk up / down until a non-empty tier is found
  const order = RARITY_ORDER;
  let idx = order.indexOf(rarity);
  let tier = pool.filter((g) => g.rarity === rarity);
  for (let step = 1; tier.length === 0 && step < order.length * 2; step++) {
    idx += step % 2 === 1 ? 1 : -1;
    if (idx < 0) idx = 0;
    if (idx >= order.length) idx = order.length - 1;
    tier = pool.filter((g) => g.rarity === order[idx]);
  }

  if (tier.length === 0) return weightedPick(pool.length ? pool : GIFTS);
  return weightedPick(tier.map((g) => ({ ...g, weight: Math.max(0.01, g.weight) })));
}

export type RolledItem = { gift: Gift; id: string };

/**
 * Star drops inside cases. Each case roll has a small chance of paying out
 * pure ★ instead of a gift — the honest weights below sum to 0.10, so one in
 * ten rolls is a star prize. Reward tiers are fixed and capped at 1,000 ★.
 */
export const STAR_DROP_CHANCE = 0.1;

export type StarDrop = { stars: number; weight: number };

export const STAR_DROPS: readonly StarDrop[] = [
  { stars: 5, weight: 0.46 },
  { stars: 10, weight: 0.22 },
  { stars: 25, weight: 0.12 },
  { stars: 50, weight: 0.09 },
  { stars: 100, weight: 0.05 },
  { stars: 250, weight: 0.03 },
  { stars: 500, weight: 0.02 },
  { stars: 1000, weight: 0.01 },
] as const;

/** Roll a star prize, or 0 for "no star drop this time". */
export function rollStarDrop(weights: readonly StarDrop[] = STAR_DROPS): number {
  if (rand() >= STAR_DROP_CHANCE) return 0;
  const picked = weightedPick(weights.map((d) => ({ ...d })));
  return Math.min(1000, picked.stars);
}

/**
 * Luck-boosted star drop for the admin "luck" toggle: same ladder, but the
 * chance doubles (still capped at 1000 ★ and never beyond 1.0).
 */
export function rollLuck(boost: number): number {
  if (boost > 0 && rand() < STAR_DROP_CHANCE + boost * 0.1) {
    const picked = weightedPick(STAR_DROPS.map((d) => ({ ...d })));
    return Math.min(1000, picked.stars);
  }
  return 0;
}

/** Build the visual strip for a case roulette. The winner is placed at `winnerIndex`. */
export function buildCaseStrip(c: Case, winner: Gift, winnerIndex: number, length = 60): RolledItem[] {
  const strip: RolledItem[] = [];
  for (let i = 0; i < length; i++) {
    const gift = i === winnerIndex ? winner : rollCase(c);
    strip.push({ gift, id: `${i}-${gift.id}-${Math.round(rand() * 1e6)}` });
  }
  return strip;
}

export function chance(p: number): boolean {
  return rand() * 100 < p;
}

/* ==================================================== model upgrade (skin) */

/** Same collectible, nicer model: all variants of one gift. */
export function modelOptions(gift: Gift): Gift[] {
  return GIFTS.filter((g) => g.slug === gift.slug && g.kind === "model");
}

export const MODEL_HOUSE_EDGE = 0.9;

/**
 * Chance to morph `from` into `to`. Both items belong to the same gift,
 * so the only thing that changes is the model value ratio.
 * The multiplier equals the value ratio, so the fair roll chance is 1/mult.
 */
export function modelUpgradeChance(from: Gift, to: Gift): number {
  if (!(to.stars > from.stars)) return 0;
  const mult = to.stars / Math.max(1, from.stars);
  return Math.min(95, Math.max(0.4, (100 / mult) * MODEL_HOUSE_EDGE));
}

/** Target models reachable from `from`, grouped from cheap to expensive. */
export function modelTargets(from: Gift): Gift[] {
  return modelOptions(from)
    .filter((g) => g.stars > from.stars && g.id !== from.id)
    .sort((a, b) => a.stars - b.stars);
}

/**
 * Roll a nicer model upward from `from`, capped at `maxStars`.
 * Weight is biased so small steps are likelier than wild jumps, matching
 * the displayed chance ladder instead of sneaking in a house edge.
 */
export function rollModelUpgrade(from: Gift, maxStars = Infinity): Gift | null {
  const pool = modelOptions(from).filter((g) => g.stars > from.stars && g.stars <= maxStars);
  if (!pool.length) return null;
  const weighted = pool.map((g) => {
    const ratio = g.stars / Math.max(1, from.stars);
    return { ...g, weight: 1 / Math.pow(ratio, 1.6) };
  });
  return weightedPick(weighted);
}

/** One of the model bundles shown in the upgrade picker. */
export const MODEL_BANDS = [
  { id: "near", label: "чуть лучше", mult: 1.5 },
  { id: "nice", label: "красивее", mult: 3 },
  { id: "shiny", label: "редкая", mult: 8 },
  { id: "grail", label: "топ-модель", mult: 25 },
] as const;

export type ModelBand = (typeof MODEL_BANDS)[number]["id"];

/** Human-friendly crypto-ish id */
export function uid(prefix = "g"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(rand() * 1e9).toString(36)}`;
}

/** Multiplier crash point for the Crash mini-game. */
export function crashPoint(houseEdge = 0.04): number {
  const u = rand();
  if (u < houseEdge) return 1.0;
  const value = (1 - houseEdge) / (1 - u);
  return Math.max(1, Math.min(500, Math.floor(value * 100) / 100));
}