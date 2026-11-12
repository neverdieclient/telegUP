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
import { pick, randInt, uid } from "../lib/rng";
import { getGiftIndex } from "../data/customGifts";
import { boostState } from "../lib/starBoost";
import { onBanSignal } from "../lib/banSignal";
import { DEFAULT_THEME, type ThemeId } from "../lib/theme";
import { rollUsername, USERNAME_BOX_PRICE } from "../lib/usernameBox";

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

export type InventoryItem = {
  /** instance id */
  id: string;
  giftId: string;
  acquiredAt: number;
  /** where it came from, for the item badge */
  source: "case" | "market" | "upgrade" | "free" | "admin" | "pvp" | "mines" | "crash" | "dice" | "wheel" | "coinflip" | "tower" | "craft";
  /**
   * Pinned to the top of the inventory, like Telegram's pinned gifts.
   * Optional so items stored before pinning existed still load.
   */
  pinned?: boolean;
};

/** Telegram shows a short row of pinned gifts; three fits our grid. */
export const MAX_PINNED = 3;

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
  /** short status line under the nickname */
  bio: string | null;
  purchasedUsernames: string[];
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
  coins: number; // clicker currency
  inventory: InventoryItem[];

  // ---- profile ----
  profile: Profile;
  joinedAt: number;

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
  };

  // ---- settings ----
  settings: Settings;
  stats: Record<StatKey, number>;

  // ---- appearance ----
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
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
  /** Open a 500★ random-username lootbox; returns the rolled username or null. */
  openUsernameBox: () => { username: string; tier: string; length: number } | null;
  /** Sell an owned username back to the shop for stars. */
  sellUsername: (username: string, price: number) => boolean;

  // ---- actions: profile ----
  /** Rename, remembering that this was a deliberate choice. */
  setNickname: (name: string) => void;
  /** Internal: adopt the account name without flagging it as custom. */
  adoptNickname: (name: string) => void;
  setMainUsername: (username: string) => boolean;
  setCollectibleUsername: (username: string | null) => void;
  setAnonymousNumber: (value: boolean) => void;
  /** Set an arbitrary +888 number (typed or generated) and switch the number on. */
  adminSetPhoneNumber: (value: string | null) => void;
  /** Extra «а также @name» entries on the profile card. */
  setAltNames: (names: string[]) => void;
  /** Avatar/header cosmetics. */
  setAccent: (accent: string | null, gradient: string | null) => void;
  setBio: (bio: string | null) => void;
  /** Privacy switch: «Показывать мои подарки другим». */
  setShowInventory: (show: boolean) => void;
  /** Wipe an account's cosmetics back to defaults. */
  adminClearCosmetics: () => void;
  /** Supabase user id of the signed-in player, mirrored into the store. */
  onlineUserId: string | null;
  setOnlineUserId: (id: string | null) => void;
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
  }) => void;
  /** verification marks: basic / premium / owner / crown */
  toggleMark: (mark: string) => void;

  // ---- actions: admin ----
  adminGrantStars: (n: number) => void;
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
  coins: 0,
  onlineUserId: null as string | null,
  banned: false,
  ownerSyncSeen: null as string | null,
  cloudLoadedFor: null as string | null,
  inventory: [] as InventoryItem[],
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
    bio: null as string | null,
    purchasedUsernames: [] as string[],
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
  },
  settings: { sound: true, reduceMotion: false } as Settings,
  theme: DEFAULT_THEME as ThemeId,
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

/* ----------------------------------------------------------------- store */

export const useGame = create<State>()(
  persist(
    (set, get) => ({
      ...initialState,

      addStars: (n) => set((s) => ({ stars: s.stars + Math.round(n * earnFactor(s.admin)) })),
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
        const prize = Math.max(1, Math.round(base * earnFactor(s.admin)));
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
        const gift = giftOf(item.giftId);
        if (!gift) return 0;
        const gain = Math.round(gift.stars * earnFactor(get().admin));
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== instanceId),
          stars: s.stars + gain,
          stats: { ...s.stats, giftsSold: s.stats.giftsSold + 1 },
        }));
        return gain;
      },

      sellAll: (filter) => {
        const { inventory, admin } = get();
        const factor = earnFactor(admin);
        const kept: InventoryItem[] = [];
        let count = 0;
        let stars = 0;
        for (const item of inventory) {
          const gift = giftOf(item.giftId);
          const matches = gift && (filter ? filter(item.giftId) : true);
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
        if (!item.pinned && get().inventory.filter((i) => i.pinned).length >= MAX_PINNED) return false;
        const next = !item.pinned;
        set((s) => ({
          inventory: s.inventory.map((i) => (i.id === instanceId ? { ...i, pinned: next } : i)),
        }));
        return next;
      },

      giftItem: (instanceId) => {
        const item = get().inventory.find((i) => i.id === instanceId);
        if (!item) return;
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
          source: "upgrade",
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
          source: "craft",
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

      openUsernameBox: () => {
        if (!get().spendStars(USERNAME_BOX_PRICE)) return null;
        const roll = rollUsername();
        // avoid handing out a name the player already owns — re-roll once
        let final = roll;
        if (get().profile.purchasedUsernames.includes(roll.username)) {
          final = rollUsername();
        }
        set((s) => ({
          profile: {
            ...s.profile,
            purchasedUsernames: [...s.profile.purchasedUsernames, final.username],
          },
        }));
        return { username: final.username, tier: final.tier, length: final.length };
      },

      sellUsername: (username, price) => {
        const { profile } = get();
        if (!profile.purchasedUsernames.includes(username)) return false;
        // can't sell the name you are currently using
        if (profile.nickname === username) return false;
        const gain = Math.max(1, Math.round(price * earnFactor(get().admin)));
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

      setBio: (bio) => set((s) => ({ profile: { ...s.profile, bio: bio?.slice(0, 60) ?? null } })),

      setShowInventory: (show) =>
        set((s) => ({ profile: { ...s.profile, showInventory: show } })),

      adminClearCosmetics: () =>
        set((s) => ({
          profile: {
            ...s.profile,
            accent: null,
            gradient: null,
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

      cloudLoadedFor: null as string | null,
      setCloudLoadedFor: (id) => set({ cloudLoadedFor: id }),

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
            server.gradient === s.profile.gradient;

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
              phoneNumber: samePhone
                ? s.profile.phoneNumber
                : server.phoneNumber,
              anonymousNumber: server.phoneNumber ? true : s.profile.anonymousNumber,
              altNames: sameAlt ? s.profile.altNames : server.altNames,
              bio: server.bio,
              accent: server.accent,
              gradient: server.gradient,
            },
            // luck is a pure owner grant: whatever the server says wins, and
            // a normal 100 is written too so a revoked boost actually drops.
            ...(server.upgradeLuck === undefined
              ? {}
              : { admin: { ...s.admin, upgradeLuck: server.upgradeLuck || 100 } }),
          };
        }),

      adminGrantStars: (n) => set((s) => ({ stars: Math.max(0, s.stars + n) })),
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
          profile: { ...initialState.profile, phoneNumber: newPhone },
          toasts: keepToasts,
        });
      },
      setAdmin: (patch) => set((s) => ({ admin: { ...s.admin, ...patch } })),

      toggleSetting: (key) => set((s) => ({ settings: { ...s.settings, [key]: !s.settings[key] } })),
      setTheme: (id) => set({ theme: id }),
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
      name: "telegup:state:v2",
      version: 5,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.profile?.marks)) {
          state.profile = { ...state.profile, marks: [] };
        }
        if (!Array.isArray(state.profile?.altNames)) {
          state.profile = { ...state.profile, altNames: [] };
        }
      },
      migrate: (persisted: unknown) => {
        const s = (persisted ?? {}) as Partial<State> & { profile?: Partial<Profile> };
        const profile: Profile = {
          ...initialState.profile,
          ...(s.profile ?? {}),
          badges: s.profile?.badges ?? [],
          marks: Array.isArray(s.profile?.marks) ? s.profile.marks : [],
          purchasedUsernames: s.profile?.purchasedUsernames ?? [],
          collectibleUsername: s.profile?.collectibleUsername ?? null,
          phoneNumber: s.profile?.phoneNumber ?? null,
          customNickname: Boolean(s.profile?.customNickname),
          altNames: Array.isArray(s.profile?.altNames) ? s.profile.altNames : [],
          accent: s.profile?.accent ?? null,
          gradient: s.profile?.gradient ?? null,
          bio: s.profile?.bio ?? null,
        };
        if (profile.anonymousNumber && !profile.phoneNumber) profile.phoneNumber = generateAnonymousNumber();
        // older saves could carry the mark after the tier was removed — drop
        // the orphan so the tick really disappears
        const premiumMarked = profile.marks.includes("premium");
        if (premiumMarked && profile.tier !== "Premium") {
          profile.marks = profile.marks.filter((m) => m !== "premium");
        }
        return {
          ...initialState,
          ...s,
          profile,
          admin: { ...initialState.admin, ...(s.admin ?? {}) },
          stats: { ...emptyStats, ...(s.stats ?? {}) },
        } as State;
      },
      partialize: (s) => ({
        stars: s.stars,
        coins: s.coins,
        onlineUserId: s.onlineUserId,
        cloudLoadedFor: s.cloudLoadedFor,
        ownerSyncSeen: s.ownerSyncSeen,
        inventory: s.inventory,
        profile: s.profile,
        joinedAt: s.joinedAt,
        lastFreeCaseAt: s.lastFreeCaseAt,
        lastDailyAt: s.lastDailyAt,
        lastFortuneAt: s.lastFortuneAt,
        admin: s.admin,
        settings: s.settings,
        theme: s.theme,
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