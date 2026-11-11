import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuctions, settleAuctions, type AuctionRow } from "./players";
import { onlineEnabled } from "./supabase";

/**
 * Lots currently on the block — including the house auctions the owner
 * schedules from the admin panel. Upcoming lots (`starts_at` in the future)
 * are returned too: the market shows them with a «скоро» badge. Lots whose
 * clock ran out are dropped right away and settled on the server, so a
 * finished lot never lingers on the board.
 */
export function useLiveAuctions(pollMs = 20_000): {
  lots: AuctionRow[];
  /** re-fetch now, e.g. after a bid or a buyout */
  refresh: () => void;
  /** a lot just closed — fired once per lot so the page can refetch its data */
  closedAt: number;
} {
  const [rows, setRows] = useState<AuctionRow[]>([]);
  const [closedAt, setClosedAt] = useState(0);
  const settled = useRef(new Set<number>());

  const load = useCallback(async () => {
    const next = await fetchAuctions();
    setRows(next);

    // a lot past its end must leave the board; the server closes it so the
    // winner really gets the gift and the seller really gets paid
    const due = next.filter(
      (l) => !l.sold && !l.cancelled && new Date(l.ends_at).getTime() <= Date.now(),
    );
    if (!due.length) return;
    let closed = 0;
    for (const lot of due) {
      if (settled.current.has(lot.id)) continue;
      settled.current.add(lot.id);
      closed += 1;
    }
    if (!closed) return;
    const count = await settleAuctions();
    if (count > 0) {
      const fresh = await fetchAuctions();
      setRows(fresh);
      setClosedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    if (!onlineEnabled) return;
    let alive = true;
    const tick = async () => {
      if (alive) await load();
    };
    void tick();
    const t = setInterval(() => void tick(), pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load, pollMs]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { lots: rows, refresh, closedAt };
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

/** Still on the board: not sold, not cancelled and not past its clock. */
export function isLotLive(lot: AuctionRow, now = Date.now()): boolean {
  if (lot.sold || lot.cancelled) return false;
  return auctionClosesIn(lot, now) > 0;
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