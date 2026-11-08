import raw from "./telegram-gifts.json";

/* ================================================================= types */

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export type RawVariant = {
  name: string;
  /** % share inside its own collection */
  rarityPct: number;
  supply: number;
  priceTon: number;
  gradient: string | null;
  image?: string | null;
};

export type RawCollection = {
  slug: string;
  name: string;
  ton: number;
  listingTotal: number;
  supply: number;
  image: string;
  folder: string;
  released: string;
  upgradeDate: string;
  initialStars: number;
  upgradeStars: number;
  upgradeNote: string;
  issued: number;
  left: number;
  upgraded: number;
  minPrice: number;
  description: string;
  models: RawVariant[];
  backgrounds: RawVariant[];
  symbols: RawVariant[];
};

/** One collectible. Collected gifts have no model; the plain gift itself is the "model". */
export type Gift = {
  id: string;
  /** gift collection name (Telegram gift name) */
  name: string;
  slug: string;
  /** model / symbol name */
  variant: string;
  kind: "gift" | "model" | "symbol";
  image: string | null;
  gradient: string | null;
  /** main accent color of the card */
  tint: string;
  rarity: Rarity;
  /** real rarity share, % (e.g. 12.4) */
  rarityPct: number;
  /** real market price in TON (0 when unavailable) */
  ton: number;
  /** local stars value = sell price */
  stars: number;
  /** real market price converted to Stars, for display */
  realStars: number;
  /** real supply / issued count */
  supply: number;
  weight: number;
  desc: string;
};

export type CaseCategory =
  | "bronze"
  | "silver"
  | "gold"
  | "legendary"
  | "collection"
  | "event"
  | "premium";

export type Case = {
  id: string;
  name: string;
  tag: string;
  price: number;
  accent: string;
  glow: string;
  odds: Record<Rarity, number>;
  desc: string;
  category: CaseCategory;
  /** real gift images shown inside the box */
  covers: string[];
  /** ids of the gifts this case can drop */
  pool: string[];
};

/* =============================================================== helpers */

const COLLECTIONS = raw as unknown as RawCollection[];

export const COLLECTIONS_BY_SLUG = Object.fromEntries(
  COLLECTIONS.map((c) => [c.slug, c]),
) as Record<string, RawCollection>;

/** Convert a scraped rarity share into one of five tiers - computed live from supply. */
export function rarityFromShare(share: number, _total = 100): Rarity {
  // share = this variant's % inside its own collection (sums to 100 across a table)
  if (share <= 0.6) return "mythic";
  if (share <= 2.5) return "legendary";
  if (share <= 8) return "epic";
  if (share <= 22) return "rare";
  return "common";
}

/** Background gradients come as `radial-gradient(circle, rgb(137, 146, 136) 30%, ...)`. */
function gradientTint(gradient: string | null): string {
  if (!gradient) return "#8b8b94";
  const rgb = gradient.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!rgb) return "#8b8b94";
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(+rgb[1])}${hex(+rgb[2])}${hex(+rgb[3])}`;
}

/** Strip the trailing `;` some scraped gradients carry (React rejects it). */
export function cleanGradient(gradient: string | null): string | null {
  if (!gradient) return null;
  return gradient.replace(/;\s*$/, "");
}

/**
 * Files in `public/` are served next to the app, not at the domain root:
 * on GitHub Pages the site lives under `/telegUP/`, so `/gifts/…` would 404.
 * Vite injects the configured base here at build time.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");
const asset = (p: string | null | undefined) =>
  p ? `${BASE}/${p.replace(/^\/+/, "")}` : null;

/**
 * Real TON → Stars rate used for display only.
 * Telegram gifts on Fragment are priced in TON; ~1 TON trades near $5 and
 * Stars near $0.013–0.02, so 1 TON ≈ 300★. Kept in one place so the UI can
 * show a realistic "real price" while the in-game economy stays separate.
 */
export const STARS_PER_TON = 300;

export function realStarsFor(ton: number): number {
  return ton > 0 ? Math.round(ton * STARS_PER_TON) : 0;
}

/** Stars value of a gift: share of the collection price scaled by real market data. */
function starsFor(ton: number, collectionTon: number, collectionStars: number, isModel: boolean): number {
  // A gift is worth roughly `collectionStars` (its star price in Telegram).
  // Models are rarer and more expensive: scale by their TON ratio.
  const base = collectionStars > 0 ? collectionStars : Math.max(50, Math.round(collectionTon * 10));
  if (!isModel) return Math.max(10, Math.round(base));
  if (ton > 0 && collectionTon > 0) {
    return Math.max(20, Math.round(base * Math.max(1, ton / Math.max(0.01, collectionTon))));
  }
  return Math.max(20, Math.round(base * 0.6));
}

/* ------------------------------------------------------------------ build */

function markRarity(pct: number): Rarity {
  return rarityFromShare(pct);
}

const RARITY_TINT: Record<Rarity, string> = {
  common: "#9aa3ad",
  rare: "#3b9dff",
  epic: "#b45cff",
  legendary: "#ffcc33",
  mythic: "#ff3d6e",
};

const GIFTS_ACC: Gift[] = [];

for (const c of COLLECTIONS) {
  const collTon = c.ton > 0 ? c.ton : c.minPrice;
  const collStars = c.initialStars > 0 ? c.initialStars : 0;

  // the gift itself (a collected, un-opened item)
  const giftGradient = null;
  const giftTint = gradientTint(giftGradient);
  GIFTS_ACC.push({
    id: `gift-${c.slug}`,
    name: c.name,
    slug: c.slug,
    variant: "Gift",
    kind: "gift",
    image: asset(c.image),
    gradient: null,
    tint: giftTint,
    rarity: markRarity(100),
    rarityPct: 100,
    ton: collTon,
    stars: starsFor(collTon, collTon, collStars, false),
    realStars: realStarsFor(collTon),
    supply: c.supply > 0 ? c.supply : c.issued,
    weight: 1,
    desc: c.description || `${c.name} — коллекционный подарок Telegram.`,
  });

  // Fallback artwork: when a variant image failed to download, show the
  // collection's real base gift image instead of a bare monogram.
  const baseImage = asset(c.image);

  // models
  for (const m of c.models ?? []) {
    const pct = m.rarityPct > 0 ? m.rarityPct : 100 / Math.max(1, c.models.length);
    GIFTS_ACC.push({
      id: `model-${c.slug}-${slugify(m.name)}`,
      name: c.name,
      slug: c.slug,
      variant: m.name,
      kind: "model",
      image: asset(m.image) ?? baseImage,
      gradient: cleanGradient(m.gradient),
      tint: RARITY_TINT[markRarity(pct)],
      rarity: markRarity(pct),
      rarityPct: pct,
      ton: m.priceTon > 0 ? m.priceTon : collTon,
      stars: starsFor(m.priceTon, collTon, collStars, true),
      realStars: realStarsFor(m.priceTon > 0 ? m.priceTon : collTon),
      supply: m.supply > 0 ? m.supply : 0,
      weight: Math.max(0.0001, pct),
      desc: `Модель «${m.name}» подарка ${c.name}. Редкость ${pct}% от всего тиража.`,
    });
  }

  // backgrounds and symbols: intentionally not part of the game catalogue
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupe(list: Gift[]): Gift[] {
  const seen = new Set<string>();
  const out: Gift[] = [];
  for (const g of list) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}

export const GIFTS: Gift[] = dedupe(GIFTS_ACC);

export const GIFT_BY_ID = Object.fromEntries(GIFTS.map((g) => [g.id, g])) as Record<string, Gift>;

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];

export const RARITY_META: Record<
  Rarity,
  {
    label: string;
    text: string;
    ring: string;
    chip: string;
    gradient: string;
    glow: string;
    hex: string;
  }
> = {
  common: {
    label: "Обычный",
    text: "text-common",
    ring: "border-common/30",
    gradient: "bg-gradient-to-br from-common/10 via-transparent to-transparent",
    chip: "border-common/40 bg-common/10 text-common",
    glow: "shadow-[0_0_30px_-8px_rgba(154,163,173,0.55)]",
    hex: "#9aa3ad",
  },
  rare: {
    label: "Редкий",
    text: "text-rare",
    ring: "border-rare/35",
    gradient: "bg-gradient-to-br from-rare/10 via-transparent to-transparent",
    chip: "border-rare/40 bg-rare/10 text-rare",
    glow: "shadow-[0_0_34px_-8px_rgba(59,157,255,0.6)]",
    hex: "#3b9dff",
  },
  epic: {
    label: "Эпический",
    text: "text-epic",
    ring: "border-epic/40",
    gradient: "bg-gradient-to-br from-epic/12 via-transparent to-transparent",
    chip: "border-epic/40 bg-epic/10 text-epic",
    glow: "shadow-[0_0_38px_-8px_rgba(180,92,255,0.65)]",
    hex: "#b45cff",
  },
  legendary: {
    label: "Легендарный",
    text: "text-legendary",
    ring: "border-legendary/40",
    gradient: "bg-gradient-to-br from-legendary/12 via-transparent to-transparent",
    chip: "border-legendary/40 bg-legendary/10 text-legendary",
    glow: "shadow-[0_0_42px_-6px_rgba(255,204,51,0.7)]",
    hex: "#ffcc33",
  },
  mythic: {
    label: "Мифический",
    text: "text-mythic",
    ring: "border-mythic/45",
    gradient: "bg-gradient-to-br from-mythic/14 via-transparent to-transparent",
    chip: "border-mythic/45 bg-mythic/12 text-mythic",
    glow: "shadow-[0_0_46px_-6px_rgba(255,61,110,0.75)]",
    hex: "#ff3d6e",
  },
};

/* ================================================================= cases */

const CASE_TIERS: {
  category: CaseCategory;
  name: string;
  tag: string;
  desc: string;
  accent: string;
  glow: string;
  odds: Record<Rarity, number>;
  priceMul: number;
}[] = [
  {
    category: "bronze",
    name: "Бронзовый",
    tag: "Старт",
    desc: "Первый кейс. Обычные и редкие подарки.",
    accent: "#c98a4b",
    glow: "rgba(201,138,75,0.45)",
    odds: { common: 0.6, rare: 0.28, epic: 0.09, legendary: 0.026, mythic: 0.004 },
    priceMul: 1,
  },
  {
    category: "silver",
    name: "Серебряный",
    tag: "Популярный",
    desc: "Больше редких и эпических моделей.",
    accent: "#b9c4d0",
    glow: "rgba(185,196,208,0.45)",
    odds: { common: 0.42, rare: 0.34, epic: 0.18, legendary: 0.052, mythic: 0.008 },
    priceMul: 4,
  },
  {
    category: "gold",
    name: "Золотой",
    tag: "Выгодный",
    desc: "Легендарные модели попадаются в разы чаще.",
    accent: "#ffcc33",
    glow: "rgba(255,204,51,0.5)",
    odds: { common: 0.24, rare: 0.34, epic: 0.28, legendary: 0.12, mythic: 0.02 },
    priceMul: 12,
  },
  {
    category: "legendary",
    name: "Легендарный",
    tag: "Дорого",
    desc: "Только топ: эпики, легендарки и мифики.",
    accent: "#ff3d6e",
    glow: "rgba(255,61,110,0.55)",
    odds: { common: 0, rare: 0.12, epic: 0.42, legendary: 0.36, mythic: 0.1 },
    priceMul: 60,
  },
];

function pickCovers(kinds: Gift["kind"][], n: number): string[] {
  const pool = GIFTS.filter((g) => kinds.includes(g.kind) && g.image);
  const out: string[] = [];
  for (let i = 0; i < pool.length && out.length < n; i += Math.max(1, Math.floor(pool.length / n))) {
    out.push(pool[i].image!);
  }
  return out;
}

function buildCases(): Case[] {
  const cases: Case[] = [];

  /** Mean stars value of a gift pool (0 for an empty pool). */
  const poolValue = (pool: Gift[]): number =>
    pool.length ? pool.reduce((a, g) => a + g.stars, 0) / pool.length : 0;

  /**
   * A case costs ~62% of the expected value of its roll, so expensive pools
   * (Plush Pepe, Durov's Cap, premium models) produce expensive cases while a
   * bronze case stuffed with cheap gifts stays cheap. The value of the roll is
   * weighted by the case odds, so a premium case is priced by what it really
   * pays out rather than by its most common tier.
   */
  const fairPrice = (pool: Gift[], odds: Record<Rarity, number>, floor: number): number => {
    let expected = 0;
    for (const r of RARITY_ORDER) {
      const w = odds[r] ?? 0;
      if (w <= 0) continue;
      const tier = pool.filter((g) => g.rarity === r);
      if (!tier.length) continue;
      expected += poolValue(tier) * w;
    }
    if (expected <= 0) expected = poolValue(pool);
    return Math.max(floor, Math.round(expected * 0.62));
  };

  // 1. Generic rarity cases: their pool is drawn from all gifts of their tiers
  for (const t of CASE_TIERS) {
    const pool: Gift[] = [];
    for (const r of RARITY_ORDER) {
      if ((t.odds[r] ?? 0) > 0) pool.push(...GIFTS.filter((g) => g.rarity === r));
    }
    const base = fairPrice(pool, t.odds, 150 * t.priceMul);
    cases.push({
      id: t.category,
      name: t.name,
      tag: t.tag,
      price: Math.max(150 * t.priceMul, base),
      accent: t.accent,
      glow: t.glow,
      odds: t.odds,
      desc: t.desc,
      category: t.category,
      covers: pickCovers(["model"], 3),
      pool: [],
    });
  }

  // 2. One case per real Telegram collection
  for (const c of COLLECTIONS) {
    const pool = GIFTS.filter((g) => g.slug === c.slug && (g.kind === "gift" || g.kind === "model"));
    if (!pool.length) continue;
    const rare = [...c.models].sort((a, b) => a.rarityPct - b.rarityPct)[0];
    const odds = { common: 0.45, rare: 0.3, epic: 0.18, legendary: 0.055, mythic: 0.015 };
    const collectionStars = c.initialStars > 0 ? c.initialStars : c.ton * 40;
    cases.push({
      id: `coll-${c.slug}`,
      name: c.name,
      tag: "Коллекция",
      price: fairPrice(pool, odds, Math.max(200, Math.round(collectionStars * 0.55))),
      accent: "#b45cff",
      glow: "rgba(180,92,255,0.5)",
      odds,
      desc: `Все модели ${c.name} в одном кейсе.${rare ? ` Самая редкая — «${rare.name}».` : ""}`,
      category: "collection",
      covers: pool.filter((g) => g.image).slice(0, 3).map((g) => g.image!),
      pool: pool.map((g) => g.id),
    });
  }

  // 3. Themed "event" cases assembled from real collections of a similar vibe
  const EVENT_SETS: {
    key: string;
    name: string;
    desc: string;
    accent: string;
    match: (s: string) => boolean;
  }[] = [
    {
      key: "hangout",
      name: "Хайп-кейс",
      desc: "Самые дорогие подарки маркета.",
      accent: "#a3ff12",
      match: () => true,
    },
    {
      key: "cute",
      name: "Милый кейс",
      desc: "Пушистые, сладкие и сердечные.",
      accent: "#ff8fd0",
      match: (s) => /bear|heart|cake|candy|cookie|bunny|kiss|love|cupid/i.test(s),
    },
    {
      key: "animal",
      name: "Зверинец",
      desc: "Все животные Telegram.",
      accent: "#c98a4b",
      match: (s) => /bear|dog|cat|pepe|fox|hedgehog|bunny|shark|monkey|panda|lion|frog|duck|pigeon|dove/i.test(s),
    },
    {
      key: "cup",
      name: "Кубки и призы",
      desc: "Трофеи и награды.",
      accent: "#ffcc33",
      match: (s) => /cup|trophy|medal|award|brick|coin|shard/i.test(s),
    },
    {
      key: "magic",
      name: "Магия",
      desc: "Мистика, магия и проклятия.",
      accent: "#b45cff",
      match: (s) => /magic|spell|potion|crystal|witch|wizard|ghost|skull|mask|eye|sun|moon|planet|star|shard/i.test(s),
    },
    {
      key: "durov",
      name: "Дуров-кейс",
      desc: "Официальные подарки из Telegram.",
      accent: "#3b9dff",
      match: (s) => /durov|telegram|cap|coat|boots|glasses/i.test(s),
    },
    {
      key: "holiday",
      name: "Праздники",
      desc: "Всё, что вручают в праздники.",
      accent: "#ff3d6e",
      match: (s) => /christmas|new-?year|easter|halloween|valentine|birthday|b-day|lunar|holiday|candle/i.test(s),
    },
  ];

  for (const set of EVENT_SETS) {
    const matched = COLLECTIONS.filter((c) => set.match(`${c.name} ${c.slug}`));
    if (matched.length < 2) continue;
    const pool = GIFTS.filter((g) => matched.some((c) => c.slug === g.slug));
    const odds = { common: 0.32, rare: 0.34, epic: 0.23, legendary: 0.095, mythic: 0.015 };
    cases.push({
      id: `event-${set.key}`,
      name: set.name,
      tag: `${matched.length} подарков`,
      price: fairPrice(pool, odds, 400),
      accent: set.accent,
      glow: "rgba(163,255,18,0.4)",
      odds: odds,
      desc: set.desc,
      category: "event",
      covers: pool.filter((g) => g.image).slice(0, 3).map((g) => g.image!),
      pool: pool.map((g) => g.id),
    });
  }

  // 4. Premium / high-roller cases from the most expensive collections
  const top = [...COLLECTIONS].sort((a, b) => b.ton - a.ton).slice(0, 12);
  if (top.length >= 4) {
    cases.push({
      id: "premium-top",
      name: "Топ-маркет",
      tag: "High roller",
      price: 120_000,
      accent: "#ff3d6e",
      glow: "rgba(255,61,110,0.55)",
      odds: { common: 0, rare: 0.08, epic: 0.34, legendary: 0.44, mythic: 0.14 },
      desc: "Только самые дорогие подарки Fragment-маркета.",
      category: "premium",
      covers: top.slice(0, 3).map((c) => asset(c.image)!).filter(Boolean),
      pool: GIFTS.filter((g) => top.some((c) => c.slug === g.slug)).map((g) => g.id),
    });
  }

  // 5. Symbols are intentionally out of the game (no symbol case, no drops).

  return cases;
}

export const CASES: Case[] = buildCases();

/** The free 24h case. */
export const FREE_CASE_CASE_ID = "bronze";
export const FREE_CASE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const CASE_BY_ID = Object.fromEntries(CASES.map((c) => [c.id, c])) as Record<string, Case>;

/** Which gifts a case can actually drop (falls back to rarity buckets for tier cases). */
export function casePool(c: Case): Gift[] {
  if (c.pool.length) {
    return c.pool.map((id) => GIFT_BY_ID[id]).filter(Boolean);
  }
  const out: Gift[] = [];
  for (const r of RARITY_ORDER) {
    if ((c.odds[r] ?? 0) > 0) out.push(...GIFTS.filter((g) => g.rarity === r));
  }
  return out;
}

/* ================================================================== shop */

export type ShopUsername = { username: string; price: number; tier: string };

export const SHOP_USERNAMES: ShopUsername[] = [
  { username: "telegup", price: 400_000, tier: "Легендарный" },
  { username: "giftking", price: 260_000, tier: "Коллекционный" },
  { username: "clicker", price: 180_000, tier: "Коллекционный" },
  { username: "admin", price: 250_000, tier: "Коллекционный" },
  { username: "god", price: 180_000, tier: "Коллекционный" },
  { username: "pepe", price: 120_000, tier: "Редкий" },
  { username: "whale", price: 95_000, tier: "Редкий" },
  { username: "durov", price: 90_000, tier: "Редкий" },
  { username: "neon", price: 60_000, tier: "Обычный" },
  { username: "star", price: 45_000, tier: "Обычный" },
  { username: "ton", price: 40_000, tier: "Обычный" },
  { username: "case", price: 30_000, tier: "Обычный" },
];

export type ShopItem = {
  id: string;
  name: string;
  desc: string;
  price: number;
  kind: "username" | "premium" | "number" | "other";
  accent: string;
};

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "second-username",
    name: "Второй юзернейм",
    desc: "Отдельный коллекционный ник — показывается под основным, как в Telegram.",
    price: 150_000,
    kind: "username",
    accent: "#b45cff",
  },
  {
    id: "premium",
    name: "Telegram Premium",
    desc: "Звезда у аватара, бейдж Premium и скидка 20% на кейсы.",
    price: 75_000,
    kind: "premium",
    accent: "#ffcc33",
  },
  {
    id: "anon-number",
    name: "Анонимный номер +888",
    desc: "Случайный номер из диапазона +888, скрывает обычный номер.",
    price: 120_000,
    kind: "number",
    accent: "#3b9dff",
  },
  {
    id: "badge-verified",
    name: "Галочка профиля",
    desc: "Синий чек рядом с ником в профиле и в топе.",
    price: 25_000,
    kind: "other",
    accent: "#3b9dff",
  },
  {
    id: "nick-style",
    name: "Стильный ник",
    desc: "Градиентный ник и подсветка в профиле.",
    price: 18_000,
    kind: "other",
    accent: "#ff8fd0",
  },
];

export type PurchasedShopItem = string;

/* ================================================================ badges */

export type BadgeId = "owner" | "dev" | "tester" | "staff" | "vip" | "og" | "whale" | "founder" | "verified";

export const BADGES: { id: BadgeId; label: string; desc: string; color: string }[] = [
  { id: "owner", label: "овнер", desc: "владелец проекта", color: "#ff3d6e" },
  { id: "founder", label: "основатель", desc: "со дня запуска", color: "#ff8f3d" },
  { id: "dev", label: "разработчик", desc: "писал код", color: "#3b9dff" },
  { id: "tester", label: "тестер", desc: "ловил баги", color: "#a3ff12" },
  { id: "staff", label: "стафф", desc: "команда телегUP", color: "#b45cff" },
  { id: "vip", label: "вип", desc: "особый гость", color: "#ffcc33" },
  { id: "og", label: "ог", desc: "самые ранние", color: "#ff9d3d" },
  { id: "whale", label: "кит", desc: "крупный инвентарь", color: "#3bffd0" },
  { id: "verified", label: "прогер", desc: "проверенный аккаунт", color: "#1d9bf0" },
];

export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b])) as Record<
  BadgeId,
  (typeof BADGES)[number]
>;

/* ============================================================ disclaimer */

export const DISCLAIMER =
  "Это игра. Все подарки вымышлены, реальный вывод средств невозможен.";