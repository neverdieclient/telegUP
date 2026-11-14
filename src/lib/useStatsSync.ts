import { useEffect, useRef } from "react";
import { GIFT_BY_ID } from "../data/gifts";
import { loadCustomGifts } from "../data/customGifts";
import { useGame } from "../store/useGame";
import { onlineEnabled, supabase } from "./supabase";
import { pushProfileSafe, pullCloudSave, pushWallet } from "./players";

/**
 * Mirrors the local game state into the shared Supabase table so that other
 * players see the real leaderboard AND so a player can continue on another
 * device.
 *
 * Order matters:
 *   1. the very first time this browser sees an account, download the cloud
 *      save (balance, inventory, timers) — a fresh device starts at 500★ and
 *      an empty inventory, so pushing before pulling wiped the real save;
 *   2. afterwards push the local snapshot, but never before step 1 finished.
 *
 * Uses `player_push_profile`, which only writes progression fields — marks,
 * badges and the tier stay owner-only.
 */
export function useStatsSync() {
  const onlineUserId = useGame((s) => s.onlineUserId);
  const accountScope = useGame((s) => s.accountScope);

  // owner-made gifts are shared server-side, so pull the catalogue on boot and
  // keep it fresh while the tab is open
  useEffect(() => {
    if (!onlineEnabled || !supabase) return;
    void loadCustomGifts();
    const tick = window.setInterval(() => void loadCustomGifts(), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  // one pull per account per page load
  const pulledFor = useRef<string | null>(null);
  const pushing = useRef(false);

  // ---- 1. pull the cloud save once per account ----
  useEffect(() => {
    if (!onlineEnabled || !supabase || !onlineUserId) return;
    // one pull per account: the local slot already holds the save of an
    // account this browser has seen before, and a stale server row would
    // overwrite gifts the player has not pushed yet
    const key = `${accountScope}|${onlineUserId}`;
    if (useGame.getState().cloudLoadedFor === onlineUserId) {
      pulledFor.current = key;
      return;
    }
    if (pulledFor.current === key) return;
    pulledFor.current = key;

    void (async () => {
      const save = await pullCloudSave();
      // the account may have changed while the request was running — the save
      // of the old account must not land in the new one
      const now = useGame.getState();
      if (now.onlineUserId !== onlineUserId || now.accountScope !== accountScope) return;
      if (save && (save.stars > 0 || (save.inventory?.length ?? 0) > 0)) {
        now.adoptCloudSave(save);
      }
      // кошелёк приходит тем же ответом: TON и дата подписки
      if (save) {
        now.adoptWallet({
          ton: save.ton ?? 0,
          premiumUntil: save.premium_until ? Date.parse(save.premium_until) : null,
        });
      }
      now.setCloudLoadedFor(onlineUserId);
      now.setOwnerSyncSeen(save?.owner_synced_at ?? null);
    })();
  }, [onlineUserId, accountScope]);

  // ---- 2. push local changes once the save is in memory ----
  useEffect(() => {
    if (!onlineEnabled || !supabase || !onlineUserId) return;

    let lastPush = 0;
    let timer: number | undefined;
    let lastKey = "";

    const push = () => {
      const s = useGame.getState();
      const user = s.onlineUserId;
      if (!user) return;
      // never push before this browser has the real save
      if (s.cloudLoadedFor !== user) return;
      if (pushing.current) return;

      const inventoryValue = s.inventory.reduce(
        (a, i) => a + (GIFT_BY_ID[i.giftId]?.stars ?? 0),
        0,
      );
      const key = `${s.stars}|${inventoryValue}|${s.inventory.length}|${s.profile.nickname}|${s.ton}|${s.premiumUntil ?? 0}`;
      if (key === lastKey) return;
      lastKey = key;

      pushing.current = true;
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
      })
        // кошелёк — отдельной RPC: она берёт максимум, поэтому подарок
        // владельца не затирается, а счётчик звёзд она не трогает
        .then(() => pushWallet(s.ton, s.premiumUntil))
        .finally(() => {
          pushing.current = false;
        });
    };

    const unsubscribe = useGame.subscribe(() => {
      const now = Date.now();
      if (now - lastPush > 10_000) {
        lastPush = now;
        push();
      } else {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          lastPush = Date.now();
          push();
        }, 10_000 - (now - lastPush));
      }
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [onlineUserId]);
}
