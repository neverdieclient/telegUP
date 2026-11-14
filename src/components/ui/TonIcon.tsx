/**
 * The TON diamond, drawn inline so it can follow the accent colour.
 *
 * TON's logo is a faceted diamond; a flat two-tone version reads correctly at
 * 12–16 px next to a number, which is where it is used (balances, prices,
 * the payout panel).
 */
export function TonIcon({
  className = "",
  size = 16,
  flat = false,
}: {
  className?: string;
  size?: number;
  /** one solid colour instead of the gradient facets */
  flat?: boolean;
}) {
  const id = flat ? "ton-flat" : "ton-grad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      role="img"
    >
      {!flat && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4aa8ff" />
            <stop offset="55%" stopColor="#2f7fe0" />
            <stop offset="100%" stopColor="#1a5fbf" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2 2.5 6.1 12 22l9.5-15.9Z"
        fill={flat ? "currentColor" : `url(#${id})`}
      />
      {!flat && (
        <>
          {/* the two inner facets: a lighter left face and a darker right one */}
          <path d="M12 22 2.5 6.1H12Z" fill="#ffffff" opacity="0.14" />
          <path d="M21.5 6.1H12L12 22Z" fill="#000000" opacity="0.16" />
          {/* the horizontal bar across the top, like the real mark */}
          <path d="M15.2 7.4h5.1L12 21.2V17.4Z" fill="#ffffff" opacity="0.55" />
          <path d="M13.4 6.1h8.1L12 22 13.4 6.1Z" fill="#ffffff" opacity="0.22" />
        </>
      )}
    </svg>
  );
}