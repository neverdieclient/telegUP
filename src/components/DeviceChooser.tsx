import { useEffect } from "react";
import { motion } from "framer-motion";
import { useGame, type DeviceMode } from "../store/useGame";

/**
 * First-visit screen: pick the computer or the phone version.
 *
 * - «Компьютерная» keeps the responsive build exactly as it is (auto).
 * - «Мобильная» pins the phone frame on any screen: the shell narrows, the
 *   desktop sidebar disappears and the bottom tab bar takes over.
 *
 * The choice is stored, so the screen shows once. It can be reopened from
 * Настройки to switch later.
 */
export function DeviceChooser() {
  const deviceChosen = useGame((s) => s.deviceChosen);
  const chooseDevice = useGame((s) => s.chooseDevice);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: deviceChosen ? 0 : 1 }}
      style={{ pointerEvents: deviceChosen ? "none" : "auto" }}
      className="fixed inset-0 z-[200] grid place-items-center overflow-y-auto bg-ink/95 p-5 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="w-full max-w-lg"
      >
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-neon/30 bg-neon/10">
            <svg viewBox="0 0 24 24" className="size-7 text-neon" fill="currentColor">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
            </svg>
          </span>
          <h1 className="mt-4 font-display text-2xl font-black tracking-tight">
            teleg<span className="text-neon">UP</span>
          </h1>
          <p className="mt-1 text-[13px] text-white/45">
            Выбери версию. Потом можно поменять в настройках.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            title="Компьютерная"
            desc="Обычная раскладка: боковое меню, широкие карточки. Крутится с любого экрана."
            icon="M3 5h18v11H3Zm5 14h8M12 16v3"
            onPick={() => chooseDevice("auto")}
            accent="neon"
          />
          <Choice
            title="Мобильная"
            desc="Узкий фрейм под телефон: нижнее меню, крупные кнопки, всё под палец."
            icon="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 16h4"
            onPick={() => chooseDevice("mobile")}
            accent="violet"
          />
        </div>

        <p className="mt-5 text-center text-[10.5px] leading-relaxed text-white/30">
          Это игра. Все подарки вымышлены, реальный вывод средств невозможен.
        </p>
      </motion.div>
    </motion.div>
  );
}

function Choice({
  title,
  desc,
  icon,
  onPick,
}: {
  title: string;
  desc: string;
  icon: string;
  onPick: () => void;
  accent: "neon" | "violet";
}) {
  return (
    <button
      onClick={onPick}
      className="group flex flex-col items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-neon/40 hover:bg-white/[0.06]"
    >
      <span className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-black/40">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 text-neon group-hover:text-white"
        >
          <path d={icon} />
        </svg>
      </span>
      <span className="text-[15px] font-extrabold">{title}</span>
      <span className="text-[11.5px] leading-relaxed text-white/45">{desc}</span>
    </button>
  );
}

/** Applies the stored device mode to <html> so the CSS can react. */
export function useDeviceScope() {
  const deviceMode = useGame((s) => s.deviceMode);
  useEffect(() => {
    if (deviceMode === "mobile") {
      document.documentElement.dataset.device = "mobile";
    } else {
      delete document.documentElement.dataset.device;
    }
  }, [deviceMode]);
}

export type { DeviceMode };
