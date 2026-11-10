import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/**
 * «Двойные звёзды» — an owner-controlled payout boost.
 *
 * The owner flips it on from the admin panel, picks the multiplier (×1.5, ×2 …)
 * and either an end time or «until I switch it off». The switch is stored as a
 * start/stop pair in the shared `star_events` row, so:
 *
 *  * every player sees the same boost and the same countdown;
 *  * if the owner forgets to switch it off, nothing runs forever — the boost
 *    is live only while `now()` sits between `started_at` and `ends_at`;
 *  * switching it off can be done from any device.
 *
 * The boost applies to stars EARNED during the event (sales, cases, fortune,
 * bonuses) — not to money already in the wallet.
 */

export type StarEvent = {
  multiplier: number;
  ends_at: string | null;
  closed: boolean;
  started_at: string | null;
  title: string | null;
};

const OFF: StarEvent = {
  multiplier: 200,
  ends_at: null,
  closed: true,
  started_at: null,
  title: null,
};

/* ------------------------------------------------------------------ store */

let event: StarEvent = OFF;
let loaded = false;
let pulledAt = 0;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function subscribeStarEvent(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getStarEvent = () => event;
/** true once one remote read finished — used to avoid duplicate fetches */
export const starEventLoaded = () => loaded;

/** Display label: `×2` / `×1.5`. */
export function boostLabel(multiplier: number): string {
  return `×${Number(multiplier.toFixed(2))}`;
}

/* ------------------------------------------------------------- derivation */

export type BoostState = {
  live: boolean;
  /** effective payout multiplier, `1` when nothing is running */
  multiplier: number;
  title: string | null;
  /** ms until the event ends, 0 when there is no deadline */
  msLeft: number;
};

export function boostState(ev: StarEvent = event, now = Date.now()): BoostState {
  const ends = ev.ends_at ? new Date(ev.ends_at).getTime() : null;
  const starts = ev.started_at ? new Date(ev.started_at).getTime() : null;
  const inWindow =
    !ev.closed &&
    (starts === null || (Number.isFinite(starts) && starts <= now)) &&
    (ends === null || (Number.isFinite(ends) && ends > now));

  if (!inWindow) {
    return { live: false, multiplier: 1, title: ev.title, msLeft: 0 };
  }
  const raw = Math.max(1, Math.min(1000, Math.round(ev.multiplier))) / 100;
  return {
    live: true,
    multiplier: raw,
    title: ev.title,
    msLeft: ends ? Math.max(0, ends - now) : 0,
  };
}

/* ------------------------------------------------------------ read + write */

export async function loadStarEvent(force = false): Promise<void> {
  loaded = true;
  if (!supabase) {
    emit();
    return;
  }
  if (!force && pulledAt && Date.now() - pulledAt < 30_000) return;
  const { data, error } = await supabase
    .from("star_events")
    .select("multiplier, ends_at, closed, started_at, title")
    .eq("id", 1)
    .maybeSingle();
  if (!error) {
    pulledAt = Date.now();
    event = data ? ({ ...OFF, ...(data as StarEvent) }) : OFF;
    emit();
  }
}

/**
 * Turn the boost on.
 *
 * `minutes` = how long it runs; `null` = until the owner switches it off.
 */
export async function startBoost(opts: {
  multiplier: number;
  minutes: number | null;
  title?: string | null;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const now = new Date();
  const endsAt = opts.minutes && opts.minutes > 0 ? new Date(now.getTime() + opts.minutes * 60_000).toISOString() : null;
  const { error } = await supabase.from("star_events").upsert({
    id: 1,
    multiplier: Math.max(1, Math.min(1000, Math.round(opts.multiplier * 100))),
    ends_at: endsAt,
    closed: false,
    started_at: now.toISOString(),
    title: opts.title ?? null,
    updated_at: now.toISOString(),
  });
  if (error) return { error: error.message };
  await loadStarEvent(true);
  return {};
}

export async function stopBoost(): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  // closing it now also fences the window: ends_at = now stops every client at
  // once even if its clock or cache is stale
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("star_events")
    .update({ closed: true, ends_at: now, updated_at: now })
    .eq("id", 1);
  if (error) return { error: error.message };
  await loadStarEvent(true);
  return {};
}

/** Live updates so a boost appears/disappears without a reload. */
export function initStarEventRealtime(): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel("star-events")
    .on("postgres_changes", { event: "*", schema: "public", table: "star_events" }, () => {
      void loadStarEvent(true);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "live_drops" }, () => {
      // the market listens to drops separately; nothing to do here
    })
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

/* ------------------------------------------------------------------ hooks */

/** Reactive boost state with a 1s tick while it is running. */
export function useBoost(): BoostState {
  const ev = useSyncExternalStore(subscribeStarEvent, getStarEvent, getStarEvent);
  const [, setTick] = useState(0);

  useEffect(() => {
    void loadStarEvent();
  }, []);

  useEffect(() => {
    const live = !ev.closed;
    if (!live) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [ev.closed]);

  return boostState(ev);
}

/** Compact countdown: `45:12` / `2ч 03м` / `без ограничения`. */
export function formatBoostLeft(ms: number): string {
  if (ms <= 0) return "без ограничения";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}ч ${m}м` : `${m}:${s}`;
}