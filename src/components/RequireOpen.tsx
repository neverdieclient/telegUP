import { Navigate, useLocation } from "react-router-dom";
import { useGame } from "../store/useGame";
import type { ReactNode } from "react";

/**
 * Routes that keep working while the site is in "технические работы" mode.
 * Everything else bounces back to the dashboard with a notice.
 */
const ALLOWED = new Set([
  "/app",
  "/app/inventory",
  "/app/shop",
  "/app/profile",
  "/app/chat",
]);

export function RequireOpen({ children }: { children: ReactNode }) {
  const maintenance = useGame((s) => s.admin.maintenance);
  const { pathname } = useLocation();

  if (maintenance && !ALLOWED.has(pathname.replace(/\/$/, ""))) {
    return <Navigate to="/app" replace state={{ maintenance: true }} />;
  }
  return <>{children}</>;
}