import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useGame } from "../store/useGame";
import { RARITY_META, BADGE_BY_ID } from "../data/gifts";
import { useAllGifts, useGiftIndex } from "../lib/useCatalog";
import { StarIcon, GiftArt } from "../components/gifts/GiftArt";
import { CheckMark } from "../components/ui/CheckMark";
import { FortuneGame } from "../components/FortuneGame";

/* --------------------------------------------------------------- layout bits */

/** One compact number inside the header's stat strip. */
function HeaderStat({
  label,
  value,
  accent = "text-white/90",
  icon,
}: {
  label: string;
  value: string;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-[116px] flex-1 flex-col rounded-2xl border border-white/8 bg-black/25 px-3.5 py-2.5 backdrop-blur">
      <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-white/35">
        {icon}
        {label}
      </span>
      <span className={`mt-0.5 text-[19px] font-black tabular-nums leading-none ${accent}`}>{value}</span>
    </div>
  );
}

/** Small secondary stat used under «Быстрый старт». */
function MiniStat({ label, value, accent = "text-white/85" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/7 bg-black/20 px-3 py-2">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-white/30">{label}</p>
      <p className={`mt-0.5 text-[15px] font-extrabold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

/** Verification marks shown next to the nickname — only «Проверенный». */
function ProfileMarks({ marks }: { marks: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {marks.includes("basic") && <CheckMark kind="basic" size={15} />}
    </span>
  );
}

/* -------------------------------------------------------------------- page */

const QUICK_LINKS = [
  { to: "/app/cases", label: "Кейсы", desc: "Рулетка подарков", color: "text-neon" },
  { to: "/app/upgrade", label: "Апгрейд", desc: "Повысь редкость", color: "text-violet" },
  { to: "/app/market", label: "Маркет", desc: "Подарки за ★", color: "text-neon" },
  { to: "/app/minigames", label: "Мини-игры", desc: "8 игр", color: "text-legendary" },
  { to: "/app/inventory", label: "Инвентарь", desc: "", color: "text-rare" },
  { to: "/app/leaders", label: "Топ игроков", desc: "Рейтинг", color: "text-mythic" },
] as const;

export default function Dashboard() {
  const { stars, inventory, profile, stats, joinedAt, lastFreeCaseAt } = useGame();
  const GIFT_BY_ID = useGiftIndex();
  const GIFTS = useAllGifts();

  const inventoryValue = useMemo(
    () => inventory.reduce((acc, i) => acc + (GIFT_BY_ID[i.giftId]?.stars ?? 0), 0),
    [inventory],
  );

  const recent = useMemo(() => [...inventory].slice(0, 6), [inventory]);

  const freeIn = useMemo(() => {
    if (!lastFreeCaseAt) return 0;
    return Math.max(0, lastFreeCaseAt + 86_400_000 - Date.now());
  }, [lastFreeCaseAt]);
  const freeReady = freeIn === 0;

  const upgradesTotal = stats.upgradesWon + stats.upgradesLost;
  const winRate = upgradesTotal > 0 ? Math.round((stats.upgradesWon / upgradesTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------ header card */}
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent p-5 backdrop-blur-xl md:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-neon/[0.09] blur-[80px]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {/* identity */}
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-violet to-[#3f2299] font-display text-2xl font-black shadow-[0_16px_40px_-18px_rgba(139,92,246,0.9)]">
                {profile.nickname.slice(0, 1).toUpperCase()}
              </span>
              {profile.tier === "Premium" && (
                <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border-2 border-ink bg-neon">
                  <StarIcon className="size-3.5 text-black" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">@{profile.nickname}</h1>
                <ProfileMarks marks={profile.marks} />
                <span className="rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neon">
                  {profile.tier}
                </span>
                {profile.badge && (
                  <span className="rounded-full border border-legendary/30 bg-legendary/10 px-2 py-0.5 text-[10px] font-bold text-legendary">
                    {profile.badge}
                  </span>
                )}
              </div>
              {/* collectible badges sit on their own row so the title stays clean */}
              {profile.badges.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {profile.badges.map((b) => {
                    const badge = BADGE_BY_ID[b];
                    if (!badge) return null;
                    return (
                      <span
                        key={b}
                        className="rounded-full border px-2 py-0.5 text-[9.5px] font-bold"
                        style={{ color: badge.color, borderColor: `${badge.color}55`, background: `${badge.color}18` }}
                      >
                        {badge.label}
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="mt-1.5 text-[12px] text-white/35">
                С нами с {new Date(joinedAt).toLocaleDateString("ru-RU")} ·{" "}
                {profile.anonymousNumber ? (
                  <span className="tabular-nums text-white/55">{profile.phoneNumber ?? "+888"}</span>
                ) : (
                  "обычный номер"
                )}
                {profile.collectibleUsername && (
                  <span className="text-violet"> · второй ник @{profile.collectibleUsername}</span>
                )}
              </p>
            </div>
          </div>

          {/* balances */}
          <div className="flex flex-wrap items-stretch gap-2.5 lg:shrink-0">
            <HeaderStat
              label="Баланс"
              accent="text-white"
              icon={<StarIcon className="size-3 text-neon" />}
              value={stars.toLocaleString("ru-RU")}
            />
            <HeaderStat label="Инвентарь" accent="text-violet" value={`${inventoryValue.toLocaleString("ru-RU")}★`} />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- main two-column */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* left column */}
        <div className="space-y-4">
          <FortuneGame />

          <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-white/[0.028] p-5 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 opacity-60 grid-bg" />

            <div className="relative mb-3.5 flex items-end justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-extrabold tracking-tight">Быстрый старт</h2>
                <p className="text-[11.5px] text-white/35">Открой кейс, прокачай подарок или сыграй</p>
              </div>
              <Link to="/app/cases" className="shrink-0 text-[11px] font-bold text-neon/80 hover:text-neon">
                В кейсы →
              </Link>
            </div>

            {/* quick links — uniform tiles, no empty description row */}
            <div className="relative grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {QUICK_LINKS.map((a) => (
                <Link
                  key={a.to}
                  to={a.to}
                  className="group flex flex-col justify-between rounded-2xl border border-white/8 bg-black/25 p-3.5 transition-all hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.05]"
                >
                  <p className={`text-[13.5px] font-extrabold tracking-tight ${a.color}`}>{a.label}</p>
                  <p className="mt-0.5 text-[10.5px] text-white/35">
                    {a.to === "/app/inventory" ? `${inventory.length} шт.` : a.desc}
                  </p>
                </Link>
              ))}
            </div>

            {/* stats strip — one clean row */}
            <div className="relative mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <MiniStat label="Кейсов" value={stats.casesOpened.toLocaleString("ru-RU")} />
              <MiniStat
                label="Апгрейды"
                value={`${stats.upgradesWon} / ${upgradesTotal}`}
                accent="text-violet"
              />
              <MiniStat label="Подарков" value={String(inventory.length)} accent="text-legendary" />
              <MiniStat label="Winrate" value={`${winRate}%`} accent="text-neon" />
            </div>
          </section>
        </div>

        {/* right column */}
        <section className="space-y-4">
          {/* free case — compact CTA */}
          <Link
            to="/app/cases"
            className="group relative block overflow-hidden rounded-3xl border border-neon/20 bg-gradient-to-br from-neon/[0.10] to-transparent p-4 transition-all hover:border-neon/40"
          >
            <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-neon/20 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neon/80">Бесплатно</p>
                <h3 className="mt-0.5 text-[15px] font-extrabold tracking-tight">Кейс раз в 24 часа</h3>
                <p className={`mt-0.5 text-[11.5px] font-bold ${freeReady ? "text-neon" : "text-white/40"}`}>
                  {freeReady ? "● Готов к открытию" : `Через ${Math.ceil(freeIn / 3600000)} ч`}
                </p>
              </div>
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-neon/25 bg-neon/10 text-neon transition-transform group-hover:scale-110">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M4 8h16v11H4Zm0 0V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1M12 9v4" />
                </svg>
              </span>
            </div>
          </Link>

          {/* recent gifts */}
          <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-extrabold tracking-tight">Последние подарки</h3>
              <Link to="/app/inventory" className="text-[11px] font-bold text-white/35 hover:text-white">
                Все →
              </Link>
            </div>
            {recent.length === 0 ? (
              <Link
                to="/app/cases"
                className="block rounded-2xl border border-dashed border-white/12 py-8 text-center transition-colors hover:border-white/25"
              >
                <p className="text-[12px] text-white/40">Пока пусто</p>
                <p className="text-[11px] text-white/25">Открой кейс →</p>
              </Link>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {recent.map((item) => {
                  const gift = GIFT_BY_ID[item.giftId];
                  if (!gift) return null;
                  const meta = RARITY_META[gift.rarity];
                  return (
                    <Link
                      key={item.id}
                      to="/app/inventory"
                      className={`flex flex-col items-center rounded-xl border bg-black/25 p-2 transition-colors hover:bg-white/[0.05] ${meta.ring}`}
                    >
                      <GiftArt gift={gift} size={40} rounded="rounded-lg" />
                      <p className="mt-1 w-full truncate text-center text-[9.5px] font-bold text-white/60">
                        {gift.name}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <p className="pt-1 text-center text-[10.5px] text-white/20">
        Всего подарков в базе: {GIFTS.length} · Это игра, реальный вывод невозможен.
      </p>
    </div>
  );
}
