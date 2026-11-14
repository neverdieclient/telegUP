import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { Layout } from "./components/Layout";
import { DeviceChooser, useDeviceScope } from "./components/DeviceChooser";
import { RequireAuth } from "./components/RequireAuth";
import { RequireOpen } from "./components/RequireOpen";
import { BannedScreen } from "./components/BannedScreen";
import Landing from "./pages/Landing";
import { useGame } from "./store/useGame";
import { applySkin, applyTheme } from "./lib/theme";
import { useStatsSync } from "./lib/useStatsSync";
import { useAccountMirror } from "./lib/useAccountMirror";
import { useGiftInbox } from "./lib/useGiftInbox";
import { useBanGuard } from "./lib/useBanGuard";

import { useAuth } from "./lib/players";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Cases = lazy(() => import("./pages/Cases"));
const UpgradePage = lazy(() => import("./pages/Upgrade"));
const News = lazy(() => import("./pages/News"));
const Updates = lazy(() => import("./pages/Updates"));
const Market = lazy(() => import("./pages/Market"));
const Inventory = lazy(() => import("./pages/Inventory"));
const MiniGames = lazy(() => import("./pages/MiniGames"));
const Shop = lazy(() => import("./pages/Shop"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));
const Auth = lazy(() => import("./pages/Auth"));
const Leaders = lazy(() => import("./pages/Leaders"));
const Auction = lazy(() => import("./pages/Auction"));
const Chat = lazy(() => import("./pages/Chat"));
const Craft = lazy(() => import("./pages/Craft"));
const Premium = lazy(() => import("./pages/Premium"));
const TonMarket = lazy(() => import("./pages/TonMarket"));

function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <span className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/25">Загрузка</span>
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  useStatsSync();
  useAccountMirror();
  useGiftInbox();
  useDeviceScope();
  useBanGuard(user?.id ?? null);

  const banned = useGame((s) => s.banned);
  const theme = useGame((s) => s.theme);
  const skin = useGame((s) => s.skin);

  /**
   * Premium реально заканчивается.
   *
   * `premiumUntil` — единственный источник правды, а тир и галочка лежат
   * отдельными полями и сами не гаснут. Сверяем дату при запуске и раз в
   * минуту: кончился месяц — подписка и четвёртый закреп исчезают сами.
   */
  useEffect(() => {
    const check = () => useGame.getState().syncPremium();
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  // the layout skin is a separate axis from the colour theme
  useEffect(() => {
    applySkin(skin);
  }, [skin]);

  // "Анимации" switch: one class on <html> freezes every decorative motion
  const reduceMotion = useGame((s) => s.settings.reduceMotion);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("reduce-motion", reduceMotion);
    return () => root.classList.remove("reduce-motion");
  }, [reduceMotion]);

  // Banned account / IP / device: the whole site is replaced by the block
  // notice — landing, auth, app, admin, everything. This is the visible half;
  // the database also rejects every write from this caller (see bans.sql).
  if (banned) return <BannedScreen />;

  return (
    <HashRouter>
      <DeviceChooser />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <Admin />
              </RequireAuth>
            }
          />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="cases" element={<RequireOpen><Cases /></RequireOpen>} />
            <Route path="upgrade" element={<RequireOpen><UpgradePage /></RequireOpen>} />
            <Route path="news" element={<RequireOpen><News /></RequireOpen>} />
            <Route path="updates" element={<RequireOpen><Updates /></RequireOpen>} />
            <Route path="market" element={<RequireOpen><Market /></RequireOpen>} />
            <Route path="auction" element={<RequireOpen><Auction /></RequireOpen>} />
            <Route path="leaders" element={<RequireOpen><Leaders /></RequireOpen>} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="craft" element={<RequireOpen><Craft /></RequireOpen>} />
            <Route path="minigames" element={<RequireOpen><MiniGames /></RequireOpen>} />
            <Route path="shop" element={<Shop />} />
            <Route path="premium" element={<Premium />} />
            <Route path="ton" element={<RequireOpen><TonMarket /></RequireOpen>} />
            <Route path="profile" element={<Profile />} />
            <Route path="chat" element={<Chat />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}