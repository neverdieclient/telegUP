import { useMemo, useSyncExternalStore } from "react";
import { GIFTS, GIFT_BY_ID, type Gift, type Rarity } from "../data/gifts";
import {
  customGiftsError,
  customGiftsLoaded,
  customGiftsToGifts,
  getCustomGiftRows,
  getGiftIndexVersion,
  subscribeCustomGifts,
  subscribeGiftIndex,
  visibleCustomGifts,
  type CustomGiftRow,
} from "../data/customGifts";
import { useIsOwnerEmail } from "./useIsOwnerEmail";

/**
 * The built-in scraped catalogue plus everything the owner has published from
 * the admin panel. Pages that list gifts should read from here so custom
 * gifts behave like any other item.
 */
export function useAllGifts(): Gift[] {
  const rows = useSyncExternalStore(subscribeCustomGifts, getCustomGiftRows, getCustomGiftRows);
  const isOwner = useIsOwnerEmail();
  return useMemo(() => [...GIFTS, ...customGiftsToGifts(visibleCustomGifts(rows, isOwner))], [rows, isOwner]);
}

/** Same catalogue, indexed by id — a drop-in for `GIFT_BY_ID`. */
export function useGiftById(): Record<string, Gift> {
  const gifts = useAllGifts();
  return useMemo(() => {
    const out: Record<string, Gift> = { ...GIFT_BY_ID };
    for (const g of gifts) out[g.id] = g;
    return out;
  }, [gifts]);
}

/** Look up one gift, built-in or custom. */
export function useGift(id: string | null | undefined): Gift | undefined {
  const byId = useGiftById();
  return id ? byId[id] : undefined;
}

/** Owner rows for the admin panel (includes test gifts). */
export function useCustomGiftRows(): CustomGiftRow[] {
  return useSyncExternalStore(subscribeCustomGifts, getCustomGiftRows, getCustomGiftRows);
}

/** Load state for the admin panel — reactive, unlike the raw getters. */
export function useCustomGiftStatus(): { loaded: boolean; error: string | null } {
  useSyncExternalStore(subscribeCustomGifts, getCustomGiftRows, getCustomGiftRows);
  return { loaded: customGiftsLoaded(), error: customGiftsError() };
}

/**
 * `GIFT_BY_ID` for the whole catalogue: built-ins plus owner-made gifts.
 *
 * The returned map is the same object identity until the custom catalogue
 * changes, so it can be dropped into any page that currently reads the static
 * `GIFT_BY_ID` — inventory items keyed by `custom-…` ids then resolve.
 */
export function useGiftIndex(): Record<string, Gift> {
  const rows = useSyncExternalStore(subscribeCustomGifts, getCustomGiftRows, getCustomGiftRows);
  const isOwner = useIsOwnerEmail();
  const version = useSyncExternalStore(subscribeGiftIndex, getGiftIndexVersion, getGiftIndexVersion);
  return useMemo(() => {
    void version;
    const out: Record<string, Gift> = { ...GIFT_BY_ID };
    // test gifts are only meant for the owner; hide them from everyone else so
    // a stray id can never be resolved into a buyable/sellable item
    for (const g of customGiftsToGifts(visibleCustomGifts(rows, isOwner))) out[g.id] = g;
    return out;
  }, [rows, isOwner, version]);
}

export type { CustomGiftRow };

/** Re-exported so callers can build filters without reaching into data/. */
export type { Gift, Rarity };
