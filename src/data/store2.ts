/**
 * telegUP 2.0 — прайс-лист внутренней экономики.
 *
 * Реальных денег в проекте нет: ни карт, ни СБП, ни QR, ни вывода. Всё, что
 * можно получить, покупается за две внутренние валюты:
 *
 *   ★ звёзды — зарабатываются в игре (кейсы, удача дня, мини-игры, продажи);
 *   TON       — покупается за звёзды и тратится в TON-маркете.
 *
 * Обмен двусторонний, но с зазором: 1 TON стабильно дороже в покупке, чем в
 * продаже, иначе «купи TON за звёзды → продай TON за звёзды» печатал бы
 * валюту бесконечно. Проверка: самый дешёвый способ получить TON — 320★/TON,
 * самый выгодный способ получить звёзды — 288★/TON.
 *
 * Этот файл — только цены. Сами покупки живут в store (`buyPremium`,
 * `buyStars`, `buyTon`, `buyCombo`, `buyTonItem`) и списывают валюту атомарно
 * с выдачей, поэтому витрина ничего не может выдать «просто так».
 */

export type PremiumPlanId = "month" | "season" | "year";

export type PremiumPlan = {
  id: PremiumPlanId;
  name: string;
  /** days added to the subscription */
  days: number;
  /** price in stars */
  stars: number;
  /** the same plan paid in TON */
  ton: number;
  badge?: string;
  perks: string[];
};

/**
 * Premium is a subscription, not a vanity badge: the expiry date is stored on
 * the profile (`premiumUntil`) and the tier flips to Premium while it is in
 * the future. When it runs out the tier drops back by itself.
 */
export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    id: "month",
    name: "Месяц",
    days: 30,
    stars: 990,
    ton: 3,
    perks: [
      "Галочка Premium рядом с ником",
      "+10% к звёздам с кейсов и продаж",
      "Слот для четвёртого закреплённого подарка",
      "Тема «Минимал» и все коллекционные галочки",
    ],
  },
  {
    id: "season",
    name: "Сезон",
    days: 92,
    stars: 2_490,
    ton: 7,
    badge: "выгода 17%",
    perks: [
      "Всё из «Месяца»",
      "Рамка профиля Premium и свечение ника",
      "Доступ к закрытому чату премиум-игроков",
      "Приоритет в очереди на фишки новых версий",
    ],
  },
  {
    id: "year",
    name: "Год",
    days: 365,
    stars: 7_900,
    ton: 21,
    badge: "выгода 33%",
    perks: [
      "Всё из «Сезона»",
      "Эксклюзивный подарок года в инвентарь",
      "Имя в списке тех, кто поддержал проект",
      "Никогда не поднимаем цены для твоей подписки",
    ],
  },
];

export const PREMIUM_BY_ID = Object.fromEntries(PREMIUM_PLANS.map((p) => [p.id, p])) as Record<
  PremiumPlanId,
  PremiumPlan
>;

/** How much of a gift's value premium adds on top (percent). */
export const PREMIUM_EARN_BONUS = 10;

/** Extra pinned slots a premium account gets. */
export const PREMIUM_EXTRA_PINS = 1;

/* --------------------------------------------------------------- exchange */

/** Курс витрины: сколько звёзд примерно стоит 1 TON (для подписей «≈ N ★»). */
export const STARS_PER_TON = 380;

/** Справочная звёздная цена TON-лота. */
export const starsForTon = (ton: number) => Math.round(ton * STARS_PER_TON);

/** Сколько звёзд даёт 1 TON при продаже (не больше самого дешёвого пака). */
export const STARS_PER_TON_SELL = 288;

/** Звёзды → TON, сколько TON дадут за сумму звёзд (с точностью 0.01 TON). */
export function tonForStars(stars: number): number {
  return Math.round((stars / STARS_PER_TON_SELL) * 100) / 100;
}

/* ------------------------------------------------------------- star packs */

export type StarPackId = "p100" | "p350" | "p700" | "p1500";

export type StarPack = {
  id: StarPackId;
  stars: number;
  /** paid in TON */
  ton: number;
  badge?: string;
};

/**
 * Звёзды покупаются за TON. Чем больше пакет, тем дешевле звезда в TON:
 * 250 → 269 → 280 → 288★ за TON. Всё это ниже, чем самый дешёвый путь
 * получить TON (320★/TON), поэтому обмен туда-обратно убыточен.
 */
export const STAR_PACKS: StarPack[] = [
  { id: "p100", stars: 100, ton: 0.4 },
  { id: "p350", stars: 350, ton: 1.3, badge: "хит" },
  { id: "p700", stars: 700, ton: 2.5, badge: "выгода" },
  { id: "p1500", stars: 1_500, ton: 5.2, badge: "максимум" },
];

export const STAR_PACK_BY_ID = Object.fromEntries(STAR_PACKS.map((p) => [p.id, p])) as Record<
  StarPackId,
  StarPack
>;

/* ------------------------------------------------------------ combo packs */

/**
 * «Стартовый набор новичка» — the good-gift bundle. It exists so a player who
 * has just registered can show something off without grinding.
 *
 * Items from a combo are **наборные**: they cannot be sold and cannot be
 * gifted away (see `sellItem`/`giftItem` in the store). That is what lets the
 * bundle cost far less than the sum of its parts — otherwise «купи набор →
 * продай содержимое» would print stars.
 */
export type ComboId = "starter" | "collector";

export type ComboPack = {
  id: ComboId;
  name: string;
  summary: string;
  /** price in stars */
  stars: number;
  /** the same bundle paid in TON */
  ton: number;
  /** stars handed over on top of the items */
  bonus: number;
  /** gift ids granted, one of each */
  giftIds: string[];
  /** value of the same items if they could be sold, for the «выгода» line */
  worthStars: number;
};

export const COMBO_PACKS: ComboPack[] = [
  {
    id: "starter",
    name: "Стартовый набор",
    summary: "Шесть подарков, с которых начинают все: сердце, роза, медвежонок и мелочь",
    stars: 490,
    ton: 1.4,
    bonus: 250,
    giftIds: [
      "gift-cookie-heart",
      "gift-trapped-heart",
      "gift-scared-cat",
      "gift-eternal-rose",
      "gift-toy-bear",
      "gift-magic-potion",
    ],
    worthStars: 715,
  },
  {
    id: "collector",
    name: "Набор коллекционера",
    summary: "Шесть заметных подарков, включая Algorithm Cup, плюс 1 000 звёзд на апгрейды",
    stars: 1_900,
    ton: 5,
    bonus: 1_000,
    giftIds: [
      "gift-cupid-charm",
      "gift-heart-button",
      "gift-precious-peach",
      "gift-durovs-cap",
      "gift-resistance-dog",
      "gift-algorithm-cup",
    ],
    worthStars: 19_700,
  },
];

export const COMBO_BY_ID = Object.fromEntries(COMBO_PACKS.map((p) => [p.id, p])) as Record<ComboId, ComboPack>;

/* --------------------------------------------------------------- TON packs */

/**
 * TON покупается за звёзды. Чем больше пакет, тем дешевле TON:
 * 400 → 360 → 340 → 320★ за TON.
 */
export type TonTopUp = { id: string; ton: number; stars: number; badge?: string };

export const TON_TOPUPS: TonTopUp[] = [
  { id: "t5", ton: 5, stars: 2_000 },
  { id: "t15", ton: 15, stars: 5_400, badge: "хит" },
  { id: "t40", ton: 40, stars: 13_600 },
  { id: "t100", ton: 100, stars: 32_000, badge: "выгода" },
];

export const TON_TOPUP_BY_ID = Object.fromEntries(TON_TOPUPS.map((t) => [t.id, t])) as Record<string, TonTopUp>;

/* -------------------------------------------------------- TON market items */

export type TonItemKind = "username" | "number";

export type TonItem = {
  /** stable id, used as the purchase key */
  id: string;
  kind: TonItemKind;
  /** `@name` or `+1 202 555 0107` */
  label: string;
  /** short human note («4 буквы», «код США») */
  note: string;
  /** price in TON */
  ton: number;
  /** shown as a tag: rare / epic / legendary / mythic */
  tier: TonTier;
};

export type TonTier = "rare" | "epic" | "legendary" | "mythic";

export const TON_TIER_META: Record<TonTier, { label: string; color: string }> = {
  rare: { label: "редкий", color: "#3b9dff" },
  epic: { label: "эпик", color: "#b45cff" },
  legendary: { label: "легендарный", color: "#ffb300" },
  mythic: { label: "мифический", color: "#ff3d6e" },
};

/**
 * Прилавок обновляется раз в час.
 *
 * Список лотов детерминирован от номера часа, поэтому **у всех игроков
 * одновременно один и тот же прилавок** — иначе «занято» не имело бы смысла:
 * два игрока видели бы разные лоты с одинаковым ником. Прошлый час никто уже
 * не купит, зато каждый час появляются новые ники и номера.
 */
export const TON_ROTATION_MS = 60 * 60 * 1000;

/** Номер текущей ротации. Меняется ровно в начале каждого часа. */
export const tonRotation = (now: number = Date.now()) => Math.floor(now / TON_ROTATION_MS);

/** Сколько лотов показываем за раз. Прилавок большой: 50 ников + 50 номеров. */
export const TON_LOTS = 100;
const TON_USER_LOTS = 50;
const TON_NUMBER_LOTS = TON_LOTS - TON_USER_LOTS;

/** Детерминированный ГПСЧ — один и тот же час даёт один и тот же прилавок. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rnd: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/* ---------------------------------------------------------------- pools */

type UserSeed = { name: string; base: number; tier: TonTier; note: string };

/** Три буквы: самое дорогое, что бывает. */
const SHORT_USERS: UserSeed[] = [
  { name: "ton", base: 95, tier: "legendary", note: "3 буквы, слово" },
  { name: "ace", base: 14, tier: "epic", note: "3 буквы" },
  { name: "rey", base: 12.5, tier: "epic", note: "3 буквы" },
  { name: "sol", base: 15.5, tier: "epic", note: "3 буквы" },
  { name: "fox", base: 13, tier: "epic", note: "3 буквы" },
  { name: "key", base: 11, tier: "epic", note: "3 буквы" },
  { name: "neo", base: 12, tier: "epic", note: "3 буквы" },
  { name: "sky", base: 12.8, tier: "epic", note: "3 буквы" },
  { name: "lux", base: 16, tier: "epic", note: "3 буквы" },
  { name: "orb", base: 10.5, tier: "epic", note: "3 буквы" },
  { name: "gem", base: 11.5, tier: "epic", note: "3 буквы" },
  { name: "ion", base: 10, tier: "epic", note: "3 буквы" },
  { name: "arc", base: 9.8, tier: "epic", note: "3 буквы" },
  { name: "nix", base: 9.5, tier: "epic", note: "3 буквы" },
  { name: "vip", base: 22, tier: "legendary", note: "3 буквы, статус" },
  { name: "pro", base: 21, tier: "legendary", note: "3 буквы, статус" },
  { name: "max", base: 19.5, tier: "legendary", note: "3 буквы, слово" },
  { name: "top", base: 20.5, tier: "legendary", note: "3 буквы, слово" },
  { name: "web", base: 17.5, tier: "legendary", note: "3 буквы, слово" },
  { name: "win", base: 16.5, tier: "legendary", note: "3 буквы, слово" },
  { name: "bit", base: 18, tier: "legendary", note: "3 буквы, слово" },
  { name: "eth", base: 24, tier: "legendary", note: "3 буквы, тикер" },
  { name: "dao", base: 18.5, tier: "legendary", note: "3 буквы, слово" },
  { name: "gas", base: 14.5, tier: "epic", note: "3 буквы" },
  { name: "hub", base: 15, tier: "epic", note: "3 буквы" },
  { name: "lab", base: 13.5, tier: "epic", note: "3 буквы" },
  { name: "net", base: 16.2, tier: "legendary", note: "3 буквы, слово" },
  { name: "art", base: 13.2, tier: "epic", note: "3 буквы" },
  { name: "dog", base: 12.2, tier: "epic", note: "3 буквы" },
  { name: "cat", base: 12.4, tier: "epic", note: "3 буквы" },
  { name: "sun", base: 11.8, tier: "epic", note: "3 буквы" },
  { name: "ice", base: 11.2, tier: "epic", note: "3 буквы" },
  { name: "ink", base: 10.8, tier: "epic", note: "3 буквы" },
  { name: "jet", base: 13.8, tier: "epic", note: "3 буквы" },
  { name: "zen", base: 12.6, tier: "epic", note: "3 буквы" },
  { name: "odd", base: 9.2, tier: "epic", note: "3 буквы" },
  { name: "raw", base: 9.4, tier: "epic", note: "3 буквы" },
  { name: "hex", base: 10.2, tier: "epic", note: "3 буквы" },
  { name: "eos", base: 11.4, tier: "epic", note: "3 буквы, тикер" },
  { name: "mag", base: 9.9, tier: "epic", note: "3 буквы" },
];

/** Четыре буквы: обычные красивые ники. */
const MID_USERS: UserSeed[] = [
  { name: "volt", base: 2.4, tier: "rare", note: "4 буквы" },
  { name: "luna", base: 2.9, tier: "rare", note: "4 буквы" },
  { name: "nova", base: 3.1, tier: "rare", note: "4 буквы" },
  { name: "kira", base: 2.6, tier: "rare", note: "4 буквы" },
  { name: "mira", base: 2.7, tier: "rare", note: "4 буквы" },
  { name: "yuki", base: 2.5, tier: "rare", note: "4 буквы" },
  { name: "zara", base: 2.8, tier: "rare", note: "4 буквы" },
  { name: "enzo", base: 2.55, tier: "rare", note: "4 буквы" },
  { name: "loki", base: 3.4, tier: "rare", note: "4 буквы" },
  { name: "mika", base: 2.45, tier: "rare", note: "4 буквы" },
  { name: "sora", base: 2.65, tier: "rare", note: "4 буквы" },
  { name: "vega", base: 3.2, tier: "rare", note: "4 буквы" },
  { name: "zeta", base: 2.75, tier: "rare", note: "4 буквы" },
  { name: "aero", base: 2.5, tier: "rare", note: "4 буквы" },
  { name: "cove", base: 2.3, tier: "rare", note: "4 буквы" },
  { name: "wisp", base: 2.35, tier: "rare", note: "4 буквы" },
  { name: "ares", base: 2.42, tier: "rare", note: "4 буквы" },
  { name: "argo", base: 2.38, tier: "rare", note: "4 буквы" },
  { name: "axel", base: 2.62, tier: "rare", note: "4 буквы" },
  { name: "bane", base: 2.28, tier: "rare", note: "4 буквы" },
  { name: "bohr", base: 2.72, tier: "rare", note: "4 буквы" },
  { name: "cade", base: 2.33, tier: "rare", note: "4 буквы" },
  { name: "cyra", base: 2.48, tier: "rare", note: "4 буквы" },
  { name: "dune", base: 2.58, tier: "rare", note: "4 буквы" },
  { name: "echo", base: 2.88, tier: "rare", note: "4 буквы" },
  { name: "faye", base: 2.44, tier: "rare", note: "4 буквы" },
  { name: "gala", base: 2.36, tier: "rare", note: "4 буквы" },
  { name: "iris", base: 2.66, tier: "rare", note: "4 буквы" },
  { name: "jade", base: 2.52, tier: "rare", note: "4 буквы" },
  { name: "kane", base: 2.47, tier: "rare", note: "4 буквы" },
  { name: "koda", base: 2.41, tier: "rare", note: "4 буквы" },
  { name: "lyra", base: 2.83, tier: "rare", note: "4 буквы" },
  { name: "orin", base: 2.32, tier: "rare", note: "4 буквы" },
  { name: "ozzy", base: 2.92, tier: "rare", note: "4 буквы" },
  { name: "pike", base: 2.26, tier: "rare", note: "4 буквы" },
  { name: "raze", base: 2.54, tier: "rare", note: "4 буквы" },
  { name: "reed", base: 2.31, tier: "rare", note: "4 буквы" },
  { name: "rhea", base: 2.57, tier: "rare", note: "4 буквы" },
  { name: "sage", base: 2.61, tier: "rare", note: "4 буквы" },
  { name: "sena", base: 2.43, tier: "rare", note: "4 буквы" },
  { name: "tobi", base: 2.39, tier: "rare", note: "4 буквы" },
  { name: "ursa", base: 2.34, tier: "rare", note: "4 буквы" },
  { name: "vito", base: 2.56, tier: "rare", note: "4 буквы" },
  { name: "wren", base: 2.29, tier: "rare", note: "4 буквы" },
  { name: "xena", base: 2.68, tier: "rare", note: "4 буквы" },
  { name: "yara", base: 2.37, tier: "rare", note: "4 буквы" },
  { name: "zion", base: 2.86, tier: "rare", note: "4 буквы" },
  { name: "azur", base: 2.53, tier: "rare", note: "4 буквы" },
  { name: "brio", base: 2.27, tier: "rare", note: "4 буквы" },
  { name: "cruz", base: 2.63, tier: "rare", note: "4 буквы" },
  { name: "dash", base: 2.46, tier: "rare", note: "4 буквы" },
  { name: "finn", base: 2.59, tier: "rare", note: "4 буквы" },
  { name: "grey", base: 2.74, tier: "rare", note: "4 буквы" },
  { name: "hale", base: 2.24, tier: "rare", note: "4 буквы" },
  { name: "ivar", base: 2.21, tier: "rare", note: "4 буквы" },
  { name: "keen", base: 2.69, tier: "rare", note: "4 буквы" },
  { name: "kylo", base: 2.94, tier: "rare", note: "4 буквы" },
  { name: "lion", base: 2.51, tier: "rare", note: "4 буквы" },
  { name: "mako", base: 2.19, tier: "rare", note: "4 буквы" },
  { name: "nash", base: 2.23, tier: "rare", note: "4 буквы" },
  { name: "onyx", base: 2.97, tier: "rare", note: "4 буквы" },
  { name: "reno", base: 2.22, tier: "rare", note: "4 буквы" },
  { name: "ryze", base: 2.49, tier: "rare", note: "4 буквы" },
  { name: "simo", base: 2.17, tier: "rare", note: "4 буквы" },
];

/** Слова и названия: коллекционные. */
const WORD_USERS: UserSeed[] = [
  { name: "telegup", base: 60, tier: "legendary", note: "имя проекта" },
  { name: "premium", base: 52, tier: "legendary", note: "слово" },
  { name: "gift", base: 44, tier: "legendary", note: "4 буквы, слово" },
  { name: "stars", base: 38, tier: "legendary", note: "слово" },
  { name: "satoshi", base: 34, tier: "legendary", note: "слово" },
  { name: "wallet", base: 26, tier: "legendary", note: "слово" },
  { name: "market", base: 24, tier: "legendary", note: "слово" },
  { name: "cipher", base: 22, tier: "legendary", note: "слово" },
  { name: "plasma", base: 21, tier: "legendary", note: "слово" },
  { name: "nebula", base: 20, tier: "legendary", note: "слово" },
  { name: "vector", base: 19, tier: "legendary", note: "слово" },
  { name: "phoenix", base: 18.5, tier: "legendary", note: "слово" },
  { name: "orbit", base: 17, tier: "legendary", note: "слово" },
  { name: "rocket", base: 16.5, tier: "legendary", note: "слово" },
  { name: "cosmos", base: 16, tier: "legendary", note: "слово" },
  { name: "pixel", base: 15, tier: "legendary", note: "слово" },
  { name: "matrix", base: 14.5, tier: "legendary", note: "слово" },
  { name: "vortex", base: 14, tier: "legendary", note: "слово" },
  { name: "dragon", base: 13.5, tier: "legendary", note: "слово" },
  { name: "thunder", base: 13, tier: "legendary", note: "слово" },
  { name: "glacier", base: 12.5, tier: "legendary", note: "слово" },
  { name: "shadow", base: 12, tier: "legendary", note: "слово" },
  { name: "crystal", base: 11.5, tier: "legendary", note: "слово" },
  { name: "quantum", base: 11, tier: "legendary", note: "слово" },
  { name: "horizon", base: 10.5, tier: "epic", note: "слово" },
  { name: "eclipse", base: 10.2, tier: "epic", note: "слово" },
  { name: "magnet", base: 9.8, tier: "epic", note: "слово" },
  { name: "aurora", base: 9.5, tier: "epic", note: "слово" },
  { name: "zenith", base: 9.2, tier: "epic", note: "слово" },
  { name: "falcon", base: 8.9, tier: "epic", note: "слово" },
  { name: "cobalt", base: 8.6, tier: "epic", note: "слово" },
  { name: "titan", base: 8.3, tier: "epic", note: "слово" },
  { name: "atlas", base: 8, tier: "epic", note: "слово" },
  { name: "prism", base: 7.7, tier: "epic", note: "слово" },
  { name: "halo", base: 7.4, tier: "epic", note: "4 буквы, слово" },
  { name: "legend", base: 7.1, tier: "epic", note: "слово" },
  { name: "empire", base: 6.8, tier: "epic", note: "слово" },
  { name: "dynasty", base: 6.5, tier: "epic", note: "слово" },
  { name: "galaxy", base: 6.2, tier: "epic", note: "слово" },
  { name: "meteor", base: 5.9, tier: "epic", note: "слово" },
];

/** Номера: цена зависит от кода страны. */
const NUMBER_SEEDS: { code: string; area: string; note: string; base: number; tier: TonTier }[] = [
  { code: "+375", area: "33", note: "код BY, 33", base: 3.6, tier: "rare" },
  { code: "+375", area: "29", note: "код BY, 29", base: 3.9, tier: "rare" },
  { code: "+380", area: "67", note: "код UA, 67", base: 3.8, tier: "rare" },
  { code: "+380", area: "44", note: "код UA, 44", base: 4.2, tier: "rare" },
  { code: "+7", area: "701", note: "код KZ, 701", base: 4.8, tier: "rare" },
  { code: "+7", area: "777", note: "код KZ, 777", base: 5.1, tier: "rare" },
  { code: "+996", area: "312", note: "код KG, Бишкек", base: 3.4, tier: "rare" },
  { code: "+998", area: "71", note: "код UZ, Ташкент", base: 3.5, tier: "rare" },
  { code: "+374", area: "10", note: "код AM, Ереван", base: 3.3, tier: "rare" },
  { code: "+995", area: "32", note: "код GE, Тбилиси", base: 3.7, tier: "rare" },
  { code: "+7", area: "999", note: "код RU, 999", base: 5.4, tier: "rare" },
  { code: "+7", area: "495", note: "код RU, Москва", base: 6.1, tier: "rare" },
  { code: "+7", area: "812", note: "код RU, Петербург", base: 5.6, tier: "rare" },
  { code: "+48", area: "22", note: "код PL, Варшава", base: 4.6, tier: "rare" },
  { code: "+420", area: "2", note: "код CZ, Прага", base: 4.9, tier: "rare" },
  { code: "+36", area: "1", note: "код HU, Будапешт", base: 4.4, tier: "rare" },
  { code: "+40", area: "21", note: "код RO, Бухарест", base: 4.1, tier: "rare" },
  { code: "+359", area: "2", note: "код BG, София", base: 3.9, tier: "rare" },
  { code: "+30", area: "21", note: "код GR, Афины", base: 5.2, tier: "rare" },
  { code: "+49", area: "30", note: "код DE, Берлин", base: 6.5, tier: "rare" },
  { code: "+49", area: "89", note: "код DE, Мюнхен", base: 6.2, tier: "rare" },
  { code: "+33", area: "1", note: "код FR, Париж", base: 7.6, tier: "rare" },
  { code: "+34", area: "91", note: "код ES, Мадрид", base: 6.8, tier: "rare" },
  { code: "+39", area: "6", note: "код IT, Рим", base: 7.2, tier: "rare" },
  { code: "+31", area: "20", note: "код NL, Амстердам", base: 7.9, tier: "rare" },
  { code: "+46", area: "8", note: "код SE, Стокгольм", base: 8.1, tier: "epic" },
  { code: "+47", area: "21", note: "код NO, Осло", base: 8.3, tier: "epic" },
  { code: "+358", area: "9", note: "код FI, Хельсинки", base: 8.2, tier: "epic" },
  { code: "+90", area: "212", note: "код TR, Стамбул", base: 7.4, tier: "rare" },
  { code: "+972", area: "3", note: "код IL, Тель-Авив", base: 9.8, tier: "epic" },
  { code: "+81", area: "3", note: "код JP, Токио", base: 8.4, tier: "epic" },
  { code: "+81", area: "6", note: "код JP, Осака", base: 8.2, tier: "epic" },
  { code: "+82", area: "2", note: "код KR, Сеул", base: 9.2, tier: "epic" },
  { code: "+86", area: "21", note: "код CN, Шанхай", base: 9.6, tier: "epic" },
  { code: "+65", area: "6", note: "код SG, Сингапур", base: 12, tier: "epic" },
  { code: "+852", area: "2", note: "код HK", base: 16, tier: "epic" },
  { code: "+61", area: "2", note: "код AU, Сидней", base: 10.4, tier: "epic" },
  { code: "+64", area: "9", note: "код NZ, Окленд", base: 9.9, tier: "epic" },
  { code: "+55", area: "11", note: "код BR, Сан-Паулу", base: 8.6, tier: "epic" },
  { code: "+52", area: "55", note: "код MX, Мехико", base: 8.1, tier: "epic" },
  { code: "+27", area: "11", note: "код ZA, Йоханнесбург", base: 7.2, tier: "rare" },
  { code: "+1", area: "202", note: "код США, округ Колумбия", base: 9.5, tier: "epic" },
  { code: "+1", area: "212", note: "код США, Нью-Йорк", base: 11.5, tier: "epic" },
  { code: "+1", area: "310", note: "код США, Лос-Анджелес", base: 11, tier: "epic" },
  { code: "+1", area: "415", note: "код США, Сан-Франциско", base: 12.5, tier: "epic" },
  { code: "+44", area: "20", note: "код UK, Лондон", base: 11, tier: "epic" },
  { code: "+44", area: "161", note: "код UK, Манчестер", base: 10.2, tier: "epic" },
  { code: "+41", area: "44", note: "код CH, Цюрих", base: 14.5, tier: "epic" },
  { code: "+353", area: "1", note: "код IE, Дублин", base: 13, tier: "epic" },
  { code: "+971", area: "4", note: "код ОАЭ, Дубай", base: 13.5, tier: "epic" },
  { code: "+888", area: "8", note: "анонимный номер Telegram", base: 250, tier: "mythic" },
];

/** Хвосты, которые делают лот «новым» в следующий час. */
const USER_TAILS = ["", "", "", "hq", "tg", "1", "7", "24", "88", "x", "pro", "vip"];

function usernameLots(rnd: () => number): TonItem[] {
  const out: TonItem[] = [];
  // 50 ников: 10 коротких, 24 четырёхбуквенных и 16 слов-коллекционок
  const groups: { seeds: UserSeed[]; take: number }[] = [
    { seeds: SHORT_USERS, take: 10 },
    { seeds: MID_USERS, take: 24 },
    { seeds: WORD_USERS, take: 16 },
  ];

  for (const group of groups) {
    for (const seed of shuffle(group.seeds, rnd).slice(0, group.take)) {
      const tail = USER_TAILS[Math.floor(rnd() * USER_TAILS.length)];
      const name = tail ? `${seed.name}${tail}` : seed.name;
      // хвост делает ник менее коллекционным, поэтому он и дешевле
      const price = Math.round(seed.base * (tail ? 0.55 : 1) * 100) / 100;
      const tier: TonTier = tail && seed.tier !== "mythic" ? (seed.tier === "epic" ? "rare" : "epic") : seed.tier;
      out.push({
        id: `u-${name.toLowerCase()}`,
        kind: "username",
        label: `@${name}`,
        note: tail ? `${seed.note} + хвост` : seed.note,
        ton: Math.max(1.2, price),
        tier,
      });
    }
  }
  return out;
}

function numberLots(rnd: () => number): TonItem[] {
  const out: TonItem[] = [];
  const used = new Set<string>();
  // пул кодов меньше, чем лотов: часть кодов повторяется с другими цифрами,
  // поэтому id собираем по самим цифрам и повторы пропускаем
  const pool = shuffle(NUMBER_SEEDS, rnd);
  for (let i = 0; out.length < TON_NUMBER_LOTS && i < pool.length * 3; i++) {
    const seed = pool[i % pool.length];
    // анонимные +888 почти всегда на прилавке — их мало и они дорогие
    const middle = seed.tier === "mythic" ? 800 + Math.floor(rnd() * 200) : 500 + Math.floor(rnd() * 100);
    const label = `${seed.code} ${seed.area} ${middle} ${pad2(Math.floor(rnd() * 100))} ${pad2(
      Math.floor(rnd() * 100),
    )}`;
    const digits = label.replace(/\D/g, "");
    if (used.has(digits)) continue;
    used.add(digits);
    out.push({
      id: `n-${digits}`,
      kind: "number",
      label,
      note: seed.note,
      ton: seed.tier === "mythic" ? seed.base + Math.floor(rnd() * 4) * 40 : seed.base,
      tier: seed.tier,
    });
  }
  return out;
}

/** Прилавок для конкретного часа ротации. */
export function tonLotsAt(hour: number = tonRotation()): TonItem[] {
  const rnd = mulberry32((hour + 1) * 0x9e3779b1);
  const users = usernameLots(rnd).slice(0, TON_USER_LOTS);
  const numbers = numberLots(rnd);
  // перемешиваем типы, но не теряем порядок внутри каждого — он и так случайный
  return [...users, ...numbers].slice(0, TON_LOTS);
}

/** Прилавок «сейчас» — для кода, которому не нужен реактивный тик. */
export const TON_MARKET: TonItem[] = tonLotsAt();

/** Сколько осталось до следующей ротации, мс. */
export const tonRotationLeft = (now: number = Date.now()) =>
  TON_ROTATION_MS - (now % TON_ROTATION_MS);