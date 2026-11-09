import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { Layout } from "./components/Layout";
import { DeviceChooser, useDeviceScope } from "./components/DeviceChooser";
import { RequireAuth } from "./components/RequireAuth";
import { RequireOpen } from "./components/RequireOpen";
import Landing from "./pages/Landing";
import { useGame } from "./store/useGame";
import { applyTheme } from "./lib/theme";
import { useStatsSync } from "./lib/useStatsSync";
import { useAccountMirror } from "./lib/useAccountMirror";
import { useGiftInbox } from "./lib/useGiftInbox";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Cases = lazy(() => import("./pages/Cases"));
const UpgradePage = lazy(() => import("./pages/Upgrade"));
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
  useStatsSync();
  useAccountMirror();
  useGiftInbox();
  useDeviceScope();

  const theme = useGame((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // "Анимации" switch: one class on <html> freezes every decorative motion
  const reduceMotion = useGame((s) => s.settings.reduceMotion);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("reduce-motion", reduceMotion);
    return () => root.classList.remove("reduce-motion");
  }, [reduceMotion]);

  return (
    <HashRouter>
      <DeviceChooser />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="cases" element={<RequireOpen><Cases /></RequireOpen>} />
            <Route path="upgrade" element={<RequireOpen><UpgradePage /></RequireOpen>} />
            <Route path="market" element={<RequireOpen><Market /></RequireOpen>} />
            <Route path="auction" element={<RequireOpen><Auction /></RequireOpen>} />
            <Route path="leaders" element={<RequireOpen><Leaders /></RequireOpen>} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="craft" element={<RequireOpen><Craft /></RequireOpen>} />
            <Route path="minigames" element={<RequireOpen><MiniGames /></RequireOpen>} />
            <Route path="shop" element={<Shop />} />
            <Route path="profile" element={<Profile />} />
            <Route path="chat" element={<Chat />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}