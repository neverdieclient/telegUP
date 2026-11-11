import { useEffect, useState } from "react";
import { fetchAuctions, type AuctionRow } from "./players";
import { onlineEnabled } from "./supabase";

/**
 * Lots currently on the block — including the house auctions the owner
 * schedules from the admin panel. Upcoming lots (`starts_at` in the future)
 * are returned too: the market shows them with a «скоро» badge.
 */
export function useLiveAuctions(pollMs = 20_000): AuctionRow[] {
  const [rows, setRows] = useState<AuctionRow[]>([]);

  useEffect(() => {
    if (!onlineEnabled) return;
    let alive = true;
    const load = async () => {
      const next = await fetchAuctions();
      if (alive) setRows(next);
    };
    void load();
    const t = setInterval(() => void load(), pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return rows;
}

/** Milliseconds until the lot opens; 0 for lots that are already live. */
export function auctionOpensIn(lot: AuctionRow, now = Date.now()): number {
  if (!lot.starts_at) return 0;
  return Math.max(0, new Date(lot.starts_at).getTime() - now);
}

/** Milliseconds until the lot closes. Upcoming lots count from their opening. */
export function auctionClosesIn(lot: AuctionRow, now = Date.now()): number {
  return Math.max(0, new Date(lot.ends_at).getTime() - now);
}

/** Next bid that will be accepted, or the starting price when nobody bid yet. */
export function nextBid(lot: AuctionRow): number {
  return Math.max(lot.min_bid, lot.top_bid + 1);
}

/** "1ч 05м" / "03:12" — compact enough for a card corner. */
export function shortLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${String(m).padStart(2, "0")}м`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}