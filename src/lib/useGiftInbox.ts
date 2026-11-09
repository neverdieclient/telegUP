import { useEffect } from "react";
import { GIFT_BY_ID, type BadgeId } from "../data/gifts";
import { useGame } from "../store/useGame";
import { onlineEnabled, supabase } from "./supabase";
import { claimDelivery, fetchDeliveries, fetchPlayer, pushProfileSafe } from "./players";

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

export function useGiftInbox() {
  const onlineUserId = useGame((s) => s.onlineUserId);
  const adoptServerProfile = useGame((s) => s.adoptServerProfile);
  const setOwnerSyncSeen = useGame((s) => s.setOwnerSyncSeen);
  const toast = useGame((s) => s.toast);

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
        (a, i) => a + (GIFT_BY_ID[i.giftId]?.stars ?? 0),
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
        const pending = await fetchDeliveries();
        if (dead || !pending.length) return;
        for (const d of pending) {
          // only accept gifts that exist in this build, so a stale row can
          // never poison the inventory with an unknown id
          if (!GIFT_BY_ID[d.gift_id]) {
            void claimDelivery(d.id);
            continue;
          }
          useGame.getState().addItem(d.gift_id, "admin");
          void claimDelivery(d.id);
          toast({
            kind: "gift",
            title: "Подарок получен",
            message: `${d.gift_name}${d.from_name ? ` · от @${d.from_name}` : ""}`,
          });
        }
        // the drained gifts must reach the cloud, otherwise the next device
        // (or a wipe of localStorage) loses them again
        flush();
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
  }, [onlineUserId, adoptServerProfile, toast]);
}