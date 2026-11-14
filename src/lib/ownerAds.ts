import { useSyncExternalStore } from "react";
import type { AdSlotId } from "./ads";

/**
 * The owner's own ads.
 *
 * Adsterra banners are someone else's creative for money; these are the
 * opposite: a card the owner writes themselves — «розыгрыш в канале», «скидка
 * на стартовый набор», «смотри обновление 2.0». They render in the same three
 * slots as the network banners, so the owner can promote their own thing
 * without touching the layout.
 *
 * Why localStorage and not Supabase: an announcement is short-lived and written
 * by exactly one person. The moment it needs to be shared between devices this
 * list moves next to `shop_orders` — the shape is already a row.
 */

export type OwnerAdPlacement = AdSlotId | "dashboard";

export type OwnerAd = {
  id: string;
  title: string;
  text: string;
  /** button label; empty = no button */
  cta: string;
  /** where the button goes (https:// or /app/…) */
  href: string;
  /** optional picture: https URL or a data URL of an uploaded file */
  image: string | null;
  slot: OwnerAdPlacement;
  active: boolean;
  createdAt: number;
};

const LS_KEY = "telegup:ownerads:v1";

let ads: OwnerAd[] = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function read(): OwnerAd[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? (JSON.parse(raw) as OwnerAd[]) : [];
    return Array.isArray(list) ? list.filter((a) => a && a.id && a.title) : [];
  } catch {
    return [];
  }
}

function persist(next: OwnerAd[]) {
  ads = next;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next.slice(0, 40)));
  } catch {
    /* quota: a big data-URL picture is the usual reason */
  }
  emit();
}

export function subscribeOwnerAds(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getOwnerAds = () => ads;
const EMPTY: OwnerAd[] = [];
export const getOwnerAdsServer = () => EMPTY;

/** React view of the list. */
export function useOwnerAds(): OwnerAd[] {
  return useSyncExternalStore(subscribeOwnerAds, getOwnerAds, getOwnerAdsServer);
}

/** The ad to show in one slot, or null. First active one wins. */
export function useOwnerAdFor(slot: OwnerAdPlacement): OwnerAd | null {
  const all = useOwnerAds();
  // `find` on every render is fine for a list that is never longer than a page
  return all.find((a) => a.active && a.slot === slot) ?? null;
}

export function saveOwnerAd(draft: Omit<OwnerAd, "id" | "createdAt"> & { id?: string }): OwnerAd {
  const existing = draft.id ? ads.find((a) => a.id === draft.id) : null;
  const ad: OwnerAd = {
    ...draft,
    id: existing?.id ?? `ad-${Date.now().toString(36)}`,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  persist([ad, ...ads.filter((a) => a.id !== ad.id)]);
  return ad;
}

export function toggleOwnerAd(id: string) {
  persist(ads.map((a) => (a.id === id ? { ...a, active: !a.active } : a)));
}

export function deleteOwnerAd(id: string) {
  persist(ads.filter((a) => a.id !== id));
}