import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onlineEnabled } from "../lib/supabase";
import { paths } from "../lib/authState";
import { getLocalSession } from "../lib/localAuth";

/**
 * Registration is mandatory: every /app route lives behind an account.
 *
 * - Online build: the Supabase session decides.
 * - Offline build: a local email + password account (localStorage) decides,
 *   so the site still refuses to open without registering.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const [checked, setChecked] = useState(onlineEnabled ? paths.checked : true);
  const [authed, setAuthed] = useState(onlineEnabled ? paths.authed : Boolean(getLocalSession()));

  useEffect(() => {
    if (onlineEnabled) {
      return paths.subscribe((next) => {
        setChecked(next.checked);
        setAuthed(next.authed);
      });
    }
    // offline: re-check on navigation (sign in/out happen on other routes)
    setChecked(true);
    setAuthed(Boolean(getLocalSession()));
  }, [loc.pathname]);

  if (!checked) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink">
        <div className="flex flex-col items-center gap-3">
          <span className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/25">Проверка аккаунта</span>
        </div>
      </div>
    );
  }

  if (!authed) {
    return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  }

  return <>{children}</>;
}