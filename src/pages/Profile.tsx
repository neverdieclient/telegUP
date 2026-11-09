import { useMemo, useState } from "react";
import { useGame } from "../store/useGame";
import { GIFT_BY_ID, RARITY_META, DISCLAIMER, BADGE_BY_ID } from "../data/gifts";
import { CheckMark } from "../components/ui/CheckMark";
import { StarIcon, GiftArt } from "../components/gifts/GiftArt";
import { useAuth, signOut } from "../lib/players";
import { onlineEnabled } from "../lib/supabase";
import { Row, Toggle, MARKS } from "./profile/rows";
import { THEMES } from "../lib/theme";

const RARITY_ROWS = ["mythic", "legendary", "epic", "rare", "common"] as const;

export default function ProfilePage() {
  const profile = useGame((s) => s.profile);
  const setNickname = useGame((s) => s.setNickname);
  const settings = useGame((s) => s.settings);
  const toggleSetting = useGame((s) => s.toggleSetting);
  const stats = useGame((s) => s.stats);
  const stars = useGame((s) => s.stars);
  const inventory = useGame((s) => s.inventory);
  const shopItems = useGame((s) => s.shopItems);
  const toast = useGame((s) => s.toast);
  const theme = useGame((s) => s.theme);
  const setTheme = useGame((s) => s.setTheme);
  const deviceMode = useGame((s) => s.deviceMode);
  const chooseDevice = useGame((s) => s.chooseDevice);
  const { user } = useAuth();

  const [draft, setDraft] = useState(profile.nickname);
  const [editing, setEditing] = useState(false);

  const value = useMemo(
    () => inventory.reduce((a, i) => a + (GIFT_BY_ID[i.giftId]?.stars ?? 0), 0),
    [inventory],
  );

  const byRarity = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const i of inventory) {
      const g = GIFT_BY_ID[i.giftId];
      if (g) acc[g.rarity] = (acc[g.rarity] ?? 0) + 1;
    }
    return acc;
  }, [inventory]);

  const best = useMemo(
    () =>
      [...inventory]
        .map((i) => GIFT_BY_ID[i.giftId])
        .filter(Boolean)
        .sort((a, b) => b.stars - a.stars)
        .slice(0, 5),
    [inventory],
  );

  const saveNick = () => {
    const clean = draft.trim().replace(/^@/, "");
    if (clean.length < 3) {
      toast({ kind: "error", title: "Слишком коротко", message: "Минимум 3 символа" });
      return;
    }
    setNickname(clean);
    setEditing(false);
    toast({ kind: "success", title: "Никнейм обновлён", message: `@${clean}` });
  };

  const activeMarks = MARKS.filter((m) => m.id === "basic" && profile.marks.includes("basic"));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/40">Profile</p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Профиль</h1>
      </header>

      <section className="relative overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.02]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(150deg, rgba(163,255,18,0.10), rgba(139,92,246,0.10) 45%, rgba(10,10,10,0) 75%)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-violet/20 blur-[90px]" />
        <div className="pointer-events-none absolute -left-16 bottom-[-40%] size-64 rounded-full bg-neon/15 blur-[90px]" />

        <div className="relative p-5 md:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="relative shrink-0">
              <div className="rounded-[24px] bg-gradient-to-br from-neon/70 via-violet/70 to-rare/60 p-[2px]">
                <span className="grid size-[92px] place-items-center rounded-[22px] bg-[#0d0d10] font-display text-[38px] font-black">
                  {profile.nickname.slice(0, 1).toUpperCase()}
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveNick()}
                      maxLength={24}
                      className="h-9 w-[170px] rounded-xl border border-neon/40 bg-black/50 px-3 text-[15px] font-extrabold outline-none"
                    />
                    <button onClick={saveNick} className="text-[11.5px] font-bold text-neon">
                      ок
                    </button>
                    <button onClick={() => setEditing(false)} className="text-[11.5px] font-bold text-white/35">
                      отмена
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="truncate font-display text-[26px] font-black leading-none tracking-tight">
                      {profile.nickname}
                    </h2>
                    <span className="inline-flex items-center gap-1">
                      {activeMarks.map((m) => (
                        <CheckMark key={m.id} kind={m.id} size={18} title={m.label} />
                      ))}
                    </span>
                    <button
                      onClick={() => {
                        setDraft(profile.nickname);
                        setEditing(true);
                      }}
                      className="rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/40 hover:text-white"
                    >
                      изменить
                    </button>
                  </>
                )}
              </div>

              {/* handle right under the nick, then the extra names */}
              <p className="mt-1 truncate text-[13px] font-bold text-sky-400">
                @{profile.nickname}
              </p>
              {(profile.altNames.length > 0 || profile.collectibleUsername) && (
                <p className="mt-0.5 truncate text-[11.5px] font-semibold text-sky-400/80">
                  а также{" "}
                  {(profile.altNames.length > 0
                    ? profile.altNames
                    : [profile.collectibleUsername as string]
                  )
                    .map((n) => `@${n.replace(/^@/, "")}`)
                    .join(", ")}
                </p>
              )}

              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-white/40">
                <span className="rounded-md border border-neon/25 bg-neon/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-neon">
                  {profile.tier}
                </span>
                {profile.anonymousNumber && (
                  <span className="tabular-nums">{profile.phoneNumber ?? "+888"}</span>
                )}
                {user?.email ? (
                  <span className="text-white/25">{user.email}</span>
                ) : (
                  <span className="text-white/25">гость</span>
                )}
              </p>

              {profile.badges.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
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
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ["Звёзды", stars.toLocaleString("ru-RU"), "text-neon"],
              ["Инвентарь", `${value.toLocaleString("ru-RU")}★`, "text-violet"],
              ["Предметов", String(inventory.length), "text-white/90"],
              ["Покупок", String(shopItems.length), "text-rare"],
            ].map(([l, v, c]) => (
              <div key={l} className="rounded-2xl border border-white/8 bg-black/35 px-3.5 py-2.5 backdrop-blur">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30">{l}</p>
                <p className={`mt-0.5 font-display text-[19px] font-black tabular-nums ${c}`}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
          <h3 className="mb-1 text-[13px] font-extrabold tracking-tight">Статистика</h3>
          <div className="mt-2">
            <Row label="Открыто кейсов" hint="всего за всё время">
              <span className="text-[12.5px] font-extrabold tabular-nums">{stats.casesOpened}</span>
            </Row>
            <Row label="Апгрейды" hint="успешных / всего">
              <span className="text-[12.5px] font-extrabold tabular-nums text-violet">
                {stats.upgradesWon} / {stats.upgradesWon + stats.upgradesLost}
              </span>
            </Row>
            <Row label="Мини-игры" hint="победы">
              <span className="text-[12.5px] font-extrabold tabular-nums">
                {stats.crashWins +
                  stats.minesWins +
                  stats.diceWins +
                  stats.coinflipWins +
                  stats.wheelWins +
                  stats.towerWins}
              </span>
            </Row>
            <Row label="PvP" hint="побед / поражений">
              <span className="text-[12.5px] font-extrabold tabular-nums text-mythic">
                {stats.pvpWins} / {stats.pvpLosses}
              </span>
            </Row>
            <Row label="Лучший дроп" hint="самый дорогой подарок">
              <span className="text-[12.5px] font-extrabold tabular-nums text-legendary">
                {best[0] ? best[0].stars.toLocaleString("ru-RU") + "★" : "—"}
              </span>
            </Row>
          </div>
        </section>

        <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
          <h3 className="mb-1 text-[13px] font-extrabold tracking-tight">Настройки</h3>
          <div className="mt-2">
            <Row label="Звуки" hint="клики и выигрыши">
              <Toggle on={settings.sound} onClick={() => toggleSetting("sound")} />
            </Row>
            <Row label="Анимации" hint="отключить для слабых устройств">
              <Toggle on={!settings.reduceMotion} onClick={() => toggleSetting("reduceMotion")} />
            </Row>
            <Row label="Онлайн-аккаунт" hint="прогресс в облаке">
              <span className="text-[11px] font-bold text-white/40">{user ? "включён" : "выключен"}</span>
            </Row>
            <Row label="Версия" hint="компьютерная или мобильная раскладка">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-0.5">
                {([
                  { id: "auto" as const, label: "Комп" },
                  { id: "mobile" as const, label: "Телефон" },
                ]).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => chooseDevice(v.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      (v.id === "mobile" && deviceMode === "mobile") ||
                      (v.id === "auto" && deviceMode !== "mobile")
                        ? "bg-neon/20 text-neon"
                        : "text-white/40 hover:text-white/75"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </Row>
          </div>

          <div className="mt-4 border-t border-white/6 pt-3">
            <p className="text-[12.5px] font-bold text-white/85">Тема оформления</p>
            <p className="text-[10.5px] text-white/30">Цвет акцентов на всём сайте</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    aria-pressed={active}
                    className={`group relative overflow-hidden rounded-2xl border p-2 transition ${
                      active
                        ? "border-white/35 bg-white/[0.07]"
                        : "border-white/8 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className="block h-7 w-full rounded-xl"
                      style={{
                        background: `linear-gradient(135deg, ${t.primary} 0%, ${t.secondary} 100%)`,
                        boxShadow: active ? `0 0 16px ${t.primary}55` : "inset 0 0 0 1px rgba(255,255,255,0.08)",
                      }}
                    />
                    <span className="mt-1.5 flex items-center justify-center gap-1 text-[10.5px] font-bold text-white/70">
                      {t.name}
                      {active && <span className="text-[9px] text-white/45">✓</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
        <h3 className="mb-3 text-[13px] font-extrabold tracking-tight">Коллекция по редкости</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {RARITY_ROWS.map((r) => {
            const meta = RARITY_META[r];
            return (
              <div key={r} className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/30 px-3 py-2">
                <span className="text-[11.5px] font-bold" style={{ color: meta.hex }}>
                  {meta.label}
                </span>
                <span className="text-[12px] font-extrabold tabular-nums text-white/70">
                  {byRarity[r] ?? 0}
                </span>
              </div>
            );
          })}
        </div>

        {best.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Топ подарков</p>
            <div className="flex flex-wrap gap-2">
              {best.map((g) => (
                <div
                  key={g.id}
                  className={`flex flex-col items-center rounded-2xl border bg-black/25 px-2 py-1.5 ${RARITY_META[g.rarity].ring}`}
                >
                  <GiftArt gift={g} size={44} rounded="rounded-lg" />
                  <p className="mt-1 w-[64px] truncate text-center text-[9px] font-bold text-white/55">
                    {g.variant}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4">
        <h3 className="mb-3 text-[13px] font-extrabold tracking-tight">Аккаунт</h3>
        {user ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-[11.5px] text-white/45">
              <StarIcon className="size-3 text-neon" />
              Онлайн-аккаунт подключён · {user.email}
            </p>
            <button
              onClick={() => {
                signOut();
                toast({ kind: "info", title: "Вы вышли", message: "Прогресс сохранён локально" });
              }}
              className="rounded-xl border border-mythic/30 bg-mythic/10 px-3 py-2 text-[11.5px] font-bold text-mythic hover:bg-mythic/20"
            >
              Выйти
            </button>
          </div>
        ) : (
          <p className="text-[11.5px] text-white/40">
            {onlineEnabled
              ? "Ты играешь без аккаунта — прогресс хранится только в этом браузере."
              : "Онлайн-режим не подключён. Прогресс хранится локально."}
          </p>
        )}
      </section>

      <p className="pb-2 text-center text-[10px] leading-relaxed text-white/20">{DISCLAIMER}</p>
    </div>
  );
}