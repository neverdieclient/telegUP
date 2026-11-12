import { useEffect, useRef } from "react";
import { useGame } from "../store/useGame";
import { useAuth, upsertProfile } from "./players";
import { onlineEnabled, supabase } from "./supabase";
import { GUEST_SCOPE, onlineScope } from "./scopedStorage";

/**
 * Keeps the local profile and the signed-in Supabase account in sync:
 * stores the account id in the game store, adopts the account username
 * as the in-game nickname (only until the player renames themselves) and
 * makes sure the shared profile row exists.
 *
 * It also owns the local save: every account keeps its own slot, so the
 * moment the signed-in account changes the whole save is swapped. A brand new
 * account therefore starts from nothing, and the account you come back to is
 * restored exactly as it was left.
 */
export function useAccountMirror() {
  const { user, loading } = useAuth();
  const setOnlineUserId = useGame((s) => s.setOnlineUserId);

  // remember which account we already mirrored so a background auth event
  // (token refresh) cannot re-run the adoption for the same session
  const mirroredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!onlineEnabled || loading) return;

    // the save of the account that is signed in — opened before the account
    // id is published, so nothing of the previous account can be pushed up
    useGame.getState().switchAccountScope(user ? onlineScope(user.id) : GUEST_SCOPE);
    setOnlineUserId(user?.id ?? null);

    if (!user) {
      mirroredFor.current = null;
      return;
    }

    const remoteName = (user.user_metadata?.username as string | undefined) ?? "";
    let s = useGame.getState();

    if (mirroredFor.current !== user.id) {
      mirroredFor.current = user.id;
      // a deliberate rename wins over the registration name, always
      if (!s.profile.customNickname && remoteName) {
        useGame.getState().adoptNickname(remoteName);
        s = useGame.getState();
      }
    }

    const name = s.profile.nickname;
    if (!name) return;

    // our nickname is the one that counts: push it up so a reload / another
    // device reads the same name instead of the registration one
    if (remoteName.toUpperCase() !== name.toUpperCase()) {
      supabase?.auth.updateUser({ data: { username: name.toUpperCase() } });
    }

    // Only the name travels up here. Marks, badges, tier and the phone number
    // are owner-controlled: pushing the browser's local copy wiped every grant
    // the owner had just made (the badge / tick came back for a moment, then a
    // token refresh re-ran this effect and overwrote the row with the stale
    // local arrays). The DB row is the source of truth for those fields,
    // adopted in useGiftInbox once the owner stamp changes.
    upsertProfile({
      id: user.id,
      username: name.toUpperCase(),
      nickname: name,
    });
  }, [user, loading, setOnlineUserId]);

  // a rename made in the profile page must reach the account metadata too,
  // otherwise the next sign-in would bring the old name back
  useEffect(() => {
    if (!onlineEnabled) return;
    return useGame.subscribe((state, prev) => {
      if (state.profile.nickname === prev.profile.nickname) return;
      if (!state.profile.customNickname || !state.onlineUserId) return;
      supabase?.auth.updateUser({ data: { username: state.profile.nickname.toUpperCase() } });
      upsertProfile({
        id: state.onlineUserId,
        username: state.profile.nickname.toUpperCase(),
        nickname: state.profile.nickname,
      });
    });
  }, []);
}
