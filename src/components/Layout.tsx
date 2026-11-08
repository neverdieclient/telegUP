import { motion } from "framer-motion";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useGame } from "../store/useGame";
import { StarIcon } from "./gifts/GiftArt";
import { ToastStack } from "./Toasts";
import { DISCLAIMER } from "../data/gifts";

type NavItem = { to: string; label: string; short: string; icon: string };

const NAV: NavItem[] = [
  { to: "/app", label: "Профиль", short: "Профиль", icon: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-8 16c0-3.3 3.6-5 8-5s8 1.7 8 5v1H4Z" },
  { to: "/app/cases", label: "Кейсы", short: "Кейсы", icon: "M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm0 0V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1M12 9v4" },
  { to: "/app/upgrade", label: "Апгрейд", short: "Апгрейд", icon: "M12 3l3 6 6 1-4.5 4.4 1 6.6L12 18l-5.5 3 1-6.6L3 10l6-1Z" },
  { to: "/app/market", label: "Маркет", short: "Маркет", icon: "M4 7h16l-1.5 12.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5ZM9 7a3 3 0 1 1 6 0" },
  { to: "/app/auction", label: "Аукцион", short: "Аукцион", icon: "M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0Zm6-2.4L13.4 12 12 13.4" },
  { to: "/app/leaders", label: "Топ", short: "Топ", icon: "M12 3l2.7 6.1 6.6.6-5 4.5 1.4 6.5L12 17.6l-5.7 3.6L7.7 14.2l-5-4.5 6.6-.6Z" },
  { to: "/app/minigames", label: "Мини-игры", short: "Игры", icon: "M7 8h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 8Zm1.5 5v3M7 14.5h3M16 13.5h.01M18 16.5h.01" },
  { to: "/app/inventory", label: "Инвентарь", short: "Инвентарь", icon: "M4 7h16v13H4Zm0 0 4-4h8l4 4M9 12h6" },
  { to: "/app/shop", label: "Telegram", short: "Telegram", icon: "M21 4L3 11l6 2.5M21 4l-3 16-6-4.5M9 13.5V19l3-2.5" },
  { to: "/app/profile", label: "Настройки", short: "Ещё", icon: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm9 4-2 1 .5 2.2-2 2-2.2-.5-1 2h-3l-1-2-2.2.5-2-2L5 12l-1.5-2.2 2-2L6 5.6l1 2h3l1-2h3" },
];

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5">
      <span className="relative grid size-9 place-items-center rounded-xl border border-neon/30 bg-neon/10">
        <svg viewBox="0 0 24 24" className="size-4 text-neon" fill="currentColor">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </svg>
        <span className="absolute inset-0 rounded-xl bg-neon/20 blur-md" />
      </span>
      <span className="text-[17px] font-extrabold tracking-tight">
        teleg<span className="text-neon">UP</span>
      </span>
    </NavLink>
  );
}

function BalancePill() {
  const stars = useGame((s) => s.stars);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 backdrop-blur">
      <StarIcon className="size-4 text-neon" />
      <motion.span
        key={stars}
        initial={{ opacity: 0.5, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[13px] font-extrabold tabular-nums"
      >
        {stars.toLocaleString("ru-RU")}
      </motion.span>
    </div>
  );
}

function Header() {
  const profile = useGame((s) => s.profile);
  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-ink/75 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-6">
          <Brand />
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.slice(1, 6).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  [
                    "rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors",
                    isActive ? "bg-white/8 text-white" : "text-white/50 hover:text-white/90",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <BalancePill />
          <div className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 sm:flex">
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet to-[#4b2bb3] text-[11px] font-black">
              {profile.nickname.slice(0, 1).toUpperCase()}
            </span>
            <div className="leading-tight">
              <p className="max-w-[110px] truncate text-[12px] font-bold">@{profile.nickname}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neon/80">
                {profile.tier}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function SideNav() {
  return (
    <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[220px] shrink-0 flex-col gap-1 border-r border-white/6 px-3 py-4 md:flex">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/app"}
          className={({ isActive }) =>
            [
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all",
              isActive
                ? "bg-white/8 text-white"
                : "text-white/45 hover:bg-white/[0.04] hover:text-white/85",
            ].join(" ")
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="navpill"
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-neon"
                />
              )}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4.5 shrink-0">
                <path d={item.icon} />
              </svg>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
      <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.03] p-3">
        <p className="text-[11px] leading-relaxed text-white/40">{DISCLAIMER}</p>
        <NavLink to="/admin" className="mt-2 inline-block text-[10.5px] font-semibold text-white/25 hover:text-white/50">
          admin console
        </NavLink>
      </div>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-ink/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
      <div className="no-scrollbar flex items-stretch gap-0.5 overflow-x-auto px-1.5 py-1.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            className={({ isActive }) =>
              [
                "flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[9.5px] font-bold transition-colors",
                isActive ? "text-neon" : "text-white/40",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span className={`relative grid size-9 place-items-center rounded-xl ${isActive ? "bg-neon/12" : ""}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
                    <path d={item.icon} />
                  </svg>
                </span>
                {item.short}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="grain min-h-dvh">
      <ToastStack />
      <Header />
      <div className="mx-auto flex max-w-[1400px]">
        <SideNav />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}