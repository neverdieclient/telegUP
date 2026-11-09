import { useEffect } from "react";
import { useGame } from "../store/useGame";
import { logLogin } from "./players";
import { onlineEnabled } from "./supabase";

/**
 * On every sign-in (and on app start when already signed in) reports this
 * device to the server and reads back whether the account / IP / device is
 * banned. Sets the store flag that drives the full-screen block notice.
 *
 * The notice is only the visible half. The real enforcement is server-side:
 * `player_push_profile` and the chat insert policy raise 'banned' for a blocked
 * caller, so clearing this flag in DevTools does not restore any privileges.
 */
export function useBanGuard(userId: string | null) {
  const setBanned = useGame((s) => s.setBanned);

  useEffect(() => {
    if (!onlineEnabled || !userId) {
      setBanned(false);
      return;
    }
    let alive = true;
    void logLogin().then(({ banned }) => {
      if (alive) setBanned(banned);
    });
    return () => {
      alive = false;
    };
  }, [userId, setBanned]);
}
