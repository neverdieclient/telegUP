/**
 * Фоны подарков — настоящие текстуры Telegram.
 *
 * В Телеграме фон подарка — это не градиент и не узор, а снятая с реального
 * подарка текстура: ровный цвет с очень мягким тканевым блеском. Здесь лежат
 * ровно те же 78 фонов: 1200×1200 PNG из каталога сплющены до 640×640 webp
 * (`public/backgrounds/<id>.webp`), поэтому все они вместе весят около 100 КБ,
 * не мигают при загрузке и работают офлайн.
 *
 * Пересобрать из новой папки с картинками:
 *   node scripts/build-backgrounds.mjs "C:\путь\к\папке\с\png"
 *
 * Деления на «редкий/эпический» у фонов нет — фон выпадает чистым случаем,
 * все варианты равны.
 */

export type GiftBackground = {
  id: string;
  name: string;
  /** Средний цвет картинки: подложка, пока webp грузится, и база под узором. */
  color: string;
  /** Путь к картинке с учётом base (`/` или `/telegUP/`). */
  src: string;
};

/**
 * `[id, название, средний цвет]` — по одной строке на фон, как в каталоге
 * Telegram. Цвет посчитан по самой картинке, поэтому он всегда совпадает
 * с текстурой.
 */
const PALETTE: [string, string, string][] = [
  // ── тёмные и металлы
  ["black", "Black", "#101010"],
  ["onyx-black", "Onyx Black", "#424242"],
  ["gunmetal", "Gunmetal", "#394b5a"],
  ["battleship-grey", "Battleship Grey", "#7b7b7b"],
  ["steel-grey", "Steel Grey", "#788b99"],
  ["roman-silver", "Roman Silver", "#9490a6"],
  ["platinum", "Platinum", "#999999"],
  ["moonstone", "Moonstone", "#6f989f"],
  ["mystic-pearl", "Mystic Pearl", "#c0716d"],
  ["ivory-white", "Ivory White", "#aaaaaa"],
  ["desert-sand", "Desert Sand", "#998a68"],

  // ── красные и огненные
  ["fire-engine", "Fire Engine", "#d94c4c"],
  ["carmine", "Carmine", "#c44844"],
  ["burgundy", "Burgundy", "#8b4f57"],
  ["coral-red", "Coral Red", "#d07658"],
  ["raspberry", "Raspberry", "#d06883"],
  ["strawberry", "Strawberry", "#c87567"],
  ["rosewood", "Rosewood", "#9d6262"],
  ["burnt-sienna", "Burnt Sienna", "#ca5731"],
  ["persimmon", "Persimmon", "#d1895b"],

  // ── оранжевые и жёлтые
  ["amber", "Amber", "#c49934"],
  ["pure-gold", "Pure Gold", "#af9538"],
  ["satin-gold", "Satin Gold", "#a48840"],
  ["old-gold", "Old Gold", "#a7782d"],
  ["mustard", "Mustard", "#c78a0f"],
  ["carrot-juice", "Carrot Juice", "#cd835f"],
  ["orange", "Orange", "#c98441"],
  ["lemongrass", "Lemongrass", "#82a54e"],
  ["copper", "Copper", "#b8753c"],
  ["caramel", "Caramel", "#c78532"],
  ["chocolate", "Chocolate", "#905845"],
  ["chestnut", "Chestnut", "#a95c49"],
  ["cappuccino", "Cappuccino", "#9a786f"],
  ["seal-brown", "Seal Brown", "#554334"],

  // ── зелёные
  ["emerald", "Emerald", "#5bb37c"],
  ["malachite", "Malachite", "#68a553"],
  ["jade-green", "Jade Green", "#46b08c"],
  ["shamrock-green", "Shamrock Green", "#6da253"],
  ["pistachio", "Pistachio", "#7a9764"],
  ["light-olive", "Light Olive", "#a19855"],
  ["khaki-green", "Khaki Green", "#8c9462"],
  ["camo-green", "Camo Green", "#648347"],
  ["ranger-green", "Ranger Green", "#4b6443"],
  ["rifle-green", "Rifle Green", "#5a5e48"],
  ["tactical-pine", "Tactical Pine", "#35746a"],
  ["pine-green", "Pine Green", "#509176"],
  ["hunter-green", "Hunter Green", "#6b9868"],
  ["dark-green", "Dark Green", "#3b5437"],
  ["feldgrau", "Feldgrau", "#797979"],
  ["gunship-green", "Gunship Green", "#4a775d"],
  ["pacific-green", "Pacific Green", "#59af8c"],

  // ── синие и голубые
  ["midnight-blue", "Midnight Blue", "#46576b"],
  ["navy-blue", "Navy Blue", "#6586ce"],
  ["cobalt-blue", "Cobalt Blue", "#5976bd"],
  ["sapphire", "Sapphire", "#558ec7"],
  ["azure-blue", "Azure Blue", "#529cbe"],
  ["french-blue", "French Blue", "#4d84ad"],
  ["marine-blue", "Marine Blue", "#45578c"],
  ["indigo-dye", "Indigo Dye", "#486d88"],
  ["celtic-blue", "Celtic Blue", "#3e9ee2"],
  ["sky-blue", "Sky Blue", "#55a0c3"],
  ["silver-blue", "Silver Blue", "#6c90ab"],
  ["neon-blue", "Neon Blue", "#6e7cf0"],
  ["pacific-cyan", "Pacific Cyan", "#47aaaf"],
  ["deep-cyan", "Deep Cyan", "#2aa2a1"],
  ["turquoise", "Turquoise", "#4da99e"],
  ["aquamarine", "Aquamarine", "#52ada4"],

  // ── фиолетовые и розовые
  ["purple", "Purple", "#9d5797"],
  ["grape", "Grape", "#8463ac"],
  ["lavender", "Lavender", "#a56ed0"],
  ["dark-lilac", "Dark Lilac", "#9a6b90"],
  ["english-violet", "English Violet", "#9f6ea6"],
  ["french-violet", "French Violet", "#aa58db"],
  ["electric-purple", "Electric Purple", "#af68cc"],
  ["electric-indigo", "Electric Indigo", "#826fe5"],
  ["fandango", "Fandango", "#c76fa1"],
  ["mexican-pink", "Mexican Pink", "#d75782"],
  ["cyberpunk", "Cyberpunk", "#8477e0"],
];

/**
 * Иды, которые были в наборе до перехода на настоящие текстуры (Tomato и
 * Mint Green в каталоге картинок нет). Старые сохранения переносим на близкий
 * по цвету фон, чтобы подарок не менял вид после обновления.
 */
const LEGACY_IDS: Record<string, string> = {
  tomato: "coral-red",
  "mint-green": "pistachio",
};

const BASE = import.meta.env.BASE_URL;

export const BACKGROUNDS: GiftBackground[] = PALETTE.map(([id, name, color]) => ({
  id,
  name,
  color,
  src: `${BASE}backgrounds/${id}.webp`,
}));

export const BACKGROUND_BY_ID: Record<string, GiftBackground> = Object.fromEntries(
  BACKGROUNDS.map((b) => [b.id, b]),
);

/** Чистый случай: у всех фонов одинаковый шанс. */
export const rollBackground = (): GiftBackground =>
  BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

export const backgroundOf = (id: string | undefined | null): GiftBackground | null => {
  if (!id) return null;
  return BACKGROUND_BY_ID[id] ?? BACKGROUND_BY_ID[LEGACY_IDS[id]] ?? null;
};

/** Готовый слой `background-image`: картинка фона или прежний тинт подарка. */
export const backgroundCss = (id: string | undefined | null, tint = "#9aa3ad"): string => {
  const bg = backgroundOf(id);
  if (bg) return `url("${bg.src}")`;
  return `radial-gradient(120% 105% at 50% 5%, ${tint}2e, #0e0e12 72%)`;
};

/** Цвет-подложка под картинкой: виден, пока webp не загрузился. */
export const backgroundTint = (id: string | undefined | null, tint = "#0e0e12"): string =>
  backgroundOf(id)?.color ?? tint;