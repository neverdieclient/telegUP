import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, onlineEnabled } from "../lib/supabase";
import { authError } from "./authError";
import { signalBanned } from "./banSignal";

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
  /** set by any owner write — newer than `syncedAt` means "accept the server" */
  owner_synced_at?: string | null;
  phone_number?: string | null;
  alt_names?: string[];
  bio?: string | null;
  accent?: string | null;
  gradient?: string | null;
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

/** Read one profile row by its account id. */
export async function fetchPlayer(id: string): Promise<PlayerRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as PlayerRow;
}

/**
 * Owner-side offence on another player's row: stars, badges and the premium
 * tier. `grant_mark`/RLS only let a player write their own row, so these go
 * through the `owner_give_*` functions below (SECURITY DEFINER, owner-only).
 */
export async function adminGiveStars(targetId: string, amount: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_give_stars", { target_id: targetId, amount: Math.round(amount) });
  return error ? { error: error.message } : {};
}

export async function adminTakeMark(targetId: string, mark: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_take_mark", { target_id: targetId, mark });
  return error ? { error: error.message } : {};
}

export async function adminGiveBadge(targetId: string, badge: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_give_badge", { target_id: targetId, badge });
  return error ? { error: error.message } : {};
}

export async function adminTakeBadge(targetId: string, badge: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_take_badge", { target_id: targetId, badge });
  return error ? { error: error.message } : {};
}

export async function adminSetTier(targetId: string, tier: "Premium" | "Free"): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_set_tier", { target_id: targetId, tier });
  return error ? { error: error.message } : {};
}

/* ---------------------------------------------------------------- chat */

export type ChatRow = {
  id: string | number;
  user_id: string;
  nickname: string;
  body: string;
  created_at: string;
};

/** Newest `limit` messages, oldest first (ready to render top-down). */
export async function fetchChat(limit = 150): Promise<ChatRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, user_id, nickname, body, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as ChatRow[]).slice().reverse();
}

export async function postChat(body: string, nickname: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { error: "Нужно войти в аккаунт" };
  const { error } = await supabase.from("chat_messages").insert({
    user_id: uid,
    nickname,
    body: body.slice(0, 500),
  });
  if (error && /banned|violates row-level/i.test(error.message)) signalBanned();
  return error ? { error: error.message } : {};
}

/** Top players ordered by their inventory value (fallback: stars). */export async function fetchTop(limit = 50): Promise<PlayerRow[]> {
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
 *
 * NOTE: a player's client cannot read another player's `gifts` rows, so this
 * is the *history* only. Gifts handed out by the owner go through
 * `ownerDeliverGift` below, which lands in the recipient's inventory.
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

/* ------------------------------------------------------- owner deliveries */

/**
 * Owner → player gift. Written to `deliveries` because a player's client can
 * read that table for itself; a plain `gifts` insert was invisible to the
 * recipient and never reached their inventory.
 */
export async function ownerDeliverGift(
  targetId: string,
  giftId: string,
  giftName: string,
  message?: string,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_deliver_gift", {
    target_id: targetId,
    p_gift_id: giftId,
    p_gift_name: giftName,
    message: message ?? null,
  });
  return error ? { error: error.message } : {};
}

export type DeliveryRow = {
  id: number;
  user_id: string;
  gift_id: string;
  gift_name: string;
  from_name: string | null;
  message: string | null;
  claimed: boolean;
  created_at: string;
};

/** Unclaimed gifts waiting for the signed-in player. */
export async function fetchDeliveries(): Promise<DeliveryRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .eq("claimed", false)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error || !data) return [];
  return data as DeliveryRow[];
}

export async function claimDelivery(id: number): Promise<void> {
  if (!supabase) return;
  await supabase.from("deliveries").update({ claimed: true }).eq("id", id);
}

export type CloudSave = {
  stars: number;
  inventory: unknown[];
  inventory_value: number;
  items: number;
  last_free_case: string | null;
  last_daily: string | null;
  joined_at: string | null;
  save_rev: number;
  nickname: string;
  tier: "Free" | "Premium";
  marks: string[];
  badges: string[];
  phone_number: string | null;
  alt_names: string[];
  bio: string | null;
  accent: string | null;
  gradient: string | null;
  owner_synced_at: string | null;
};

/* --------------------------------------------------------- profile pushes */

/** Server-side profile write that can never clobber an owner grant. */
export async function pushProfileSafe(row: {
  username: string;
  nickname: string;
  stars: number;
  inventory_value: number;
  items: number;
  inventory?: unknown[];
  lastFreeCase?: number | null;
  lastDaily?: number | null;
  joinedAt?: number | null;
}): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("player_push_profile", {
    p_username: row.username,
    p_nickname: row.nickname,
    p_stars: Math.round(row.stars),
    p_inventory_value: Math.round(row.inventory_value),
    p_items: row.items,
    p_marks: null,
    p_badges: null,
    p_inventory: row.inventory ?? null,
    p_last_free_case: row.lastFreeCase ? new Date(row.lastFreeCase).toISOString() : null,
    p_last_daily: row.lastDaily ? new Date(row.lastDaily).toISOString() : null,
    p_joined_at: row.joinedAt ? new Date(row.joinedAt).toISOString() : null,
  });
  if (error) {
    if (/banned/i.test(error.message)) signalBanned();
    return null;
  }
  return typeof data === "string" ? data : null;
}

/** Read this account's cloud save. Returns null offline or when the row is missing. */
export async function pullCloudSave(): Promise<CloudSave | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("player_pull_profile");
  if (error || !data) return null;
  return data as CloudSave;
}

/** Owner edit of another player's cosmetics and number. */
export async function ownerSetProfile(
  targetId: string,
  patch: {
    nickname?: string | null;
    bio?: string | null;
    accent?: string | null;
    gradient?: string | null;
    phone?: string | null;
    altNames?: string[] | null;
  },
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_set_profile", {
    target_id: targetId,
    p_nickname: patch.nickname ?? null,
    p_bio: patch.bio ?? null,
    p_accent: patch.accent ?? null,
    p_gradient: patch.gradient ?? null,
    p_phone: patch.phone ?? null,
    p_alt_names: patch.altNames ?? null,
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

/* ------------------------------------------------- bans / login tracking */

export type BanKind = "ip" | "device" | "user";

export type BanRow = {
  id: number;
  kind: BanKind;
  value: string;
  label: string | null;
  reason: string | null;
  created_at: string;
  /** последний известный ник/ip/устройство по этому бану (заполняет сервер) */
  nickname: string | null;
  ip: string | null;
  fingerprint: string | null;
  user_id: string | null;
};

export type LoginEventRow = {
  id: number;
  user_id: string | null;
  username: string | null;
  nickname: string | null;
  ip: string | null;
  fingerprint: string | null;
  user_agent: string | null;
  vpn_flag: boolean;
  created_at: string;
};

const IP_CACHE_KEY = "telegup.ip.v1";
const FP_CACHE_KEY = "telegup.fp.v1";

/**
 * Public IP of this browser. Free, key-less (api.ipify.org). Cached for the
 * session — the value cannot change without a reconnect anyway.
 *
 * NOTE: this is the *client's* view of its own address. The server never sees
 * the caller IP through PostgREST, so the client must report it. A determined
 * cheater can lie here; that is why the ban is ALSO checked server-side by the
 * stored value and account id.
 */
export async function fetchClientIp(): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(IP_CACHE_KEY);
    if (cached) return cached;
  } catch {
    /* private mode: no sessionStorage */
  }
  try {
    const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { ip?: string };
    const ip = j.ip ?? null;
    if (ip) {
      try {
        sessionStorage.setItem(IP_CACHE_KEY, ip);
      } catch {
        /* ignore */
      }
    }
    return ip;
  } catch {
    return null;
  }
}

/**
 * Stable-ish browser fingerprint. Not cryptographic; good enough to catch the
 * same person returning after an IP change. Persisted in localStorage so it
 * survives reloads but not a full profile wipe.
 */
export function deviceFingerprint(): string {
  try {
    const cached = localStorage.getItem(FP_CACHE_KEY);
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? 0),
    String((navigator as { deviceMemory?: number }).deviceMemory ?? 0),
    String(navigator.maxTouchPoints ?? 0),
  ];
  // cheap 32-bit hash (FNV-1a) — no crypto needed, just a stable label
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const fp = "fp_" + (h >>> 0).toString(16) + "_" + s.length.toString(16);
  try {
    localStorage.setItem(FP_CACHE_KEY, fp);
  } catch {
    /* ignore */
  }
  return fp;
}

/**
 * Coarse "looks like a VPN / datacenter / proxy" heuristic with no external
 * API: private-range, known CDN/datacenter prefixes and a few hosting ASN
 * ranges are flagged. Deliberately conservative — it is a hint for the owner,
 * never a hard block.
 */
export function vpnHint(ip: string | null): boolean {
  if (!ip) return false;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!v4) return false; // only IPv4 heuristics for now
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  // common hosting / cloud / VPN egress ranges (partial list, may drift)
  const datacenter: Array<[number, number]> = [
    [5, 5],      // 5.0.0.0/8
    [34, 34],    // GCP
    [35, 35],    // GCP
    [45, 45],    // various VPS
    [51, 51],    // OVH
    [62, 62],    // Hetzner
    [104, 104],  // Cloudflare / VPS
    [138, 138],
    [146, 146],  // Hetzner
    [159, 159],  // DigitalOcean
    [165, 165],  // incl. DO
    [167, 167],  // DigitalOcean
    [178, 178],  // incl. DO
    [185, 185],
    [188, 188],
    [194, 194],  // incl. OVH
    [212, 212],
  ];
  return datacenter.some(([lo, hi]) => a >= lo && a <= hi) || (a === 10) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Report this login to the server (ip + device + ua) and learn whether the
 * account/ip/device is banned. Returns { banned } so the UI can raise the
 * block screen immediately. No-op when offline or signed out.
 */
export async function logLogin(): Promise<{ banned: boolean; offline: boolean }> {
  if (!supabase) return { banned: false, offline: true };
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return { banned: false, offline: false };

  const [ip, fingerprint] = await Promise.all([fetchClientIp(), Promise.resolve(deviceFingerprint())]);
  const { data, error } = await supabase.rpc("log_login", {
    p_ip: ip,
    p_fingerprint: fingerprint,
    p_user_agent: navigator.userAgent,
    p_vpn_flag: vpnHint(ip),
  });
  if (error) return { banned: false, offline: false };
  const banned = Boolean((data as { banned?: boolean } | null)?.banned);
  if (banned) signalBanned();
  return { banned, offline: false };
}

/** Owner: list active bans (with the offender's last-known identity). */
export async function fetchBans(): Promise<BanRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("owner_list_bans");
  if (error || !data) return [];
  return data as BanRow[];
}

/** Owner: recent login journal (ip, device, time, nickname). */
export async function fetchLoginEvents(limit = 200): Promise<LoginEventRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("owner_login_events", { p_limit: limit });
  if (error || !data) return [];
  return data as LoginEventRow[];
}

/** Owner: ban by ip / device / account id. */
export async function ownerBan(
  kind: BanKind,
  value: string,
  label?: string | null,
  reason?: string | null,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_ban", {
    p_kind: kind,
    p_value: value,
    p_label: label ?? null,
    p_reason: reason ?? null,
  });
  return error ? { error: error.message } : {};
}

/** Owner: lift a ban by its row id. */
export async function ownerUnban(id: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_unban", { p_id: id });
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