import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, onlineEnabled } from "../lib/supabase";
import { authError } from "./authError";

export type PlayerRow = {
  id: string;
  username: string;
  nickname: string;
  tier: "Free" | "Premium";
  stars: number;
  inventory_value: number;
  items: number;
  badges: string[];
  marks: string[];
  created_at: string;
};

export type AuthState = {
  user: User | null;
  loading: boolean;
  /** local-only mode: no backend configured */
  offline: boolean;
};

/** Sign up with email + password. The username is stored in user metadata. */
export async function signUp(email: string, password: string, username: string) {
  if (!supabase) return { error: "Онлайн не подключён" };
  const clean = username.toUpperCase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: clean } },
  });
  if (error) return { error: authError(error.message) };
  if (data.user) {
    // the row lives behind RLS; if email confirmation is on, there is no session
    // yet and the insert will be rejected — useAccountMirror retries on sign-in
    await upsertProfile({ id: data.user.id, username: clean, nickname: clean });
  }
  return { user: data.user };
}

export async function signIn(email: string, password: string) {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authError(error.message) };
  return {};
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function upsertProfile(patch: Partial<PlayerRow> & { id: string }) {
  if (!supabase) return;
  await supabase.from("profiles").upsert({ ...patch }, { onConflict: "id" });
}

export async function pushStats(row: {
  id: string;
  username: string;
  nickname: string;
  tier: string;
  stars: number;
  inventory_value: number;
  items: number;
  badges: string[];
  marks: string[];
}) {
  if (!supabase) return;
  await supabase.from("profiles").upsert(row, { onConflict: "id" });
}

/** Grant a verification mark to any player. The DB only accepts this from the owner. */
export async function grantMark(
  targetId: string,
  mark: string,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("grant_mark", { target_id: targetId, mark });
  return error ? { error: error.message } : {};
}

/** Top players ordered by their inventory value (fallback: stars). */
export async function fetchTop(limit = 50): Promise<PlayerRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("inventory_value", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as PlayerRow[];
}

/** Search by username / nickname, case-insensitive prefix match. */
export async function searchPlayers(query: string, limit = 20): Promise<PlayerRow[]> {
  if (!supabase) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .or(`username.ilike.%${q}%,nickname.ilike.%${q}%`)
    .limit(limit);
  if (error || !data) return [];
  return data as PlayerRow[];
}

/**
 * Send a gift to another player. The local item is already removed from the
 * sender's inventory by the caller; this only writes the online record.
 * Without a backend (or a signed-in account) this is a no-op (local sim).
 */
export async function sendGift(payload: {
  fromId: string;
  fromName: string;
  toId: string | null;
  toName: string;
  giftId: string;
  giftName: string;
  giftStars: number;
  message?: string;
}): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from("gifts").insert({
    from_id: payload.fromId,
    from_name: payload.fromName,
    to_id: payload.toId,
    to_name: payload.toName,
    gift_id: payload.giftId,
    gift_name: payload.giftName,
    gift_stars: payload.giftStars,
    message: payload.message ?? null,
  });
  return error ? { error: error.message } : {};
}

export type AuctionKind = "gift" | "username" | "number";

export type AuctionRow = {
  id: number;
  seller_id: string;
  seller_name: string;
  item_id: string;
  item_name: string;
  item_kind: AuctionKind;
  item_value: number;
  min_bid: number;
  buyout: number | null;
  top_bid: number;
  top_bidder: string | null;
  top_bidder_name: string | null;
  sold: boolean;
  cancelled: boolean;
  ends_at: string;
  created_at: string;
};

export type BidRow = {
  id: number;
  auction_id: number;
  bidder_id: string;
  bidder_name: string;
  amount: number;
  created_at: string;
};

/** All lots that are still live, newest-ending first. */
export async function fetchAuctions(): Promise<AuctionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("auctions")
    .select("*")
    .eq("sold", false)
    .eq("cancelled", false)
    .order("ends_at", { ascending: true })
    .limit(200);
  if (error || !data) return [];
  return data as AuctionRow[];
}

export async function fetchBids(auctionId: number, limit = 12): Promise<BidRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("auction_bids")
    .select("*")
    .eq("auction_id", auctionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as BidRow[];
}

export async function listAuction(lot: {
  sellerId: string;
  sellerName: string;
  itemId: string;
  itemName: string;
  itemKind: AuctionKind;
  itemValue: number;
  minBid: number;
  buyout: number | null;
  hours: number;
}): Promise<{ error?: string; id?: number }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const ends = new Date(Date.now() + lot.hours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("auctions")
    .insert({
      seller_id: lot.sellerId,
      seller_name: lot.sellerName,
      item_id: lot.itemId,
      item_name: lot.itemName,
      item_kind: lot.itemKind,
      item_value: lot.itemValue,
      min_bid: Math.max(1, Math.round(lot.minBid)),
      buyout: lot.buyout ? Math.max(1, Math.round(lot.buyout)) : null,
      ends_at: ends,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: number }).id };
}

/** Place a bid through the DB function so "bid must be higher" is enforced. */
export async function placeBid(auctionId: number, amount: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("place_bid", { lot: auctionId, amount: Math.round(amount) });
  return error ? { error: error.message } : {};
}

export async function cancelAuction(auctionId: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.from("auctions").update({ cancelled: true }).eq("id", auctionId);
  return error ? { error: error.message } : {};
}

export async function closeAuction(auctionId: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.from("auctions").update({ sold: true }).eq("id", auctionId);
  return error ? { error: error.message } : {};
}

/** React hook: current session + subscription to auth changes. */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(onlineEnabled);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading, offline: !onlineEnabled };
}