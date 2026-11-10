import { useSyncExternalStore } from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { GIFTS, type Gift } from "./gifts";
import { getCustomGiftRows, subscribeCustomGifts } from "./customGifts";

/**
 * Limited-time drops.
 *
 * The owner picks ONE gift (built-in or his own) from the admin panel and
 * calls it limited. While the drop is live the gift gets a «Лимитед» frame and
 * shows in its own shelf at the top of the market; when the countdown runs out
 * the gift stays in the catalogue but can no longer be bought.
 *
 * Lives in the shared `live_drops` table (`supabase/live-drops.sql`) so every
 * player sees the same drop, with an RLS-backed owner-only write path.
 */

export type DropRow = {
  id: number;
  slug: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  closed: boolean;
  created_at?: string;
};

/** What the UI actually needs: the drop plus the gift it points at. */
export type LiveDrop = DropRow & {
  gift: Gift | null;
  /** current phase, computed from the clock */
  phase: "live" | "scheduled" | "ended";
  /** ms left until `ends_at` (0 when there is no limit or it passed) */
  msLeft: number;
};

/* ------------------------------------------------------------------ store */

let rows: DropRow[] = [];
let loaded = false;
let loadError: string | null = null;
let pulledAt = 0;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function subscribeDrops(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getDrops = (): DropRow[] => rows;
export const dropsLoaded = () => loaded;
export const dropsError = () => loadError;

/* ------------------------------------------------------------- derivation */

/** Gift id for a drop: built-ins are `gift-<slug>`, owned ones `custom-<slug>`. */
export function giftIdForSlug(slug: string): string {
  const isCustom = getCustomGiftRows().some((r) => r.slug === slug);
  return isCustom ? `custom-${slug}` : `gift-${slug}`;
}

function resolveGift(slug: string): Gift | null {
  if (getCustomGiftRows().some((r) => r.slug === slug)) return null;
  return GIFTS.find((g) => g.id === `gift-${slug}`) ?? null;
}

/**
 * Built-in gift art for a drop, used to decorate custom items too so a limited
 * drop always has a picture in the shelf.
 */
export function builtInArt(slug: string): string | null {
  const custom = getCustomGiftRows().find((r) => r.slug === slug);
  if (custom?.image) return custom.image;
  return GIFTS.find((g) => g.slug === slug && g.kind === "gift")?.image ?? null;
}

export function dropPhase(row: DropRow, now = Date.now()): LiveDrop["phase"] {
  if (row.closed) return "ended";
  const start = new Date(row.starts_at).getTime();
  if (Number.isFinite(start) && start > now) return "scheduled";
  if (row.ends_at) {
    const end = new Date(row.ends_at).getTime();
    if (Number.isFinite(end) && end <= now) return "ended";
  }
  return "live";
}

function msLeftOf(row: DropRow, now = Date.now()): number {
  if (row.closed || !row.ends_at) return 0;
  const end = new Date(row.ends_at).getTime();
  return Number.isFinite(end) ? Math.max(0, end - now) : 0;
}

/**
 * Rows → `LiveDrop`s, decorated with the gift resolved through `index`.
 * `index` is the merged gift map from `useGiftIndex()` (built-ins + custom).
 */
export function decorateDrops(list: DropRow[], index: Record<string, Gift>, now = Date.now()): LiveDrop[] {
  return list.map((row) => {
    const phase = dropPhase(row, now);
    const id = giftIdForSlug(row.slug);
    return {
      ...row,
      gift: index[id] ?? resolveGift(row.slug),
      phase,
      msLeft: msLeftOf(row, now),
    };
  });
}

/** Slug → drop, for the market grid («Лимитед» frames and blocked buys). */
export function dropsBySlug(list: LiveDrop[]): Map<string, LiveDrop> {
  const map = new Map<string, LiveDrop>();
  for (const d of list) map.set(d.slug, d);
  return map;
}

/* -------------------------------------------------------------- read path */

export async function loadDrops(force = false): Promise<void> {
  loaded = true;
  if (!supabase) {
    emit();
    return;
  }
  if (!force && pulledAt && Date.now() - pulledAt < 30_000) return;
  const { data, error } = await supabase
    .from("live_drops")
    .select("*")
    .order("started_at", { ascending: false });
  if (error) {
    loadError = error.message;
  } else {
    loadError = null;
    pulledAt = Date.now();
    rows = (data ?? []) as DropRow[];
  }
  emit();
}

/* ------------------------------------------------------------- write path */

export async function openDrop(
  slug: string,
  opts: { hours?: number | null; label?: string | null } = {},
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  // one live drop at a time: close the previous one first
  const { error: closeErr } = await supabase
    .from("live_drops")
    .update({ closed: true })
    .eq("closed", false);
  if (closeErr && closeErr.code !== "PGRST116") return { error: closeErr.message };

  const endsAt =
    opts.hours && opts.hours > 0
      ? new Date(Date.now() + opts.hours * 3_600_000).toISOString()
      : null;

  const { error } = await supabase
    .from("live_drops")
    .insert({ slug, label: opts.label ?? null, ends_at: endsAt, closed: false });
  if (error) return { error: error.message };
  await loadDrops(true);
  return {};
}

export async function closeDrop(id: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const { error } = await supabase.from("live_drops").update({ closed: true }).eq("id", id);
  if (error) return { error: error.message };
  await loadDrops(true);
  return {};
}

export async function deleteDrop(id: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const { error } = await supabase.from("live_drops").delete().eq("id", id);
  if (error) return { error: error.message };
  await loadDrops(true);
  return {};
}

/* ------------------------------------------------------------------ hooks */

/**
 * Reactive drop list for the market. Keeps a 1s ticker going so countdowns and
 * the live → ended transition happen without a reload.
 */
export function useLiveDrops(index: Record<string, Gift>): LiveDrop[] {
  const rowsNow = useSyncExternalStore(subscribeDrops, getDrops, getDrops);
  const customRows = useSyncExternalStore(subscribeCustomGifts, getCustomGiftRows, getCustomGiftRows);
  const [, tick] = useTicker(Boolean(rowsNow.length));
  void tick;
  void customRows;
  return decorateDrops(rowsNow, index);
}

/** Shared 1-second clock; only runs while `on` is true. */
function useTicker(on: boolean): [number, (n: number) => void] {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setN((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return [n, setN];
}

/** `3д 04:12:07` / `04:12:07` — compact countdown label. */
export function formatLeft(ms: number): string {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const h = String(Math.floor((total % 86_400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return days > 0 ? `${days}д ${h}:${m}:${s}` : `${h}:${m}:${s}`;
}