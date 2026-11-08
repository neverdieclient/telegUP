import { useEffect } from "react";
import { GIFT_BY_ID } from "../data/gifts";
import { useGame } from "../store/useGame";
import { onlineEnabled, supabase } from "./supabase";
import { pushStats } from "./players";

/**
 * Mirrors the local game state into the shared Supabase table so that other
 * players see the real leaderboard. Debounced: stats are pushed at most once
 * per 10 seconds, and only when the value actually changed.
 */
export function useStatsSync() {
  useEffect(() => {
    if (!onlineEnabled || !supabase) return;

    let lastPush = 0;
    let timer: number | undefined;
    let lastKey = "";

    const push = () => {
      const s = useGame.getState();
      const user = s.onlineUserId;
      if (!user) return;

      const inventoryValue = s.inventory.reduce(
        (a, i) => a + (GIFT_BY_ID[i.giftId]?.stars ?? 0),
        0,
      );
      const key = `${s.stars}|${inventoryValue}|${s.inventory.length}`;
      if (key === lastKey) return;
      lastKey = key;

      pushStats({
        id: user,
        username: s.profile.nickname.toUpperCase(),
        nickname: s.profile.nickname,
        tier: s.profile.tier,
        stars: s.stars,
        inventory_value: inventoryValue,
        items: s.inventory.length,
        badges: s.profile.badges,
        marks: s.profile.marks,
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
  }, []);
}