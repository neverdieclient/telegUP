import { motion } from "framer-motion";
import type { CheckMarkKind } from "../../components/ui/CheckMark";

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[12.5px] font-bold text-white/85">{label}</p>
        {hint && <p className="text-[10.5px] text-white/30">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-[2px] transition-colors duration-200 ${
        on ? "border-neon/45 bg-neon/25" : "border-white/12 bg-white/8"
      }`}
    >
      <motion.span
        initial={false}
        animate={{ x: on ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={`block size-[16px] shrink-0 rounded-full shadow-sm ${
          on ? "bg-neon shadow-[0_0_10px_rgba(163,255,18,0.55)]" : "bg-white/60"
        }`}
      />
    </button>
  );
}

export const MARKS: { id: CheckMarkKind; label: string; desc: string }[] = [
  { id: "owner", label: "Овнер", desc: "Владелец проекта" },
  { id: "premium", label: "Premium", desc: "Премиум-аккаунт" },
  { id: "basic", label: "Проверенный", desc: "Верифицированный аккаунт" },
  { id: "crown", label: "Коллекционный", desc: "Редкий коллекционный статус" },
];
