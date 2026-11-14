import { motion } from "framer-motion";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useGame } from "../store/useGame";
import { StarIcon } from "./gifts/GiftArt";
import { TonIcon } from "./ui/TonIcon";
import { ToastStack } from "./Toasts";
import { AdSlot } from "./AdSlot";
import { DISCLAIMER } from "../data/gifts";
import { Avatar } from "./profile/Cosmetics";
import { useOwner } from "../lib/useOwner";

/**
 * The shell of the whole app.
 *
 * ## Two skins, one layout
 *
 * `classic` is the shell the site grew up with: a 220px sidebar with words next
 * to icons, glow on the active row, grain on the background.
 *
 * `minimal` is the 2.0 shell: a narrow icon lane on the left where **icons never
 * cross a label** (the label only appears on hover, as a tooltip), hairline
 * separators between groups, no glow and no glass. Same routes, same order —
 * the difference is that a page can be read without decoration.
 *
 * Everything else here is shared: the header, the bottom bar (five taps on a
 * phone, with «Ещё» opening the rest), the owner-only console entry point and
 * the footer disclaimer.
 */

type NavItem = {
  to: string;
  label: string;
  short: string;
  icon: string;
  /** group in the sidebar / "Ещё" sheet */
  group: "игра" | "деньги" | "сообщество" | "прочее";
};

const NAV: NavItem[] = [
  {
    to: "/app",
    label: "Профиль",
    short: "Профиль",
    group: "игра",
    icon: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-8 16c0-3.3 3.6-5 8-5s8 1.7 8 5v1H4Z",
  },
  {
    to: "/app/cases",
    label: "Кейсы",
    short: "Кейсы",
    group: "игра",
    icon: "M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm0 0V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1M12 9v4",
  },
  {
    to: "/app/upgrade",
    label: "Апгрейд",
    short: "Апгрейд",
    group: "игра",
    icon: "M12 3l3 6 6 1-4.5 4.4 1 6.6L12 18l-5.5 3 1-6.6L3 10l6-1Z",
  },
  {
    to: "/app/market",
    label: "Маркет",
    short: "Маркет",
    group: "деньги",
    icon: "M4 7h16l-1.5 12.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5ZM9 7a3 3 0 1 1 6 0",
  },
  {
    to: "/app/premium",
    label: "Premium",
    short: "Premium",
    group: "деньги",
    icon: "M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.9l6-.9Z",
  },
  {
    to: "/app/ton",
    label: "TON",
    short: "TON",
    group: "деньги",
    icon: "M12 3 4.5 8.5 12 21l7.5-12.5Zm0 0v18M4.5 8.5h15",
  },
  {
    to: "/app/auction",
    label: "Аукцион",
    short: "Аукцион",
    group: "деньги",
    icon: "M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0Zm6-2.4L13.4 12 12 13.4",
  },
  {
    to: "/app/news",
    label: "Новости",
    short: "Новости",
    group: "сообщество",
    icon: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 4h10M7 12h10M7 15h6",
  },
  {
    to: "/app/chat",
    label: "Чат",
    short: "Чат",
    group: "сообщество",
    icon: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Zm3 4h10M7 12h6",
  },
  {
    to: "/app/leaders",
    label: "Топ",
    short: "Топ",
    group: "сообщество",
    icon: "M12 3l2.7 6.1 6.6.6-5 4.5 1.4 6.5L12 17.6l-5.7 3.6L7.7 14.2l-5-4.5 6.6-.6Z",
  },
  {
    to: "/app/inventory",
    label: "Инвентарь",
    short: "Инвентарь",
    group: "прочее",
    icon: "M4 7h16v13H4Zm0 0 4-4h8l4 4M9 12h6",
  },
  {
    to: "/app/minigames",
    label: "Мини-игры",
    short: "Игры",
    group: "прочее",
    icon: "M7 8h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 8Zm1.5 5v3M7 14.5h3M16 13.5h.01M18 16.5h.01",
  },
  {
    to: "/app/craft",
    label: "Крафт",
    short: "Крафт",
    group: "прочее",
    icon: "M12 2 4 7v10l8 5 8-5V7Zm0 0v20M4 7l8 5 8-5",
  },
  {
    to: "/app/updates",
    label: "Обновления",
    short: "Апдейты",
    group: "прочее",
    icon: "M12 3v12m0 0 4-4m-4 4-4-4M5 20h14",
  },
  {
    to: "/app/profile",
    label: "Настройки",
    short: "Ещё",
    group: "прочее",
    icon: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm9 4-2 1 .5 2.2-2 2-2.2-.5-1 2h-3l-1-2-2.2.5-2-2L5 12l-1.5-2.2 2-2L6 5.6l1 2h3l1-2h3",
  },
];

/** The four routes a phone keeps at the bottom; everything else is «Ещё». */
const PRIMARY = ["/app", "/app/cases", "/app/market", "/app/premium"];

const GROUP_TITLE: Record<NavItem["group"], string> = {
  игра: "Игра",
  деньги: "Деньги и маркет",
  сообщество: "Сообщество",
  прочее: "Ещё",
};

function Icon({ d, className = "size-4.5" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <NavLink to="/" className="flex items-center gap-2.5">
      <span className="relative grid size-9 place-items-center rounded-xl border border-neon/30 bg-neon/10">
        <svg viewBox="0 0 24 24" className="size-4 text-neon" fill="currentColor">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </svg>
        <span className="absolute inset-0 rounded-xl bg-neon/20 blur-md skin-hide" />
      </span>
      {!compact && (
        <span className="text-[17px] font-extrabold tracking-tight">
          teleg<span className="text-neon">UP</span>
        </span>
      )}
    </NavLink>
  );
}

function BalancePill() {
  const stars = useGame((s) => s.stars);
  const ton = useGame((s) => s.ton);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2">
      <StarIcon className="size-4 text-neon" />
      <motion.span
        key={stars}
        initial={{ opacity: 0.5, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[13px] font-extrabold tabular-nums"
      >
        {stars.toLocaleString("ru-RU")}
      </motion.span>
      {ton > 0 && (
        <>
          <span className="h-3.5 w-px bg-white/10" />
          <TonIcon size={13} />
          <span className="text-[13px] font-extrabold tabular-nums text-white/70">
            {ton.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
          </span>
        </>
      )}
    </div>
  );
}

function Header() {
  const profile = useGame((s) => s.profile);
  const { isOwner } = useOwner();

  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-ink/85 backdrop-blur-md">
      {/* blur — только 12px: липкая шапка с blur(40px) перерисовывает подложку
          на каждом кадре прокрутки, и именно она давала «мыло» и рывки */}
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Brand />
          <nav className="hidden items-center gap-0.5 lg:flex">
            {NAV.filter((n) => ["/app/cases", "/app/market", "/app/premium", "/app/ton", "/app/updates"].includes(n.to)).map(
              (item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/app"}
                  className={({ isActive }) =>
                    [
                      "rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors",
                      isActive ? "bg-white/8 text-white" : "text-white/50 hover:text-white/90",
                    ].join(" ")
                  }
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <BalancePill />
          <NavLink
            to="/app/profile"
            className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 sm:flex"
          >
            <Avatar src={profile.avatarUrl} nickname={profile.nickname} size={28} rounded="rounded-lg" className="text-[11px]" />
            <div className="leading-tight">
              <p className="max-w-[110px] truncate text-[12px] font-bold">@{profile.nickname}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neon/80">{profile.tier}</p>
            </div>
          </NavLink>
          {isOwner && (
            <NavLink
              to="/admin"
              title="Админ-панель"
              className="grid size-10 place-items-center rounded-2xl border border-mythic/30 bg-mythic/10 text-mythic transition hover:bg-mythic/20"
            >
              <Icon d="M12 3l2 5h5l-4 3.5 1.5 5.5L12 14l-4.5 3 1.5-5.5L5 8h5Z" className="size-4" />
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Classic sidebar: words next to icons.
 *
 * Groups are separated by a hairline and a tiny caption so fifteen routes read
 * as four blocks instead of one long list.
 */
function SideNavClassic() {
  const { isOwner } = useOwner();
  return (
    <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[228px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/6 px-3 py-4 md:flex">
      {NAV.map((item, i) => {
        const newGroup = i === 0 || NAV[i - 1].group !== item.group;
        return (
          <div key={item.to}>
            {newGroup && (
              <p
                className={`px-3 pb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/22 ${
                  i === 0 ? "pt-0" : "pt-3.5"
                }`}
              >
                {GROUP_TITLE[item.group]}
              </p>
            )}
            <NavLink
              to={item.to}
              end={item.to === "/app"}
              className={({ isActive }) =>
                [
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all",
                  isActive ? "bg-white/8 text-white" : "text-white/45 hover:bg-white/[0.04] hover:text-white/85",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span layoutId="navpill" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-neon" />
                  )}
                  <Icon d={item.icon} />
                  {item.label}
                </>
              )}
            </NavLink>
          </div>
        );
      })}

      <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.03] p-3">
        <p className="text-[11px] leading-relaxed text-white/40">{DISCLAIMER}</p>
        {isOwner && (
          <NavLink
            to="/admin"
            className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-mythic/70 hover:text-mythic"
          >
            <Icon d="M12 3l2 5h5l-4 3.5 1.5 5.5L12 14l-4.5 3 1.5-5.5L5 8h5Z" className="size-3" />
            админ-панель
          </NavLink>
        )}
      </div>
    </aside>
  );
}

/**
 * Minimal sidebar: a lane of icons, nothing else.
 *
 * The label is a tooltip that opens *outside* the lane, so an icon never sits
 * on top of a word. Groups keep their separators — the caption is replaced by a
 * hairline, which is enough at this width.
 */
function SideNavMinimal() {
  const { isOwner } = useOwner();
  return (
    <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[68px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-white/[0.05] py-4 md:flex">
      {NAV.map((item, i) => {
        const newGroup = i === 0 || NAV[i - 1].group !== item.group;
        return (
          <div key={item.to} className="w-full">
            {newGroup && i > 0 && <div className="mx-auto my-2 h-px w-7 bg-white/[0.07]" />}
            <NavLink to={item.to} end={item.to === "/app"} className="group relative mx-auto flex w-11 justify-center">
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      "grid size-11 place-items-center rounded-xl transition-all",
                      isActive
                        ? "bg-neon/12 text-neon ring-1 ring-neon/25"
                        : "text-white/35 hover:bg-white/[0.05] hover:text-white/75",
                    ].join(" ")}
                  >
                    <Icon d={item.icon} className="size-[18px]" />
                  </span>
                  <span className="pointer-events-none absolute left-[52px] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#141418] px-2 py-1 text-[11px] font-bold text-white/85 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          </div>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1 pb-1">
        {isOwner && (
          <NavLink
            to="/admin"
            className="group relative grid size-11 place-items-center rounded-xl border border-mythic/25 bg-mythic/10 text-mythic/80 transition hover:bg-mythic/20 hover:text-mythic"
          >
            <Icon d="M12 3l2 5h5l-4 3.5 1.5 5.5L12 14l-4.5 3 1.5-5.5L5 8h5Z" className="size-[17px]" />
            <span className="pointer-events-none absolute left-[52px] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#141418] px-2 py-1 text-[11px] font-bold text-white/85 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
              админ-панель
            </span>
          </NavLink>
        )}
        <span className="mt-1 grid size-7 place-items-center rounded-lg bg-white/[0.03] text-[8px] font-black uppercase tracking-wider text-white/30">
          2.0
        </span>
      </div>
    </aside>
  );
}

/** Everything that did not fit in the bottom bar, in a sheet. */
function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isOwner } = useOwner();
  const { pathname } = useLocation();
  useEffect(() => {
    if (open) onClose();
    // close on navigation: the sheet exists to get somewhere
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] md:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 max-h-[78dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0b0b0e] p-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15" />
        <div className="grid grid-cols-3 gap-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-[10.5px] font-bold transition",
                  isActive
                    ? "border-neon/30 bg-neon/10 text-neon"
                    : "border-white/[0.06] bg-white/[0.02] text-white/55",
                ].join(" ")
              }
            >
              <Icon d={item.icon} className="size-5" />
              {item.short}
            </NavLink>
          ))}
          {isOwner && (
            <NavLink
              to="/admin"
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-mythic/25 bg-mythic/10 px-1 py-3 text-[10.5px] font-bold text-mythic"
            >
              <Icon d="M12 3l2 5h5l-4 3.5 1.5 5.5L12 14l-4.5 3 1.5-5.5L5 8h5Z" className="size-5" />
              Админка
            </NavLink>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function BottomNav() {
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => PRIMARY.includes(n.to));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="flex items-stretch px-1 py-1.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              className={({ isActive }) =>
                [
                  "flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[9.5px] font-bold transition-colors",
                  isActive ? "text-neon" : "text-white/40",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`grid size-9 place-items-center rounded-xl ${isActive ? "bg-neon/12" : ""}`}>
                    <Icon d={item.icon} className="size-[18px]" />
                  </span>
                  {item.short}
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMore(true)}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[9.5px] font-bold text-white/40"
          >
            <span className="grid size-9 place-items-center rounded-xl">
              <Icon d="M5 7h14M5 12h14M5 17h14" className="size-[18px]" />
            </span>
            Ещё
          </button>
        </div>
      </nav>
      <MoreSheet open={more} onClose={() => setMore(false)} />
    </>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const skin = useGame((s) => s.skin);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return (
    <div className={`min-h-dvh ${skin === "minimal" ? "app-shell-minimal" : "grain"}`}>
      <ToastStack />
      <Header />
      <div className="mx-auto flex max-w-[1400px]">
        {skin === "minimal" ? <SideNavMinimal /> : <SideNavClassic />}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10">
          {/* 300×250 between the nav and content — does not interrupt play. */}
          <AdSlot id="inline" className="mx-auto mb-5 max-w-[300px]" />
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}