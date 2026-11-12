import {
  NAME_GRADIENTS,
  BADGE_GLOWS,
  PROFILE_BANNERS,
  badgeGlow,
  nameGradient,
  profileBanner,
} from "../../data/cosmetics";

/**
 * Picker for the three decorative slots of a player card.
 *
 * The component is deliberately dumb: it renders the current value and calls
 * `onPick` — saving (local store vs. the owner RPC) is the caller's job. That
 * keeps the «себе» and «другому игроку» paths from drifting apart.
 */

export type CosmeticSlot = "name" | "badge" | "banner";

export const SLOT_TITLE: Record<CosmeticSlot, string> = {
  name: "Градиент ника",
  badge: "Свечение бейджей",
  banner: "Баннер профиля",
};

/** One swatch, used by every slot so the panel reads as a single grid. */
function Swatch({
  active,
  onClick,
  label,
  preview,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  preview: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={`group flex flex-col items-center gap-1 rounded-xl border p-1 transition-colors disabled:opacity-40 ${
        active
          ? "border-neon/50 bg-neon/[0.08]"
          : "border-white/8 bg-black/25 hover:border-white/20"
      }`}
    >
      <span className="grid h-7 w-full place-items-center overflow-hidden rounded-md">
        {preview}
      </span>
      <span className="w-full truncate text-center text-[8.5px] font-bold text-white/55">
        {label}
      </span>
    </button>
  );
}

export function CosmeticsPicker({
  slot,
  value,
  onPick,
  busy,
}: {
  slot: CosmeticSlot;
  value: string | null;
  onPick: (id: string | null) => void;
  busy?: boolean;
}) {
  const current =
    slot === "name"
      ? nameGradient(value)?.id
      : slot === "badge"
        ? badgeGlow(value)?.id
        : profileBanner(value)?.id;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-4 gap-1">
        {slot === "name" &&
          NAME_GRADIENTS.map((g) => (
            <Swatch
              key={g.id}
              label={g.label}
              active={current === g.id}
              disabled={busy}
              onClick={() => onPick(current === g.id ? null : g.id)}
              preview={
                <span
                  className="grid h-full w-full place-items-center bg-clip-text text-[14px] font-black text-transparent"
                  style={{ backgroundImage: g.background }}
                >
                  Aa
                </span>
              }
            />
          ))}

        {slot === "badge" &&
          BADGE_GLOWS.map((g) => (
            <Swatch
              key={g.id}
              label={g.label}
              active={current === g.id}
              disabled={busy}
              onClick={() => onPick(current === g.id ? null : g.id)}
              preview={
                <span
                  className="grid size-5 place-items-center rounded-full border text-[9px] font-bold"
                  style={{
                    color: g.color,
                    borderColor: `${g.color}66`,
                    background: `${g.color}22`,
                    boxShadow: `0 0 9px 2px ${g.color}66`,
                  }}
                >
                  ★
                </span>
              }
            />
          ))}

        {slot === "banner" &&
          PROFILE_BANNERS.map((b) => (
            <Swatch
              key={b.id}
              label={b.label}
              active={current === b.id}
              disabled={busy}
              onClick={() => onPick(current === b.id ? null : b.id)}
              preview={
                <span
                  className="h-full w-full"
                  style={{
                    backgroundImage: b.overlay ? `${b.overlay}, ${b.background}` : b.background,
                    backgroundSize:
                      b.id === "grid" || b.id === "matrix" ? "9px 9px, 9px 9px, auto" : undefined,
                  }}
                />
              }
            />
          ))}
      </div>

      {current && (
        <button
          type="button"
          onClick={() => onPick(null)}
          disabled={busy}
          className="w-full rounded-lg border border-white/8 py-1 text-[10px] font-bold text-white/40 hover:text-white/80 disabled:opacity-40"
        >
          убрать
        </button>
      )}
    </div>
  );
}