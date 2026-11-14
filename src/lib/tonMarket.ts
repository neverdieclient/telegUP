import { useEffect } from "react";
import { useGame } from "../store/useGame";
import { supabase, onlineEnabled } from "./supabase";

/**
 * Ownership of TON-market lots.
 *
 * A username or a number is one of a kind: once somebody took `@luna`, nobody
 * else may take `@luna`, even after the shelf is reshuffled the next hour. The
 * player's own purchase is already recorded locally (it must work offline),
 * but "somebody else has it" has to come from the server — otherwise two
 * browsers would happily sell the same number.
 *
 * If the `ton_claims` table does not exist yet (the SQL in
 * `supabase/ton-market.sql` was not run) every call degrades to "nobody has
 * it" instead of breaking the page: the local check still prevents buying the
 * same lot twice.
 */

/** key → owner id, for every lot that is already somebody's. */
export type TonClaims = Record<string, string>;

const TABLE = "ton_claims";

/** Everything that is already taken. Errors mean "unknown", never "free". */
export async function fetchTonClaims(): Promise<TonClaims | null> {
  if (!onlineEnabled || !supabase) return null;
  try {
    const { data, error } = await supabase.from(TABLE).select("key, owner_id");
    if (error || !Array.isArray(data)) return null;
    const map: TonClaims = {};
    for (const row of data as { key: string; owner_id: string }[]) map[row.key] = row.owner_id;
    return map;
  } catch {
    return null;
  }
}

/**
 * Reserve a lot for this account.
 *
 * `true` — the lot is now mine (or was already mine), so the purchase may
 * proceed. `false` — somebody took it first. `null` — the server could not be
 * asked (offline, missing table), and the caller decides to trust the local
 * list instead of blocking the player.
 */
export async function claimTonItem(
  key: string,
  label: string,
  kind: "username" | "number",
  ton: number,
): Promise<boolean | null> {
  if (!onlineEnabled || !supabase) return null;
  try {
    const { data, error } = await supabase.rpc("claim_ton_item", {
      p_key: key,
      p_label: label,
      p_kind: kind,
      p_ton: ton,
    });
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}

/** Give the lot back when the purchase did not complete. */
export async function releaseTonItem(key: string): Promise<void> {
  if (!onlineEnabled || !supabase) return;
  try {
    await supabase.rpc("release_ton_item", { p_key: key });
  } catch {
    /* nothing to undo */
  }
}

/**
 * Keep the local "somebody has it" list fresh.
 *
 * Called once from the TON market so the shelf shows «занят» without each card
 * asking the server, and refreshed on an interval — one player buying a lot
 * should grey it out for the others without a reload.
 */
export function useTonClaims() {
  const setTonTaken = useGame((s) => s.setTonTaken);

  useEffect(() => {
    let dead = false;

    const tick = async () => {
      const map = await fetchTonClaims();
      if (!dead && map) setTonTaken(map);
    };

    void tick();
    const timer = window.setInterval(tick, 60_000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      dead = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [setTonTaken]);
}