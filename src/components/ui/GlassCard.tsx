import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export function GlassCard({ children, className = "", hover = false }: Props) {
  return (
    <div
      className={[
        "relative rounded-3xl border border-white/8 bg-white/[0.035] backdrop-blur-sm",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_-40px_rgba(0,0,0,0.9)]",
        hover
          ? "transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.055]"
          : "",
        className,
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {children}
    </div>
  );
}