import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  FREE_CASE_COOLDOWN_MS,
  FREE_CASE_CASE_ID,
  GIFT_BY_ID,
  GIFTS,
  type BadgeId,
  type PurchasedShopItem,
} from "../data/gifts";
import { randInt, uid } from "../lib/rng";
import { DEFAULT_THEME, type ThemeId } from "../lib/theme";
import { rollUsername, USERNAME_BOX_PRICE } from "../lib/usernameBox";

export type InventoryItem = {
  /** instance id */
  id: string;
  giftId: string;
  acquiredAt: number;
  /** where it came from, for the item badge */
  source: "case" | "market" | "upgrade" | "free" | "admin" | "pvp" | "mines" | "crash" | "dice" | "wheel" | "coinflip" | "tower";
};

export type StatKey =
  | "casesOpened"
  | "upgradesWon"
  | "upgradesLost"
  | "marketBuys"
  | "giftsSold"
  | "clicks"
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
  purchasedUsernames: string[];
  /** second, collectible username shown under the main one */
  collectibleUsername: string | null;
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

  // ---- admin ----
  admin: {
    alwaysWinUpgrade: boolean;
    luckBoost: boolean;
    unlocked: boolean;
    /** 100 = normal payout, 600 = sixfold */
    payoutMultiplier: number;
    freeCases: boolean;
    noCooldown: boolean;
  };

  // ---- settings ----
  settings: Settings;
  stats: Record<StatKey, number>;

  // ---- appearance ----
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;

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
  giftItem: (instanceId: string) => void;
  /**
   * Morph one inventory item into a better model of the same gift.
   * Consumes the source item and inserts `targetGiftId` in its place.
   * Returns the new item, or null when the source is missing.
   */
  upgradeItemModel: (instanceId: string, targetGiftId: string) => InventoryItem | null;
  /** Failed model upgrade: the source item is consumed. */
  loseItemOnUpgrade: (instanceId: string) => void;

  // ---- actions: free case ----
  freeCaseReadyAt: () => number;
  claimFreeCaseCooldown: () => void;

  // ---- actions: shop ----
  buyUsername: (username: string, price: number) => boolean;
  buyShopItem: (id: PurchasedShopItem, price: number) => boolean;
  /** Open a 500★ random-username lootbox; returns the rolled username or null. */
  openUsernameBox: () => { username: string; tier: string; length: number } | null;
  /** Sell an owned username back to the shop for stars. */
  sellUsername: (username: string, price: number) => boolean;

  // ---- actions: profile ----
  setNickname: (name: string) => void;
  setMainUsername: (username: string) => boolean;
  setCollectibleUsername: (username: string | null) => void;
  setAnonymousNumber: (value: boolean) => void;
  /** Supabase user id of the signed-in player, mirrored into the store. */
  onlineUserId: string | null;
  setOnlineUserId: (id: string | null) => void;
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
  clicks: 0,
  crashWins: 0,
  minesWins: 0,
  pvpWins: 0,
  pvpLosses: 0,
  diceWins: 0,
  coinflipWins: 0,
  wheelWins: 0,
  towerWins: 0,
};

export const initialState = {
  stars: 500,
  coins: 0,
  onlineUserId: null as string | null,
  inventory: [] as InventoryItem[],
  profile: {
    nickname: "telegup_user",
    tier: "Free" as const,
    badge: null,
    badges: [] as BadgeId[],
    marks: [] as string[],
    anonymousNumber: false,
    phoneNumber: null,
    purchasedUsernames: [] as string[],
    collectibleUsername: null,
  },
  joinedAt: Date.now(),
  lastFreeCaseAt: null as number | null,
  lastDailyAt: null as number | null,
  admin: {
    alwaysWinUpgrade: false,
    luckBoost: false,
    unlocked: false,
    payoutMultiplier: 100,
    freeCases: false,
    noCooldown: false,
  },
  settings: { sound: true, reduceMotion: false } as Settings,
  theme: DEFAULT_THEME as ThemeId,
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

/** Random, Telegram-looking "+888 x xxx" style anonymous number. */
export function generateAnonymousNumber(): string {
  let digits = "";
  for (let i = 0; i < 6; i++) digits += String(randInt(10));
  return PHONE_MASKS[randInt(PHONE_MASKS.length)](digits);
}

/* ----------------------------------------------------------------- store */

export const useGame = create<State>()(
  persist(
    (set, get) => ({
      ...initialState,

      addStars: (n) => set((s) => ({ stars: s.stars + Math.round(n * (s.admin.payoutMultiplier / 100)) })),
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
        const gift = GIFT_BY_ID[item.giftId];
        if (!gift) return 0;
        const gain = Math.round(gift.stars * (get().admin.payoutMultiplier / 100));
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== instanceId),
          stars: s.stars + gain,
          stats: { ...s.stats, giftsSold: s.stats.giftsSold + 1 },
        }));
        return gain;
      },

      sellAll: (filter) => {
        const { inventory, admin } = get();
        const kept: InventoryItem[] = [];
        let count = 0;
        let stars = 0;
        for (const item of inventory) {
          const gift = GIFT_BY_ID[item.giftId];
          const matches = gift && (filter ? filter(item.giftId) : true);
          if (!matches) {
            kept.push(item);
            continue;
          }
          count++;
          stars += Math.round(gift.stars * (admin.payoutMultiplier / 100));
        }
        if (!count) return { count: 0, stars: 0 };
        set((s) => ({
          inventory: kept,
          stars: s.stars + stars,
          stats: { ...s.stats, giftsSold: s.stats.giftsSold + count },
        }));
        return { count, stars };
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
        const target = GIFT_BY_ID[targetGiftId];
        if (!target || target.slug !== GIFT_BY_ID[source.giftId]?.slug) return null;
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
        const gain = Math.max(1, Math.round(price * (get().admin.payoutMultiplier / 100)));
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
          return { profile: { ...s.profile, nickname: clean } };
        }),

      setMainUsername: (username) => {
        const { profile } = get();
        if (!profile.purchasedUsernames.includes(username)) return false;
        // don't allow the same name for both slots
        const collectible = profile.collectibleUsername === username ? null : profile.collectibleUsername;
        set((s) => ({ profile: { ...s.profile, nickname: username, collectibleUsername: collectible } }));
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

      adminGrantStars: (n) => set((s) => ({ stars: Math.max(0, s.stars + n) })),
      adminGrantAllGifts: () =>
        set((s) => {
          const now = Date.now();
          const added: InventoryItem[] = GIFTS.map((g) => ({
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
      version: 3,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.profile?.marks)) {
          state.profile = { ...state.profile, marks: [] };
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
        inventory: s.inventory,
        profile: s.profile,
        joinedAt: s.joinedAt,
        lastFreeCaseAt: s.lastFreeCaseAt,
        lastDailyAt: s.lastDailyAt,
        admin: s.admin,
        settings: s.settings,
        theme: s.theme,
        stats: s.stats,
        shopItems: s.shopItems,
      }),
    },
  ),
);

/** Small helpers used across pages. */
export const selectInventoryValue = (state: State) =>
  state.inventory.reduce((acc, i) => acc + (GIFT_BY_ID[i.giftId]?.stars ?? 0), 0);

export const FREE_CASE_ID = FREE_CASE_CASE_ID;

export function useHydrated() {
  return useGame.persist.hasHydrated();
}