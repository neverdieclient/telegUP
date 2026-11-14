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
  /** TON из облака; в старых строках отсутствует */
  ton?: number | null;
  premium_until?: string | null;
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
  /** preset id, see src/data/cosmetics.ts */
  name_gradient?: string | null;
  badge_glow?: string | null;
  profile_banner?: string | null;
  /** public URL of the uploaded avatar (bucket `avatars`) */
  avatar_url?: string | null;
  /** privacy switch: whether other players may browse this inventory */
  show_inventory?: boolean | null;
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

/** One stored inventory entry, as it is written into `profiles.inventory`. */
export type RemoteInventoryItem = {
  id: string;
  giftId: string;
  acquiredAt?: number;
  source?: string;
  /** pinned to the top of the owner's collection and shown on their card */
  pinned?: boolean;
};

/**
 * Another player's inventory, for the admin panel and the public player card.
 *
 * `profiles` is world-readable (the leaderboard needs it), so the `inventory`
 * jsonb column comes down directly — no elevated function required.
 *
 * `show` mirrors the profile's privacy switch: when a player has turned their
 * collection off, callers must render «Инвентарь скрыт», not the gift list.
 */
export async function fetchPlayerInventory(
  playerId: string,
): Promise<{ items: RemoteInventoryItem[]; show: boolean }> {
  if (!supabase) return { items: [], show: true };
  const { data, error } = await supabase
    .from("profiles")
    .select("inventory,show_inventory")
    .eq("id", playerId)
    .maybeSingle();
  if (error || !data) return { items: [], show: true };
  const row = data as { inventory?: unknown; show_inventory?: boolean | null };
  const raw = row.inventory;
  const items = Array.isArray(raw)
    ? raw.filter(
        (i): i is RemoteInventoryItem =>
          Boolean(i) && typeof (i as RemoteInventoryItem).giftId === "string",
      )
    : [];
  // a missing column (migration not run yet) reads as `undefined` → stay open
  return { items, show: row.show_inventory !== false };
}

/** Flip the signed-in player's «Показывать мои подарки другим» switch. */
export async function setInventoryVisibility(show: boolean): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("player_set_inventory_visibility", { p_show: show });
  return error ? { error: error.message } : {};
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

/**
 * Кошелёк TON и срок Premium.
 *
 * Вторая валюта и дата подписки живут в облаке, иначе их не увидеть на другом
 * устройстве, а выданный владельцем TON пропадёт вместе с чисткой кэша.
 * `push` берёт максимум из присланного и сохранённого — обычная игра не
 * затирает подарок владельца.
 */
export async function pushWallet(ton: number, premiumUntil: number | null): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("player_push_wallet", {
    p_ton: Math.max(0, Math.round(ton * 1e8) / 1e8),
    p_premium_until: premiumUntil ? new Date(premiumUntil).toISOString() : null,
  });
}

/** Свой кошелёк с сервера (`null` офлайн или если RPC ещё не применён). */
export async function fetchWallet(): Promise<{ ton: number; premiumUntil: number | null } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("player_get_wallet");
  if (error || !data) return null;
  const row = data as { ton?: number | string; premium_until?: string | null };
  const ton = Number(row.ton ?? 0);
  const until = row.premium_until ? Date.parse(row.premium_until) : NaN;
  return { ton: Number.isFinite(ton) ? ton : 0, premiumUntil: Number.isFinite(until) ? until : null };
}

/**
 * Выдать (или списать отрицательной суммой) TON игроку.
 * `targetId` может быть своим — «себе» и «другому» это одна кнопка.
 */
export async function adminGiveTon(targetId: string, amount: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_give_ton", {
    target_id: targetId,
    amount: Math.round(amount * 1e8) / 1e8,
  });
  return error ? { error: error.message } : {};
}

/**
 * Upgrade luck, in percent of normal odds (100 = honest, 200 = ×2, 10000 = ×100).
 * `targetId` may be the owner's own id — the same lot has to work for «себе».
 */
export async function adminSetUpgradeLuck(targetId: string, luck: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_set_upgrade_luck", {
    target_id: targetId,
    p_luck: Math.round(luck),
  });
  return error ? { error: error.message } : {};
}

/** The signed-in player's granted upgrade luck (100 when nothing was granted). */
export async function fetchUpgradeLuck(): Promise<number> {
  if (!supabase) return 100;
  const { data, error } = await supabase.rpc("player_get_upgrade_luck");
  if (error) return 100;
  return Number(data) || 100;
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
 * sender's inventory by the caller; this writes the online record.
 *
 * Goes through `player_send_gift`, which writes BOTH the `gifts` history row and
 * a `deliveries` row. That second row is what the recipient's client drains into
 * their inventory — writing only `gifts` (the old behaviour) meant the gift was
 * never delivered. Without a backend (or a signed-in account) this is a no-op.
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

  if (payload.toId) {
    const { error } = await supabase.rpc("player_send_gift", {
      target_id: payload.toId,
      p_gift_id: payload.giftId,
      p_gift_name: payload.giftName,
      p_gift_stars: Math.max(0, Math.round(payload.giftStars)),
      message: payload.message ?? null,
    });
    if (!error) return {};
    // 42883 = function missing (SQL not applied yet): fall through to the
    // legacy history-only insert so the sender's log still records the send.
    if (!/42883|does not exist|schema cache/i.test(error.message)) {
      return { error: error.message };
    }
  }

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
  /** вторая валюта; может отсутствовать в старых ответах сервера */
  ton?: number | null;
  /** срок Premium (ISO), null = подписки нет */
  premium_until?: string | null;
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
  name_gradient: string | null;
  badge_glow: string | null;
  profile_banner: string | null;
  avatar_url: string | null;
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
    // The RPC can be missing/broken server-side (an older deploy shipped one
    // whose body threw «missing FROM-clause entry for table p», which silently
    // dropped every inventory). `profiles` allows a player to update their own
    // row, so fall back to a direct write: it keeps the gift list saving even
    // while the corrected `player_push_profile` has not been applied yet.
    await pushInventoryDirect(row);
    return null;
  }
  return typeof data === "string" ? data : null;
}

/**
 * Direct `profiles` update used when the push RPC fails. Writes only the
 * progression columns (never marks/badges/tier — those stay owner-only).
 */
async function pushInventoryDirect(row: {
  username: string;
  nickname: string;
  stars: number;
  inventory_value: number;
  items: number;
  inventory?: unknown[];
}): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) return;
  await supabase
    .from("profiles")
    .update({
      username: row.username.slice(0, 64),
      nickname: row.nickname.slice(0, 64),
      stars: Math.max(0, Math.round(row.stars)),
      inventory_value: Math.max(0, Math.round(row.inventory_value)),
      items: Math.max(0, Math.round(row.items)),
      ...(row.inventory ? { inventory: row.inventory } : {}),
    })
    .eq("id", uid);
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

/**
 * Owner edit of the three decorative slots on a player card.
 *
 * Each slot has its own `set…` flag, so saving "gradient only" leaves the
 * banner and the glow alone. The DB function is `owner_set_cosmetics` from
 * `supabase/profile-cosmetics.sql`.
 */
export async function ownerSetCosmetics(
  targetId: string,
  patch: {
    nameGradient?: string | null;
    badgeGlow?: string | null;
    profileBanner?: string | null;
  },
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_set_cosmetics", {
    target_id: targetId,
    p_name_gradient: patch.nameGradient ?? null,
    p_set_name_gradient: patch.nameGradient !== undefined,
    p_badge_glow: patch.badgeGlow ?? null,
    p_set_badge_glow: patch.badgeGlow !== undefined,
    p_profile_banner: patch.profileBanner ?? null,
    p_set_profile_banner: patch.profileBanner !== undefined,
  });
  return error ? { error: error.message } : {};
}

/**
 * Upload a picture from disk into the `avatars` bucket and return its public URL.
 *
 * Files live under the uploader's own folder (`<uuid>/…`), which is exactly the
 * path prefix the storage policy in `supabase/profile-avatars.sql` allows. The
 * owner may also upload into another player's folder.
 */
export async function uploadAvatar(
  file: File,
  ownerId: string,
): Promise<{ url?: string; error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const ext = (file.name.split(".").pop() || "webp").toLowerCase();
  const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || "image/webp",
  });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl };
}

/** Save the uploaded avatar for the signed-in player (their own row only). */
export async function setMyAvatar(url: string | null): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("player_set_avatar", { p_url: url });
  return error ? { error: error.message } : {};
}

/** Owner: set the avatar of any player (or themself) from the admin panel. */
export async function ownerSetAvatar(
  targetId: string,
  url: string | null,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_set_avatar", {
    target_id: targetId,
    p_avatar_url: url,
  });
  return error ? { error: error.message } : {};
}

/** True for files we can use as an avatar. */
export function isAvatarFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(webp|png|jpe?g|gif|avif)$/i.test(file.name)
  );
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
  /** 'house' — лот выставил владелец из админки; 'player' — обычный игрок */
  source?: "player" | "house";
  /**
   * When the lot opens. `null` (or a past date) means it is live; a future
   * date means it is an upcoming auction: visible, «скоро», bids disabled.
   */
  starts_at?: string | null;
  /** optional caption shown above the upcoming lot */
  lot_label?: string | null;
};

export type BidRow = {
  id: number;
  auction_id: number;
  bidder_id: string;
  bidder_name: string;
  amount: number;
  created_at: string;
};

/** All lots that are still on the board, soonest-ending first. */
export async function fetchAuctions(): Promise<AuctionRow[]> {
  return fetchLotRows();
}

/**
 * @param houseOnly   — только лоты дома (вкладка «Аукцион» в маркете)
 * @param playerOnly  — только лоты игроков (старая вкладка «Аукцион»)
 *
 * Лоты дома и лоты игроков — два разных мира: один живёт в маркете, другой в
 * промо-вкладке, и они не должны видеть лоты друг друга.
 */
export async function fetchLotRows(
  opts: { houseOnly?: boolean; playerOnly?: boolean } = {},
): Promise<AuctionRow[]> {
  if (!supabase) return [];
  let q = supabase
    .from("auctions")
    .select("*")
    .eq("sold", false)
    .eq("cancelled", false)
    .order("ends_at", { ascending: true })
    .limit(200);
  if (opts.houseOnly) q = q.eq("source", "house");
  if (opts.playerOnly) q = q.or("source.is.null,source.eq.player");
  const { data, error } = await q;
  if (error || !data) return [];
  // a lot past its clock is closed on the server, but the board must never
  // show it even for the one poll until that lands
  const now = Date.now();
  return (data as AuctionRow[]).filter((l) => new Date(l.ends_at).getTime() > now);
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

/**
 * Close every lot whose clock ran out — winner gets the gift and the stars
 * move to the seller (a house lot's stars burn). Runs on the server so a lot
 * cannot be kept alive by a lagging client; finished lots then disappear from
 * the board for everybody.
 */
export async function settleAuctions(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("settle_expired_auctions");
  if (error) return 0;
  return Number(data) || 0;
}

/** Lots that are still on the board (not closed and not past their end). */
export function isLotLive(lot: AuctionRow, now = Date.now()): boolean {
  if (lot.sold || lot.cancelled) return false;
  return new Date(lot.ends_at).getTime() > now;
}

/* --------------------------------------------------- owner (house) auctions */

/** Owner-only: put any catalogue gift on the block. */
export async function ownerCreateAuction(lot: {
  itemId: string;
  itemName: string;
  itemKind?: AuctionKind;
  itemValue: number;
  minBid: number;
  buyout: number | null;
  /** how long the lot lives after it opens */
  minutes: number;
  /** how long until it opens; 0 — right away */
  startInMinutes?: number;
  label?: string | null;
}): Promise<{ error?: string; id?: number }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { data, error } = await supabase.rpc("owner_create_auction", {
    p_item_id: lot.itemId,
    p_item_name: lot.itemName,
    p_item_kind: lot.itemKind ?? "gift",
    p_item_value: Math.max(0, Math.round(lot.itemValue)),
    p_min_bid: Math.max(1, Math.round(lot.minBid)),
    p_buyout: lot.buyout && lot.buyout > 0 ? Math.round(lot.buyout) : null,
    p_minutes: Math.max(1, Math.round(lot.minutes)),
    p_start_in: Math.max(0, Math.round(lot.startInMinutes ?? 0)),
    p_label: lot.label?.trim() || null,
  });
  if (error) return { error: error.message };
  return { id: Number(data) };
}

/** Owner-only: pull a lot off the board. */
export async function ownerCancelAuction(auctionId: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_cancel_auction", { p_lot: auctionId });
  return error ? { error: error.message } : {};
}

/** Owner-only: re-price an open lot and/or move its window. */
export async function ownerUpdateAuction(
  auctionId: number,
  patch: { minBid: number; buyout: number | null; minutes: number; startInMinutes?: number | null },
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн не подключён" };
  const { error } = await supabase.rpc("owner_update_auction", {
    p_lot: auctionId,
    p_min_bid: Math.max(1, Math.round(patch.minBid)),
    p_buyout: patch.buyout && patch.buyout > 0 ? Math.round(patch.buyout) : null,
    p_minutes: Math.max(1, Math.round(patch.minutes)),
    p_start_in:
      patch.startInMinutes === undefined || patch.startInMinutes === null
        ? null
        : Math.max(0, Math.round(patch.startInMinutes)),
  });
  return error ? { error: error.message } : {};
}

/** Every live lot (open and upcoming), plus finished house lots for the panel. */
export async function fetchOwnerAuctions(): Promise<AuctionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("auctions")
    .select("*")
    .eq("source", "house")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error || !data) return [];
  return data as AuctionRow[];
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