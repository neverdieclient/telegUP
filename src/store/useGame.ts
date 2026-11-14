import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  FREE_CASE_COOLDOWN_MS,
  FREE_CASE_CASE_ID,
  GIFT_BY_ID,
  GIFTS,
  RARITY_ORDER,
  type BadgeId,
  type Gift,
  type PurchasedShopItem,
} from "../data/gifts";
import { pick, randInt, rollModelUpgrade, uid } from "../lib/rng";
import { getGiftIndex } from "../data/customGifts";
import { boostState } from "../lib/starBoost";
import { onBanSignal } from "../lib/banSignal";
import { DEFAULT_SKIN, DEFAULT_THEME, type SkinId, type ThemeId } from "../lib/theme";

import {
  COMBO_BY_ID,
  PREMIUM_BY_ID,
  PREMIUM_EARN_BONUS,
  PREMIUM_EXTRA_PINS,
  STAR_PACK_BY_ID,
  TON_TOPUPS,
  type ComboId,
  type PremiumPlanId,
  type StarPackId,
  type TonItem,
} from "../data/store2";
import { discountTon } from "../lib/pricing";
import { checkPromo, consumePromo, type PromoResult } from "../lib/promos";
import {
  getScope,
  readAccountState,
  scopedStorage,
  setScope,
  STORE_KEY,
} from "../lib/scopedStorage";

/**
 * Store-side lookups that also see owner-made gifts.
 *
 * `GIFT_BY_ID` is a module constant built from the scraped catalogue, while
 * custom gifts arrive from Supabase at runtime, so every economy action has to
 * resolve ids through these helpers — otherwise a custom present would sell for
 * nothing and could never be upgraded or crafted.
 */
const giftOf = (id: string | null | undefined) =>
  id ? GIFT_BY_ID[id] ?? getGiftIndex()[id] : undefined;

/** Built-ins plus everything currently published in `custom_gifts`. */
const allGifts = (): Gift[] => [...GIFTS, ...Object.values(getGiftIndex())];

/**
 * Everything a player EARNs is scaled by the owner's payout multiplier and, on
 * top of that, by a running «двойные звёзды» event. One helper so a sale, a
 * case drop and the daily fortune can never disagree about the boost.
 */
const earnFactor = (admin: { payoutMultiplier: number }) =>
  (admin.payoutMultiplier / 100) * boostState().multiplier;

/**
 * Read the whole earn rate in one place: the owner multiplier × the event
 * boost × the premium bonus while a subscription is running.
 */
const earnRate = (s: {
  admin: { payoutMultiplier: number; premiumBoost: boolean };
  premiumUntil: number | null;
}) => earnFactor(s.admin) * (isPremiumActive(s.premiumUntil) ? 1 + PREMIUM_EARN_BONUS / 100 : 1);

/** True while a premium subscription is running. */
export const isPremiumActive = (premiumUntil: number | null | undefined) =>
  typeof premiumUntil === "number" && premiumUntil > Date.now();

/**
 * Звёздная цена со скидкой владельца.
 *
 * Скидка одна на весь магазин, поэтому считается в одном месте: и звёздные
 * цены (целые, не ниже 1★), и TON-цены (`discountTon`, две цифры после точки).
 * Экран показывает ровно то, что спишет store.
 */
const salePrice = (base: number, discount: number) => {
  const d = Math.min(95, Math.max(0, Math.round(discount || 0)));
  if (!d) return base;
  return Math.max(1, Math.round((base * (100 - d)) / 100));
};

/**
 * One thing the player bought with the internal currency.
 *
 * There is no money layer any more — no provider reference and no `paid`
 * status, because the currency is spent in the same tick the item is granted.
 * A receipt is therefore just «что, когда и сколько стоило», kept newest-first
 * for the «мои покупки» list.
 */
export type PurchaseRecord = {
  id: string;
  /** `premium:month`, `stars:p350`, `combo:starter`, `ton:u-ace`, `ton-topup:t15` */
  sku: string;
  /** human label shown in the receipt */
  label: string;
  /** what it cost, split by currency (one of the two is 0) */
  paid: { stars: number; ton: number };
  at: number;
};

/** What a purchase with the internal currency did. */
export type BuyResult = {
  ok: boolean;
  /** `stars` / `ton` — not enough balance; `owned` / `taken` — the lot is not free */
  reason?: "stars" | "ton" | "owned" | "taken" | "unknown";
};

/**
 * Может ли игрок купить подарок целиком.
 *
 * Два условия: владелец включил прямые продажи и этот конкретный подарок не
 * помечен «только апгрейд». Апгрейд модели проверяется отдельно
 * (`giftUpgradesEnabled`), поэтому пометка «только апгрейд» не ломает
 * улучшения.
 */
export const canBuyGift = (
  admin: { giftBuyEnabled: boolean; upgradeOnly: string[] },
  slug: string,
) => admin.giftBuyEnabled && !(admin.upgradeOnly ?? []).includes(slug);

export type InventoryItem = {
  /** instance id */
  id: string;
  giftId: string;
  acquiredAt: number;
  /** where it came from, for the item badge */
  source:
    | "case"
    | "market"
    | "upgrade"
    | "free"
    | "admin"
    | "pvp"
    | "mines"
    | "crash"
    | "dice"
    | "wheel"
    | "coinflip"
    | "tower"
    | "craft"
    /**
     * Из набора: такой предмет нельзя продать и нельзя подарить, иначе
     * «купи набор → продай содержимое» печатало бы звёзды. Улучшать — можно.
     */
    | "combo";
  /**
   * Pinned to the top of the inventory, like Telegram's pinned gifts.
   * Optional so items stored before pinning existed still load.
   */
  pinned?: boolean;
};

/** Telegram shows a short row of pinned gifts; three fits our grid. */
export const MAX_PINNED = 3;

/**
 * How many gifts this account may pin: three for everyone, one more while a
 * premium subscription is running (a paid perk must stop when the plan does).
 */
export const pinCap = (premiumUntil: number | null | undefined) =>
  MAX_PINNED + (isPremiumActive(premiumUntil) ? PREMIUM_EXTRA_PINS : 0);

/**
 * Полный порядок закреплённых подарков.
 *
 * `pinOrder` хранит только id и может разойтись с инвентарём: закреп,
 * сделанный до появления списка (или из другой вкладки), в нём отсутствует.
 * Тогда `indexOf` возвращает −1, и перестановка молча ничего не делала — именно
 * поэтому кнопки «выше/ниже» когда-то «не работали». Здесь список всегда
 * собирается целиком: сначала то, что помнит `pinOrder`, затем остальные
 * закрепы в порядке инвентаря.
 */
export function pinnedOrderOf(s: {
  inventory: { id: string; pinned?: boolean }[];
  pinOrder: string[];
}): string[] {
  const pinnedIds = s.inventory.filter((i) => i.pinned).map((i) => i.id);
  const known = s.pinOrder.filter((id) => pinnedIds.includes(id));
  return [...known, ...pinnedIds.filter((id) => !known.includes(id))];
}

/**
 * Guaranteed model upgrade: the drop is always a better model, but the player
 * cannot pick which one. Price = value gap to the rolled model, plus a 10%
 * skinning fee (and a 10★ floor), so a resale can never print money.
 */
export const GUARANTEE_FEE = 1.1;
export const GUARANTEE_MIN = 10;

export const guaranteePrice = (gap: number) =>
  Math.max(GUARANTEE_MIN, Math.round(Math.max(0, gap) * GUARANTEE_FEE));

/** What the guaranteed roll did, so the UI can explain a failure. */
export type GuaranteedUpgradeResult = {
  ok: boolean;
  reason?: "missing" | "top" | "disabled" | "stars";
  /** stars charged on success, or the price that was missing */
  cost?: number;
  /** the model that dropped (success) or would have dropped (no stars) */
  targetGiftId?: string;
  item?: InventoryItem;
};

/** Outcome of one crafting attempt. */
export type CraftResult =
  | { ok: true; item: InventoryItem }
  | { ok: false; reason: "too-few" | "mismatch" | "burned" | "missing" };

export type StatKey =
  | "casesOpened"
  | "upgradesWon"
  | "upgradesLost"
  | "marketBuys"
  | "giftsSold"
  | "crashWins"
  | "minesWins"
  | "pvpWins"
  | "pvpLosses"
  | "diceWins"
  | "coinflipWins"
  | "wheelWins"
  | "towerWins";

export type Settings = {
  sound: boolean;
  reduceMotion: boolean;
};

/** How the layout behaves: follows the screen, or is forced by the choice made on first visit. */
export type DeviceMode = "auto" | "desktop" | "mobile";

export type Toast = {
  id: string;
  kind: "success" | "error" | "info" | "gift";
  title: string;
  message?: string;
};

export type Profile = {
  nickname: string;
  tier: "Free" | "Premium";
  /** legacy single badge kept for compatibility */
  badge: string | null;
  /** profile checkmarks: тестер, овнер, dev… */
  badges: BadgeId[];
  /** visual verification marks drawn by <CheckMark> */
  marks: string[];
  anonymousNumber: boolean;
  /** generated +888 mask, e.g. "+888 123 456" */
  phoneNumber: string | null;
  /** extra decorative names shown after «а также» */
  altNames: string[];
  /** accent colour of the profile avatar ring */
  accent: string | null;
  /** gradient preset id for the avatar/header (see ACCENTS) */
  gradient: string | null;
  /** nickname text gradient, see src/data/cosmetics.ts */
  nameGradient: string | null;
  /** badge pulse preset, see src/data/cosmetics.ts */
  badgeGlow: string | null;
  /** header banner preset, see src/data/cosmetics.ts */
  profileBanner: string | null;
  /** public URL of the uploaded avatar (bucket `avatars`); null = letter fallback */
  avatarUrl: string | null;
  /** short status line under the nickname */
  bio: string | null;
  purchasedUsernames: string[];
  /** купленные номера (в порядке покупки) — как ники, их можно переключать */
  purchasedNumbers: string[];
  /** second, collectible username shown under the main one */
  collectibleUsername: string | null;
  /** show my gift inventory to other players (public player card) */
  showInventory: boolean;
  /**
   * The nickname the player picked themselves. The account mirror only fills
   * `nickname` from the registration name while this is empty, so a rename is
   * never reverted.
   */
  customNickname: boolean;
};

type State = {
  // ---- economy ----
  stars: number;
  /** TON balance — the second, separate currency of the 2.0 market */
  ton: number;
  coins: number; // clicker currency
  inventory: InventoryItem[];

  // ---- premium ----
  /** epoch ms when the running subscription ends; null = never had one */
  premiumUntil: number | null;
  /** last plan bought, for the «продлить» button */
  premiumPlan: PremiumPlanId | null;
  /** every purchase with the internal currency, newest first (a receipt trail) */
  purchases: PurchaseRecord[];
  /**
   * Keys of TON-market lots this account owns (`u-luna`, `n-79995551234`).
   * Kept even after the shelf rotates, so an owned lot can never be sold to
   * the same account twice.
   */
  tonOwned: string[];
  /**
   * Lots somebody else already owns — key → owner id. Filled from the server by
   * `useTonClaims`; a lot in here is shown as «занят» and cannot be bought.
   */
  tonTaken: Record<string, string>;

  // ---- profile ----
  profile: Profile;
  joinedAt: number;
  /**
   * Order of the pinned gifts, by inventory instance id. Telegram keeps your
   * pinned gifts in a row you arrange yourself, so the order is stored
   * separately from the inventory — filtering or sorting the grid never
   * reshuffles the strip.
   */
  pinOrder: string[];

  // ---- cooldowns ----
  lastFreeCaseAt: number | null;
  lastDailyAt: number | null;
  /** last «Удача дня» spin (ms); gates the free earner */
  lastFortuneAt: number | null;

  // ---- admin ----
  admin: {
    alwaysWinUpgrade: boolean;
    luckBoost: boolean;
    unlocked: boolean;
    /** 100 = normal payout, 600 = sixfold */
    payoutMultiplier: number;
    /**
     * Multiplies the chance of a successful upgrade (both the classic wheel
     * and model upgrades). 100 = honest odds, 200 = ×2, 10000 = ×100.
     * The owner hands this out per player; the server is the source of truth
     * and this mirror only keeps the UI in step after a reload.
     */
    upgradeLuck: number;
    freeCases: boolean;
    noCooldown: boolean;
    /** when on, only profile, inventory, Telegram, settings and chat work */
    maintenance: boolean;
    /** the notice shown on the maintenance screen and on the dashboard */
    maintenanceNote: string;
    /** scheduled quiet hours, «HH:MM»; empty = no schedule */
    quietFrom: string;
    quietTo: string;
    /** global discount in percent on shop prices (0 = off) */
    discount: number;
    /**
     * Buying a *gift* itself is off by default: the catalogue is shown, but
     * the price button turns into an upgrade entry point. The owner flips this
     * to bring direct gift sales back.
     */
    giftBuyEnabled: boolean;
    /**
     * Model upgrades of a gift stay purchasable while direct gift sales are
     * hidden — this is the switch that decides whether they are.
     */
    giftUpgradesEnabled: boolean;
    /** premium adds its bonus to earnings (see earnRate) */
    premiumBoost: boolean;
    /** the owner's own banner rotation, shown in the ad slots */
    adsEnabled: boolean;
    /**
     * Подарки, которые нельзя купить целиком — только улучшить. Владелец
     * выбирает их по одному, слагами (`heart-locket`), поэтому список живёт
     * рядом с двумя общими тумблерами ниже.
     */
    upgradeOnly: string[];
  };

  // ---- settings ----
  settings: Settings;
  stats: Record<StatKey, number>;

  // ---- appearance ----
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  /** classic (glow, glass) or the flat 2.0 shell */
  skin: SkinId;
  setSkin: (id: SkinId) => void;
  /** forced layout from the first-visit screen ("auto" follows the window) */
  deviceMode: DeviceMode;
  setDeviceMode: (m: DeviceMode) => void;
  /** true once the visitor picked a version on the first-visit screen */
  deviceChosen: boolean;
  chooseDevice: (m: DeviceMode) => void;

  // ---- purchased shop items (telegram clone) ----
  shopItems: PurchasedShopItem[];

  // ---- transient ----
  toasts: Toast[];

  // ---- actions: economy ----
  addStars: (n: number) => void;
  spendStars: (n: number) => boolean;
  addCoins: (n: number) => void;
  spendCoins: (n: number) => boolean;
  /** Add TON (top-up, prize, admin grant). Never scaled by boosts. */
  addTon: (n: number) => void;
  /** Spend TON; false when the balance is short. */
  spendTon: (n: number) => boolean;

  // ---- actions: premium & purchases ----
  /**
   * Start or extend a subscription. Extending adds the plan's days to the
   * remaining time, so buying twice never throws days away.
   */
  grantPremium: (planId: PremiumPlanId) => void;
  /** Выдать Premium на N дней — для промокодов (складывается с остатком). */
  grantPremiumDays: (days: number) => void;
  /** Drop premium immediately (admin / refund / expired). */
  revokePremium: () => void;
  /**
   * Снять подписку, если её срок уже вышел.
   *
   * `premiumUntil` — единственный источник правды, но тир `profile.tier`
   * лежит отдельным полем и сам по себе не гаснет. Эта функция сверяет дату и
   * реально снимает Premium (тир, галочку, четвёртый пин), поэтому «месяц
   * кончился» = «подписки нет», а не вечная галочка.
   */
  syncPremium: () => void;

  /** Premium за звёзды или за TON; списывает валюту и продлевает подписку. */
  buyPremium: (planId: PremiumPlanId, pay: "stars" | "ton") => BuyResult;
  /** Пакет звёзд, оплаченный TON (звёзды зачисляются ровно, без множителей). */
  buyStars: (packId: StarPackId) => BuyResult;
  /** Пополнение TON за звёзды. */
  buyTon: (topUpId: string) => BuyResult;
  /** Набор новичка/коллекционера за звёзды или TON. */
  buyCombo: (comboId: ComboId, pay: "stars" | "ton") => BuyResult;
  /**
   * Купить юзернейм или номер за TON. Валюта списывается атомарно с выдачей;
   * лот, который уже чей-то, не покупается (`taken`).
   */
  buyTonItem: (item: TonItem) => BuyResult;
  /** Список занятых лотов с сервера (см. lib/tonMarket). */
  setTonTaken: (claims: Record<string, string>) => void;
  /** Одна строка истории покупок; используется всеми действиями выше. */
  recordPurchase: (sku: string, label: string, paid: { stars: number; ton: number }) => void;
  /**
   * Погасить промокод: звёзды, TON или дни Premium.
   *
   * Проверка и списание — в одном действии, поэтому код нельзя применить
   * дважды (использованный код записывается на этот аккаунт) и нельзя
   * «проверить, но не забрать».
   */
  redeemPromo: (code: string) => PromoResult;

  /** Reorder pinned gifts by one slot (keyboard fallback for the drag). */
  movePin: (instanceId: string, dir: -1 | 1) => void;

  /**
   * Полный порядок закреплённых — его пишет перетаскивание пальцем.
   *
   * Экшен принимает любой список и сам приводит его в порядок: хранит только
   * реально закреплённые подарки, без дублей, а забытые дописывает в конец.
   * Так «отпустил палец посреди анимации» не может потерять закреп.
   */
  setPinOrder: (ids: string[]) => void;

  // ---- actions: inventory ----
  addItem: (giftId: string, source: InventoryItem["source"]) => InventoryItem;
  removeItem: (instanceId: string) => boolean;
  sellItem: (instanceId: string) => number;
  sellAll: (filter?: (giftId: string) => boolean) => { count: number; stars: number };
  /** Pin/unpin a gift; returns the new pinned state (false when the cap is hit). */
  togglePin: (instanceId: string) => boolean;
  giftItem: (instanceId: string) => void;
  /**
   * Morph one inventory item into a better model of the same gift.
   * Consumes the source item and inserts `targetGiftId` in its place.
   * Returns the new item, or null when the source is missing.
   */
  upgradeItemModel: (instanceId: string, targetGiftId: string) => InventoryItem | null;
  /** Failed model upgrade: the source item is consumed. */
  loseItemOnUpgrade: (instanceId: string) => void;
  /**
   * Guaranteed model upgrade: the roll cannot fail, but *which* nicer model
   * drops is random. You only pay the value gap to the model you won, so the
   * player is buying the skin, never a lottery ticket.
   */
  guaranteedUpgrade: (instanceId: string) => GuaranteedUpgradeResult;

  /**
   * Crafting: consume 2–4 items and get either one better gift (a "crafted"
   * copy) or nothing. The craft roll is weighted by how many items went in.
   */
  craftItems: (instanceIds: string[]) => CraftResult;

  // ---- actions: free case ----
  freeCaseReadyAt: () => number;
  claimFreeCaseCooldown: () => void;

  // ---- actions: «Удача дня» (free earner) ----
  /** ms left before the next free spin, 0 when ready */
  fortuneReadyIn: () => number;
  /** Spend the free spin and return the star prize (0 if not ready). */
  spinFortune: () => number;

  // ---- actions: shop ----
  buyUsername: (username: string, price: number) => boolean;
  buyShopItem: (id: PurchasedShopItem, price: number) => boolean;
  /** Sell an owned username back to the shop for stars. */
  sellUsername: (username: string, price: number) => boolean;

  // ---- actions: profile ----
  /** Rename, remembering that this was a deliberate choice. */
  setNickname: (name: string) => void;
  /** Internal: adopt the account name without flagging it as custom. */
  adoptNickname: (name: string) => void;
  setMainUsername: (username: string) => boolean;
  setCollectibleUsername: (username: string | null) => void;
  /** Переключить активный номер из купленных (`null` — вернуть обычный). */
  setMainNumber: (label: string | null) => boolean;
  setAnonymousNumber: (value: boolean) => void;
  /** Set an arbitrary +888 number (typed or generated) and switch the number on. */
  adminSetPhoneNumber: (value: string | null) => void;
  /** Extra «а также @name» entries on the profile card. */
  setAltNames: (names: string[]) => void;
  /** Avatar/header cosmetics. */
  setAccent: (accent: string | null, gradient: string | null) => void;
  /** Nickname gradient / badge glow / profile banner. */
  setCosmetics: (patch: {
    nameGradient?: string | null;
    badgeGlow?: string | null;
    profileBanner?: string | null;
  }) => void;
  setBio: (bio: string | null) => void;
  /** Uploaded avatar URL (null falls back to the nickname letter). */
  setAvatar: (url: string | null) => void;
  /** Privacy switch: «Показывать мои подарки другим». */
  setShowInventory: (show: boolean) => void;
  /** Wipe an account's cosmetics back to defaults. */
  adminClearCosmetics: () => void;
  /** Supabase user id of the signed-in player, mirrored into the store. */
  onlineUserId: string | null;
  setOnlineUserId: (id: string | null) => void;
  /**
   * The account whose local save is currently open (see lib/scopedStorage).
   * Every account owns a slot, so switching accounts swaps the whole save.
   */
  accountScope: string;
  /**
   * Open another account's slot: the save on screen is flushed into the slot
   * it belongs to, the state is reset and the other account's save is loaded
   * back. A brand new account therefore starts from nothing while the account
   * you come back to is restored exactly as it was left.
   */
  switchAccountScope: (scope: string) => void;
  /**
   * Set when the server reports this account / IP / device is banned.
   * Drives the full-screen block notice; the server also enforces it.
   */
  banned: boolean;
  setBanned: (b: boolean) => void;
  /**
   * Adopt the server's copy of the profile after the owner changed it
   * (marks, badges, tier, stars, nickname, cosmetics). Only fields the owner
   * controls are taken; local progress is never rolled back.
   */
  adoptServerProfile: (server: {
    marks: string[];
    badges: BadgeId[];
    tier: "Free" | "Premium";
    stars: number;
    nickname: string;
    phoneNumber: string | null;
    altNames: string[];
    bio: string | null;
    accent: string | null;
    gradient: string | null;
    nameGradient?: string | null;
    badgeGlow?: string | null;
    profileBanner?: string | null;
    avatarUrl?: string | null;
    /** owner-granted upgrade luck (100 = honest). Optional so older callers keep working. */
    upgradeLuck?: number;
  }) => void;
  /**
   * Last `owner_synced_at` this browser already applied. Adoption is skipped
   * when the row's stamp is unchanged, so a stale server row can never bring
   * back a tick the owner just removed here.
   */
  ownerSyncSeen: string | null;
  setOwnerSyncSeen: (stamp: string | null) => void;

  /**
   * Account id whose cloud save was already pulled into this browser. A fresh
   * device has no local progress, so it must download the cloud row *before*
   * anything is pushed up — otherwise the default 500★ overwrote the save.
   */
  cloudLoadedFor: string | null;
  setCloudLoadedFor: (id: string | null) => void;
  /**
   * Забрать кошелёк из облака (TON + срок Premium).
   *
   * TON только растёт: сервер тоже держит максимум, поэтому локальная
   * заработка не может быть затёрта устаревшим ответом. Premium применяется,
   * только если дата ещё впереди — истёкшая подписка не возвращается.
   */
  adoptWallet: (wallet: { ton?: number | null; premiumUntil?: number | null }) => void;

  /** Replace local progression with a downloaded cloud save. */
  adoptCloudSave: (save: {
    stars: number;
    inventory: unknown[];
    last_free_case: string | null;
    last_daily: string | null;
    joined_at: string | null;
    nickname: string;
    tier: "Free" | "Premium";
    marks: string[];
    badges: string[];
    phone_number: string | null;
    alt_names: string[];
    bio: string | null;
    accent: string | null;
    gradient: string | null;
    name_gradient?: string | null;
    badge_glow?: string | null;
    profile_banner?: string | null;
    avatar_url?: string | null;
  }) => void;
  /** verification marks: basic / premium / owner / crown */
  toggleMark: (mark: string) => void;

  // ---- actions: admin ----
  adminGrantStars: (n: number) => void;
  /** Выдать TON игроку (или себе) — вторая валюта тоже должна быть выдаваемой. */
  adminGrantTon: (n: number) => void;
  adminGrantAllGifts: () => void;
  adminGrantBadge: (badge: BadgeId) => void;
  adminRevokeBadge: (badge: BadgeId) => void;
  adminGrantPremium: (value: boolean) => void;
  adminClearInventory: () => void;
  adminReset: () => void;
  setAdmin: (patch: Partial<State["admin"]>) => void;

  // ---- actions: settings / stats ----
  toggleSetting: (key: keyof Settings) => void;
  bumpStat: (key: StatKey, by?: number) => void;

  // ---- toasts ----
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
};

const emptyStats: Record<StatKey, number> = {
  casesOpened: 0,
  upgradesWon: 0,
  upgradesLost: 0,
  marketBuys: 0,
  giftsSold: 0,
  crashWins: 0,
  minesWins: 0,
  pvpWins: 0,
  pvpLosses: 0,
  diceWins: 0,
  coinflipWins: 0,
  wheelWins: 0,
  towerWins: 0,
};

/* ------------------------------------------------------------- earners */
/**
 * «Удача дня» is the free, always-available earner that replaced the old
 * tap-clicker. One spin every `FORTUNE_COOLDOWN_MS`, no stake, pays a modest
 * random prize so a patient player keeps a small income without touching the
 * staked mini-games.
 */
export const FORTUNE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
/** prize buckets, most likely first */
export const FORTUNE_PRIZES = [25, 50, 75, 100, 150, 200, 300, 500, 1_000] as const;

export const initialState = {
  stars: 500,
  ton: 0,
  coins: 0,
  onlineUserId: null as string | null,
  banned: false,
  ownerSyncSeen: null as string | null,
  cloudLoadedFor: null as string | null,
  inventory: [] as InventoryItem[],
  pinOrder: [] as string[],
  premiumUntil: null as number | null,
  premiumPlan: null as PremiumPlanId | null,
  purchases: [] as PurchaseRecord[],
  tonOwned: [] as string[],
  tonTaken: {} as Record<string, string>,
  profile: {
    nickname: "telegup_user",
    customNickname: false,
    tier: "Free" as const,
    badge: null,
    badges: [] as BadgeId[],
    marks: [] as string[],
    anonymousNumber: false,
    phoneNumber: null,
    altNames: [] as string[],
    accent: null as string | null,
    gradient: null as string | null,
    nameGradient: null as string | null,
    badgeGlow: null as string | null,
    profileBanner: null as string | null,
    avatarUrl: null as string | null,
    bio: null as string | null,
    purchasedUsernames: [] as string[],
    purchasedNumbers: [] as string[],
    collectibleUsername: null,
    showInventory: true,
  },
  joinedAt: Date.now(),
  lastFreeCaseAt: null as number | null,
  lastDailyAt: null as number | null,
  lastFortuneAt: null as number | null,
  admin: {
    alwaysWinUpgrade: false,
    luckBoost: false,
    unlocked: false,
    payoutMultiplier: 100,
    upgradeLuck: 100,
    freeCases: false,
    noCooldown: false,
    maintenance: false,
    maintenanceNote: "Ведутся технические работы — скоро вернёмся",
    quietFrom: "",
    quietTo: "",
    discount: 0,
    // direct gift sales are on by default; the upgrade of a model is open too
    giftBuyEnabled: true,
    giftUpgradesEnabled: true,
    premiumBoost: true,
    adsEnabled: false,
    /** подарки, которые нельзя купить целиком — только улучшить */
    upgradeOnly: [] as string[],
  },
  settings: { sound: true, reduceMotion: false } as Settings,
  theme: DEFAULT_THEME as ThemeId,
  skin: DEFAULT_SKIN as SkinId,
  deviceMode: "auto" as DeviceMode,
  deviceChosen: false,
  stats: { ...emptyStats },
  shopItems: [] as PurchasedShopItem[],
  toasts: [] as Toast[],
};

/* ------------------------------------------------------------ +888 masks */

const PHONE_MASKS = [
  (d: string) => `+888 ${d.slice(0, 1)} ${d.slice(1, 4)}`,
  (d: string) => `+888 ${d.slice(0, 2)} ${d.slice(2, 5)}`,
  (d: string) => `+888 ${d.slice(0, 3)} ${d.slice(3, 6)}`,
  (d: string) => `+888 ${d.slice(0, 1)} ${d.slice(1, 3)} ${d.slice(3, 6)}`,
  (d: string) => `+888 ${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)}`,
  (d: string) => `+888 ${d.slice(0, 1)} ${d.slice(1, 4)} ${d.slice(4, 6)}`,
];

/** Named presets shown in the admin panel, e.g. «+888 X XXX» → "+888 8 888". */
export const PHONE_FORMATS: { id: string; label: string; pattern: string }[] = [
  { id: "x-xxx", label: "+888 X XXX", pattern: "+888 X XXX" },
  { id: "xx-xxx", label: "+888 XX XXX", pattern: "+888 XX XXX" },
  { id: "xxx-xxx", label: "+888 XXX XXX", pattern: "+888 XXX XXX" },
  { id: "x-xx-xxx", label: "+888 X XX XXX", pattern: "+888 X XX XXX" },
  { id: "xx-xx-xx", label: "+888 XX XX XX", pattern: "+888 XX XX XX" },
  { id: "x-xxx-xx", label: "+888 X XXX XX", pattern: "+888 X XXX XX" },
  { id: "plain", label: "+888", pattern: "+888" },
];

/** Where the free-form digits go inside a preset (6 digits total). */
function applyFormat(formatId: string, digits: string): string {
  const d = digits.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
  const groups: Record<string, number[]> = {
    "x-xxx": [1, 3],
    "xx-xxx": [2, 3],
    "xxx-xxx": [3, 3],
    "x-xx-xxx": [1, 2, 3],
    "xx-xx-xx": [2, 2, 2],
    "x-xxx-xx": [1, 3, 2],
    plain: [],
  };
  const sizes = groups[formatId] ?? [1, 3];
  const parts: string[] = [];
  let at = 0;
  for (const n of sizes) {
    parts.push(d.slice(at, at + n));
    at += n;
  }
  return ["+888", ...parts].join(" ");
}

/**
 * Format any user input into a +888 number.
 *
 * - `"+888 8 888"` / `"8888 888"` / `"8-888-123"` → keeps the digits and
 *   re-groups them with the preset's spacing.
 * - Anything without digits → a random number in that preset.
 * Always returns a string that starts with "+888", or "" for empty input.
 */
export function formatPhoneNumber(input: string, formatId = "x-xxx"): string {
  const trimmed = (input ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");
  // "+888" alone is a valid (empty) anonymous number
  if (!trimmed) return "";
  if (!digits || digits === "888") return applyFormat(formatId, randomDigits());
  // the leading 888 is the prefix, not part of the six free digits
  const body = digits.startsWith("888") && digits.length > 3 ? digits.slice(3) : digits;
  return applyFormat(formatId, body);
}

/** Random, Telegram-looking "+888 x xxx" style anonymous number. */
export function generateAnonymousNumber(): string {
  return PHONE_MASKS[randInt(PHONE_MASKS.length)](randomDigits());
}

function randomDigits(): string {
  let digits = "";
  for (let i = 0; i < 6; i++) digits += String(randInt(10));
  return digits;
}

/**
 * Fill in everything an older save did not have.
 *
 * Used by the persist migration and when a saved account slot is loaded
 * back, so a save from any build opens without a missing field.
 */
function normalizeProfile(p: Partial<Profile> | undefined): Profile {
  // Купленные номера. В старых сохранениях был только один — берём его, но
  // лишь если номер действительно включён: сгенерированный «обычный» номер
  // покупкой не считается.
  const numbers = Array.isArray(p?.purchasedNumbers)
    ? p.purchasedNumbers
    : p?.anonymousNumber && p?.phoneNumber
      ? [p.phoneNumber]
      : [];
  return {
    ...initialState.profile,
    ...(p ?? {}),
    badges: p?.badges ?? [],
    marks: Array.isArray(p?.marks) ? p.marks : [],
    purchasedUsernames: p?.purchasedUsernames ?? [],
    purchasedNumbers: numbers,
    // есть купленный номер → он и показывается в профиле, а не «обычный»
    anonymousNumber: numbers.length > 0 ? true : Boolean(p?.anonymousNumber),
    collectibleUsername: p?.collectibleUsername ?? null,
    phoneNumber: p?.phoneNumber ?? null,
    customNickname: Boolean(p?.customNickname),
    altNames: Array.isArray(p?.altNames) ? p.altNames : [],
    accent: p?.accent ?? null,
    gradient: p?.gradient ?? null,
    nameGradient: p?.nameGradient ?? null,
    badgeGlow: p?.badgeGlow ?? null,
    profileBanner: p?.profileBanner ?? null,
    avatarUrl: p?.avatarUrl ?? null,
    bio: p?.bio ?? null,
  };
}

/**
 * The state of a brand new account.
 *
 * Nothing is carried over from the account that was open before: the stars,
 * the gifts, the cosmetics and the nickname all start from scratch. Only the
 * device preferences (theme, sound, device, owner switches) are kept — they
 * belong to the browser, not to the player.
 */
function freshAccount(keep: State): Partial<State> {
  return {
    stars: initialState.stars,
    ton: 0,
    coins: 0,
    onlineUserId: null,
    cloudLoadedFor: null,
    ownerSyncSeen: null,
    banned: false,
    inventory: [],
    pinOrder: [],
    premiumUntil: null,
    premiumPlan: null,
    purchases: [],
    tonOwned: [],
    tonTaken: {},
    profile: normalizeProfile({
      ...initialState.profile,
      phoneNumber: generateAnonymousNumber(),
    }),
    joinedAt: Date.now(),
    lastFreeCaseAt: null,
    lastDailyAt: null,
    lastFortuneAt: null,
    stats: { ...emptyStats },
    shopItems: [],
    // the owner switches belong to the device, the luck boost to the account
    admin: { ...keep.admin, upgradeLuck: 100 },
    settings: keep.settings,
    theme: keep.theme,
    deviceMode: keep.deviceMode,
    deviceChosen: keep.deviceChosen,
    toasts: keep.toasts,
  };
}

/* ----------------------------------------------------------------- store */

export const useGame = create<State>()(
  persist(
    (set, get) => ({
      ...initialState,
      /** the account slot that is open right now */
      accountScope: getScope(),

      addStars: (n) => set((s) => ({ stars: s.stars + Math.round(n * earnRate(s)) })),
      spendStars: (n) => {
        if (n < 0) return false;
        if (get().stars < n) return false;
        set((s) => ({ stars: s.stars - n }));
        return true;
      },
      addCoins: (n) => set((s) => ({ coins: s.coins + n })),
      spendCoins: (n) => {
        if (get().coins < n) return false;
        set((s) => ({ coins: s.coins - n }));
        return true;
      },

      /**
       * TON never goes through `earnRate`: it is bought with real money, so a
       * payout multiplier or a «двойные звёзды» event must not create money
       * out of nothing. Amounts are rounded to 8 decimals to avoid 0.1+0.2.
       */
      addTon: (n) =>
        set((s) => ({ ton: Math.max(0, Math.round((s.ton + n) * 1e8) / 1e8) })),
      spendTon: (n) => {
        if (n < 0) return false;
        // a tiny epsilon so a balance of 0.3 can pay a price of 0.3
        if (get().ton + 1e-9 < n) return false;
        set((s) => ({ ton: Math.max(0, Math.round((s.ton - n) * 1e8) / 1e8) }));
        return true;
      },

      /**
       * Start or extend the subscription.
       *
       * «Продлить» is treated as an extension, not a replacement: the days are
       * added to whatever is left, or to today when the plan already lapsed.
       */
      grantPremium: (planId) =>
        set((s) => {
          const plan = PREMIUM_BY_ID[planId];
          if (!plan) return {};
          const base = Math.max(Date.now(), s.premiumUntil ?? 0);
          return {
            premiumUntil: base + plan.days * 24 * 60 * 60 * 1000,
            premiumPlan: planId,
            profile: {
              ...s.profile,
              tier: "Premium" as const,
              marks: s.profile.marks.includes("premium")
                ? s.profile.marks
                : [...s.profile.marks, "premium"],
            },
            shopItems: s.shopItems.includes("premium") ? s.shopItems : [...s.shopItems, "premium"],
          };
        }),

      /**
       * Выдать Premium на N дней.
       *
       * Промокод даёт именно дни, а не тариф: 7 дней = сдвиг даты на неделю.
       * Складывается с остатком, поэтому ввод двух кодов не сгорает.
       */
      grantPremiumDays: (days) =>
        set((s) => {
          const n = Math.max(1, Math.round(days));
          const base = Math.max(Date.now(), s.premiumUntil ?? 0);
          return {
            premiumUntil: base + n * 24 * 60 * 60 * 1000,
            profile: {
              ...s.profile,
              tier: "Premium" as const,
              marks: s.profile.marks.includes("premium")
                ? s.profile.marks
                : [...s.profile.marks, "premium"],
            },
            shopItems: s.shopItems.includes("premium")
              ? s.shopItems
              : [...s.shopItems, "premium"],
          };
        }),

      revokePremium: () =>
        set((s) => ({
          premiumUntil: null,
          premiumPlan: null,
          profile: {
            ...s.profile,
            tier: "Free" as const,
            marks: s.profile.marks.filter((m) => m !== "premium"),
          },
          shopItems: s.shopItems.filter((i) => i !== "premium"),
          // a lapsed subscription may not keep the extra pin slot
          inventory: s.inventory.map((i) =>
            i.pinned && s.pinOrder.indexOf(i.id) >= MAX_PINNED ? { ...i, pinned: false } : i,
          ),
          pinOrder: s.pinOrder.slice(0, MAX_PINNED),
        })),

      /**
       * Снять подписку, если срок вышел.
       *
       * Premium — это дата (`premiumUntil`), но тир и галочка лежат отдельными
       * полями и сами не гаснут. Поэтому при каждом запуске и раз в минуту
       * приложение сверяет дату: если она в прошлом — подписка реально
       * пропадает вместе с четвёртым закрепом.
       */
      syncPremium: () => {
        const { premiumUntil } = get();
        // датированная подписка истекла; выданная владельцем без даты — нет
        if (typeof premiumUntil === "number" && premiumUntil <= Date.now()) {
          get().revokePremium();
        }
      },

      buyPremium: (planId, pay) => {
        const plan = PREMIUM_BY_ID[planId];
        if (!plan) return { ok: false, reason: "unknown" };
        const { discount } = get().admin;
        const cost =
          pay === "ton"
            ? { stars: 0, ton: discountTon(plan.ton, discount) }
            : { stars: salePrice(plan.stars, discount), ton: 0 };
        const paid = cost.ton > 0 ? get().spendTon(cost.ton) : get().spendStars(cost.stars);
        if (!paid) return { ok: false, reason: pay === "ton" ? "ton" : "stars" };
        get().grantPremium(planId);
        get().recordPurchase(`premium:${planId}`, `Premium · ${plan.name}`, cost);
        return { ok: true };
      },

      buyStars: (packId) => {
        const pack = STAR_PACK_BY_ID[packId];
        if (!pack) return { ok: false, reason: "unknown" };
        const price = discountTon(pack.ton, get().admin.discount);
        if (!get().spendTon(price)) return { ok: false, reason: "ton" };
        // купленные звёзды точные: ни множителя, ни премиум-бонуса
        set((s) => ({ stars: s.stars + pack.stars }));
        get().recordPurchase(`stars:${pack.id}`, `${pack.stars.toLocaleString("ru-RU")} ★`, {
          stars: 0,
          ton: price,
        });
        return { ok: true };
      },

      buyTon: (topUpId) => {
        const top = TON_TOPUPS.find((t) => t.id === topUpId);
        if (!top) return { ok: false, reason: "unknown" };
        const price = salePrice(top.stars, get().admin.discount);
        if (!get().spendStars(price)) return { ok: false, reason: "stars" };
        get().addTon(top.ton);
        get().recordPurchase(`ton-topup:${top.id}`, `Пополнение ${top.ton} TON`, {
          stars: price,
          ton: 0,
        });
        return { ok: true };
      },

      buyCombo: (comboId, pay) => {
        const pack = COMBO_BY_ID[comboId];
        if (!pack) return { ok: false, reason: "unknown" };
        const { discount } = get().admin;
        const cost =
          pay === "ton"
            ? { stars: 0, ton: discountTon(pack.ton, discount) }
            : { stars: salePrice(pack.stars, discount), ton: 0 };
        const paid = cost.ton > 0 ? get().spendTon(cost.ton) : get().spendStars(cost.stars);
        if (!paid) return { ok: false, reason: pay === "ton" ? "ton" : "stars" };

        // предметы набора идут с источником «combo» — их нельзя продать и
        // подарить, поэтому набор не превращается в печатный станок звёзд
        const granted = pack.giftIds.filter((id) => giftOf(id));
        for (const giftId of granted) get().addItem(giftId, "combo");
        if (pack.bonus > 0) set((s) => ({ stars: s.stars + pack.bonus }));

        get().recordPurchase(
          `combo:${pack.id}`,
          `${pack.name} · ${granted.length} подарков + ${pack.bonus.toLocaleString("ru-RU")} ★`,
          cost,
        );
        return { ok: true };
      },

      buyTonItem: (item) => {
        const s = get();
        if (s.tonOwned.includes(item.id)) return { ok: false, reason: "owned" };
        if (s.tonTaken[item.id]) return { ok: false, reason: "taken" };
        // списание и выдача — в одном действии, отказа быть не может
        if (!get().spendTon(item.ton)) return { ok: false, reason: "ton" };

        if (item.kind === "username") {
          const name = item.label.replace(/^@/, "");
          set((st) => ({
            profile: {
              ...st.profile,
              purchasedUsernames: st.profile.purchasedUsernames.includes(name)
                ? st.profile.purchasedUsernames
                : [...st.profile.purchasedUsernames, name],
            },
          }));
        } else {
          set((st) => ({
            profile: {
              ...st.profile,
              phoneNumber: item.label,
              // любой купленный номер заменяет обычный — иначе профиль
              // продолжал бы писать «обычный номер» после покупки
              anonymousNumber: true,
              purchasedNumbers: st.profile.purchasedNumbers.includes(item.label)
                ? st.profile.purchasedNumbers
                : [...st.profile.purchasedNumbers, item.label],
            },
          }));
        }

        set((st) => ({ tonOwned: [...st.tonOwned.filter((k) => k !== item.id), item.id] }));
        get().recordPurchase(`ton:${item.id}`, item.label, { stars: 0, ton: item.ton });
        return { ok: true };
      },

      setTonTaken: (claims) => set({ tonTaken: claims }),

      /** One receipt row, newest first, capped — the only bookkeeping left. */
      recordPurchase: (sku, label, paid) =>
        set((s) => ({
          purchases: [
            { id: uid("ord"), sku, label, paid, at: Date.now() },
            ...s.purchases,
          ].slice(0, 60),
        })),

      redeemPromo: (code) => {
        const scope = get().onlineUserId ?? get().accountScope ?? "guest";
        const res = checkPromo(code, scope);
        if (!res.ok) return res;
        const { promo } = res;

        if (promo.kind === "stars") {
          set((s) => ({ stars: s.stars + promo.amount }));
        } else if (promo.kind === "ton") {
          get().addTon(promo.amount);
        } else {
          get().grantPremiumDays(promo.amount);
        }

        consumePromo(promo.code, scope);
        get().recordPurchase(`promo:${promo.code}`, `Промокод ${promo.code}`, { stars: 0, ton: 0 });
        return res;
      },

      fortuneReadyIn: () => {
        const { lastFortuneAt, admin } = get();
        if (admin.freeCases || admin.noCooldown) return 0;
        if (!lastFortuneAt) return 0;
        return Math.max(0, lastFortuneAt + FORTUNE_COOLDOWN_MS - Date.now());
      },

      spinFortune: () => {
        const s = get();
        if (s.fortuneReadyIn() > 0) return 0;
        // weight the low end of the table so a spin feels honest but modest
        const weights = FORTUNE_PRIZES.map((_, i) => Math.pow(0.62, i));
        const total = weights.reduce((a, w) => a + w, 0);
        let r = Math.random() * total;
        let idx = 0;
        for (let i = 0; i < weights.length; i++) {
          r -= weights[i];
          if (r <= 0) {
            idx = i;
            break;
          }
        }
        const base = FORTUNE_PRIZES[idx];
        const prize = Math.max(1, Math.round(base * earnRate(s)));
        set({ lastFortuneAt: Date.now(), stars: s.stars + prize });
        return prize;
      },

      addItem: (giftId, source) => {
        const item: InventoryItem = {
          id: uid("inv"),
          giftId,
          acquiredAt: Date.now(),
          source,
        };
        set((s) => ({ inventory: [item, ...s.inventory] }));
        return item;
      },

      removeItem: (instanceId) => {
        const exists = get().inventory.some((i) => i.id === instanceId);
        if (!exists) return false;
        set((s) => ({ inventory: s.inventory.filter((i) => i.id !== instanceId) }));
        return true;
      },

      sellItem: (instanceId) => {
        const item = get().inventory.find((i) => i.id === instanceId);
        if (!item) return 0;
        // наборный предмет не продаётся: иначе набор был бы печатным станком
        if (item.source === "combo") return 0;
        const gift = giftOf(item.giftId);
        if (!gift) return 0;
        const gain = Math.round(gift.stars * earnRate(get()));
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== instanceId),
          stars: s.stars + gain,
          stats: { ...s.stats, giftsSold: s.stats.giftsSold + 1 },
        }));
        return gain;
      },

      sellAll: (filter) => {
        const { inventory } = get();
        const factor = earnRate(get());
        const kept: InventoryItem[] = [];
        let count = 0;
        let stars = 0;
        for (const item of inventory) {
          const gift = giftOf(item.giftId);
          // «продать всё» тоже уважает наборы: они остаются в инвентаре
          const matches =
            gift && item.source !== "combo" && (filter ? filter(item.giftId) : true);
          if (!matches) {
            kept.push(item);
            continue;
          }
          count++;
          stars += Math.round(gift.stars * factor);
        }
        if (!count) return { count: 0, stars: 0 };
        set((s) => ({
          inventory: kept,
          stars: s.stars + stars,
          stats: { ...s.stats, giftsSold: s.stats.giftsSold + count },
        }));
        return { count, stars };
      },

      togglePin: (instanceId) => {
        const item = get().inventory.find((i) => i.id === instanceId);
        if (!item) return false;
        const cap = pinCap(get().premiumUntil);
        if (!item.pinned && get().inventory.filter((i) => i.pinned).length >= cap) return false;
        const next = !item.pinned;
        set((s) => {
          // порядок нормализуем: закрепы из старых сейвов тоже должны попасть
          // в список, иначе они сортируются «в конце» и их не переставить
          const order = pinnedOrderOf(s).filter((id) => id !== instanceId);
          return {
            inventory: s.inventory.map((i) => (i.id === instanceId ? { ...i, pinned: next } : i)),
            // the strip order is its own list, so a new pin always lands last
            pinOrder: next ? [...order, instanceId] : order,
          };
        });
        return next;
      },

      /**
       * Move a pinned gift one slot. Bounded on both sides: the first item
       * cannot move up and the last cannot move down, so the order a player set
       * is never shuffled into something unexpected.
       *
       * Порядок сначала нормализуется (`pinnedOrderOf`): без этого закрепы,
       * которых нет в `pinOrder`, не находились по `indexOf` и перестановка
       * тихо ничего не делала.
       */
      movePin: (instanceId, dir) => {
        const order = pinnedOrderOf(get());
        const to = order.indexOf(instanceId) + dir;
        const at = order.indexOf(instanceId);
        if (at < 0 || to < 0 || to >= order.length) return;
        [order[at], order[to]] = [order[to], order[at]];
        set({ pinOrder: order });
      },

      setPinOrder: (ids) => {
        const pinned = get().inventory.filter((i) => i.pinned);
        const allowed = new Set(pinned.map((i) => i.id));
        const clean: string[] = [];
        for (const id of ids) if (allowed.has(id) && !clean.includes(id)) clean.push(id);
        // закреп, который не пришёл в списке, не теряем — уходит в конец
        for (const item of pinned) if (!clean.includes(item.id)) clean.push(item.id);
        set({ pinOrder: clean });
      },

      giftItem: (instanceId) => {
        const item = get().inventory.find((i) => i.id === instanceId);
        if (!item) return;
        // наборный подарок нельзя передать — только оставить себе
        if (item.source === "combo") return;
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== instanceId),
          stats: { ...s.stats, giftsSold: s.stats.giftsSold + 1 },
        }));
      },

      upgradeItemModel: (instanceId, targetGiftId) => {
        const source = get().inventory.find((i) => i.id === instanceId);
        if (!source) return null;
        const target = giftOf(targetGiftId);
        if (!target || target.slug !== giftOf(source.giftId)?.slug) return null;
        const next: InventoryItem = {
          id: uid("inv"),
          giftId: targetGiftId,
          acquiredAt: Date.now(),
          // апгрейд наборного подарка остаётся наборным, иначе его можно было
          // бы «отмыть» в продаваемый и напечатать звёзды
          source: source.source === "combo" ? "combo" : "upgrade",
        };
        set((s) => ({
          inventory: [next, ...s.inventory.filter((i) => i.id !== instanceId)],
          stats: { ...s.stats, upgradesWon: s.stats.upgradesWon + 1 },
        }));
        return next;
      },

      loseItemOnUpgrade: (instanceId) =>
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== instanceId),
          stats: { ...s.stats, upgradesLost: s.stats.upgradesLost + 1 },
        })),

      /**
       * 100% successful model upgrade with a random result.
       *
       * The draw never reaches for a model the player cannot pay for, so the
       * button cannot silently fail with a "нужно 55 000★" wall: the ceiling is
       * the priciest model the current balance covers, and `rollModelUpgrade`
       * biases the pick towards the closest steps under that ceiling. The price
       * is the value gap to whatever dropped, so a guaranteed roll is a skin
       * purchase — never a lottery ticket, and never a way to print stars.
       */
      guaranteedUpgrade: (instanceId) => {
        const s = get();
        const item = s.inventory.find((i) => i.id === instanceId);
        if (!item) return { ok: false, reason: "missing" };
        if (!s.admin.giftUpgradesEnabled) return { ok: false, reason: "disabled" };
        const from = giftOf(item.giftId);
        if (!from) return { ok: false, reason: "missing" };

        // strictly better models only: a «гарантированный апгрейд» must never
        // hand out a cheaper skin of the same collectible
        const pool = allGifts().filter(
          (g) => g.slug === from.slug && g.kind === "model" && g.id !== from.id && g.stars > from.stars,
        );
        if (!pool.length) return { ok: false, reason: "top" };

        const priced = pool.map((g) => ({ gift: g, cost: guaranteePrice(g.stars - from.stars) }));
        const cheapest = priced.reduce((a, b) => (b.cost < a.cost ? b : a));
        if (s.stars < cheapest.cost) {
          return { ok: false, reason: "stars", cost: cheapest.cost, targetGiftId: cheapest.gift.id };
        }
        // highest model this balance can actually pay for
        const ceiling = priced
          .filter((x) => x.cost <= s.stars)
          .reduce((a, b) => (b.gift.stars > a.gift.stars ? b : a));
        const target = rollModelUpgrade(from, ceiling.gift.stars, pool) ?? ceiling.gift;

        const cost = guaranteePrice(target.stars - from.stars);
        const next: InventoryItem = {
          id: uid("inv"),
          giftId: target.id,
          acquiredAt: Date.now(),
          source: item.source === "combo" ? "combo" : "upgrade",
        };
        set((st) => ({
          stars: st.stars - cost,
          inventory: [next, ...st.inventory.filter((i) => i.id !== instanceId)],
          pinOrder: st.pinOrder.filter((id) => id !== instanceId),
          stats: { ...st.stats, upgradesWon: st.stats.upgradesWon + 1 },
        }));
        return { ok: true, cost, targetGiftId: target.id, item: next };
      },

      craftItems: (instanceIds) => {
        const s = get();
        const items = instanceIds
          .map((id) => s.inventory.find((i) => i.id === id))
          .filter((i): i is InventoryItem => Boolean(i));
        if (items.length < 2) return { ok: false, reason: "too-few" };
        if (items.length > 4) return { ok: false, reason: "mismatch" };

        const source = giftOf(items[0].giftId);
        if (!source) return { ok: false, reason: "missing" };
        // every item must be the same collectible (the same slug)
        if (!items.every((i) => giftOf(i.giftId)?.slug === source.slug)) {
          return { ok: false, reason: "mismatch" };
        }

        // consume the inputs no matter what the roll does
        const idSet = new Set(items.map((i) => i.id));

        // more items → better odds: 2→40%, 3→60%, 4→80%
        const winOdds = 0.4 + (items.length - 2) * 0.2;
        const success = Math.random() < winOdds;

        if (!success) {
          set((cur) => ({
            inventory: cur.inventory.filter((i) => !idSet.has(i.id)),
            stats: { ...cur.stats, giftsSold: cur.stats.giftsSold + items.length },
          }));
          return { ok: false, reason: "burned" };
        }

        // pick a better model of the same collectible — the next value step up
        const catalogue = allGifts();
        const sameModel = catalogue.filter(
          (g) => g.slug === source.slug && g.kind === "model" && g.stars > source.stars,
        );
        let target = sameModel.length
          ? pick(sameModel.sort((a, b) => a.stars - b.stars).slice(0, 2))
          : null;

        // nothing better in the same collectible → roll a random gift of a
        // higher rarity (a true "crafted" reward)
        if (!target) {
          const idx = RARITY_ORDER.indexOf(source.rarity);
          const higherRarities = RARITY_ORDER.slice(Math.max(0, idx + 1));
          const pool = catalogue.filter(
            (g) => g.kind === "gift" && higherRarities.includes(g.rarity),
          );
          target = pool.length ? pick(pool) : pick(catalogue.filter((g) => g.stars > source.stars));
        }
        if (!target) {
          set((cur) => ({ inventory: cur.inventory.filter((i) => !idSet.has(i.id)) }));
          return { ok: false, reason: "burned" };
        }

        const crafted: InventoryItem = {
          id: uid("inv"),
          giftId: target.id,
          acquiredAt: Date.now(),
          // если в крафт ушли наборные подарки, результат тоже наборный
          source: items.some((i) => i.source === "combo") ? "combo" : "craft",
        };
        set((cur) => ({
          inventory: [crafted, ...cur.inventory.filter((i) => !idSet.has(i.id))],
          stats: { ...cur.stats, upgradesWon: cur.stats.upgradesWon + 1 },
        }));
        return { ok: true, item: crafted };
      },

      freeCaseReadyAt: () => {
        const { lastFreeCaseAt, admin } = get();
        if (admin.freeCases || admin.noCooldown) return 0;
        if (!lastFreeCaseAt) return 0;
        return Math.max(0, lastFreeCaseAt + FREE_CASE_COOLDOWN_MS - Date.now());
      },
      claimFreeCaseCooldown: () => {
        if (get().admin.noCooldown) return;
        set({ lastFreeCaseAt: Date.now() });
      },

      buyUsername: (username, price) => {
        const { profile, stars } = get();
        if (stars < price) return false;
        if (profile.purchasedUsernames.includes(username)) return false;
        set((s) => ({
          stars: s.stars - price,
          profile: {
            ...s.profile,
            nickname: username,
            customNickname: true,
            purchasedUsernames: [...s.profile.purchasedUsernames, username],
          },
        }));
        return true;
      },

      sellUsername: (username, price) => {
        const { profile } = get();
        if (!profile.purchasedUsernames.includes(username)) return false;
        // can't sell the name you are currently using
        if (profile.nickname === username) return false;
        const gain = Math.max(1, Math.round(price * earnRate(get())));
        set((s) => ({
          stars: s.stars + gain,
          profile: {
            ...s.profile,
            purchasedUsernames: s.profile.purchasedUsernames.filter((u) => u !== username),
            collectibleUsername:
              s.profile.collectibleUsername === username ? null : s.profile.collectibleUsername,
          },
          stats: { ...s.stats, giftsSold: s.stats.giftsSold + 1 },
        }));
        return true;
      },

      buyShopItem: (id, price) => {
        const { shopItems, stars, profile } = get();
        if (stars < price) return false;
        if (shopItems.includes(id)) return false;
        const nextProfile: Profile = {
          ...profile,
          tier: id === "premium" ? "Premium" : profile.tier,
          anonymousNumber: id === "anonymous" ? true : profile.anonymousNumber,
          phoneNumber:
            id === "anonymous" ? profile.phoneNumber ?? generateAnonymousNumber() : profile.phoneNumber,
          badge: id === "badge" ? "Основатель" : profile.badge,
          badges:
            id === "badge" && !profile.badges.includes("founder")
              ? [...profile.badges, "founder"]
              : profile.badges,
          collectibleUsername:
            id === "second-username" ? profile.collectibleUsername ?? profile.purchasedUsernames[0] ?? null : profile.collectibleUsername,
        };
        set((s) => ({
          stars: s.stars - price,
          shopItems: [...s.shopItems, id],
          profile: nextProfile,
        }));
        return true;
      },

      setNickname: (name) =>
        set((s) => {
          const clean = name.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
          return { profile: { ...s.profile, nickname: clean, customNickname: true } };
        }),

      adoptNickname: (name) =>
        set((s) => {
          if (s.profile.customNickname) return {};
          const clean = name.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
          if (!clean) return {};
          return { profile: { ...s.profile, nickname: clean } };
        }),

      setMainUsername: (username) => {
        const { profile } = get();
        if (!profile.purchasedUsernames.includes(username)) return false;
        // don't allow the same name for both slots
        const collectible = profile.collectibleUsername === username ? null : profile.collectibleUsername;
        set((s) => ({ profile: { ...s.profile, nickname: username, customNickname: true, collectibleUsername: collectible } }));
        return true;
      },

      setCollectibleUsername: (username) =>
        set((s) => {
          if (username && username === s.profile.nickname) return {};
          return { profile: { ...s.profile, collectibleUsername: username } };
        }),

      /**
       * Переключение активного номера.
       *
       * Купленных номеров может быть несколько (все они лежат в
       * `purchasedNumbers`), а на профиле виден один — как основной ник.
       * `null` возвращает обычный номер.
       */
      setMainNumber: (label) => {
        if (label !== null && !get().profile.purchasedNumbers.includes(label)) return false;
        set((s) => ({
          profile: {
            ...s.profile,
            phoneNumber: label ?? s.profile.phoneNumber,
            anonymousNumber: Boolean(label),
          },
        }));
        return true;
      },

      setAnonymousNumber: (value) =>
        set((s) => ({
          profile: {
            ...s.profile,
            anonymousNumber: value,
            phoneNumber: value ? s.profile.phoneNumber ?? generateAnonymousNumber() : s.profile.phoneNumber,
          },
        })),

      adminSetPhoneNumber: (value) =>
        set((s) => {
          const clean = value === null ? null : formatPhoneNumber(value);
          return {
            profile: {
              ...s.profile,
              phoneNumber: clean,
              anonymousNumber: Boolean(clean),
            },
          };
        }),

      setAltNames: (names) =>
        set((s) => ({
          profile: {
            ...s.profile,
            altNames: names
              .map((n) => n.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, ""))
              .filter(Boolean)
              .slice(0, 4),
          },
        })),

      setAccent: (accent, gradient) =>
        set((s) => ({ profile: { ...s.profile, accent, gradient } })),

      setCosmetics: (patch) =>
        set((s) => ({
          profile: {
            ...s.profile,
            ...(patch.nameGradient !== undefined ? { nameGradient: patch.nameGradient } : {}),
            ...(patch.badgeGlow !== undefined ? { badgeGlow: patch.badgeGlow } : {}),
            ...(patch.profileBanner !== undefined ? { profileBanner: patch.profileBanner } : {}),
          },
        })),

      setBio: (bio) => set((s) => ({ profile: { ...s.profile, bio: bio?.slice(0, 60) ?? null } })),

      setAvatar: (url) => set((s) => ({ profile: { ...s.profile, avatarUrl: url || null } })),

      setShowInventory: (show) =>
        set((s) => ({ profile: { ...s.profile, showInventory: show } })),

      adminClearCosmetics: () =>
        set((s) => ({
          profile: {
            ...s.profile,
            accent: null,
            gradient: null,
            nameGradient: null,
            badgeGlow: null,
            profileBanner: null,
            avatarUrl: null,
            bio: null,
            altNames: [],
          },
        })),

      toggleMark: (mark) =>
        set((s) => {
          const on = s.profile.marks.includes(mark);
          const marks = on
            ? s.profile.marks.filter((m) => m !== mark)
            : [...s.profile.marks, mark];
          // the premium mark and the premium tier are the same thing: switching
          // one off has to drop the tier too, otherwise the tick comes back
          // from `<CheckMark kind="premium" />` in every header
          if (mark !== "premium") return { profile: { ...s.profile, marks } };
          return {
            profile: { ...s.profile, marks, tier: on ? ("Free" as const) : ("Premium" as const) },
            shopItems: on ? s.shopItems.filter((i) => i !== "premium") : s.shopItems,
          };
        }),

      setOnlineUserId: (id) => set({ onlineUserId: id }),
      setBanned: (b) => set({ banned: b }),
      setOwnerSyncSeen: (stamp) => set({ ownerSyncSeen: stamp }),

      /**
       * Open another account's local slot.
       *
       * The order matters a lot:
       *   1. the save that is on screen belongs to the account that is open
       *      now — it is flushed into that slot, so the account you leave
       *      keeps every star, gift and cosmetic;
       *   2. what the other account left in this browser is read back;
       *   3. only then the storage is pointed at the new slot, so the state
       *      that is written next lands in the right place.
       *
       * A brand new account has no slot of its own, so it starts from the
       * fresh baseline — nothing of the previous account is carried over.
       *
       * The cloud copy of the account is *not* pulled again here: the slot
       * already holds this account's save, and a stale server row would
       * overwrite gifts the player has not pushed yet. The pull happens once
       * per account, the first time this browser sees it.
       */
      switchAccountScope: (scope) => {
        const state = get();
        if (state.accountScope === scope) return;

        // 1. the current save belongs to the slot that is open now
        const opts = useGame.persist.getOptions();
        if (opts.partialize && opts.storage) {
          opts.storage.setItem(STORE_KEY, {
            state: opts.partialize({ ...state }),
            version: opts.version ?? 0,
          });
        }

        // 2. what did the other account leave behind in this browser?
        const saved = readAccountState(scope);
        const restored = saved
          ? ({
              ...saved,
              profile: normalizeProfile(saved.profile as Partial<Profile> | undefined),
              stats: { ...emptyStats, ...((saved.stats as object) ?? {}) },
            } as unknown as Partial<State>)
          : null;

        // 3. from here on every write goes into the new slot
        setScope(scope);

        // 4. a new account starts from nothing, the old one gets its save back
        set({
          ...freshAccount(state),
          ...(restored ?? {}),
          // the device preferences belong to the browser, not to the account
          settings: state.settings,
          theme: state.theme,
          deviceMode: state.deviceMode,
          deviceChosen: state.deviceChosen,
          toasts: state.toasts,
          accountScope: scope,
        });
      },

      cloudLoadedFor: null as string | null,
      setCloudLoadedFor: (id) => set({ cloudLoadedFor: id }),

      adoptWallet: (wallet) =>
        set((s) => {
          const cloudTon = Math.max(0, Number(wallet.ton ?? 0) || 0);
          const until = Number(wallet.premiumUntil ?? 0) || 0;
          const alive = until > Date.now();
          const premiumUntil = alive
            ? Math.max(until, s.premiumUntil ?? 0)
            : s.premiumUntil;
          const marks = alive && !s.profile.marks.includes("premium")
            ? [...s.profile.marks, "premium" as const]
            : s.profile.marks;
          return {
            ton: Math.max(s.ton, cloudTon),
            premiumUntil,
            profile: alive
              ? { ...s.profile, tier: "Premium" as const, marks }
              : s.profile,
          };
        }),

      adoptCloudSave: (save) =>
        set((s) => {
          const inv = (save.inventory ?? []).filter(
            (i): i is InventoryItem =>
              Boolean(i) &&
              typeof (i as InventoryItem).giftId === "string" &&
              // keep custom ids even before the catalogue has loaded, otherwise
              // a cloud pull would silently drop owner-made gifts
              (Boolean(giftOf((i as InventoryItem).giftId)) ||
                (i as InventoryItem).giftId.startsWith("custom-")),
          );
          const marks = [...(save.marks ?? [])];
          if (save.tier === "Premium" && !marks.includes("premium")) marks.push("premium");
          // Never let a stale server pull wipe stars the player just earned
          // locally (a fortune spin / case / minigame win has not been pushed
          // yet). Local is the player's own balance; the pull may only raise
          // it (owner grant) — never lower it below what is already on screen.
          const cloudStars = Math.max(0, Math.round(save.stars ?? s.stars));
          // Same rule for the inventory: an empty cloud list must not erase the
          // gifts sitting in this browser. Older builds pushed the counters but
          // never the jsonb, so a real collection lived only locally — adopting
          // `[]` on every load looked like "все подарки пропали". Only take the
          // server copy when it is non-empty (a genuine save from another
          // device), otherwise keep what we have.
          const cloudInv = inv.length > 0 ? inv : s.inventory;
          return {
            stars: Math.max(s.stars, cloudStars),
            inventory: cloudInv,
            joinedAt: save.joined_at ? new Date(save.joined_at).getTime() : s.joinedAt,
            lastFreeCaseAt: save.last_free_case ? new Date(save.last_free_case).getTime() : s.lastFreeCaseAt,
            lastDailyAt: save.last_daily ? new Date(save.last_daily).getTime() : s.lastDailyAt,
            profile: {
              ...s.profile,
              tier: save.tier ?? s.profile.tier,
              marks,
              badges: (save.badges ?? s.profile.badges) as BadgeId[],
              nickname:
                s.profile.customNickname || !save.nickname ? s.profile.nickname : save.nickname,
              phoneNumber: save.phone_number ?? s.profile.phoneNumber,
              anonymousNumber: save.phone_number ? true : s.profile.anonymousNumber,
              altNames: save.alt_names ?? s.profile.altNames,
              bio: save.bio ?? s.profile.bio,
              accent: save.accent ?? s.profile.accent,
              gradient: save.gradient ?? s.profile.gradient,
              nameGradient: save.name_gradient ?? s.profile.nameGradient,
              badgeGlow: save.badge_glow ?? s.profile.badgeGlow,
              profileBanner: save.profile_banner ?? s.profile.profileBanner,
              avatarUrl: save.avatar_url ?? s.profile.avatarUrl,
            },
          };
        }),

      adoptServerProfile: (server) =>
        set((s) => {
          const marks = [...server.marks];
          // Premium is one thing: the tier and the tick always travel together
          if (server.tier === "Premium" && !marks.includes("premium")) marks.push("premium");
          const sameMarks =
            marks.length === s.profile.marks.length &&
            marks.every((m) => s.profile.marks.includes(m));
          const sameBadges =
            server.badges.length === s.profile.badges.length &&
            server.badges.every((b) => s.profile.badges.includes(b));
          const sameAlt =
            server.altNames.length === s.profile.altNames.length &&
            server.altNames.every((n) => s.profile.altNames.includes(n));
          const sameStars = Math.round(server.stars) === Math.round(s.stars);
          const sameNick = server.nickname === s.profile.nickname;
          const sameLuck =
            server.upgradeLuck === undefined || (server.upgradeLuck || 100) === s.admin.upgradeLuck;
          const samePhone = (server.phoneNumber ?? null) === (s.profile.phoneNumber ?? null);
          const sameCosmetics =
            server.bio === s.profile.bio &&
            server.accent === s.profile.accent &&
            server.gradient === s.profile.gradient &&
            (server.nameGradient === undefined || server.nameGradient === s.profile.nameGradient) &&
            (server.badgeGlow === undefined || server.badgeGlow === s.profile.badgeGlow) &&
            (server.profileBanner === undefined || server.profileBanner === s.profile.profileBanner) &&
            (server.avatarUrl === undefined || server.avatarUrl === s.profile.avatarUrl);

          // nothing changed: keep the same object so React does not re-render
          if (
            sameMarks &&
            sameBadges &&
            sameAlt &&
            sameStars &&
            sameNick &&
            samePhone &&
            sameCosmetics &&
            sameLuck &&
            server.tier === s.profile.tier
          ) {
            return {};
          }

          return {
            // stars may only grow from a pull: a stale row (still 1500 while
            // the local balance is already 1600 from a fresh win) must never
            // drag the on-screen balance back down.
            stars: Math.max(s.stars, Math.round(server.stars)),
            profile: {
              ...s.profile,
              tier: server.tier,
              marks,
              badges: sameBadges ? s.profile.badges : server.badges,
              // the server name only wins when the player never renamed
              nickname: sameNick || s.profile.customNickname ? s.profile.nickname : server.nickname,
              phoneNumber: server.phoneNumber
                ? // номер приходит с сервера только из админки; купленные в
                  // TON-маркете лежат локально и не должны затираться пустым полем
                  server.phoneNumber
                : s.profile.phoneNumber,
              anonymousNumber: server.phoneNumber ? true : s.profile.anonymousNumber,
              altNames: sameAlt ? s.profile.altNames : server.altNames,
              bio: server.bio,
              accent: server.accent,
              gradient: server.gradient,
              nameGradient: server.nameGradient ?? s.profile.nameGradient,
              badgeGlow: server.badgeGlow ?? s.profile.badgeGlow,
              profileBanner: server.profileBanner ?? s.profile.profileBanner,
              avatarUrl: server.avatarUrl ?? s.profile.avatarUrl,
            },
            // luck is a pure owner grant: whatever the server says wins, and
            // a normal 100 is written too so a revoked boost actually drops.
            ...(server.upgradeLuck === undefined
              ? {}
              : { admin: { ...s.admin, upgradeLuck: server.upgradeLuck || 100 } }),
          };
        }),

      adminGrantStars: (n) => set((s) => ({ stars: Math.max(0, s.stars + n) })),
      /**
       * TON выдаётся так же, как звёзды: вручную, любому игроку.
       *
       * Округление до 8 знаков — то же, что в `addTon`, чтобы 0.1 + 0.2 не
       * превращалось в 0.30000000000000004 в кошельке.
       */
      adminGrantTon: (n) =>
        set((s) => ({ ton: Math.max(0, Math.round((s.ton + n) * 1e8) / 1e8) })),
      adminGrantAllGifts: () =>
        set((s) => {
          const now = Date.now();
          const added: InventoryItem[] = allGifts().map((g) => ({
            id: uid("inv"),
            giftId: g.id,
            acquiredAt: now,
            source: "admin",
          }));
          return { inventory: [...added, ...s.inventory] };
        }),
      adminGrantBadge: (badge) =>
        set((s) =>
          s.profile.badges.includes(badge)
            ? {}
            : { profile: { ...s.profile, badges: [...s.profile.badges, badge] } },
        ),
      adminRevokeBadge: (badge) =>
        set((s) => ({ profile: { ...s.profile, badges: s.profile.badges.filter((b) => b !== badge) } })),
      adminGrantPremium: (value) =>
        set((s) => {
          const shopItems = value
            ? s.shopItems.includes("premium")
              ? s.shopItems
              : [...s.shopItems, "premium" as PurchasedShopItem]
            : s.shopItems.filter((i) => i !== "premium");
          return {
            profile: {
              ...s.profile,
              tier: value ? ("Premium" as const) : ("Free" as const),
              // keep the stored mark in sync — it is what the profile reads
              marks: value
                ? s.profile.marks.includes("premium")
                  ? s.profile.marks
                  : [...s.profile.marks, "premium"]
                : s.profile.marks.filter((m) => m !== "premium"),
            },
            shopItems,
          };
        }),
      adminClearInventory: () => set({ inventory: [] }),
      adminReset: () => {
        const keepToasts = get().toasts;
        const newPhone = generateAnonymousNumber();
        set({
          ...initialState,
          joinedAt: Date.now(),
          profile: {
            ...initialState.profile,
            phoneNumber: newPhone,
            // the owner's decoration is a grant, not progress: a reset must not
            // take away a gradient someone paid attention to set up
            nameGradient: get().profile.nameGradient,
            badgeGlow: get().profile.badgeGlow,
            profileBanner: get().profile.profileBanner,
          },
          toasts: keepToasts,
        });
      },
      setAdmin: (patch) => set((s) => ({ admin: { ...s.admin, ...patch } })),

      toggleSetting: (key) => set((s) => ({ settings: { ...s.settings, [key]: !s.settings[key] } })),
      setTheme: (id) => set({ theme: id }),
      setSkin: (id) => set({ skin: id }),
      setDeviceMode: (m) => set({ deviceMode: m }),
      chooseDevice: (m) => set({ deviceMode: m, deviceChosen: true }),
      bumpStat: (key, by = 1) => set((s) => ({ stats: { ...s.stats, [key]: s.stats[key] + by } })),

      toast: (t) => {
        const id = uid("t");
        set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-3) }));
        window.setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
        }, 3600);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: STORE_KEY,
      // 5 → 6: в 5-м сохранении ещё не было полей `upgradeOnly`,
      // `giftBuyEnabled` и `giftUpgradesEnabled`. Миграция их добавляет, иначе
      // старое сохранение читалось как «апгрейд закрыт», а панель магазина
      // в админке падала на `upgradeOnly.length`.
      version: 6,
      /**
       * Every account owns its own slot (see lib/scopedStorage), so the save
       * of one player can never end up under another account.
       */
      storage: createJSONStorage(() => scopedStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.profile?.marks)) {
          state.profile = { ...state.profile, marks: [] };
        }
        if (!Array.isArray(state.profile?.altNames)) {
          state.profile = { ...state.profile, altNames: [] };
        }
        // страховка для сохранений, которые пережили миграцию: список
        // «только апгрейд» всегда должен быть массивом, иначе панель магазина
        // в админке падает на `upgradeOnly.length`, а тумблеры магазина —
        // булевы, иначе маркет пишет «не продаётся» вместо цены
        if (
          !Array.isArray(state.admin?.upgradeOnly) ||
          typeof state.admin?.giftBuyEnabled !== "boolean" ||
          typeof state.admin?.giftUpgradesEnabled !== "boolean"
        ) {
          state.admin = {
            ...initialState.admin,
            ...(state.admin ?? {}),
            giftBuyEnabled:
              typeof state.admin?.giftBuyEnabled === "boolean"
                ? state.admin.giftBuyEnabled
                : initialState.admin.giftBuyEnabled,
            giftUpgradesEnabled:
              typeof state.admin?.giftUpgradesEnabled === "boolean"
                ? state.admin.giftUpgradesEnabled
                : initialState.admin.giftUpgradesEnabled,
            upgradeOnly: Array.isArray(state.admin?.upgradeOnly) ? state.admin.upgradeOnly : [],
          };
        }
      },
      migrate: (persisted: unknown) => {
        const s = (persisted ?? {}) as Partial<State> & { profile?: Partial<Profile> };
        const profile: Profile = normalizeProfile(s.profile);
        if (profile.anonymousNumber && !profile.phoneNumber) profile.phoneNumber = generateAnonymousNumber();
        // older saves could carry the mark after the tier was removed — drop
        // the orphan so the tick really disappears
        const premiumMarked = profile.marks.includes("premium");
        if (premiumMarked && profile.tier !== "Premium") {
          profile.marks = profile.marks.filter((m) => m !== "premium");
        }
        // a save from before pinning had no strip order: rebuild it from the
        // inventory, keeping the order the pins were made in
        const inventory = Array.isArray(s.inventory) ? s.inventory : [];
        const pinOrder = Array.isArray(s.pinOrder) && s.pinOrder.length
          ? s.pinOrder.filter((id) => inventory.some((i) => i.id === id && i.pinned))
          : inventory.filter((i) => i.pinned).map((i) => i.id).slice(0, MAX_PINNED);
        // pins beyond the cap (a lapsed premium) are dropped, not silently kept
        const cappedPins = new Set(pinOrder);

        // ── подписка ───────────────────────────────────────────────────────
        // Просроченная подписка не должна переезжать в новый билд: дата в
        // прошлом → тир и галочка снимаются сразу при загрузке, ещё до того,
        // как `syncPremium` успеет сработать.
        const premiumUntil = typeof s.premiumUntil === "number" ? s.premiumUntil : null;
        const premiumAlive = premiumUntil !== null && premiumUntil > Date.now();
        if (!premiumAlive) {
          profile.tier = "Free";
          profile.marks = profile.marks.filter((m) => m !== "premium");
        }

        // ── покупки ────────────────────────────────────────────────────────
        // Старые чеки писались в рублях (`rub`, `ref`, `status`). Денежного
        // слоя больше нет, поэтому такие записи не переносим — они описывают
        // то, чего в экономике не существует.
        const purchases = Array.isArray(s.purchases)
          ? (s.purchases as unknown[]).filter(
              (p): p is PurchaseRecord =>
                Boolean(p) &&
                typeof (p as PurchaseRecord).sku === "string" &&
                typeof (p as PurchaseRecord).paid === "object" &&
                (p as PurchaseRecord).paid !== null,
            )
          : [];

        // ── админка ────────────────────────────────────────────────────────
        // Поля реальных денег (реквизиты, «собрано и не выплачено») в новой
        // экономике бессмысленны — вычищаем их из сохранения, а не тащим.
        const restAdmin = { ...(s.admin ?? {}) } as Record<string, unknown>;
        for (const dead of ["payoutBalance", "payCard", "payHolder", "payBank", "payTon", "payQr"]) {
          delete restAdmin[dead];
        }
        // Тумблеры магазина — булевы. В старом сохранении их просто нет, и
        // тогда решают значения по умолчанию: подарок продаётся, апгрейд
        // модели открыт. Без этого «не определено» превращалось в «выключено»
        // — маркет писал «не продаётся», а модели «закрыто».
        const giftBuyEnabled =
          typeof restAdmin.giftBuyEnabled === "boolean"
            ? restAdmin.giftBuyEnabled
            : initialState.admin.giftBuyEnabled;
        const giftUpgradesEnabled =
          typeof restAdmin.giftUpgradesEnabled === "boolean"
            ? restAdmin.giftUpgradesEnabled
            : initialState.admin.giftUpgradesEnabled;

        return {
          ...initialState,
          ...s,
          inventory: inventory.map((i) =>
            i.pinned && !cappedPins.has(i.id) ? { ...i, pinned: false } : i,
          ),
          pinOrder,
          ton: typeof s.ton === "number" ? s.ton : 0,
          premiumUntil: premiumAlive ? premiumUntil : null,
          premiumPlan: premiumAlive ? s.premiumPlan ?? null : null,
          purchases,
          tonOwned: Array.isArray(s.tonOwned) ? s.tonOwned : [],
          tonTaken: {},
          skin: s.skin ?? DEFAULT_SKIN,
          profile,
          admin: {
            ...initialState.admin,
            ...(restAdmin as Partial<State["admin"]>),
            giftBuyEnabled,
            giftUpgradesEnabled,
            upgradeOnly: Array.isArray(restAdmin.upgradeOnly) ? (restAdmin.upgradeOnly as string[]) : [],
          },
          stats: { ...emptyStats, ...(s.stats ?? {}) },
        } as State;
      },
      partialize: (s) => ({
        stars: s.stars,
        ton: s.ton,
        coins: s.coins,
        onlineUserId: s.onlineUserId,
        cloudLoadedFor: s.cloudLoadedFor,
        ownerSyncSeen: s.ownerSyncSeen,
        inventory: s.inventory,
        pinOrder: s.pinOrder,
        premiumUntil: s.premiumUntil,
        premiumPlan: s.premiumPlan,
        purchases: s.purchases,
        tonOwned: s.tonOwned,
        profile: s.profile,
        joinedAt: s.joinedAt,
        lastFreeCaseAt: s.lastFreeCaseAt,
        lastDailyAt: s.lastDailyAt,
        lastFortuneAt: s.lastFortuneAt,
        admin: s.admin,
        settings: s.settings,
        theme: s.theme,
        skin: s.skin,
        deviceMode: s.deviceMode,
        deviceChosen: s.deviceChosen,
        stats: s.stats,
        shopItems: s.shopItems,
      }),
    },
  ),
);

/** Small helpers used across pages. */
export const selectInventoryValue = (state: State) =>
  state.inventory.reduce((acc, i) => acc + (giftOf(i.giftId)?.stars ?? 0), 0);

// The data layer raises this when a server RPC rejects with 'banned'. Flip the
// flag so App swaps in the block notice — even if the login check was missed.
onBanSignal(() => useGame.getState().setBanned(true));

export const FREE_CASE_ID = FREE_CASE_CASE_ID;

export function useHydrated() {
  return useGame.persist.hasHydrated();
}