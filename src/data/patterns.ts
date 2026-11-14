/**
 * Узоры подарков — как в Телеграме.
 *
 * В настоящем Телеграме у подарка на фоне лежит узор (symbol): монохромный
 * знак, повторённый плиткой по всей площади — «тиснение» поверх цвета фона.
 * Базовый набор — SVG-тайлы в `public/patterns/<id>.svg`. Реальные символы
 * из Telegram (PNG из gift-parser.py) импортируются как webp:
 *   node scripts/build-patterns.mjs "C:\...\<Collection>_patterns"
 * после чего добавьте выведенные строки в LIST с расширением "webp".
 *
 * Идентификаторы сохранены, поэтому узоры уже выданных подарков остаются
 * на месте. Фон и узор выпадают чистым случаем, у всех равный шанс.
 */

export type GiftPattern = {
  id: string;
  name: string;
  /** Путь к тайлу узора с учётом base (`/` или `/telegUP/`). */
  src: string;
};

/** `[id, название, расширение?]` — по одной строке на узор. */
const LIST: [string, string, ("svg" | "webp")?][] = [
  // базовые символы
  ["hearts", "Hearts"],
  ["ace-of-hearts", "Ace Of Hearts"],
  ["club", "Club"],
  ["diamond", "Diamond"],
  ["star", "Star"],
  ["starflower", "Starflower"],
  ["sparkle", "Sparkle"],
  ["flower", "Flower"],
  ["half-moon", "Half Moon"],
  ["sun", "Sun"],
  ["cloud", "Cloud"],
  ["lightning", "Lightning"],
  ["snowflake", "Snowflake"],
  ["clover", "Clover"],
  ["skull", "Skull"],
  ["cross", "Cross"],
  ["balance", "Balance"],
  ["scales", "Scales"],
  ["crown", "Crown"],
  ["sword", "Sword"],
  ["anchor", "Anchor"],
  ["flag", "Flag"],
  ["note", "Music Note"],
  ["notes", "Notes"],
  // реальные символы Telegram (PlushPepe)
  ["blood-drop-0-5", "Blood Drop 0.5%", "webp"],
  ["cash-0-4", "Cash 0.4%", "webp"],
  ["celtic-cross-0-4", "Celtic Cross 0.4%", "webp"],
  ["feather-0-3", "Feather 0.3%", "webp"],
  ["jellyfish-0-3", "Jellyfish 0.3%", "webp"],
  ["loveberry-0-3", "Loveberry 0.3%", "webp"],
];

const BASE = import.meta.env.BASE_URL;

export const PATTERNS: GiftPattern[] = LIST.map(([id, name, ext = "svg"]) => ({
  id,
  name,
  src: `${BASE}patterns/${id}.${ext}`,
}));

export const PATTERN_BY_ID: Record<string, GiftPattern> = Object.fromEntries(
  PATTERNS.map((p) => [p.id, p]),
);

/** Чистый случай: у всех узоров одинаковый шанс. */
export const rollPattern = (): GiftPattern =>
  PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

export const patternOf = (id: string | undefined | null): GiftPattern | null =>
  (id ? PATTERN_BY_ID[id] ?? null : null);

/**
 * Слой узора для `background-image`: картинка-тайл, которая повторяется по всей
 * площади фона. Плотность задаётся размером слоя в `Inventory.lookStyle`.
 */
export function patternLayer(
  id: string | undefined | null,
  _opts: { size?: number; opacity?: number } = {},
): string | null {
  const p = patternOf(id);
  if (!p) return null;
  return `url("${p.src}")`;
}
