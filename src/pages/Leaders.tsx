import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { BADGE_BY_ID, DISCLAIMER, GIFT_BY_ID, GIFTS, RARITY_META, type BadgeId } from "../data/gifts";
import { useGame } from "../store/useGame";
import { GiftArt } from "../components/gifts/GiftArt";
import { CheckMark, type CheckMarkKind } from "../components/ui/CheckMark";
import { fetchTop, searchPlayers, useAuth, type PlayerRow } from "../lib/players";
import { onlineEnabled } from "../lib/supabase";

const MARKS: CheckMarkKind[] = ["owner", "premium", "basic", "crown"];

function PlayerAvatar({ p, size = 48 }: { p: PlayerRow; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet to-[#3f2299] font-display font-black"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {p.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}

function PlayerMarks({ p, size = 14 }: { p: PlayerRow; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {MARKS.filter((m) => p.marks?.includes(m)).map((m) => (
        <CheckMark key={m} kind={m} size={size} />
      ))}
      {p.tier === "Premium" && !p.marks?.includes("premium") && <CheckMark kind="premium" size={size} />}
    </span>
  );
}

function ProfileModal({ player, onClose }: { player: PlayerRow; onClose: () => void }) {
  const gifts = useMemo(() => {
    const owned = new Set<string>();
    return GIFTS.filter((g) => g.slug === player.username.toLowerCase() || owned.has(g.id)).slice(0, 8);
  }, [player]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
 className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0f0f13]"
      >
        <div className="relative overflow-hidden border-b border-white/8 bg-gradient-to-br from-white/[0.07] to-transparent p-5">
          <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-violet/20 blur-[70px]" />
          <div className="relative flex items-center gap-4">
            <PlayerAvatar p={player} size={64} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-lg font-extrabold tracking-tight">@{player.nickname}</h3>
                <PlayerMarks p={player} />
              </div>
              <p className="mt-0.5 text-[11.5px] text-white/35">
                с {new Date(player.created_at).toLocaleDateString("ru-RU")} · {player.items} подарков
              </p>
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-2">
            {[
              ["Звёзды", player.stars.toLocaleString("ru-RU"), "text-neon"],
              ["Инвентарь", `${player.inventory_value.toLocaleString("ru-RU")}★`, "text-violet"],
              ["Предметов", String(player.items), "text-white/90"],
            ].map(([l, v, c]) => (
              <div key={l} className="rounded-xl border border-white/8 bg-black/30 px-2.5 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/30">{l}</p>
                <p className={`mt-0.5 text-[13px] font-extrabold tabular-nums ${c}`}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5">
          {player.badges.length > 0 && (
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">бейджи</p>
              <div className="flex flex-wrap gap-1.5">
                {player.badges.map((b) => {
                  const badge = BADGE_BY_ID[b as BadgeId];
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
            </div>
          )}

          {gifts.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">в инвентаре</p>
              <div className="grid grid-cols-4 gap-1.5">
                {gifts.map((g) => (
                  <div key={g.id} className={`flex flex-col items-center rounded-xl border bg-black/25 p-1.5 ${RARITY_META[g.rarity].ring}`}>
                    <GiftArt gift={g} size={38} rounded="rounded-lg" />
                    <p className="mt-1 w-full truncate text-center text-[8.5px] font-bold text-white/55">{g.variant}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-[12.5px] font-bold text-white/70 hover:bg-white/[0.08]"
          >
            Закрыть
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Leaders() {
  const { profile, inventory } = useGame();
  const { user } = useAuth();

  const [top, setTop] = useState<PlayerRow[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlayerRow[]>([]);
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [searching, setSearching] = useState(false);

  const inventoryValue = useMemo(
    () => inventory.reduce((a, i) => a + (GIFT_BY_ID[i.giftId]?.stars ?? 0), 0),
    [inventory],
  );

  // locally build a row for the signed-in visitor
  const me: PlayerRow = useMemo(
    () => ({
      id: user?.id ?? "local",
      username: profile.nickname.toUpperCase(),
      nickname: profile.nickname,
      tier: profile.tier,
      stars: 0,
      inventory_value: inventoryValue,
      items: inventory.length,
      badges: profile.badges,
      marks: profile.marks,
      created_at: new Date(Date.now() - 60_000).toISOString(),
    }),
    [user, profile, inventoryValue, inventory],
  );

  useEffect(() => {
    if (!onlineEnabled) return;
    fetchTop(50).then(setTop);
  }, []);

  useEffect(() => {
    if (!onlineEnabled) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      searchPlayers(trimmed).then((r) => {
        setResults(r);
        setSearching(false);
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const ranking = top.length > 0 ? top : [me];

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/40">Players</p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Топ игроков</h1>
        <p className="mt-1 text-[12px] text-white/35">Нажми на ник, чтобы открыть профиль игрока</p>
      </header>

      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/25"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти игрока по юзернейму или нику"
          className="h-11 w-full rounded-2xl border border-white/10 bg-black/35 pl-10 pr-3 text-[13px] font-semibold text-white outline-none transition-colors placeholder:text-white/25 focus:border-neon/40"
        />
      </div>

      {q.trim().length >= 2 && (
        <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-3">
 <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
       {searching ? "поиск…" : `найдено: ${results.length}`}
          </p>
          {!searching && results.length === 0 && (
            <p className="px-1 py-4 text-center text-[11.5px] text-white/30">Никого не нашли</p>
          )}
          <div className="space-y-1">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-white/8 hover:bg-white/[0.04]"
              >
                <PlayerAvatar p={p} size={36} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold">@{p.nickname}</span>
                <span className="text-[11px] font-bold tabular-nums text-white/35">{p.inventory_value.toLocaleString("ru-RU")}★</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-white/8 bg-white/[0.025]">
        {ranking.map((p, i) => {
          const isMe = p.id === me.id;
          const rank = i + 1;
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                i > 0 ? "border-t border-white/6" : ""
              }`}
            >
              <span
                className={`w-5 shrink-0 text-center font-display text-[13px] font-black tabular-nums ${
                  rank === 1 ? "text-legendary" : rank <= 3 ? "text-white/70" : "text-white/25"
                }`}
              >
                {rank}
              </span>
              <PlayerAvatar p={p} size={38} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-extrabold tracking-tight">@{p.nickname}</span>
                  <PlayerMarks p={p} size={13} />
                  {isMe && (
                    <span className="rounded-md border border-neon/30 bg-neon/10 px-1.5 py-0.5 text-[9px] font-bold text-neon">вы</span>
                  )}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-white/25">
                  {p.items} подарков · {p.badges.length} бейджей
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-[15px] font-black tabular-nums">{p.inventory_value.toLocaleString("ru-RU")}</span>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-white/25">стоимость</span>
              </span>
            </button>
          );
        })}
      </section>

      {!onlineEnabled && (
        <p className="rounded-2xl border border-white/8 bg-black/30 p-3 text-center text-[11px] text-white/30">
          Онлайн-реестр игроков не подключён. Пока здесь только ты — топ и поиск станут общими после
          добавления ключей Supabase.
        </p>
      )}

      <p className="text-center text-[10px] text-white/20">{DISCLAIMER}</p>

      <AnimatePresence>
        {selected && <ProfileModal player={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}