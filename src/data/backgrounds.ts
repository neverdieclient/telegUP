/**
 * Фоны подарков — как в Телеграме.
 *
 * В Телеграме фон подарка — это спокойный однотонный цвет с очень мягким
 * блеском (как ткань или металл), а не узор. Названия и порядок взяты из
 * настоящего каталога фонов Telegram: Black, Onyx Black, Fire Engine,
 * Gunmetal, Caramel, Ivory White, Midnight Blue, Pure Gold, Emerald…
 *
 * Здесь фон — чистый CSS: цвет плюс два мягких свечения по краям. Никаких
 * полосок, клеток, конфетти и звёздочек: только гладкий градиент. Так он
 * ничего не весит, не мигает при загрузке и работает офлайн.
 *
 * Деления на «редкий/эпический» у фонов нет — фон выпадает чистым случаем,
 * все варианты равны.
 */

export type GiftBackground = { id: string; name: string; css: string };

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** Осветлить (amt > 0) или затемнить (amt < 0) цвет: `#3366cc`, 0.2. */
function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => (amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${clamp(mix(r))} ${clamp(mix(g))} ${clamp(mix(b))})`;
}

/**
 * Гладкий фон подарка: ровный цвет и два очень мягких пятна — чуть светлее
 * к верхнему левому краю, чуть темнее к нижнему правому.
 *
 * Разброс намеренно маленький (±6–8%): фон должен читаться как один цвет,
 * как в Телеграме. Раньше здесь был блик +26% и тень −45%, из-за этого
 * карточки выглядели как «нейросетевые» градиенты и резали глаз.
 */
function cloth(hex: string): string {
  return [
    `radial-gradient(130% 110% at 30% 0%, ${shade(hex, 0.06)} 0%, transparent 70%)`,
    `radial-gradient(130% 110% at 70% 100%, ${shade(hex, -0.07)} 0%, transparent 70%)`,
    `linear-gradient(${hex}, ${hex})`,
  ].join(", ");
}

/** `[id, название, цвет]` — по одной строке на фон, как в каталоге Telegram. */
const PALETTE: [string, string, string][] = [
  // ── тёмные и металлы
  ["black", "Black", "#0d0d10"],
  ["onyx-black", "Onyx Black", "#16161c"],
  ["gunmetal", "Gunmetal", "#2b3439"],
  ["battleship-grey", "Battleship Grey", "#84847f"],
  ["steel-grey", "Steel Grey", "#71797e"],
  ["roman-silver", "Roman Silver", "#838996"],
  ["platinum", "Platinum", "#e5e4e2"],
  ["moonstone", "Moonstone", "#3aa8c1"],
  ["mystic-pearl", "Mystic Pearl", "#d8cfc7"],
  ["ivory-white", "Ivory White", "#fffdf0"],
  ["desert-sand", "Desert Sand", "#edc9af"],

  // ── красные и огненные
  ["fire-engine", "Fire Engine", "#ce2029"],
  ["carmine", "Carmine", "#960018"],
  ["burgundy", "Burgundy", "#800020"],
  ["tomato", "Tomato", "#ff6347"],
  ["coral-red", "Coral Red", "#ff4040"],
  ["raspberry", "Raspberry", "#e30b5d"],
  ["strawberry", "Strawberry", "#fc5a8d"],
  ["rosewood", "Rosewood", "#65000b"],
  ["burnt-sienna", "Burnt Sienna", "#e97451"],
  ["persimmon", "Persimmon", "#ec5800"],

  // ── оранжевые и жёлтые
  ["amber", "Amber", "#ffbf00"],
  ["pure-gold", "Pure Gold", "#ffd700"],
  ["satin-gold", "Satin Gold", "#cba135"],
  ["old-gold", "Old Gold", "#cfb53b"],
  ["mustard", "Mustard", "#ffdb58"],
  ["carrot-juice", "Carrot Juice", "#f08019"],
  ["orange", "Orange", "#ff8000"],
  ["lemongrass", "Lemongrass", "#a8c400"],
  ["copper", "Copper", "#b87333"],
  ["caramel", "Caramel", "#af6e4d"],
  ["chocolate", "Chocolate", "#7b3f00"],
  ["chestnut", "Chestnut", "#954535"],
  ["cappuccino", "Cappuccino", "#a67b5b"],
  ["seal-brown", "Seal Brown", "#59260b"],

  // ── зелёные
  ["emerald", "Emerald", "#50c878"],
  ["malachite", "Malachite", "#0bda51"],
  ["jade-green", "Jade Green", "#00a86b"],
  ["shamrock-green", "Shamrock Green", "#009e60"],
  ["mint-green", "Mint Green", "#98ff98"],
  ["pistachio", "Pistachio", "#93c572"],
  ["light-olive", "Light Olive", "#b2b76a"],
  ["khaki-green", "Khaki Green", "#78866b"],
  ["camo-green", "Camo Green", "#5c6b3f"],
  ["ranger-green", "Ranger Green", "#444c38"],
  ["rifle-green", "Rifle Green", "#414d3b"],
  ["tactical-pine", "Tactical Pine", "#3c4d3a"],
  ["pine-green", "Pine Green", "#01796f"],
  ["hunter-green", "Hunter Green", "#355e3b"],
  ["dark-green", "Dark Green", "#013220"],
  ["feldgrau", "Feldgrau", "#4d5d53"],
  ["gunship-green", "Gunship Green", "#4b5320"],
  ["pacific-green", "Pacific Green", "#0f8a80"],

  // ── синие и голубые
  ["midnight-blue", "Midnight Blue", "#191970"],
  ["navy-blue", "Navy Blue", "#0a1a4a"],
  ["cobalt-blue", "Cobalt Blue", "#0047ab"],
  ["sapphire", "Sapphire", "#0f52ba"],
  ["azure-blue", "Azure Blue", "#007fff"],
  ["french-blue", "French Blue", "#0072bb"],
  ["marine-blue", "Marine Blue", "#01386a"],
  ["indigo-dye", "Indigo Dye", "#00416a"],
  ["celtic-blue", "Celtic Blue", "#246bce"],
  ["sky-blue", "Sky Blue", "#87ceeb"],
  ["silver-blue", "Silver Blue", "#7c9cb8"],
  ["neon-blue", "Neon Blue", "#1f51ff"],
  ["pacific-cyan", "Pacific Cyan", "#1ca9c9"],
  ["deep-cyan", "Deep Cyan", "#0b8f8f"],
  ["turquoise", "Turquoise", "#40e0d0"],
  ["aquamarine", "Aquamarine", "#7fffd4"],

  // ── фиолетовые и розовые
  ["purple", "Purple", "#7d26cd"],
  ["grape", "Grape", "#6f2da8"],
  ["lavender", "Lavender", "#b57edc"],
  ["dark-lilac", "Dark Lilac", "#6a3f8f"],
  ["english-violet", "English Violet", "#563c5c"],
  ["french-violet", "French Violet", "#8806ce"],
  ["electric-purple", "Electric Purple", "#bf00ff"],
  ["electric-indigo", "Electric Indigo", "#6f00ff"],
  ["fandango", "Fandango", "#b53389"],
  ["mexican-pink", "Mexican Pink", "#e4007c"],
  ["cyberpunk", "Cyberpunk", "#b400ff"],
];

export const BACKGROUNDS: GiftBackground[] = PALETTE.map(([id, name, hex]) => ({
  id,
  name,
  css: cloth(hex),
}));

export const BACKGROUND_BY_ID: Record<string, GiftBackground> = Object.fromEntries(
  BACKGROUNDS.map((b) => [b.id, b]),
);

/** Чистый случай: у всех фонов одинаковый шанс. */
export const rollBackground = (): GiftBackground =>
  BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

export const backgroundOf = (id: string | undefined | null): GiftBackground | null =>
  (id ? BACKGROUND_BY_ID[id] ?? null : null);

/** Готовая подложка для карточки: фон, а без фона — прежний тинт подарка. */
export const backgroundCss = (id: string | undefined | null, tint = "#9aa3ad"): string => {
  const bg = backgroundOf(id);
  if (bg) return bg.css;
  return `radial-gradient(120% 105% at 50% 5%, ${tint}2e, #0e0e12 72%)`;
};