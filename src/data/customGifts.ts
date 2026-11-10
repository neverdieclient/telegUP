import { supabase } from "../lib/supabase";
import { RARITY_TINT, type Gift, type Rarity } from "./gifts";

/**
 * Owner-made gifts live in the shared `custom_gifts` table, so every player
 * sees the same catalogue. This module keeps the server copy in a small store
 * and exposes it as plain `Gift` objects, matching how `GIFTS` behaves.
 */

export type CustomVisibility = "public" | "test";

export type CustomModel = {
  name: string;
  price: number;
  rarityPct: number;
  image?: string | null;
};

export type CustomGiftRow = {
  id: number;
  slug: string;
  name: string;
  visibility: CustomVisibility;
  price: number;
  image: string | null;
  accent: string;
  description: string;
  models: CustomModel[];
  created_at?: string;
  updated_at?: string;
};

/** Draft used by the admin form before it is written to the server. */
export type CustomGiftDraft = {
  slug: string;
  name: string;
  visibility: CustomVisibility;
  price: number;
  image: string | null;
  accent: string;
  description: string;
  models: CustomModel[];
};

/* ------------------------------------------------------------------ store */

let rows: CustomGiftRow[] = [];
let loaded = false;
let loadError: string | null = null;
let pulledAt = 0;

const listeners = new Set<() => void>();

const emit = () => listeners.forEach((fn) => fn());

/** Subscribe to catalogue changes (React's useSyncExternalStore). */
export function subscribeCustomGifts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getCustomGiftRows = () => rows;
export const customGiftsLoaded = () => loaded;
export const customGiftsError = () => loadError;

/**
 * Live lookup table for *every* gift the app knows about.
 *
 * The store, the inventory and the upgrade screens all key items by `giftId`
 * (see `GIFT_BY_ID`), but the owner can mint new gifts at runtime. Rather than
 * threading a hook through dozens of call sites, the index kept here is filled
 * in-place and the screens read it through the little `useGiftIndex()` hook —
 * a custom gift bought in the market then resolves in the inventory too.
 */
const index: Record<string, Gift> = {};
let indexVersion = 0;
const indexListeners = new Set<() => void>();

function rebuildIndex(list: CustomGiftRow[]) {
  for (const key of Object.keys(index)) delete index[key];
  for (const g of customGiftsToGifts(list)) index[g.id] = g;
  indexVersion++;
  indexListeners.forEach((fn) => fn());
}

/** Snapshot of custom gifts by id (built-ins are merged by `useGiftIndex`). */
export const getGiftIndex = () => index;
export const getGiftIndexVersion = () => indexVersion;

export function subscribeGiftIndex(fn: () => void): () => void {
  indexListeners.add(fn);
  return () => indexListeners.delete(fn);
}

/* ---------------------------------------------------------------- mapping */

const tintFor = (pct: number, accent: string): string => {
  // model tint follows rarity, exactly like the built-in catalogue
  void accent;
  const r: Rarity =
    pct <= 2 ? "mythic" : pct <= 6 ? "legendary" : pct <= 15 ? "epic" : pct <= 40 ? "rare" : "common";
  return RARITY_TINT[r];
};

function rarityOf(pct: number): Rarity {
  return pct <= 2 ? "mythic" : pct <= 6 ? "legendary" : pct <= 15 ? "epic" : pct <= 40 ? "rare" : "common";
}

/** Server rows → the same shape the rest of the app already understands. */
export function customGiftsToGifts(list: CustomGiftRow[]): Gift[] {
  const out: Gift[] = [];
  for (const c of list) {
    if (!c.slug || !c.name) continue;

    out.push({
      id: `custom-${c.slug}`,
      name: c.name,
      slug: c.slug,
      variant: "Gift",
      kind: "gift",
      image: c.image,
      gradient: null,
      tint: c.accent,
      rarity: "mythic",
      rarityPct: 100,
      ton: 0,
      stars: Math.max(1, Math.round(c.price)),
      realStars: 0,
      supply: 0,
      weight: 1,
      desc: c.description || `${c.name} — подарок от администрации.`,
    });

    for (const m of c.models ?? []) {
      if (!m?.name) continue;
      const pct = m.rarityPct > 0 ? m.rarityPct : 10;
      out.push({
        id: `custom-${c.slug}-${m.name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-")}`,
        name: c.name,
        slug: c.slug,
        variant: m.name,
        kind: "model",
        // a model with no picture of its own borrows the gift art, and the
        // UI marks it as borrowed so two models never look identical
        image: m.image || c.image,
        hasOwnImage: Boolean(m.image),
        gradient: null,
        tint: tintFor(pct, c.accent),
        rarity: rarityOf(pct),
        rarityPct: pct,
        ton: 0,
        stars: Math.max(1, Math.round(m.price)),
        realStars: 0,
        supply: 0,
        weight: Math.max(0.0001, pct),
        desc: `Модель «${m.name}» подарка ${c.name}.`,
      });
    }
  }
  return out;
}

/* ----------------------------------------------------------- visibility */

/**
 * Every published gift is visible to everyone — including «тест» ones, so other
 * players can see that a gift exists and read «Недоступно» on its button. The
 * *purchase* is what stays owner-only (see `isPurchasable`).
 */
export function visibleCustomGifts(list: CustomGiftRow[], _isOwner: boolean): CustomGiftRow[] {
  return list;
}

export function isPurchasable(row: CustomGiftRow, isOwner: boolean): boolean {
  return row.visibility === "public" || isOwner;
}

/* -------------------------------------------------------------- plumbing */

/** Load the catalogue once; safe to call repeatedly. */
export async function loadCustomGifts(force = false): Promise<void> {
  if (!supabase) {
    loaded = true;
    return;
  }
  if (loaded && !force && Date.now() - pulledAt < 60_000) return;
  const { data, error } = await supabase
    .from("custom_gifts")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    loadError = error.message;
    loaded = true;
    emit();
    return;
  }
  loadError = null;
  pulledAt = Date.now();
  loaded = true;
  rows = (data ?? []) as CustomGiftRow[];
  rebuildIndex(rows);
  emit();
}

export function replaceCustomGifts(next: CustomGiftRow[]) {
  rows = next;
  pulledAt = Date.now();
  loaded = true;
  rebuildIndex(next);
  emit();
}

/** Insert or update one row, then refresh the local copy. */
export async function saveCustomGift(
  draft: CustomGiftDraft,
  existingId?: number,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const payload = {
    slug: draft.slug,
    name: draft.name,
    visibility: draft.visibility,
    price: Math.max(0, Math.round(draft.price)),
    image: draft.image,
    accent: draft.accent,
    description: draft.description,
    models: draft.models,
  };
  const q = existingId
    ? supabase.from("custom_gifts").update(payload).eq("id", existingId)
    : supabase.from("custom_gifts").insert(payload);
  const { error } = await q;
  if (error) return { error: error.message };
  await loadCustomGifts(true);
  return {};
}

export async function deleteCustomGift(id: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const { error } = await supabase.from("custom_gifts").delete().eq("id", id);
  if (error) return { error: error.message };
  replaceCustomGifts(rows.filter((r) => r.id !== id));
  return {};
}

/** Turn a display name into a stable, url-safe slug. */
export function slugFor(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `my-${base || "gift"}`;
}

/** Upload a picture from disk and return its public URL. */
export async function uploadCustomImage(file: File): Promise<{ url?: string; error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const ext = (file.name.split(".").pop() || "webp").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("gift-art").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || "image/webp",
  });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("gift-art").getPublicUrl(path);
  return { url: data.publicUrl };
}
