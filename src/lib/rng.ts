import type { Case, Gift, Rarity } from "../data/gifts";
import { GIFTS, RARITY_ORDER, casePool } from "../data/gifts";
import { UPGRADE_STARS } from "./pricing";

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

/** Roll a full gift out of a case: rarity first, then weight inside the rarity.
 *  `capStars` drops any candidate above that value before the pick, so the
 *  free daily case can never pay out a gift worth more than its ceiling. */
export function rollCase(c: Case, luckBoost = 0, capStars = Infinity): Gift {
  const full = casePool(c);
  const capped = capStars === Infinity ? full : full.filter((g) => g.stars <= capStars);
  const pool = capped.length ? capped : full;
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
 * Star drops inside cases. Each case roll has a healthy chance of paying out
 * pure ★ instead of a gift — the honest weights below sum to 0.45, so almost
 * one in two rolls pays stars. Tiers are small on purpose (50 / 100 / 200 are
 * the common ones) and capped at 1,000 ★.
 */
export const STAR_DROP_CHANCE = 0.45;

export type StarDrop = { stars: number; weight: number };

export const STAR_DROPS: readonly StarDrop[] = [
  { stars: 50, weight: 0.40 },
  { stars: 100, weight: 0.27 },
  { stars: 200, weight: 0.16 },
  { stars: 300, weight: 0.07 },
  { stars: 500, weight: 0.05 },
  { stars: 1000, weight: 0.03 },
  // the jackpot: about one in a thousand star drops
  { stars: 10_000, weight: 0.002 },
] as const;

/** Hard ceiling for a single case payout — nobody can log in richer than this. */
export const MAX_CASE_PAYOUT = 10_000;

/** Roll a star prize, or 0 for "no star drop this time". */
export function rollStarDrop(weights: readonly StarDrop[] = STAR_DROPS): number {
  if (rand() >= STAR_DROP_CHANCE) return 0;
  const picked = weightedPick(weights.map((d) => ({ ...d })));
  return Math.min(MAX_CASE_PAYOUT, picked.stars);
}

/**
 * Luck-boosted star drop for the admin "luck" toggle: same ladder, but the
 * chance doubles (still capped at 1000 ★ and never beyond 1.0).
 */
export function rollLuck(boost: number): number {
  if (boost > 0 && rand() < STAR_DROP_CHANCE + boost * 0.1) {
    const picked = weightedPick(STAR_DROPS.map((d) => ({ ...d })));
    return Math.min(MAX_CASE_PAYOUT, picked.stars);
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

/**
 * Upgrade odds with the owner's per-player boost applied.
 *
 * `boost` is stored in percent-of-normal (100 = untouched), and the result is
 * clamped to 0–100 because a probability above 1 would make the wheel land
 * outside its winning arc. Model upgrades pass their own cap of 95 so a
 * boosted roll still reads as "very likely", not "guaranteed".
 */
export function boostedChance(p: number, boost: number, cap = 100): number {
  const factor = Math.max(0, boost) / 100;
  return Math.min(cap, Math.max(0, p * factor));
}

/* ==================================================== model upgrade (skin) */

/** Same collectible, nicer models: every model variant of one gift. */
export function modelOptions(gift: Gift, pool: Gift[] = GIFTS): Gift[] {
  return pool.filter((g) => g.slug === gift.slug && g.kind === "model");
}

/** Fair odds — no house edge on model upgrades either. */
export const MODEL_HOUSE_EDGE = 1.0;

/**
 * Chance to morph `from` into `to`. Both items belong to the same gift,
 * so the only thing that changes is the model value ratio.
 * The multiplier equals the value ratio, so the fair roll chance is 1/mult.
 * Equal-value (sideways) swaps fall back to a high-but-not-certain chance.
 */
export function modelUpgradeChance(from: Gift, to: Gift): number {
  if (to.stars >= from.stars) {
    const mult = to.stars / Math.max(1, from.stars);
    return Math.min(95, Math.max(0.4, (100 / mult) * MODEL_HOUSE_EDGE));
  }
  // a sideways/downward target (only allowed as a last resort) is easy
  return 80;
}

/**
 * All the other models of the same collectible, cheapest first.
 *
 * The base gift itself (a «Gift» row, not a model) must never hide its
 * collection: a 3 700★ gift with 45 cheaper models still shows all 45, since
 * owning the gift is exactly the situation where you want to pick a skin.
 * Only model → model moves keep a value floor (equal or pricier) so the
 * upgrade ladder still makes sense; when the source is already the priciest
 * model, its cheaper siblings are offered as a last-resort "rename".
 */
export function modelTargets(from: Gift, pool: Gift[] = GIFTS): Gift[] {
  const options = modelOptions(from, pool).filter((g) => g.id !== from.id);
  if (!options.length) return [];
  const byPrice = [...options].sort((a, b) => a.stars - b.stars);
  // a gift (not a model) opens its whole collection
  if (from.kind !== "model") return byPrice;
  const higher = byPrice.filter((g) => g.stars >= from.stars);
  if (higher.length) return higher;
  // source is the priciest model → offer the closest cheaper ones
  return [...options].sort((a, b) => b.stars - a.stars).slice(0, 6);
}

/**
 * Roll a nicer model upward from `from`, capped at `maxStars`.
 * Weight is biased so small steps are likelier than wild jumps, matching
 * the displayed chance ladder instead of sneaking in a house edge.
 */
export function rollModelUpgrade(from: Gift, maxStars = Infinity, pool: Gift[] = GIFTS): Gift | null {
  const targets = modelTargets(from, pool).filter((g) => g.stars <= maxStars);
  if (!targets.length) return null;
  const weighted = targets.map((g) => {
    const ratio = g.stars / Math.max(1, from.stars);
    return { ...g, weight: 1 / Math.pow(ratio, 1.6) };
  });
  return weightedPick(weighted);
}

/**
 * Честный розыгрыш модели — чистый случай.
 *
 * В пуле вся коллекция, кроме текущей модели: топовая выпадает так же часто,
 * как самая дешёвая, без «только лучше» и без перекоса к мелким шагам.
 * Бросок стоит фиксированные 15★ (см. `UPGRADE_STARS`), поэтому цена не
 * зависит от того, что выпало.
 *
 * Улучшать можно только базовый подарок: модель, которая уже выпала из
 * апгрейда, — финальная вещь, второй раз её не трогаем.
 *
 * Возвращает null, если улучшать нечего или не хватает звёзд.
 */
export function rollGuarantee(
  from: Gift,
  pool: readonly Gift[],
  balance: number,
): { gift: Gift; cost: number } | null {
  if (from.kind !== "gift") return null;
  const models = pool.filter(
    (g) => g.slug === from.slug && g.kind === "model" && g.id !== from.id,
  );
  if (!models.length) return null;
  if (balance < UPGRADE_STARS) return null;
  // у всех моделей коллекции одинаковый шанс
  return { gift: models[randInt(models.length)], cost: UPGRADE_STARS };
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