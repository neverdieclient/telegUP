/**
 * Узоры подарков — как в Телеграме.
 *
 * У улучшенного подарка в Телеграме на фоне лежит узор (symbol): мелкий
 * повторяющийся знак — сердце, звезда, полумесяц, череп. Названия взяты из
 * настоящего каталога (telegifter.ru/gifts/rarest-symbol: Hearts, Ace Of
 * Hearts, Half Moon, Starflower, Skull…); там их 718, здесь — те, что можно
 * нарисовать знаком шрифта, без картинок.
 *
 * Узор намеренно мелкий и бледный: он должен читаться как тиснение на ткани, а
 * не спорить с подарком. Поэтому в наборе только настоящие знаки — никаких
 * точек, квадратов и колец: крупная геометрия на фоне выглядит как горошек.
 *
 * Деления на «редкий/эпический» у узоров нет: узор выпадает чистым случаем.
 */

export type GiftPattern = { id: string; name: string; glyph: string };

/** `[id, название, знак]` — по строке на узор. Знаки одноцветные (не эмодзи). */
const LIST: [string, string, string][] = [
  ["hearts", "Hearts", "♥"],
  ["ace-of-hearts", "Ace Of Hearts", "♠"],
  ["club", "Club", "♣"],
  ["diamond", "Diamond", "♦"],
  ["star", "Star", "★"],
  ["starflower", "Starflower", "✾"],
  ["sparkle", "Sparkle", "✦"],
  ["flower", "Flower", "✿"],
  ["half-moon", "Half Moon", "☾"],
  ["sun", "Sun", "☀"],
  ["cloud", "Cloud", "☁"],
  ["lightning", "Lightning", "⚡"],
  ["snowflake", "Snowflake", "❄"],
  ["clover", "Clover", "☘"],
  ["skull", "Skull", "☠"],
  ["cross", "Cross", "✝"],
  ["balance", "Balance", "☯"],
  ["scales", "Scales", "⚖"],
  ["crown", "Crown", "♛"],
  ["sword", "Sword", "⚔"],
  ["anchor", "Anchor", "⚓"],
  ["flag", "Flag", "⚑"],
  ["note", "Music Note", "♪"],
  ["notes", "Notes", "♫"],
];

export const PATTERNS: GiftPattern[] = LIST.map(([id, name, glyph]) => ({ id, name, glyph }));

export const PATTERN_BY_ID: Record<string, GiftPattern> = Object.fromEntries(
  PATTERNS.map((p) => [p.id, p]),
);

/** Чистый случай: у всех узоров одинаковый шанс. */
export const rollPattern = (): GiftPattern =>
  PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

export const patternOf = (id: string | undefined | null): GiftPattern | null =>
  (id ? PATTERN_BY_ID[id] ?? null : null);

/**
 * Слой узора для `background-image`.
 *
 * Знак рисуется в маленьком SVG-тайле и повторяется по всей площади фона.
 * Тёмная копия чуть ниже и светлая сверху дают мягкое тиснение: узор видно,
 * но подарок остаётся главным на картинке.
 */
export function patternLayer(
  id: string | undefined | null,
  { size = 14, opacity = 0.18 }: { size?: number; opacity?: number } = {},
): string | null {
  const p = patternOf(id);
  if (!p) return null;
  const tile = Math.round(size * 2.6);
  const x = tile / 2;
  const font = (dy: number, fill: string, alpha: number) =>
    `<text x="${x}" y="${Math.round(tile / 2) + dy}" font-size="${size}" text-anchor="middle" ` +
    `fill="${fill}" fill-opacity="${alpha}" ` +
    `font-family="Segoe UI Symbol, Noto Sans Symbols, Apple Symbols, sans-serif">${p.glyph}</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">` +
    font(1, "#000000", opacity * 0.9) +
    font(0, "#ffffff", opacity) +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}