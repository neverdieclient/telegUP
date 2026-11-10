import { useEffect, useState } from "react";
import {
  isOwnerEmail,
  getLocalSession,
  OWNER_EMAIL,
} from "./localAuth";
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
    void supabase.auth.getUser().then(({ data }) => apply(data.user?.email));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user?.email));
    return () => {
      dead = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return owner;
}