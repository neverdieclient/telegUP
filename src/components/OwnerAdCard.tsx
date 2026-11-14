import { Link } from "react-router-dom";
import type { OwnerAd } from "../lib/ownerAds";

/**
 * One card of the owner's own announcement.
 *
 * Deliberately quiet: it sits in the same place a network banner would, so it
 * must not shout louder than the site itself. A picture on the left (if given),
 * the text, and a single link — nothing to dismiss, nothing that moves.
 */
export function OwnerAdCard({ ad, className = "" }: { ad: OwnerAd; className?: string }) {
  const external = /^https?:\/\//i.test(ad.href);

  const body = (
    <div className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(120deg,rgba(255,255,255,0.05),rgba(255,255,255,0.012))] p-3 transition hover:border-white/16">
      {ad.image && (
        <img
          src={ad.image}
          alt=""
          loading="lazy"
          className="size-12 shrink-0 rounded-xl border border-white/8 object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/25">от администрации</p>
        <p className="mt-0.5 truncate text-[12.5px] font-extrabold tracking-tight">{ad.title}</p>
        {ad.text && <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-white/40">{ad.text}</p>}
      </div>
      {ad.cta && ad.href && (
        <span className="shrink-0 rounded-lg border border-neon/30 bg-neon/10 px-2.5 py-1 text-[10.5px] font-bold text-neon">
          {ad.cta}
        </span>
      )}
    </div>
  );

  if (!ad.href) return <div className={className}>{body}</div>;
  if (external)
    return (
      <a href={ad.href} target="_blank" rel="noopener noreferrer" className={className}>
        {body}
      </a>
    );
  return (
    <Link to={ad.href} className={className}>
      {body}
    </Link>
  );
}