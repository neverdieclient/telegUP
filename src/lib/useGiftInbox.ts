import { useCallback, useEffect, useRef } from "react";
import type { BadgeId } from "../data/gifts";
import { useGiftIndex } from "./useCatalog";
import { useGame } from "../store/useGame";
import { onlineEnabled, supabase } from "./supabase";
import { claimDelivery, fetchDeliveries, fetchPlayer, fetchUpgradeLuck, pushProfileSafe, settleAuctions } from "./players";

/**
 * Keeps this browser in step with what the owner handed out.
 *
 * Two things go wrong without it:
 *
 * 1. Verification marks / badges / stars. The owner writes them to the
 *    player's profile row, but nothing in the player's browser ever reads
 *    that row again — the local profile (and the profile page, which reads
 *    it) keeps the old value while the leaderboard, which fetches rows
 *    fresh, already shows the new one.
 *    → poll the row and adopt marks, badges, tier and stars.
 *
 * 2. Gifts. The owner's gift lands in `deliveries`; nothing moved it into an
 *    inventory.
 *    → drain `deliveries` into the local inventory.
 *
 * Everything is a no-op without a backend.
 */

const POLL_MS = 20_000;

export function useGiftInbox(): { flush: () => void } {
  const onlineUserId = useGame((s) => s.onlineUserId);
  const adoptServerProfile = useGame((s) => s.adoptServerProfile);
  const setOwnerSyncSeen = useGame((s) => s.setOwnerSyncSeen);
  const toast = useGame((s) => s.toast);
  /**
   * The known-item table must include owner-made gifts: an auction win of a
   * custom gift (or its model) otherwise arrived as unknown id and was thrown
   * away instead of landing in the inventory.
   */
  const GIFT_BY_ID = useGiftIndex();
  const knownRef = useRef(GIFT_BY_ID);
  knownRef.current = GIFT_BY_ID;
  /** set from inside the effect so callers can force a sync right away */
  const flushRef = useRef<() => void>(() => {});

  /** ids already handed to the inventory, so a slow `claimDelivery` can't double-add */
  const claimedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!onlineEnabled || !supabase || !onlineUserId) return;

    let dead = false;
    let busy = false;
    /** the last owner stamp applied — starts from what this browser stored */
    let seen = useGame.getState().ownerSyncSeen;

    /** push the freshly-changed inventory up so it survives a switch device */
    const flush = () => {
      const s = useGame.getState();
      if (s.cloudLoadedFor !== s.onlineUserId) return;
      if (!s.onlineUserId) return;
      const inventoryValue = s.inventory.reduce(
        (a, i) => a + (knownRef.current[i.giftId]?.stars ?? 0),
        0,
      );
      void pushProfileSafe({
        username: s.profile.nickname.toUpperCase(),
        nickname: s.profile.nickname,
        stars: s.stars,
        inventory_value: inventoryValue,
        items: s.inventory.length,
        inventory: s.inventory,
        lastFreeCase: s.lastFreeCaseAt,
        lastDaily: s.lastDailyAt,
        joinedAt: s.joinedAt,
      });
    };
    flushRef.current = flush;

    const tick = async () => {
      if (dead || busy) return;
      busy = true;
      try {
        // ---- 1. adopt owner edits on the profile row
        //
        // Only when the row's `owner_synced_at` is new. Without this check a
        // stale server row (or one written before the owner's "remove tick"
        // landed) kept re-adding marks the owner had just switched off, so a
        // tick removed in this browser came back after every reload.
        const row = await fetchPlayer(onlineUserId);
        if (dead) return;
        // Luck is granted per player from the admin panel, so it has to be
        // polled too — otherwise a boost handed to someone else only lands on
        // their next full reload.
        const luck = await fetchUpgradeLuck();
        if (dead) return;
        if (luck !== useGame.getState().admin.upgradeLuck) {
          useGame.getState().setAdmin({ upgradeLuck: luck });
        }
        if (row) {
          const stamp = row.owner_synced_at ?? null;
          const ownerTouched = stamp !== null && stamp !== seen;
          if (ownerTouched || seen === null) {
            seen = stamp;
            setOwnerSyncSeen(stamp);
            adoptServerProfile({
              marks: row.marks ?? [],
              badges: (row.badges ?? []) as BadgeId[],
              tier: row.tier === "Premium" ? "Premium" : "Free",
              stars: row.stars,
              nickname: row.nickname,
              phoneNumber: row.phone_number ?? null,
              altNames: row.alt_names ?? [],
              bio: row.bio ?? null,
              accent: row.accent ?? null,
              gradient: row.gradient ?? null,
            });
          }
        }

        // ---- 2. drain deliveries into the inventory
        //
        // Before reading the queue, ask the server to close every lot whose
        // clock ran out. Settlement is what *creates* the delivery for an
        // auction win, so without this call a winner waited for someone to
        // open a particular page before the gift appeared at all.
        await settleAuctions();
        if (dead) return;

        const pending = await fetchDeliveries();
        if (dead || !pending.length) return;
        let added = 0;
        for (const d of pending) {
          if (claimedRef.current.has(d.id)) continue;
          // only accept gifts this build knows — built-in *or* owner-made.
          // An unknown id is still claimed, otherwise it would block the
          // queue forever, but it is never dropped silently into nothing.
          if (!knownRef.current[d.gift_id]) {
            claimedRef.current.add(d.id);
            void claimDelivery(d.id);
            continue;
          }
          claimedRef.current.add(d.id);
          useGame.getState().addItem(d.gift_id, "admin");
          void claimDelivery(d.id);
          added += 1;
          toast({
            kind: "gift",
            title: "Подарок получен",
            message: `${d.gift_name}${d.from_name ? ` · от @${d.from_name}` : ""}`,
          });
        }
        // the drained gifts must reach the cloud, otherwise the next device
        // (or a wipe of localStorage) loses them again
        if (added) flush();
      } catch {
        /* offline blip — retry on the next tick */
      } finally {
        busy = false;
      }
    };

    void tick();
    const t = window.setInterval(tick, POLL_MS);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      dead = true;
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [onlineUserId, adoptServerProfile, toast, GIFT_BY_ID]);

  const flush = useCallback(() => flushRef.current(), []);
  return { flush };
}