import { useEffect, useState } from "react";
import { useAuth } from "./players";
import { onlineEnabled } from "./supabase";
import { getLocalSession, isOwnerEmail, localSignIn, verifyOwner } from "./localAuth";

/**
 * Отладочный флаг владельца.
 *
 * `localStorage.setItem("telegup:dev-owner", "1")` открывает панели
 * владельца в локальной dev-сборке — удобно проверять админку и dev-канал
 * без входа в Supabase. В production-сборке (`import.meta.env.DEV === false`)
 * флаг не читается вообще: там единственный способ — настоящий вход.
 */
const DEV_OWNER_KEY = "telegup:dev-owner";

function devOwnerFlag(): boolean {
  try {
    return import.meta.env.DEV && localStorage.getItem(DEV_OWNER_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Is the signed-in account the owner?
 *
 * A single hook so the navigation, the maintenance gate and the console all
 * agree — an «админка» link that appears for one of them and not the other is
 * how a panel leaks. The email is public knowledge (it is the "who", never the
 * "how"); the password is verified by Supabase or by the local owner hash.
 */
export function useOwner() {
  const { user, loading } = useAuth();
  const [localOwner, setLocalOwner] = useState<boolean>(
    () => isOwnerEmail(getLocalSession()?.email) || devOwnerFlag(),
  );
  const [isOwner, setIsOwner] = useState(false);

  const email = (user?.email ?? "").trim().toLowerCase();

  useEffect(() => {
    setIsOwner(devOwnerFlag() || (Boolean(user) && isOwnerEmail(email)));
  }, [user, email]);

  return {
    isOwner: onlineEnabled ? isOwner : localOwner,
    checked: !loading,
    user,
    /** offline unlock: sign the owner in so the rest of the site sees them */
    signInLocal: (mail: string, pass: string) => {
      const ok = verifyOwner(mail, pass);
      if (ok) {
        localSignIn(mail, pass);
        setLocalOwner(true);
      }
      return ok;
    },
    signOutLocal: () => setLocalOwner(false),
  };
}