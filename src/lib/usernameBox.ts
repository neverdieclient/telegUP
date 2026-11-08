/**
 * Random-username lootbox.
 *
 * The box costs 500★ and hands out a generated Telegram-style username of a
 * random length. Shorter usernames are rarer — and each length has its own
 * chance of rolling something valuable:
 *
 *   4 letters →  3%  drops a big-name username, always rare tier or better
 *   5 letters → 50%
 *   6 letters → 75%
 *   7 letters → 90%
 *
 * The weights below are the real, honest odds (nothing is fudged client-side).
 */

import { randInt } from "./rng";

export const USERNAME_BOX_PRICE = 500;

export type UsernameTier = "Обычный" | "Редкий" | "Коллекционный" | "Легендарный";

export type UsernameRoll = {
  username: string;
  length: number;
  tier: UsernameTier;
  /** the chance that produced this length tier, for the reveal card */
  pity: number;
};

/** Probability of rolling a "good" username for each length. */
export const LENGTH_ODDS: { length: number; chance: number; weight: number }[] = [
  { length: 4, chance: 0.03, weight: 0.08 },
  { length: 5, chance: 0.5, weight: 0.22 },
  { length: 6, chance: 0.75, weight: 0.32 },
  { length: 7, chance: 0.9, weight: 0.38 },
];

const CONSONANTS = "bcdfghjklmnprstvwz";
const VOWELS = "aeiouy";
const ENDINGS = ["", "x", "z", "on", "ex", "io", "us", "er", "ah", "y"];

/** Words that make a 4-letter username instantly desirable. */
const SHORT_GOLD = [
  "wolf", "nova", "kira", "luna", "moon", "star", "gold", "dark", "fire", "tonx",
  "smurf", "bear", "mint", "onyx", "echo", "raze", "vibe", "flux", "king", "aero",
];

const COOL_PREFIX = ["neo", "max", "pro", "ultra", "hyper", "cyber", "pixel", "astro", "lunar", "shadow"];

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)];
}

/** Pronounceable syllable, e.g. "ka", "zor". */
function syllable(): string {
  return pick(CONSONANTS.split("")) + pick(VOWELS.split(""));
}

function buildup(length: number): string {
  let s = "";
  while (s.length < length) s += syllable();
  return s.slice(0, length);
}

/**
 * Roll one username. `pity` is the length's own chance of a "good" result:
 * when the 3%/50%/75%/90% roll succeeds we produce a curated or prefixed name;
 * otherwise it's a plain pronounceable handle.
 */
export function rollUsername(): UsernameRoll {
  const total = LENGTH_ODDS.reduce((a, l) => a + l.weight, 0);
  let r = Math.random() * total;
  let bucket = LENGTH_ODDS[LENGTH_ODDS.length - 1];
  for (const l of LENGTH_ODDS) {
    if (r < l.weight) {
      bucket = l;
      break;
    }
    r -= l.weight;
  }

  const good = Math.random() < bucket.chance;
  let username: string;
  let tier: UsernameTier;

  if (good) {
    if (bucket.length <= 4) {
      username = pick(SHORT_GOLD);
      tier = "Легендарный";
    } else if (bucket.length === 5) {
      username = pick(SHORT_GOLD).slice(0, 5).padEnd(5, "x");
      tier = randInt(100) < 25 ? "Коллекционный" : "Редкий";
    } else {
      username = pick(COOL_PREFIX).slice(0, bucket.length - 2) + pick(ENDINGS);
      username = username.slice(0, bucket.length).padEnd(bucket.length, "x");
      tier = randInt(100) < 55 ? "Редкий" : "Коллекционный";
    }
  } else {
    username = buildup(bucket.length) + (bucket.length >= 6 ? pick(ENDINGS) : "");
    username = username.slice(0, bucket.length);
    tier = "Обычный";
  }

  return { username, length: bucket.length, tier, pity: bucket.chance };
}

export const TIER_COLOR: Record<UsernameTier, string> = {
  Обычный: "#9aa0aa",
  Редкий: "#3b9dff",
  Коллекционный: "#b45cff",
  Легендарный: "#ffb300",
};