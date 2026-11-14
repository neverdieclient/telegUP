/**
 * Узоры подарков — как в Телеграме.
 *
 * В настоящем Телеграме у подарка на фоне лежит узор (symbol): монохромный
 * знак, повторённый плиткой по всей площади — «тиснение» поверх цвета фона.
 * Раньше здесь были текстовые символы, теперь — отдельные картинки-тайлы в
 * `public/patterns/<id>.svg` (базовый набор) или `.webp` (импорт из скрапера).
 *
 * Импорт настоящих паттернов Telegram (скачанных gift-parser.py в папку
 * `<Collection>_patterns/` с PNG-файлами символов):
 *   node scripts/build-patterns.mjs "C:\путь\к\Plushpepe_patterns"
 * Скрипт конвертирует PNG → webp и печатает строки для PALETTE ниже.
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

/** `[id, название]` — по одной строке на узор. */
const LIST: [string, string][] = [
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
];

const BASE = import.meta.env.BASE_URL;

/**
 * Формат файла узора: по умолчанию `.svg` (базовый набор). Для импортированных
 * из скрапера PNG-паттернов поменяйте расширение нужных записей на `.webp`
 * (или добавьте новые строки после конвертации build-patterns.mjs).
 */
const ext = (id: string): string => `${BASE}patterns/${id}.svg`;

export const PATTERNS: GiftPattern[] = LIST.map(([id, name]) => ({
  id,
  name,
  src: ext(id),
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
