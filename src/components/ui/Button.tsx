import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "violet" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  full?: boolean;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-neon text-black shadow-[0_10px_40px_-12px_rgba(163,255,18,0.75)] hover:shadow-[0_14px_52px_-10px_rgba(163,255,18,0.9)] hover:bg-[#b4ff41]",
  violet:
    "bg-violet text-white shadow-[0_10px_40px_-14px_rgba(139,92,246,0.9)] hover:bg-[#9b6ffc]",
  ghost: "bg-white/6 text-white/90 border border-white/10 hover:bg-white/10 hover:border-white/20",
  outline:
    "bg-transparent text-white/85 border border-white/15 hover:bg-white/5 hover:border-white/30",
  danger: "bg-mythic/15 text-mythic border border-mythic/30 hover:bg-mythic/25",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[12.5px] rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm rounded-2xl gap-2",
  lg: "h-14 px-8 text-[15px] rounded-2xl gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  full,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <motion.button
      whileHover={rest.disabled ? undefined : { y: -1 }}
      whileTap={rest.disabled ? undefined : { scale: 0.975 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={[
        "relative inline-flex select-none items-center justify-center font-semibold tracking-tight",
        "transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        variants[variant],
        sizes[size],
        full ? "w-full" : "",
        className,
      ].join(" ")}
      {...(rest as object)}
    >
      {icon}
      {children}
    </motion.button>
  );
}