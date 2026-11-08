import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useGame } from "../store/useGame";
import { BADGES, BADGE_BY_ID, DISCLAIMER, GIFTS, RARITY_META } from "../data/gifts";
import { GiftArt, StarIcon } from "../components/gifts/GiftArt";
import { CheckMark, type CheckMarkKind } from "../components/ui/CheckMark";
import { Button } from "../components/ui/Button";
import { useAuth } from "../lib/players";
import { onlineEnabled } from "../lib/supabase";
import { grantMark, searchPlayers, type PlayerRow } from "../lib/players";
import { getLocalSession, localSignIn, isOwnerEmail, verifyOwner } from "../lib/localAuth";

/**
 * The single account allowed into the panel.
 *
 * The email is public knowledge — it is only the "who", never the "how".
 * The password is verified by Supabase (hashed server-side), so it is never
 * present in this bundle. Anyone can read this file in devtools and still be
 * unable to sign in without the real password.
 */
const OWNER_EMAIL = "oleg123456789123456@gmail.com";

const MARK_LIST: { id: CheckMarkKind; label: string }[] = [
  { id: "owner", label: "Овнер" },
  { id: "premium", label: "Premium" },
  { id: "basic", label: "Проверенный" },
  { id: "crown", label: "Коллекционный" },
];

function Panel({
  title,
  desc,
  badge,
  children,
}: {
  title: string;
  desc?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13.5px] font-extrabold tracking-tight">{title}</h2>
          {desc && <p className="mt-0.5 text-[11px] leading-relaxed text-white/30">{desc}</p>}
        </div>
        {badge && (
          <span className="shrink-0 rounded-md border border-mythic/30 bg-mythic/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-mythic">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Owner-only gate: online → Supabase email; offline → local owner login. */
export function useIsOwner() {
  const { user, loading } = useAuth();
  const [localOwner, setLocalOwner] = useState<boolean>(() => isOwnerEmail(getLocalSession()?.email));
  const [isOwner, setIsOwner] = useState(false);

  const email = (user?.email ?? "").trim().toLowerCase();
  useEffect(() => {
    setIsOwner(Boolean(user) && email === OWNER_EMAIL);
  }, [user, email]);

  const checked = !loading;

  return {
    isOwner: onlineEnabled ? isOwner : localOwner,
    checked,
    user,
    signInLocal: (mail: string, pass: string) => {
      const ok = verifyOwner(mail, pass);
      if (ok) {
        localSignIn(mail, pass);
        setLocalOwner(true);
      }
      return ok;
    },
    signOutLocal: () => setLocalOwner(false),
  };
}

/** Offline owner login — email + password, both typed by the owner. */
function LocalUnlock({ onOk }: { onOk: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyOwner(email, password)) {
      setError("Неверная почта или пароль");
      return;
    }
    localSignIn(email, password);
    setError(null);
    onOk();
  };

  return (
    <div className="mx-auto grid min-h-[60vh] w-full max-w-md place-items-center">
      <form onSubmit={submit} className="w-full rounded-3xl border border-mythic/25 bg-mythic/[0.06] p-6">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-mythic/30 bg-mythic/10">
          <svg viewBox="0 0 24 24" className="size-6 text-mythic" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="4" y="10" width="16" height="10" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        </span>
        <h1 className="mt-4 text-center font-display text-xl font-black tracking-tight">Вход в админку</h1>
        <p className="mt-1.5 text-center text-[12px] leading-relaxed text-white/40">
          Только для владельца сайта.
        </p>

        <div className="mt-4 space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            autoComplete="username"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[13px] text-white outline-none placeholder:text-white/20 focus:border-mythic/40"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="пароль"
            autoComplete="current-password"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[13px] text-white outline-none placeholder:text-white/20 focus:border-mythic/40"
          />
          {error && (
            <p className="rounded-xl border border-mythic/30 bg-mythic/10 px-3 py-2 text-[11.5px] font-semibold text-mythic">
              {error}
            </p>
          )}
          <Button full size="lg">
            Войти
          </Button>
        </div>
      </form>
    </div>
  );
}

function Locked() {
  return (
    <div className="mx-auto grid min-h-[60vh] w-full max-w-md place-items-center">
      <div className="w-full rounded-3xl border border-mythic/25 bg-mythic/[0.06] p-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-mythic/30 bg-mythic/10">
          <svg viewBox="0 0 24 24" className="size-6 text-mythic" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="4" y="10" width="16" height="10" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        </span>
        <h1 className="mt-4 font-display text-xl font-black tracking-tight">Доступ закрыт</h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">
          Админ-панель доступна только аккаунту владельца.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link to="/auth">
            <Button full size="sm">
              Войти
            </Button>
          </Link>
          <Link to="/app">
            <Button full size="sm" variant="ghost">
              В приложение
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { isOwner, checked, user } = useIsOwner();
  const [, forceUnlock] = useState(0);
  const stars = useGame((s) => s.stars);
  const inventory = useGame((s) => s.inventory);
  const profile = useGame((s) => s.profile);
  const stats = useGame((s) => s.stats);
  const adminGrantStars = useGame((s) => s.adminGrantStars);
  const adminGrantBadge = useGame((s) => s.adminGrantBadge);
  const adminRevokeBadge = useGame((s) => s.adminRevokeBadge);
  const adminGrantPremium = useGame((s) => s.adminGrantPremium);
  const adminClearInventory = useGame((s) => s.adminClearInventory);
  const adminReset = useGame((s) => s.adminReset);
  const toggleMark = useGame((s) => s.toggleMark);
  const addItem = useGame((s) => s.addItem);
  const toast = useGame((s) => s.toast);

  const [amount, setAmount] = useState(100000);
  const [giftQuery, setGiftQuery] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  // player lookup for granting to other players
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");

  useEffect(() => {
    if (!isOwner || playerQuery.trim().length < 2) {
      setPlayers([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchPlayers(playerQuery.trim()).then(setPlayers);
    }, 300);
    return () => window.clearTimeout(t);
  }, [isOwner, playerQuery]);

  const found = giftQuery.trim()
    ? GIFTS.filter(
        (g) =>
          g.name.toLowerCase().includes(giftQuery.trim().toLowerCase()) ||
          g.variant.toLowerCase().includes(giftQuery.trim().toLowerCase()),
      ).slice(0, 24)
    : [];

  if (!checked) {
    return <p className="py-16 text-center text-[12px] text-white/30">Проверка доступа…</p>;
  }
  if (!isOwner) {
    if (!onlineEnabled) return <LocalUnlock onOk={() => forceUnlock((n) => n + 1)} />;
    return <Locked />;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-mythic">
            <CheckMark kind="owner" size={13} /> Owner
          </p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Админ-панель</h1>
          <p className="mt-1 text-[12.5px] text-white/35">
            {user?.email} · выдача подарков и знаков игрокам
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
          <StarIcon className="size-4 text-neon" />
          <span className="text-[15px] font-extrabold tabular-nums">{stars.toLocaleString("ru-RU")}</span>
          <span className="text-[11px] text-white/30">· {inventory.length} предметов</span>
        </div>
      </header>

      <div className="grid gap-3.5 lg:grid-cols-2">
        {/* ---------------- players + marks ---------------- */}
        <Panel
          title="Игроки и знаки"
          desc="Найди игрока по нику и выдай ему знак верификации."
          badge="players"
        >
          <input
            value={playerQuery}
            onChange={(e) => setPlayerQuery(e.target.value)}
            placeholder="Ник или юзернейм"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
          />
          {!onlineEnabled && (
            <p className="mt-2 rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-[11px] text-white/30">
              Онлайн-база не подключена — доступен только локальный профиль ниже.
            </p>
          )}
          <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
            {players.map((p) => (
              <div key={p.id} className="rounded-xl border border-white/8 bg-black/25 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-bold">
                    @{p.nickname}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-white/30">
                    {p.inventory_value.toLocaleString("ru-RU")}★
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {MARK_LIST.map((m) => (
                    <button
                      key={m.id}
                      onClick={async () => {
                        const res = await grantMark(p.id, m.id);
                        if (res?.error) {
                          toast({ kind: "error", title: "Не удалось", message: res.error });
                        } else {
                          toast({ kind: "success", title: `Знак «${m.label}» → @${p.nickname}` });
                        }
                      }}
                      className="flex items-center gap-1 rounded-lg border border-white/8 px-1.5 py-1 text-[10px] font-bold text-white/55 hover:border-neon/30 hover:text-white"
                    >
                      <CheckMark kind={m.id} size={12} />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {playerQuery.trim().length >= 2 && players.length === 0 && (
              <p className="py-3 text-center text-[11px] text-white/25">Никого не нашли</p>
            )}
          </div>

          <div className="mt-3 border-t border-white/6 pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
              мой профиль
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MARK_LIST.map((m) => {
                const on = profile.marks.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMark(m.id)}
                    className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      on ? "border-neon/30 bg-neon/[0.08] text-white" : "border-white/8 text-white/45 hover:text-white"
                    }`}
                  >
                    <CheckMark kind={m.id} size={14} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* ---------------- gifts ---------------- */}
        <Panel title="Выдать подарки" desc="Поиск по всей базе реальных подарков Telegram." badge="gifts">
          <input
            value={giftQuery}
            onChange={(e) => setGiftQuery(e.target.value)}
            placeholder="Plush Pepe, Durov…"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
          />
          <div className="mt-2.5 grid max-h-52 grid-cols-3 gap-1.5 overflow-y-auto">
            {found.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  addItem(g.id, "admin");
                  toast({ kind: "gift", title: g.name, message: g.variant });
                }}
                className={`flex flex-col items-center rounded-xl border p-1.5 ${RARITY_META[g.rarity].ring} hover:bg-white/5`}
              >
                <GiftArt gift={g} size={34} rounded="rounded-md" />
                <p className="mt-0.5 w-full truncate text-center text-[8.5px] font-bold text-white/60">
                  {g.variant === "Gift" ? g.name : g.variant}
                </p>
              </button>
            ))}
            {!found.length && (
              <p className="col-span-3 py-6 text-center text-[11px] text-white/25">
                Введите название, чтобы найти подарок
              </p>
            )}
          </div>
        </Panel>

        {/* ---------------- economy ---------------- */}
        <Panel title="Экономика" desc="Звёзды и бейджи локального профиля." badge="stars">
          <div className="flex items-end gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12.5px] font-bold tabular-nums outline-none focus:border-neon/40"
            />
            <Button size="sm" onClick={() => adminGrantStars(amount)}>
              +★
            </Button>
            <Button size="sm" variant="ghost" onClick={() => adminGrantStars(-amount)}>
              −★
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {BADGES.map((b) => {
              const on = profile.badges.includes(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => (on ? adminRevokeBadge(b.id) : adminGrantBadge(b.id))}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left ${
                    on ? "bg-white/[0.06]" : "border-white/8 hover:bg-white/[0.04]"
                  }`}
                  style={on ? { borderColor: `${b.color}66` } : undefined}
                >
                  <span className="truncate text-[11px] font-bold" style={{ color: b.color }}>
                    {b.label}
                  </span>
                  <span className="text-[9px] text-white/30">{BADGE_BY_ID[b.id] ? (on ? "✓" : "") : ""}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" variant="violet" onClick={() => adminGrantPremium(profile.tier !== "Premium")}>
              {profile.tier === "Premium" ? "Снять Premium" : "Выдать Premium"}
            </Button>
            <Button size="sm" variant="ghost" onClick={adminClearInventory}>
              Очистить инвентарь
            </Button>
          </div>
          <Button full size="sm" variant="danger" className="mt-2" onClick={() => setConfirmReset(true)}>
            Полный сброс аккаунта
          </Button>
        </Panel>

        {/* ---------------- stats ---------------- */}
        <Panel title="Статистика" desc="Счётчики текущего браузера." badge="stats">
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ["кейсов", stats.casesOpened],
                ["апгрейд +", stats.upgradesWon],
                ["апгрейд −", stats.upgradesLost],
                ["маркет", stats.marketBuys],
                ["продано", stats.giftsSold],
                ["pvp +", stats.pvpWins],
                ["pvp −", stats.pvpLosses],
                ["crash", stats.crashWins],
                ["mines", stats.minesWins],
                ["dice", stats.diceWins],
                ["wheel", stats.wheelWins],
                ["tower", stats.towerWins],
              ] as [string, number][]
            ).map(([l, v]) => (
              <div key={l} className="rounded-xl border border-white/7 bg-white/[0.02] px-2.5 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/25">{l}</p>
                <p className="text-[12.5px] font-extrabold tabular-nums text-white/80">{v}</p>
              </div>
            ))}
          </div>
          <Link to="/app" className="mt-3 block">
            <Button full size="sm" variant="ghost">
              ← В приложение
            </Button>
          </Link>
        </Panel>
      </div>

      <p className="rounded-2xl border border-white/6 bg-white/[0.02] p-3.5 text-center text-[10.5px] leading-relaxed text-white/25">
        {DISCLAIMER}
      </p>

      {confirmReset && (
        <div
          onClick={() => setConfirmReset(false)}
          className="fixed inset-0 z-[95] grid place-items-center bg-black/80 p-5 backdrop-blur"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-3xl border border-mythic/25 bg-[#0f0f13] p-5 text-center"
          >
            <p className="text-[15px] font-extrabold">Сбросить всё?</p>
            <p className="mt-1 text-[11.5px] text-white/35">
              Инвентарь, баланс, бейджи и настройки вернутся к стартовым.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                Отмена
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  adminReset();
                  setConfirmReset(false);
                  toast({ kind: "info", title: "Аккаунт сброшен" });
                }}
              >
                Сбросить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}