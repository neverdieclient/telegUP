import { Link, useLocation } from "react-router-dom";
import { useGame } from "../store/useGame";
import { maintenanceActive } from "../lib/adminTools";
import { useOwner } from "../lib/useOwner";
import type { ReactNode } from "react";

/**
 * Routes that keep working while the site is in "технические работы" mode.
 * Everything else is replaced by the notice — not silently redirected, because
 * a player who is bounced to the dashboard with no explanation thinks the link
 * is broken.
 */
const ALLOWED = new Set([
  "/app",
  "/app/inventory",
  "/app/shop",
  "/app/premium",
  "/app/ton",
  "/app/profile",
  "/app/chat",
  "/app/updates",
]);

export function RequireOpen({ children }: { children: ReactNode }) {
  const admin = useGame((s) => s.admin);
  const { isOwner } = useOwner();
  const { pathname } = useLocation();

  const closed = maintenanceActive(admin);
  // the owner keeps working inside the site while it is "closed" — otherwise
  // they could not turn the work off from within it
  if (closed && !isOwner && !ALLOWED.has(pathname.replace(/\/$/, ""))) {
    return <MaintenanceNotice note={admin.maintenanceNote} until={admin.quietTo} />;
  }
  return <>{children}</>;
}

/** The standalone «работы идут» screen. */
export function MaintenanceNotice({ note, until }: { note: string; until?: string }) {
  return (
    <div className="mx-auto grid min-h-[62vh] w-full max-w-md place-items-center">
      <div className="w-full rounded-3xl border border-amber-400/25 bg-amber-400/[0.06] p-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-amber-400/30 bg-amber-400/10">
          <svg viewBox="0 0 24 24" className="size-6 text-amber-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M14.7 6.3a4 4 0 1 0 5 5L21 21H3l9.7-9.7Z" />
            <path d="M9 15h6" />
          </svg>
        </span>
        <h1 className="mt-4 font-display text-[19px] font-black tracking-tight">Ведутся технические работы</h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">{note}</p>
        <p className="mt-3 text-[11px] leading-relaxed text-white/30">
          Профиль, инвентарь, магазин, чат и обновления открыты как обычно
          {until ? `. Игры вернутся после ${until}` : ". Игры вернутся, как только всё закончим"}.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            to="/app/inventory"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-bold text-white/80 hover:bg-white/10"
          >
            Инвентарь
          </Link>
          <Link
            to="/app/chat"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-bold text-white/80 hover:bg-white/10"
          >
            Чат
          </Link>
        </div>
      </div>
    </div>
  );
}