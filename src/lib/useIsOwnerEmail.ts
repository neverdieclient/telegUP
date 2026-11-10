import { useEffect, useState } from "react";
import { isOwnerEmail, getLocalSession, OWNER_EMAIL } from "./localAuth";
import { onlineEnabled, supabase } from "./supabase";

/**
 * Whether the current visitor is the site owner.
 *
 * Works in both modes: with Supabase the owner is whoever is signed in under
 * `OWNER_EMAIL`, offline it is whoever used the owner password. Kept in one
 * hook so the catalogue, the admin panel and the market all agree.
 */
export function useIsOwnerEmail(): boolean {
  const [owner, setOwner] = useState<boolean>(() =>
    onlineEnabled ? false : isOwnerEmail(getLocalSession()?.email),
  );

  useEffect(() => {
    if (!onlineEnabled) {
      setOwner(isOwnerEmail(getLocalSession()?.email));
      return;
    }
    if (!supabase) {
      setOwner(false);
      return;
    }
    let dead = false;
    const apply = (email: string | undefined | null) => {
      if (!dead) setOwner((email ?? "").trim().toLowerCase() === OWNER_EMAIL);
    };

    // Subscribe FIRST. The auth client replays `SIGNED_IN` for a session that
    // is already cached, but an early `getUser()` would resolve to null while
    // the token is still being restored — which left test gifts hidden from
    // their own owner.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        apply(null);
        return;
      }
      if (session?.user) apply(session.user.email);
    });

    // Fall back to the cached session, then to the server, so a page load that
    // missed the event still settles on the right answer.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) apply(data.session.user.email);
    });
    void supabase.auth.getUser().then(({ data }) => apply(data.user?.email));

    return () => {
      dead = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return owner;
}
