/**
 * Verified check-marks, drawn after the reference set:
 *  - basic     -> sky-blue scalloped star with a white tick
 *  - premium   -> deeper blue badge with a star cut-out + two ribbon tails
 *  - owner     -> violet scalloped star with a gold crown
 *  - crown     -> soft blue gradient crown (collectible mark)
 *
 * All inline SVG: scales crisply, no external assets.
 */

export type CheckMarkKind = "basic" | "premium" | "owner" | "crown";

export const MARK_TITLE: Record<CheckMarkKind, string> = {
  basic: "Проверенный аккаунт",
  premium: "Премиум",
  owner: "Владелец",
  crown: "Коллекционный ник",
};

/** Scalloped "seal" outline used by the star-shaped badges. */
function sealPath(points = 10, outer = 12, inner = 10.2): string {
  const cx = 12;
  const cy = 12;
  const step = Math.PI / points;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    d += `${i === 0 ? "M" : "L"}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)} `;
  }
  return `${d}Z`;
}

const SEAL = sealPath(10, 12, 10.2);

/** The classic blue tick (reference 1). */
function BasicMark({ size, className, title }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "-0.15em" }}
    >
      <defs>
        <linearGradient id="cm-basic" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5ec9ff" />
          <stop offset="0.55" stopColor="#1f9bf0" />
          <stop offset="1" stopColor="#1a7fd4" />
        </linearGradient>
      </defs>
      <path d={SEAL} fill="url(#cm-basic)" />
      <path
        d="M7.1 12.2 L10.4 15.5 L16.9 9"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Premium seal with a star cut-out and two ribbon tails (reference 2). */
function PremiumMark({ size, className, title }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "-0.15em", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="cm-prem" x1="4" y1="2" x2="20" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#54acff" />
          <stop offset="0.5" stopColor="#1f8ff0" />
          <stop offset="1" stopColor="#1c7cf2" />
        </linearGradient>
        <linearGradient id="cm-ribbon" x1="0" y1="12" x2="0" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#37a2ff" />
          <stop offset="1" stopColor="#1c5cff" />
        </linearGradient>
      </defs>
      {/* ribbons: symmetric, tucked under the seal, staying inside the viewBox */}
      <path d="M9.1 13.4 L8.3 21.4 L11.0 19.2 L12.0 21.6 L12.9 13.6 Z" fill="url(#cm-ribbon)" />
      <path d="M14.9 13.4 L15.7 21.4 L13.0 19.2 L12.0 21.6 L11.1 13.6 Z" fill="url(#cm-ribbon)" />
      <path d={SEAL} fill="url(#cm-prem)" />
      <path
        d="M12 5.4 L13.74 8.92 L17.61 9.48 L14.81 12.2 L15.47 16.05 L12 14.23 L8.53 16.05 L9.19 12.2 L6.39 9.48 L10.26 8.92 Z"
        fill="#ffffff"
      />
    </svg>
  );
}

/** Violet seal + gold crown (reference 3). */
function OwnerMark({ size, className, title }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "-0.15em" }}
    >
      <defs>
        <linearGradient id="cm-owner" x1="3" y1="1" x2="21" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#6d3fd1" />
        </linearGradient>
        <linearGradient id="cm-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#ffc23d" />
        </linearGradient>
      </defs>
      <path d={SEAL} fill="url(#cm-owner)" />
      <path
        d="M6.6 15.4 L7.0 8.7 L9.9 11.1 L12 8.2 L14.1 11.1 L17.0 8.7 L17.4 15.4 Z"
        fill="url(#cm-gold)"
        stroke="#ffd97a"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Soft blue crown (reference 4). */
function CrownMark({ size, className, title }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "-0.15em" }}
    >
      <defs>
        <linearGradient id="cm-crown" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2fc0ff" />
          <stop offset="0.45" stopColor="#63d0ff" />
          <stop offset="1" stopColor="#92a9ff" />
        </linearGradient>
      </defs>
      <path
        d="M3.8 8.2 L7.4 11.4 L12 5.2 L16.6 11.4 L20.2 8.2 L18.6 19.0 L5.4 19.0 Z"
        fill="url(#cm-crown)"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type MarkProps = { size: number; className: string; title: string };

export function CheckMark({
  kind = "basic",
  size = 14,
  className = "",
  title,
}: {
  kind?: CheckMarkKind;
  size?: number;
  className?: string;
  title?: string;
}) {
  const props: MarkProps = { size, className, title: title ?? MARK_TITLE[kind] };
  switch (kind) {
    case "premium":
      return <PremiumMark {...props} />;
    case "owner":
      return <OwnerMark {...props} />;
    case "crown":
      return <CrownMark {...props} />;
    case "basic":
    default:
      return <BasicMark {...props} />;
  }
}
