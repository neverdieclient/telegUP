import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useGame, formatPhoneNumber, PHONE_FORMATS } from "../store/useGame";
import { BADGES, DISCLAIMER, RARITY_META } from "../data/gifts";
import { useAllGifts, useGiftIndex } from "../lib/useCatalog";
import { CustomGiftEditor } from "./admin/CustomGiftEditor";
import { BoostPanel } from "./admin/BoostPanel";
import { AuctionAdmin } from "./admin/AuctionAdmin";
import { GiftArt, StarIcon } from "../components/gifts/GiftArt";
import { CheckMark, type CheckMarkKind } from "../components/ui/CheckMark";
import { Button } from "../components/ui/Button";
import { onlineEnabled } from "../lib/supabase";
import {
  adminGiveBadge,
  adminGiveStars,
  adminGiveTon,
  adminSetTier,
  adminSetUpgradeLuck,
  adminTakeBadge,
  adminTakeMark,
  fetchBans,
  fetchLoginEvents,
  fetchPlayer,
  fetchPlayerInventory,
  fetchTop,
  grantMark,
  ownerBan,
  ownerDeliverGift,
  ownerSetCosmetics,
  ownerSetProfile,
  ownerUnban,
  searchPlayers,
  type BanKind,
  type BanRow,
  type LoginEventRow,
  type RemoteInventoryItem,
  type PlayerRow,
} from "../lib/players";
import { getLocalSession, localSignIn, verifyOwner } from "../lib/localAuth";
import { useOwner } from "../lib/useOwner";
import { CosmeticsPicker, SLOT_TITLE, type CosmeticSlot } from "./admin/CosmeticsPicker";

import { AuditDesk, DiscountDesk, PromoDesk } from "./admin/GrowthDesk";
import { AdsDesk, GiftShopDesk } from "./admin/ShopDesk";
import { SnapshotDesk } from "./admin/SnapshotDesk";

/**
 * The single account allowed into the panel.
 *
 * The email is public knowledge — it is only the "who", never the "how".
 * The password is verified by Supabase (hashed server-side), so it is never
 * present in this bundle. Anyone can read this file in devtools and still be
 * unable to sign in without the real password.
 *
 * The check itself lives in `lib/useOwner` so the navigation, the maintenance
 * gate and this console can never disagree about who the owner is.
 */

const MARK_LIST: { id: CheckMarkKind; label: string }[] = [
  { id: "basic", label: "Проверенный" },
];

/** Tabs keep the console to one screen — nothing is stacked six panels deep. */
type AdminTab = "players" | "cosmetics" | "content" | "growth" | "site";

const ADMIN_TABS: { id: AdminTab; label: string; hint: string }[] = [
  { id: "players", label: "Игроки", hint: "выдача, звёзды, знаки, бейджи" },
  { id: "cosmetics", label: "Красоты", hint: "градиент, свечение, баннер" },
  { id: "content", label: "Контент", hint: "подарки, аукцион, буст" },
  { id: "growth", label: "Рост", hint: "промокоды, скидка, журнал действий" },
  { id: "site", label: "Сайт", hint: "обслуживание, реклама, магазин" },
];

function TabBar({ tab, onPick }: { tab: AdminTab; onPick: (t: AdminTab) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-black/30 p-1">
      {ADMIN_TABS.map((t) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            title={t.hint}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
              on ? "bg-white/10 text-white" : "text-white/40 hover:text-white/75"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

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

/** Small pill used for the account action rows. */
function Chip({
  on,
  onClick,
  children,
  title,
}: {
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-bold transition-colors ${
        on
          ? "border-neon/35 bg-neon/[0.08] text-white"
          : "border-white/8 text-white/45 hover:border-neon/25 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Bans + login journal. The owner sees every recent login (ip, device, time,
 * nickname) and can ban by ip / device / account, or lift a ban. Rows are the
 * offender's last-known identity so a nickname change does not hide them.
 */
function BanPanel() {
  const [bans, setBans] = useState<BanRow[]>([]);
  const [events, setEvents] = useState<LoginEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualKind, setManualKind] = useState<BanKind>("ip");
  const [tab, setTab] = useState<"bans" | "log">("log");
  const toast = useGame((s) => s.toast);

  const load = async () => {
    setLoading(true);
    const [b, e] = await Promise.all([fetchBans(), fetchLoginEvents(200)]);
    setBans(b);
    setEvents(e);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doBan = async (kind: BanKind, value: string, label?: string | null) => {
    if (!value) return;
    setBusy(true);
    const res = await ownerBan(kind, value, label ?? null, null);
    setBusy(false);
    if (res.error) {
      toast({ kind: "error", title: "Не вышло", message: res.error });
      return;
    }
    toast({ kind: "success", title: "Забанен" });
    void load();
  };

  const doUnban = async (id: number) => {
    setBusy(true);
    const res = await ownerUnban(id);
    setBusy(false);
    if (res.error) {
      toast({ kind: "error", title: "Не вышло", message: res.error });
      return;
    }
    toast({ kind: "success", title: "Разбанен" });
    void load();
  };

  const isBanned = (kind: BanKind, value: string | null | undefined) =>
    Boolean(value) && bans.some((b) => b.kind === kind && b.value === value);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Panel
      title="Блокировки и входы"
      desc="Кто, откуда и с какого устройства заходил. Бан по IP, устройству или аккаунту."
      badge="bans"
    >
      <div className="mb-3 flex gap-1.5">
        <Chip on={tab === "log"} onClick={() => setTab("log")}>
          Входы ({events.length})
        </Chip>
        <Chip on={tab === "bans"} onClick={() => setTab("bans")}>
          Баны ({bans.length})
        </Chip>
        <span className="flex-1" />
        <Chip onClick={() => void load()}>Обновить</Chip>
      </div>

      {loading && <p className="py-3 text-center text-[11px] text-white/30">Загрузка…</p>}

      {!loading && tab === "log" && (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {events.length === 0 && (
            <p className="py-3 text-center text-[11px] text-white/30">
              Пока пусто — входы появятся, как только игроки зайдут.
            </p>
          )}
          {events.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-bold">@{e.nickname ?? "—"}</span>
                  {e.vpn_flag && (
                    <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1 py-px text-[8.5px] font-bold uppercase text-amber-300">
                      VPN?
                    </span>
                  )}
                  {isBanned("ip", e.ip) && (
                    <span className="rounded-md border border-mythic/30 bg-mythic/10 px-1 py-px text-[8.5px] font-bold uppercase text-mythic">
                      бан ip
                    </span>
                  )}
                  {isBanned("device", e.fingerprint) && (
                    <span className="rounded-md border border-mythic/30 bg-mythic/10 px-1 py-px text-[8.5px] font-bold uppercase text-mythic">
                      бан устр.
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[10px] tabular-nums text-white/35">
                  {e.ip ?? "ip ?"} · {e.fingerprint ?? "dev ?"} · {fmt(e.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Chip title="Забанить этот IP" onClick={() => e.ip && void doBan("ip", e.ip, e.nickname)}>
                  IP
                </Chip>
                <Chip
                  title="Забанить это устройство"
                  onClick={() => e.fingerprint && void doBan("device", e.fingerprint, e.nickname)}
                >
                  устр.
                </Chip>
                <Chip
                  title="Забанить аккаунт"
                  onClick={() => e.user_id && void doBan("user", e.user_id, e.nickname)}
                >
                  акк
                </Chip>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "bans" && (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {bans.length === 0 && (
            <p className="py-3 text-center text-[11px] text-white/30">Активных банов нет.</p>
          )}
          {bans.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-mythic/20 bg-mythic/[0.04] px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md border border-mythic/30 bg-mythic/10 px-1 py-px text-[8.5px] font-bold uppercase text-mythic">
                    {b.kind === "ip" ? "IP" : b.kind === "device" ? "Устройство" : "Аккаунт"}
                  </span>
                  {b.nickname && <span className="truncate text-[12px] font-bold">@{b.nickname}</span>}
                </div>
                <p className="mt-0.5 truncate text-[10px] tabular-nums text-white/35">
                  {b.value} · {fmt(b.created_at)}
                </p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void doUnban(b.id)}>
                Разбанить
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2 border-t border-white/8 pt-3">
        <select
          value={manualKind}
          onChange={(e) => setManualKind(e.target.value as BanKind)}
          className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-[11px] text-white/80 outline-none focus:border-neon/40"
        >
          <option value="ip">IP</option>
          <option value="device">Устройство</option>
          <option value="user">Аккаунт (uuid)</option>
        </select>
        <input
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
          placeholder="Значение для бана"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
        />
        <Button
          size="sm"
          variant="danger"
          disabled={busy || !manualValue.trim()}
          onClick={() => {
            void doBan(manualKind, manualValue.trim());
            setManualValue("");
          }}
        >
          Забанить
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Shows another player's gift inventory, so the owner can see what an account
 * actually holds before granting or revoking anything. `profiles` is
 * world-readable, so the jsonb inventory column comes down as-is.
 */
function PlayerInventory({ playerId, nickname }: { playerId: string; nickname: string }) {
  const [items, setItems] = useState<RemoteInventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const GIFT_BY_ID = useGiftIndex();

  useEffect(() => {
    if (!onlineEnabled) {
      setItems(null);
      return;
    }
    let dead = false;
    setItems(null);
    setError(null);
    fetchPlayerInventory(playerId)
      .then((res) => {
        if (!dead) setItems(res.items);
      })
      .catch((e: unknown) => {
        if (!dead) setError(e instanceof Error ? e.message : "Не удалось загрузить");
      });
    return () => {
      dead = true;
    };
  }, [playerId]);

  // newest first, and grouped so 40 «Plush Pepe» do not fill the panel
  const grouped = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, { giftId: string; count: number }>();
    for (const i of [...items].sort((a, b) => (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0))) {
      const entry = map.get(i.giftId) ?? { giftId: i.giftId, count: 0 };
      entry.count++;
      map.set(i.giftId, entry);
    }
    return [...map.values()];
  }, [items]);

  if (!onlineEnabled) {
    return (
      <p className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[11px] text-white/30">
        Инвентарь показывается только с подключённой онлайн-базой.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">
          Инвентарь @{nickname}
        </p>
        <span className="text-[10px] tabular-nums text-white/30">
          {items ? `${items.length} шт` : "…"}
        </span>
      </div>

      {error && (
        <p className="rounded-xl border border-mythic/30 bg-mythic/10 px-3 py-2 text-[11px] font-bold text-mythic">
          {error}
        </p>
      )}
      {!items && !error && <p className="text-[11px] text-white/25">Загрузка…</p>}
      {items && !items.length && (
        <p className="rounded-xl border border-white/8 bg-black/25 px-3 py-3 text-[11px] text-white/25">
          Инвентарь пуст.
        </p>
      )}

      {grouped.length > 0 && (
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {grouped.map((g) => {
            const gift = GIFT_BY_ID[g.giftId];
            return (
              <div
                key={g.giftId}
                className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/25 px-2 py-1.5"
              >
                <span className="grid size-8 shrink-0 place-items-center">
                  {gift ? (
                    <GiftArt gift={gift} size={28} rounded="rounded-md" />
                  ) : (
                    <span className="grid size-7 place-items-center rounded-md border border-white/10 text-[10px] text-white/30">
                      ?
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-bold">
                    {gift ? gift.name : "Неизвестный подарок"}
                    {gift && gift.variant !== "Gift" && (
                      <span className="font-normal text-white/40"> · {gift.variant}</span>
                    )}
                  </span>
                  {!gift && (
                    <span className="block truncate text-[10px] text-white/30">{g.giftId}</span>
                  )}
                </span>
                {gift && (
                  <span className="shrink-0 text-[10px] tabular-nums text-white/35">
                    {gift.stars.toLocaleString("ru-RU")}★
                  </span>
                )}
                <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white/60">
                  ×{g.count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Owner-only gate, shared with the navigation (see lib/useOwner). */

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

/** Leaderboard picker: click a row to load that player into the action panel. */
function TopPlayers({ onPick }: { onPick: (p: PlayerRow) => void }) {
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    fetchTop(20).then((r) => {
      if (!dead) {
        setRows(Array.isArray(r) ? r : []);
        setLoading(false);
      }
    });
    return () => {
      dead = true;
    };
  }, []);

  if (!onlineEnabled)
    return (
      <p className="py-6 text-center text-[11px] text-white/25">
        Лидерборд появится, когда подключена онлайн-база.
      </p>
    );

  if (loading) return <p className="py-6 text-center text-[11px] text-white/25">Загрузка…</p>;

  return (
    <div className="max-h-72 space-y-1 overflow-y-auto">
      {rows.map((p, i) => (
        <button
          key={p.id}
          onClick={() => onPick(p)}
          className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-black/25 px-2.5 py-2 text-left hover:border-mythic/30 hover:bg-white/[0.04]"
        >
          <span className="w-5 shrink-0 text-[10.5px] font-black tabular-nums text-white/30">{i + 1}</span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate text-[12px] font-bold">@{p.nickname}</span>
            {p.tier === "Premium" && <CheckMark kind="premium" size={12} />}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-white/35">
            {p.inventory_value.toLocaleString("ru-RU")}★
          </span>
        </button>
      ))}
      {!rows.length && <p className="py-6 text-center text-[11px] text-white/25">Пока пусто</p>}
    </div>
  );
}

export default function Admin() {
  const { isOwner, checked, user } = useOwner();
  // local unlock bumps this to re-render; the gate itself comes from localStorage
  // local unlock bumps `forceUnlock` to re-render; the gate itself is in localStorage
  const [unlockTick, forceUnlock] = useState(0);
  void unlockTick;
  const localUnlocked = !onlineEnabled && Boolean(getLocalSession());
  const stars = useGame((s) => s.stars);
  const inventory = useGame((s) => s.inventory);
  const profile = useGame((s) => s.profile);
  const stats = useGame((s) => s.stats);
  const adminGrantStars = useGame((s) => s.adminGrantStars);
  const adminGrantTon = useGame((s) => s.adminGrantTon);
  const ton = useGame((s) => s.ton);
  const adminGrantBadge = useGame((s) => s.adminGrantBadge);
  const adminRevokeBadge = useGame((s) => s.adminRevokeBadge);
  const adminGrantPremium = useGame((s) => s.adminGrantPremium);
  const adminGrantAllGifts = useGame((s) => s.adminGrantAllGifts);
  const adminClearInventory = useGame((s) => s.adminClearInventory);
  const adminReset = useGame((s) => s.adminReset);
  const admin = useGame((s) => s.admin);
  const setAdmin = useGame((s) => s.setAdmin);
  const toggleMark = useGame((s) => s.toggleMark);
  const addItem = useGame((s) => s.addItem);
  const toast = useGame((s) => s.toast);
  const GIFT_BY_ID = useGiftIndex();

  const [amount, setAmount] = useState(100000);
  /** сумма выдачи TON, отдельная от звёзд — валюты разные */
  const [tonAmount, setTonAmount] = useState(5);
  const [giftQuery, setGiftQuery] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  // player lookup for granting to other players
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");
  /** account currently being acted on (from the search list) */
  const [target, setTarget] = useState<PlayerRow | null>(null);
  const [lookNick, setLookNick] = useState("");
  const [lookBio, setLookBio] = useState("");
  const [lookAlt, setLookAlt] = useState("");
  const [lookPhone, setLookPhone] = useState("");
  /** which "+888 X XXX" preset new numbers use */
  const [phoneFormat, setPhoneFormat] = useState("x-xxx");
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("players");
  const [lookGradient, setLookGradient] = useState<string | null>(null);
  const [lookGlow, setLookGlow] = useState<string | null>(null);
  const [lookBanner, setLookBanner] = useState<string | null>(null);
  const setCosmetics = useGame((s) => s.setCosmetics);

  // keep the cosmetics form in step with the selected account
  useEffect(() => {
    if (target) {
      setLookNick(target.nickname ?? "");
      setLookBio(target.bio ?? "");
      setLookAlt((target.alt_names ?? []).join(", "));
      setLookPhone(target.phone_number ?? "");
      setLookGradient(target.name_gradient ?? null);
      setLookGlow(target.badge_glow ?? null);
      setLookBanner(target.profile_banner ?? null);
      return;
    }
    setLookNick(profile.nickname);
    setLookBio(profile.bio ?? "");
    setLookAlt(profile.altNames.join(", "));
    setLookPhone(profile.phoneNumber ?? "");
    setLookGradient(profile.nameGradient);
    setLookGlow(profile.badgeGlow);
    setLookBanner(profile.profileBanner);
  }, [target?.id]);

  useEffect(() => {
    if (!isOwner) return;
    if (playerQuery.trim().length < 2) {
      setPlayers([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchPlayers(playerQuery.trim()).then(setPlayers);
    }, 300);
    return () => window.clearTimeout(t);
  }, [isOwner, playerQuery]);

  // the selected account must follow its row when the list refreshes
  useEffect(() => {
    if (!target) return;
    const fresh = players.find((p) => p.id === target.id);
    if (fresh) setTarget(fresh);
  }, [players, target]);

  // granting must reach owner-made gifts too, not just the scraped catalogue
  const GIFTS = useAllGifts();

  const found = giftQuery.trim()
    ? GIFTS.filter(
        (g) =>
          g.name.toLowerCase().includes(giftQuery.trim().toLowerCase()) ||
          g.variant.toLowerCase().includes(giftQuery.trim().toLowerCase()),
      ).slice(0, 24)
    : [];

  /* ------------------------------------------------ remote actions */
  /** Runs an online call with a spinner + one toast at the end. */
  const run = async (key: string, label: string, fn: () => Promise<{ error?: string }>) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res?.error) toast({ kind: "error", title: "Не вышло", message: res.error });
    else toast({ kind: "success", title: label });
  };

  const targetId = target?.id ?? user?.id ?? "";
  const isSelf = !target || target.id === user?.id;

  /** Re-read the selected account from the DB after a grant. */
  const refreshTarget = async (id: string) => {
    const fresh = await fetchPlayer(id);
    if (fresh) setTarget(fresh);
    return fresh;
  };

  /** Send a gift from the owner account into the selected player's inbox. */
  const giveGiftToTarget = async (giftId: string) => {
    const gift = GIFT_BY_ID[giftId];
    if (!gift || !user || !target) return;
    await run(`gift:${giftId}`, `Подарок «${gift.name}» → @${target.nickname}`, async () => {
      const res = await ownerDeliverGift(
        target.id,
        giftId,
        gift.variant === "Gift" ? gift.name : `${gift.name} · ${gift.variant}`,
        "Подарок от владельца",
      );
      return res;
    });
    void refreshTarget(target.id);
  };

  /**
   * Выдача TON.
   *
   * Себе — сразу в кошелёк этого браузера (и в облако при следующей
   * синхронизации), другому игроку — через `owner_give_ton`, потому что его
   * кошелёк лежит в его строке `profiles`, а не здесь.
   */
  const giveTonToTarget = async (n: number) => {
    if (!target) {
      adminGrantTon(n);
      toast({ kind: "success", title: `${n > 0 ? "+" : ""}${n} TON себе` });
      return;
    }
    await run(`ton:${n}`, `${n > 0 ? "+" : ""}${n} TON → @${target.nickname}`, () =>
      adminGiveTon(target.id, n),
    );
    void refreshTarget(target.id);
  };

  const giveStarsToTarget = async (n: number) => {
    if (!target) {
      adminGrantStars(n);
      toast({ kind: "success", title: `${n > 0 ? "+" : ""}${n.toLocaleString("ru-RU")} ★ себе` });
      return;
    }
    await run(`stars:${n}`, `${n > 0 ? "+" : ""}${n.toLocaleString("ru-RU")} ★ → @${target.nickname}`, () =>
      adminGiveStars(target.id, n),
    );
    void refreshTarget(target.id);
  };

  /**
   * Upgrade luck: 100 = honest odds, 200 = ×2, 10000 = ×100. Works on the
   * selected player, and on the owner's own row when nothing is selected —
   * so «себе» and «другому игроку» are the same button.
   */
  const giveLuckToTarget = async (luck: number) => {
    const who = isSelf ? "себе" : `@${target!.nickname}`;
    const label =
      luck > 100 ? `Бонус удачи ×${luck / 100} · ${who}` : `Бонус удачи снят · ${who}`;
    if (!onlineEnabled || !user) {
      // offline build: nothing to persist, just mirror it in this browser
      setAdmin({ upgradeLuck: luck });
      toast({ kind: "success", title: label });
      return;
    }
    if (!targetId) {
      toast({ kind: "error", title: "Не выбран игрок", message: "Войди или выбери аккаунт выше" });
      return;
    }
    await run(`luck:${luck}`, label, () => adminSetUpgradeLuck(targetId, luck));
    if (isSelf) setAdmin({ upgradeLuck: luck });
    else void refreshTarget(targetId);
  };

  const giveMarkToTarget = async (mark: CheckMarkKind, label: string, on = true) => {
    if (!target) return;
    await run(
      `mark:${mark}`,
      `${on ? "Знак" : "Снять знак"} «${label}» → @${target.nickname}`,
      () => (on ? grantMark(target.id, mark) : adminTakeMark(target.id, mark)),
    );
    void refreshTarget(target.id);
  };

  const giveBadgeToTarget = async (badge: string, label: string, on: boolean) => {
    if (!target) return;
    await run(
      `badge:${badge}`,
      `${on ? "Бейдж" : "Снять бейдж"} «${label}» → @${target.nickname}`,
      () => (on ? adminGiveBadge(target.id, badge) : adminTakeBadge(target.id, badge)),
    );
    void refreshTarget(target.id);
  };

  const setTargetTier = async (premium: boolean) => {
    if (!target) return;
    await run(`tier`, `@${target.nickname}: ${premium ? "Premium" : "Free"}`, () =>
      adminSetTier(target.id, premium ? "Premium" : "Free"),
    );
    void refreshTarget(target.id);
  };

  /** Owner edit of the selected account's cosmetics / number. */
  const saveTargetCosmetics = async (
    label: string,
    patch: Parameters<typeof ownerSetProfile>[1],
  ) => {
    if (!target) return;
    await run(`look:${label}`, `${label} → @${target.nickname}`, () =>
      ownerSetProfile(target.id, patch),
    );
    void refreshTarget(target.id);
  };

  /**
   * Apply one of the three decorative slots. On the owner's own row it also
   * updates the live store so the change is visible without a reload; on
   * another player it only writes the DB (they pick it up on the next poll).
   */
  const applyCosmetic = async (slot: CosmeticSlot, id: string | null) => {
    if (slot === "name") setLookGradient(id);
    if (slot === "badge") setLookGlow(id);
    if (slot === "banner") setLookBanner(id);

    const patch =
      slot === "name"
        ? { nameGradient: id }
        : slot === "badge"
          ? { badgeGlow: id }
          : { profileBanner: id };

    if (isSelf) setCosmetics(patch);

    if (!onlineEnabled || !targetId) {
      toast({ kind: "success", title: `${SLOT_TITLE[slot]} · себе` });
      return;
    }

    const who = isSelf ? "себе" : `@${target!.nickname}`;
    await run(`look:${slot}`, `${SLOT_TITLE[slot]} · ${who}`, () =>
      ownerSetCosmetics(targetId, patch),
    );
    if (!isSelf) void refreshTarget(targetId);
  };

  /** Local "give to myself" — the gift lands in this browser's inventory. */
  const giveSelfGift = (giftId: string) => {
    const gift = GIFT_BY_ID[giftId];
    if (!gift) return;
    addItem(giftId, "admin");
    toast({ kind: "gift", title: gift.name, message: gift.variant });
  };

  const selfTier = isSelf ? profile.tier : target?.tier === "Premium" ? "Premium" : "Free";
  const selfMarks = isSelf ? profile.marks : target?.marks ?? [];
  const selfBadges = isSelf ? profile.badges : target?.badges ?? [];

  // the unlock state is written to localStorage, not to a hook, so read it
  // here as well; `unlockTick` is what makes the next render pick it up
  const unlocked = onlineEnabled ? isOwner : localUnlocked;
  if (!checked) {
    return <p className="py-16 text-center text-[12px] text-white/30">Проверка доступа…</p>;
  }
  if (!unlocked) {
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
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
          <StarIcon className="size-4 text-neon" />
          <span className="text-[15px] font-extrabold tabular-nums">{stars.toLocaleString("ru-RU")}</span>
          <span className="text-[11px] text-white/30">· {inventory.length} предметов</span>
        </div>
      </header>

      <TabBar tab={tab} onPick={setTab} />

      {/* ---------------- who the actions apply to ---------------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">аккаунт</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[12.5px] font-extrabold">
            @{target ? target.nickname : profile.nickname}
          </span>
          {selfTier === "Premium" && <CheckMark kind="premium" size={13} />}
        </span>
        <span className="rounded-md border border-neon/25 bg-neon/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neon">
          {target ? "выбран" : "я"}
        </span>
        {target && (
          <button
            onClick={() => setTarget(null)}
            className="ml-auto rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/45 hover:text-white"
          >
            действовать на себя
          </button>
        )}
      </div>

      {tab === "players" && (
        <div className="grid gap-3.5 lg:grid-cols-2">
          {/* ---------------- account picker ---------------- */}
          <Panel
            title="Выбрать аккаунт"
            desc="Найди игрока и выдай ему подарок, звёзды, бейдж или знак."
            badge="accounts"
          >
            <div className="flex gap-2">
              <input
                value={playerQuery}
                onChange={(e) => setPlayerQuery(e.target.value)}
                placeholder={onlineEnabled ? "Ник или юзернейм (мин. 2 символа)" : "Только офлайн — своего профиля"}
                disabled={!onlineEnabled}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40 disabled:opacity-40"
              />
            </div>

            {!onlineEnabled && (
              <p className="mt-2 rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-[11px] text-white/30">
                Онлайн-база не подключена — действия применяются к твоему локальному профилю.
              </p>
            )}

            {!target && (
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                {players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setTarget(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 px-2.5 py-2 text-left hover:border-neon/30 hover:bg-white/[0.04]"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12px] font-bold">@{p.nickname}</span>
                      {p.tier === "Premium" && <CheckMark kind="premium" size={12} />}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-white/30">
                      {p.stars.toLocaleString("ru-RU")}★ · {p.items} шт
                    </span>
                  </button>
                ))}
                {onlineEnabled && playerQuery.trim().length >= 2 && players.length === 0 && (
                  <p className="py-3 text-center text-[11px] text-white/25">Никого не нашли</p>
                )}
                {onlineEnabled && playerQuery.trim().length < 2 && (
                  <p className="py-3 text-center text-[11px] text-white/25">
                    Введи ник — или действуй на себя
                  </p>
                )}
              </div>
            )}

            {/* stars */}
            <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">звёзды</p>
            <div className="flex items-end gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12.5px] font-bold tabular-nums outline-none focus:border-neon/40"
              />
              <Button
                size="sm"
                disabled={busy === `stars:${amount}` || !targetId}
                onClick={() => giveStarsToTarget(amount)}
              >
                +★
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === `stars:${-amount}` || !targetId}
                onClick={() => giveStarsToTarget(-amount)}
              >
                −★
              </Button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[1_000, 10_000, 100_000, 1_000_000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className="rounded-lg border border-white/8 px-2 py-1 text-[10px] font-bold text-white/45 hover:border-neon/25 hover:text-white"
                >
                  {v.toLocaleString("ru-RU")}
                </button>
              ))}
            </div>

            {/* TON — вторая валюта, выдаётся так же, как звёзды */}
            <p className="mb-1.5 mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
              <span>TON</span>
              <span className="tabular-nums text-[#4aa8ff]/70">{ton.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} у тебя</span>
            </p>
            <div className="flex items-end gap-2">
              <input
                type="number"
                step="0.1"
                value={tonAmount}
                onChange={(e) => setTonAmount(Number(e.target.value) || 0)}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12.5px] font-bold tabular-nums outline-none focus:border-[#4aa8ff]/50"
              />
              <Button
                size="sm"
                variant="violet"
                disabled={!!busy || !targetId}
                onClick={() => giveTonToTarget(tonAmount)}
              >
                +TON
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy || !targetId}
                onClick={() => giveTonToTarget(-tonAmount)}
              >
                −TON
              </Button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[1, 5, 15, 40, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setTonAmount(v)}
                  className="rounded-lg border border-white/8 px-2 py-1 text-[10px] font-bold text-white/45 hover:border-[#4aa8ff]/40 hover:text-white"
                >
                  {v} TON
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-white/25">
              {isSelf
                ? "Зачисляется в твой кошелёк сразу."
                : `Через сервер: TON попадёт в кошелёк @${target?.nickname} при следующей синхронизации.`}
            </p>

            {/* upgrade luck */}
            <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
              бонус удачи в апгрейде
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { luck: 200, label: "×2 шанс" },
                { luck: 10_000, label: "×100 шанс" },
                { luck: 100, label: "снять" },
              ].map((b) => (
                <Button
                  key={b.luck}
                  size="sm"
                  variant={b.luck === 100 ? "ghost" : "primary"}
                  disabled={!!busy || !targetId || (isSelf && admin.upgradeLuck === b.luck)}
                  onClick={() => giveLuckToTarget(b.luck)}
                >
                  {b.label}
                </Button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-white/30">
              {isSelf
                ? admin.upgradeLuck > 100
                  ? `Сейчас активен бонус ×${admin.upgradeLuck / 100} — действует на тебя`
                  : "Сейчас действует обычный шанс"
                : `Применится к @${target?.nickname ?? "—"}`}
            </p>

            {/* verification marks */}
            <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
              знаки
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MARK_LIST.map((m) => {
                const on = m.id === "premium" ? selfTier === "Premium" : selfMarks.includes(m.id);
                const click = () => {
                  // 'Овнер' is the key to this panel — removing it would lock
                  // the account out of every admin function for good.
                  if (m.id === "owner" && on) {
                    toast({
                      kind: "error",
                      title: "Знак «Овнер» убрать нельзя",
                      message: "Он открывает админку — иначе доступ потеряется навсегда",
                    });
                    return;
                  }
                  if (isSelf) {
                    // premium goes through the tier so the tick cannot come back
                    if (m.id === "premium") {
                      adminGrantPremium(profile.tier !== "Premium");
                      return;
                    }
                    // a tick removed only in this browser comes back from the
                    // DB on the next reload, so push the change to the server
                    // whenever the owner is really signed in
                    if (onlineEnabled && user) {
                      void run(
                        `mark:${m.id}`,
                        `${on ? "Снять знак" : "Знак"} «${m.label}» у себя`,
                        () =>
                          on ? adminTakeMark(user.id, m.id) : grantMark(user.id, m.id),
                      );
                      toggleMark(m.id);
                      return;
                    }
                    toggleMark(m.id);
                    return;
                  }
                  if (m.id === "premium") setTargetTier(selfTier !== "Premium");
                  else giveMarkToTarget(m.id, m.label, !on);
                };
                return (
                  <Chip key={m.id} on={on} onClick={click} title={on ? "Снять" : "Выдать"}>
                    <CheckMark kind={m.id} size={13} />
                    {m.label}
                  </Chip>
                );
              })}
            </div>

            {/* badges */}
            <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
              бейджи
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {BADGES.map((b) => {
                const on = selfBadges.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => {
                      if (isSelf) {
                        // same as ticks: a browser-only change is undone by the
                        // next reload, so mirror it to the DB when signed in
                        if (onlineEnabled && user) {
                          void run(`badge:${b.id}`, `Бейдж «${b.label}»`, () =>
                            on ? adminTakeBadge(user.id, b.id) : adminGiveBadge(user.id, b.id),
                          );
                        }
                        if (on) adminRevokeBadge(b.id);
                        else adminGrantBadge(b.id);
                        return;
                      }
                      giveBadgeToTarget(b.id, b.label, !on);
                    }}
                    className={`flex items-center justify-between gap-1 rounded-xl border px-2 py-1.5 text-left ${
                      on ? "bg-white/[0.06]" : "border-white/8 hover:bg-white/[0.04]"
                    }`}
                    style={on ? { borderColor: `${b.color}66` } : undefined}
                  >
                    <span className="truncate text-[10.5px] font-bold" style={{ color: b.color }}>
                      {b.label}
                    </span>
                    <span className="text-[9px] text-white/30">{on ? "✓" : ""}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* ---------------- gifts ---------------- */}
          <Panel
            title={target ? `Подарок → @${target.nickname}` : "Выдать подарки"}
            desc="Поиск по всей базе реальных подарков Telegram."
            badge="gifts"
          >
            <input
              value={giftQuery}
              onChange={(e) => setGiftQuery(e.target.value)}
              placeholder="Plush Pepe, Durov…"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
            />
            <div className="mt-2.5 grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
              {found.map((g) => (
                <button
                  key={g.id}
                  disabled={busy === `gift:${g.id}`}
                  onClick={() => (target ? giveGiftToTarget(g.id) : giveSelfGift(g.id))}
                  className={`flex flex-col items-center rounded-xl border p-1.5 disabled:opacity-40 ${RARITY_META[g.rarity].ring} hover:bg-white/5`}
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

            {target && (
              <div className="mt-3 border-t border-white/8 pt-3">
                <PlayerInventory playerId={target.id} nickname={target.nickname} />
              </div>
            )}

            <div className="mt-3 border-t border-white/8 pt-3">
              <TopPlayers onPick={(p) => setTarget(p)} />
            </div>
          </Panel>
        </div>
      )}

      {/* ---------------- cosmetics ---------------- */}
      {tab === "cosmetics" && (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Panel
            title={`Красоты → ${target ? `@${target.nickname}` : "себе"}`}
            desc="Градиент ника, свечение бейджей и баннер карточки. Выбор применяется сразу и виден всем."
            badge="look"
          >
            <div className="space-y-3">
              {(
                [
                  ["name", lookGradient],
                  ["badge", lookGlow],
                  ["banner", lookBanner],
                ] as [CosmeticSlot, string | null][]
              ).map(([slot, value]) => (
                <div key={slot}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                    {SLOT_TITLE[slot]}
                  </p>
                  <CosmeticsPicker
                    slot={slot}
                    value={value}
                    busy={!!busy}
                    onPick={(id) => void applyCosmetic(slot, id)}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Профиль игрока"
            desc={target ? `Ник, статус, доп. имена и +888 для @${target.nickname}.` : "Ник, статус, доп. имена и +888 на своей карточке."}
            badge="profile"
          >
            <div className="space-y-1.5">
              <input
                value={lookNick}
                onChange={(e) => setLookNick(e.target.value)}
                placeholder="Ник"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
              />
              <input
                value={lookBio}
                onChange={(e) => setLookBio(e.target.value)}
                placeholder="Статус / био"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
              />
              <input
                value={lookAlt}
                onChange={(e) => setLookAlt(e.target.value)}
                placeholder="Доп. имена: @name1, @name2"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
              />

              {/* +888 number issuing */}
              <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                  +888 номер
                </p>
                <div className="mb-2 flex flex-wrap gap-1">
                  {PHONE_FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPhoneFormat(f.id)}
                      className={`rounded-lg border px-2 py-1 text-[10.5px] font-bold transition ${
                        phoneFormat === f.id
                          ? "border-neon/40 bg-neon/15 text-neon"
                          : "border-white/10 bg-white/[0.03] text-white/45 hover:text-white/80"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={lookPhone}
                    onChange={(e) => setLookPhone(e.target.value)}
                    placeholder={PHONE_FORMATS.find((f) => f.id === phoneFormat)?.label ?? "+888 X XXX"}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] tabular-nums text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40"
                  />
                  <button
                    type="button"
                    onClick={() => setLookPhone(formatPhoneNumber("", phoneFormat))}
                    className="shrink-0 rounded-xl border border-violet/30 bg-violet/15 px-3 py-2 text-[11px] font-bold text-violet hover:bg-violet/25"
                  >
                    Рандом
                  </button>
                  <button
                    type="button"
                    onClick={() => setLookPhone("")}
                    className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-bold text-white/45 hover:text-white/80"
                  >
                    Сброс
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-white/25">
                  Своё значение подставляется в выбранный формат: «8888 8» → +888 8 888.
                </p>
              </div>

              <button
                disabled={busy === "look:save"}
                onClick={() => {
                  if (target) {
                    void saveTargetCosmetics("Профиль", {
                      nickname: lookNick.trim() || null,
                      bio: lookBio.trim() || null,
                      altNames: lookAlt
                        .split(",")
                        .map((s) => s.replace(/^@/, "").trim())
                        .filter(Boolean),
                      phone: lookPhone.trim() ? formatPhoneNumber(lookPhone, phoneFormat) : null,
                    });
                    return;
                  }
                  toast({
                    kind: "info",
                    title: "Только для выбранного аккаунта",
                    message: "Выбери игрока на вкладке «Игроки»",
                  });
                }}
                className="w-full rounded-xl bg-white/10 py-2 text-[11.5px] font-bold text-white/80 hover:bg-white/15 disabled:opacity-40"
              >
                {busy === "look:save" ? "Сохраняю…" : "Сохранить профиль игрока"}
              </button>
              {!target && (
                <p className="text-[10.5px] leading-relaxed text-white/25">
                  Выбери аккаунт на вкладке «Игроки», чтобы менять чужой профиль. Красоты выше
                  применяются к тебе.
                </p>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* ---------------- content ---------------- */}
      {tab === "content" && (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Panel
            title="Мои подарки и улучшения"
            desc="Создавай свои подарки: «Всем» — обычный публичный, «Тест» — купить может только владелец."
            badge="custom"
          >
            <CustomGiftEditor />
          </Panel>

          <Panel
            title="Аукцион"
            desc="Выставь любой подарок по названию: старт, выкуп и сколько идёт. Можно запланировать — тогда лот виден всем с пометкой «скоро» и закрыт до выбранного времени."
            badge="новое"
          >
            <AuctionAdmin />
          </Panel>

          <Panel
            title="Двойные звёзды"
            desc="Включай и выключай бонус в любой момент: множитель на всё, что игроки зарабатывают."
            badge="boost"
          >
            <BoostPanel />
          </Panel>
        </div>
      )}

      {/* ---------------- growth ---------------- */}
      {tab === "growth" && (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Panel title="Промокоды" desc="Код на звёзды, TON или дни Premium. Игрок вводит его в профиле." badge="promo">
            <PromoDesk />
          </Panel>

          <div className="space-y-3.5">
            <Panel title="Скидка" desc="Снижает все цены магазина разом — удобно на выходные." badge="sale">
              <DiscountDesk />
            </Panel>

            <Panel title="Журнал действий" desc="Что и когда менялось. Здесь же видно, кто получил подарок." badge="audit">
              <AuditDesk />
            </Panel>
          </div>
        </div>
      )}

      {/* ---------------- site ---------------- */}
      {tab === "site" && (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <BanPanel />

          <div className="space-y-3.5">
            <Panel
              title="Сайт"
              desc="Технические работы: кейсы, апгрейд, аукцион, маркет и мини-игры закрыты. Профиль, инвентарь, Telegram, настройки и чат остаются."
              badge="site"
            >
              <button
                onClick={() => setAdmin({ maintenance: !admin.maintenance })}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  admin.maintenance
                    ? "border-amber-400/40 bg-amber-400/10"
                    : "border-white/8 bg-black/30 hover:bg-white/[0.04]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-extrabold">
                    {admin.maintenance ? "Технические работы включены" : "Сайт работает"}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-white/35">
                    {admin.maintenance
                      ? "Игроки видят только разрешённые разделы"
                      : "Нажми, чтобы временно закрыть игры"}
                  </span>
                </span>
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    admin.maintenance ? "bg-amber-400" : "bg-white/12"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
                      admin.maintenance ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>

              <div className="mt-2.5 rounded-xl border border-white/7 bg-black/25 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
                  тихие часы
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    value={admin.quietFrom}
                    onChange={(e) => setAdmin({ quietFrom: e.target.value })}
                    placeholder="23:30"
                    inputMode="numeric"
                    maxLength={5}
                    className="h-8 w-16 rounded-lg border border-white/10 bg-black/40 px-2 text-center text-[12px] tabular-nums outline-none placeholder:text-white/15 focus:border-amber-400/50"
                  />
                  <span className="text-[11px] text-white/25">→</span>
                  <input
                    value={admin.quietTo}
                    onChange={(e) => setAdmin({ quietTo: e.target.value })}
                    placeholder="07:00"
                    inputMode="numeric"
                    maxLength={5}
                    className="h-8 w-16 rounded-lg border border-white/10 bg-black/40 px-2 text-center text-[12px] tabular-nums outline-none placeholder:text-white/15 focus:border-amber-400/50"
                  />
                  <button
                    onClick={() => setAdmin({ quietFrom: "", quietTo: "" })}
                    className="ml-auto rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-white/40 hover:text-white/75"
                  >
                    сбросить
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-white/25">
                  {admin.quietFrom && admin.quietTo
                    ? `Каждую ночь с ${admin.quietFrom} до ${admin.quietTo} игры закрываются сами.`
                    : "Можно закрывать игры по расписанию — например, с 23:30 до 07:00."}
                </p>
              </div>

              <label className="mt-2 block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
                  текст на экране работ
                </span>
                <textarea
                  value={admin.maintenanceNote}
                  onChange={(e) => setAdmin({ maintenanceNote: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-2.5 py-2 text-[11.5px] leading-snug outline-none focus:border-amber-400/40"
                />
              </label>
            </Panel>

            <Panel
              title="Обслуживание"
              desc="Действия на твоём профиле."
              badge="self"
            >
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="violet" onClick={() => adminGrantPremium(profile.tier !== "Premium")}>
                  {profile.tier === "Premium" ? "Снять Premium" : "Выдать Premium"}
                </Button>
                <Button size="sm" variant="ghost" onClick={adminGrantAllGifts}>
                  Выдать все подарки
                </Button>
                <Button size="sm" variant="ghost" onClick={adminClearInventory}>
                  Очистить инвентарь
                </Button>
                <Button size="sm" variant="ghost" onClick={() => adminGrantStars(-stars)}>
                  Обнулить баланс
                </Button>
              </div>
              <Button full size="sm" variant="danger" className="mt-2" onClick={() => setConfirmReset(true)}>
                Полный сброс аккаунта
              </Button>
            </Panel>

            <Panel
              title="Реклама"
              desc="Свои объявления на сайте: дашборд, лендинг и внутри страниц."
              badge="ads"
            >
              <AdsDesk />
            </Panel>

            <Panel
              title="Магазин"
              desc="Что можно купить за деньги: подарок целиком или только улучшение модели."
              badge="shop"
            >
              <GiftShopDesk />
            </Panel>

            <Panel
              title="Снимки сохранения"
              desc="Страховка от ошибки: снимок перед сбросом аккаунта или чисткой инвентаря."
              badge="backup"
            >
              <SnapshotDesk />
            </Panel>

            <Panel title="Статистика" desc="Счётчики текущего браузера." badge="stats">
              <div className="grid grid-cols-3 gap-1.5">
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
        </div>
      )}

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
