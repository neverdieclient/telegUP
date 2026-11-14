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
  /**
   * True when the model has its own artwork. Models without a downloaded
   * image fall back to the collection art, so the UI overlays a rarity tint
   * and the model initials to keep them visually distinct.
   */
  hasOwnImage?: boolean;
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
  | "price"
  | "event"
  | "premium"
  | "free";

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
  /** cheapest gift the pool can drop, in stars (used for the price ladder hint) */
  fromStars?: number;
  /** most expensive gift the pool can drop, in stars */
  toStars?: number;
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
  // The gift itself leans on its Telegram star price, with the old TON fallback.
  if (!isModel) {
    const giftBase = collectionStars > 0 ? collectionStars : Math.max(50, Math.round(collectionTon * 10));
    return Math.max(10, Math.round(giftBase));
  }
  // Models: some collections store a tiny placeholder in `collectionStars`
  // (e.g. Candy Cane: 10★ for a 3.98 TON base). Fall back to a TON-derived
  // value so models keep their spread instead of collapsing onto one floor.
  const tonOut = Math.max(50, Math.round(collectionTon * 10));
  const base = collectionStars > 0 ? Math.max(collectionStars, tonOut) : tonOut;
  if (ton > 0 && collectionTon > 0) {
    // a gentler curve (sqrt) keeps the numbers apart when the ton ratio is ~1
    const ratio = Math.max(1, ton / Math.max(0.01, collectionTon));
    const scaled = base * (0.6 + 0.4 * Math.sqrt(ratio));
    const floor = Math.max(20, Math.round(base * ratio * 0.75));
    return Math.max(floor, Math.round(scaled));
  }
  return Math.max(20, Math.round(base * 0.6));
}

/* ------------------------------------------------------------------ build */

function markRarity(pct: number): Rarity {
  return rarityFromShare(pct);
}

/**
 * В игре осталась одна видимая редкость — «обычный».
 *
 * Деления на редкий/эпический/легендарный/мифический больше нет: цветные
 * чипы и жёлтые/фиолетовые подложки выдавали «дорогой» подарок ещё до того,
 * как игрок открыл карточку. Внутри данные о редкости остались (на них
 * держатся веса кейсов), но наружу выходит один нейтральный серый тир.
 */
export const RARITY_TINT: Record<Rarity, string> = {
  common: "#9aa3ad",
  rare: "#9aa3ad",
  epic: "#9aa3ad",
  legendary: "#9aa3ad",
  mythic: "#9aa3ad",
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
      hasOwnImage: Boolean(m.image),
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
  // Один вид на все тиры: чип «ОБЫЧНЫЙ», серая рамка, серая подложка.
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
    label: "Обычный",
    text: "text-common",
    ring: "border-common/30",
    gradient: "bg-gradient-to-br from-common/10 via-transparent to-transparent",
    chip: "border-common/40 bg-common/10 text-common",
    glow: "shadow-[0_0_30px_-8px_rgba(154,163,173,0.55)]",
    hex: "#9aa3ad",
  },
  epic: {
    label: "Обычный",
    text: "text-common",
    ring: "border-common/30",
    gradient: "bg-gradient-to-br from-common/10 via-transparent to-transparent",
    chip: "border-common/40 bg-common/10 text-common",
    glow: "shadow-[0_0_30px_-8px_rgba(154,163,173,0.55)]",
    hex: "#9aa3ad",
  },
  legendary: {
    label: "Обычный",
    text: "text-common",
    ring: "border-common/30",
    gradient: "bg-gradient-to-br from-common/10 via-transparent to-transparent",
    chip: "border-common/40 bg-common/10 text-common",
    glow: "shadow-[0_0_30px_-8px_rgba(154,163,173,0.55)]",
    hex: "#9aa3ad",
  },
  mythic: {
    label: "Обычный",
    text: "text-common",
    ring: "border-common/30",
    gradient: "bg-gradient-to-br from-common/10 via-transparent to-transparent",
    chip: "border-common/40 bg-common/10 text-common",
    glow: "shadow-[0_0_30px_-8px_rgba(154,163,173,0.55)]",
    hex: "#9aa3ad",
  },
};

/* ================================================================= cases */

/**
 * Ten price-tier cases. Every case draws from the whole catalogue and only
 * shifts the odds toward its price band: a cheap case mostly drops cheap
 * gifts, an expensive case mostly drops expensive ones. The bands are defined
 * by the gifts' star value, so "дешёвый" really means "gifts under N stars".
 */
const PRICE_CASES: {
  id: string;
  name: string;
  tag: string;
  desc: string;
  accent: string;
  glow: string;
  /** star range of the gifts this case favours */
  min: number;
  max: number;
  /** how sharply the odds skew toward the band (1 = flat, higher = sharper) */
  bias: number;
  /** fraction of the expected roll value that becomes the case price */
  priceRate: number;
}[] = [
  {
    id: "price-starter",
    name: "Стартовый кейс",
    tag: "от 200 ★",
    desc: "Все подарки маркета, но чаще всего дешёвые.",
    accent: "#9aa3ad",
    glow: "rgba(154,163,173,0.45)",
    min: 0,
    max: 2_000,
    bias: 2.2,
    priceRate: 0.7,
  },
  {
    id: "price-cheap",
    name: "Дешёвый кейс",
    tag: "дешёвые",
    desc: "Подарки до пары тысяч звёзд — вход в игру.",
    accent: "#8bd4a0",
    glow: "rgba(139,212,160,0.45)",
    min: 0,
    max: 1_000,
    bias: 3,
    priceRate: 0.72,
  },
  {
    id: "price-cheap-plus",
    name: "Доступный кейс",
    tag: "дешёвые+",
    desc: "Немного выше дешёвого: изредка падают редкие вещи.",
    accent: "#7fd1c0",
    glow: "rgba(127,209,192,0.45)",
    min: 200,
    max: 3_000,
    bias: 2.6,
    priceRate: 0.7,
  },
  {
    id: "price-mid",
    name: "Средний кейс",
    tag: "средние",
    desc: "Середина рынка: от нескольких сотен до тысяч звёзд.",
    accent: "#3b9dff",
    glow: "rgba(59,157,255,0.5)",
    min: 800,
    max: 8_000,
    bias: 2.2,
    priceRate: 0.68,
  },
  {
    id: "price-mid-plus",
    name: "Средний+ кейс",
    tag: "средние+",
    desc: "Центр рынка с большим шансом на эпики.",
    accent: "#4f7bff",
    glow: "rgba(79,123,255,0.5)",
    min: 1_500,
    max: 15_000,
    bias: 2.2,
    priceRate: 0.68,
  },
  {
    id: "price-mid-high",
    name: "Крепкий кейс",
    tag: "средние++",
    desc: "Средние и дорогие подарки в равных долях.",
    accent: "#7c5cff",
    glow: "rgba(124,92,255,0.5)",
    min: 2_500,
    max: 25_000,
    bias: 2,
    priceRate: 0.66,
  },
  {
    id: "price-rare",
    name: "Редкий кейс",
    tag: "подороже",
    desc: "Уклон в дорогую половину рынка.",
    accent: "#b45cff",
    glow: "rgba(180,92,255,0.5)",
    min: 5_000,
    max: 50_000,
    bias: 1.9,
    priceRate: 0.64,
  },
  {
    id: "price-expensive",
    name: "Дорогой кейс",
    tag: "дорогие",
    desc: "Дорогие подарки — основной улов этого кейса.",
    accent: "#ffcc33",
    glow: "rgba(255,204,51,0.5)",
    min: 12_000,
    max: 120_000,
    bias: 1.8,
    priceRate: 0.62,
  },
  {
    id: "price-elite",
    name: "Элитный кейс",
    tag: "очень дорогие",
    desc: "Только дорогие и легендарные подарки.",
    accent: "#ff8a3d",
    glow: "rgba(255,138,61,0.55)",
    min: 40_000,
    max: 400_000,
    bias: 1.7,
    priceRate: 0.6,
  },
  {
    id: "price-ultimate",
    name: "Ультра кейс",
    tag: "топ",
    desc: "Самый дорогой кейс: топ рынка и мифики.",
    accent: "#ff3d6e",
    glow: "rgba(255,61,110,0.55)",
    min: 100_000,
    max: Infinity,
    bias: 1.6,
    priceRate: 0.58,
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
   * A case costs a fraction of the expected value of its roll, so expensive
   * pools (Plush Pepe, Durov's Cap, premium models) produce expensive cases
   * while a case stuffed with cheap gifts stays cheap. The value of the roll is
   * weighted by the case odds, so a premium case is priced by what it really
   * pays out rather than by its most common tier.
   */
  const fairPrice = (
    pool: Gift[],
    odds: Record<Rarity, number>,
    floor: number,
    rate = 0.62,
  ): number => {
    let expected = 0;
    for (const r of RARITY_ORDER) {
      const w = odds[r] ?? 0;
      if (w <= 0) continue;
      const tier = pool.filter((g) => g.rarity === r);
      if (!tier.length) continue;
      expected += poolValue(tier) * w;
    }
    if (expected <= 0) expected = poolValue(pool);
    return Math.max(floor, Math.round(expected * rate));
  };

  /** Median stars value of a list (0 when empty). */
  const median = (list: number[]): number => {
    if (!list.length) return 0;
    const s = [...list].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  /**
   * The pool a price case favours. Gifts inside the band are the core of the
   * pool; gifts above the band are kept as a rare "surprise" tail so a cheap
   * case can still drop something nice, but they are heavily down-weighted.
   * Gifts below the band are dropped (a "дорогой" case should not pay junk).
   */
  const bandPool = (min: number, max: number, bias: number): Gift[] => {
    const out: Gift[] = [];
    for (const g of GIFTS) {
      if (g.kind === "symbol") continue;
      if (g.stars >= min && g.stars <= max) {
        out.push({ ...g, weight: Math.max(0.0005, g.weight) });
      } else if (g.stars > max) {
        // rare tail — a jackpot is still possible, just unlikely
        out.push({ ...g, weight: Math.max(0.0002, g.weight / Math.pow(bias, 3)) });
      }
    }
    // never return an empty pool
    return out.length ? out : GIFTS.map((g) => ({ ...g, weight: Math.max(0.0005, g.weight) }));
  };

  /**
   * Rarity odds for a price case: a cheap case is mostly common, an expensive
   * one leans epic/legendary. `t` slides from 0 (cheap) to 1 (top) with the
   * band's midpoint on a log scale.
   */
  const bandOdds = (min: number, max: number): Record<Rarity, number> => {
    const cap = Number.isFinite(max) ? max : 400_000;
    const mid = (min + cap) / 2;
    const t = Math.min(1, Math.max(0, Math.log10(Math.max(10, mid)) / 6));
    const common = 0.78 - t * 0.62;
    const rare = 0.16 + t * 0.10;
    const epic = 0.05 + t * 0.22;
    const legendary = 0.008 + t * 0.22;
    const mythic = 0.002 + t * 0.08;
    const sum = common + rare + epic + legendary + mythic;
    const n = (v: number) => v / sum;
    return {
      common: n(common),
      rare: n(rare),
      epic: n(epic),
      legendary: n(legendary),
      mythic: n(mythic),
    };
  };

  /**
   * Price of a price case: a fraction of the *typical* (median) in-band gift,
   * so the ladder tracks the band and stays predictable instead of being
   * dragged up by a handful of ultra-expensive models. A floor keeps the
   * cheapest case near ~200 ★.
   */
  const bandPrice = (min: number, max: number, rate: number, floor: number): number => {
    const cap = Number.isFinite(max) ? max : 400_000;
    // a cheap band has nothing above 1k only rarely, so guard the lower edge
    const lo = Math.max(min, 15);
    const inBand = GIFTS.filter((g) => g.stars >= lo && g.stars <= cap && g.kind !== "symbol");
    const base = inBand.length ? median(inBand.map((g) => g.stars)) : Math.max(floor, lo);
    return Math.max(floor, Math.round(base * rate));
  };

  // 1. Ten price cases: "все подарки / дешёвые / средние / дорогие"
  for (const p of PRICE_CASES) {
    const odds = bandOdds(p.min, p.max);
    const pool = bandPool(p.min, p.max, p.bias);
    const price = bandPrice(p.min, p.max, p.priceRate, 200);
    cases.push({
      id: p.id,
      name: p.name,
      tag: p.tag,
      price,
      accent: p.accent,
      glow: p.glow,
      odds,
      desc: p.desc,
      category: "price",
      covers: pickCovers(["model"], 3),
      pool: pool.map((g) => g.id),
      fromStars: p.min,
      toStars: Number.isFinite(p.max) ? p.max : undefined,
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

  // 6. The free 24h case: its own small pool, nothing above 1,000 ★.
  const freePool = GIFTS.filter(
    (g) => g.kind !== "symbol" && g.stars >= FREE_CASE_MIN_STARS && g.stars <= FREE_CASE_MAX_STARS,
  );
  if (freePool.length) {
    const odds = { common: 0.6, rare: 0.28, epic: 0.09, legendary: 0.026, mythic: 0.004 };
    cases.push({
      id: "free-daily",
      name: "Бесплатный кейс",
      tag: "каждые 24 ч",
      price: 0,
      accent: "#a3ff12",
      glow: "rgba(163,255,18,0.45)",
      odds,
      desc: "Раз в сутки бесплатно. Подарки от 15 до 1000 ★.",
      category: "free",
      covers: freePool.filter((g) => g.image).slice(0, 3).map((g) => g.image!),
      pool: freePool.map((g) => g.id),
      fromStars: FREE_CASE_MIN_STARS,
      toStars: FREE_CASE_MAX_STARS,
    });
  }

  return cases;
}

/** The free 24h case drops nothing cheaper than this many stars. */
export const FREE_CASE_MIN_STARS = 15;
/** …and nothing more expensive than this. Hard cap inside the free case. */
export const FREE_CASE_MAX_STARS = 1_000;

export const CASES: Case[] = buildCases();

/** The free 24h case. */
export const FREE_CASE_CASE_ID = "free-daily";
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