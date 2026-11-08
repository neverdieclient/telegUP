import { useEffect } from "react";
import { useGame } from "../store/useGame";
import { useAuth, upsertProfile } from "./players";
import { onlineEnabled } from "./supabase";

/**
 * Keeps the local profile and the signed-in Supabase account in sync:
 * stores the account id in the game store, adopts the account username
 * as the in-game nickname and makes sure the shared profile row exists.
 */
export function useAccountMirror() {
  const { user, loading } = useAuth();
  const setOnlineUserId = useGame((s) => s.setOnlineUserId);

  useEffect(() => {
    if (!onlineEnabled || loading) return;
    setOnlineUserId(user?.id ?? null);
    if (!user) return;

    const remoteName = (user.user_metadata?.username as string | undefined) ?? "";
    if (!remoteName) return;

    const local = useGame.getState().profile.nickname;
    if (local.toLowerCase() !== remoteName.toLowerCase()) {
      useGame.getState().setNickname(remoteName);
    }

    const s = useGame.getState();
    upsertProfile({
      id: user.id,
      username: remoteName.toUpperCase(),
      nickname: remoteName,
      tier: s.profile.tier,
      badges: s.profile.badges,
      marks: s.profile.marks,
    });
  }, [user, loading, setOnlineUserId]);
}