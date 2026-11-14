import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useGame } from "../store/useGame";
import { RARITY_META, DISCLAIMER, SHOP_USERNAMES } from "../data/gifts";
import { useGiftIndex } from "../lib/useCatalog";
import { CheckMark } from "../components/ui/CheckMark";
import { StarIcon, GiftArt } from "../components/gifts/GiftArt";
import { useAuth, signOut, fetchPlayer, setInventoryVisibility, uploadAvatar, setMyAvatar, isAvatarFile } from "../lib/players";
import { onlineEnabled } from "../lib/supabase";
import { Row, Toggle, MARKS } from "./profile/rows";
import { SKINS, THEMES, type SkinId } from "../lib/theme";
import {
  Avatar,
  GradientNick,
  GlowBadge,
  ProfileBannerLayer,
  PinnedStrip,
  useMyPinnedGifts,
} from "../components/profile/Cosmetics";

const RARITY_ROWS = ["mythic", "legendary", "epic", "rare", "common"] as const;

export default function ProfilePage() {
  const profile = useGame((s) => s.profile);
  const setNickname = useGame((s) => s.setNickname);
  const settings = useGame((s) => s.settings);
  const toggleSetting = useGame((s) => s.toggleSetting);
  const stats = useGame((s) => s.stats);
  const stars = useGame((s) => s.stars);
  const inventory = useGame((s) => s.inventory);
  const GIFT_BY_ID = useGiftIndex();
  const shopItems = useGame((s) => s.shopItems);
  const toast = useGame((s) => s.toast);
  const theme = useGame((s) => s.theme);
  const setTheme = useGame((s) => s.setTheme);
  const skin = useGame((s) => s.skin);
  const setSkin = useGame((s) => s.setSkin);
  const redeemPromo = useGame((s) => s.redeemPromo);
  const deviceMode = useGame((s) => s.deviceMode);
  const chooseDevice = useGame((s) => s.chooseDevice);
  const showInventory = useGame((s) => s.profile.showInventory);
  const setShowInventory = useGame((s) => s.setShowInventory);
  const setAvatar = useGame((s) => s.setAvatar);
  const setMainUsername = useGame((s) => s.setMainUsername);
  const setCollectibleUsername = useGame((s) => s.setCollectibleUsername);
  const sellUsername = useGame((s) => s.sellUsername);
  const { user } = useAuth();

  const [draft, setDraft] = useState(profile.nickname);
  const [editing, setEditing] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  /** черновик промокода; чистится только после успешного погашения */
  const [promoDraft, setPromoDraft] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const myPinned = useMyPinnedGifts();

  // Ники живут в настройках: основной и второй (коллекционный) — как в Telegram.
  const usernames = profile.purchasedUsernames;
  const collectibleOptions = usernames.filter((u) => u !== profile.nickname);

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

  // the switch lives on the server too, so it holds across devices
  useEffect(() => {
    if (!onlineEnabled || !user) return;
    let dead = false;
    fetchPlayer(user.id).then((row) => {
      if (dead || !row) return;
      const serverShow = (row as { show_inventory?: boolean | null }).show_inventory;
      if (typeof serverShow === "boolean") setShowInventory(serverShow);
    });
    return () => {
      dead = true;
    };
  }, [user, setShowInventory]);

  const onToggleInventory = () => {
    const next = !showInventory;
    setShowInventory(next);
    if (!onlineEnabled || !user) return;
    void setInventoryVisibility(next).then((res) => {
      if (res.error) {
        toast({ kind: "error", title: "Не сохранилось", message: "Запусти supabase/inventory-visibility.sql" });
      }
    });
  };

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

  /**
   * Погасить промокод.
   *
   * Проверка и начисление живут в одном действии стора, поэтому здесь только
   * перевод причины отказа в понятный текст. Код остаётся в поле, если не
   * сработал — чтобы опечатку было видно и легко исправить.
   */
  const applyPromo = () => {
    const res = redeemPromo(promoDraft);
    if (res.ok) {
      const { promo } = res;
      const what =
        promo.kind === "stars"
          ? `${promo.amount.toLocaleString("ru-RU")} ★`
          : promo.kind === "ton"
            ? `${promo.amount} TON`
            : `${promo.amount} дней Premium`;
      setPromoDraft("");
      toast({ kind: "success", title: "Промокод принят", message: `Зачислено: ${what}` });
      return;
    }
    const reason =
      res.reason === "empty"
        ? "Введи код"
        : res.reason === "missing"
          ? "Такого кода нет"
          : res.reason === "used"
            ? "Ты уже использовал этот код"
            : "Код закончился — все использования разобрали";
    toast({ kind: "error", title: "Не сработало", message: reason });
  };

  /**
   * Upload a picture and make it the avatar.
   *
   * Without an online account there is nowhere to put the file (a data URL
   * would blow up localStorage on the next save), so the button says so
   * instead of silently losing the picture on reload.
   */
  const pickAvatar = async (file: File) => {
    if (!isAvatarFile(file)) {
      toast({ kind: "error", title: "Не картинка", message: "png, jpg, webp, gif или avif" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ kind: "error", title: "Слишком большой файл", message: "Максимум 4 МБ" });
      return;
    }
    if (!onlineEnabled || !user) {
      toast({
        kind: "error",
        title: "Нужен онлайн-аккаунт",
        message: "Аватарка хранится в облаке — войди в аккаунт",
      });
      return;
    }

    setAvatarBusy(true);
    const up = await uploadAvatar(file, user.id);
    if (!up.url) {
      setAvatarBusy(false);
      toast({ kind: "error", title: "Загрузка не удалась", message: up.error ?? "Запусти supabase/profile-avatars.sql" });
      return;
    }
    const saved = await setMyAvatar(up.url);
    setAvatarBusy(false);
    if (saved.error) {
      toast({ kind: "error", title: "Не сохранилось", message: "Запусти supabase/profile-avatars.sql" });
      return;
    }
    setAvatar(up.url);
    toast({ kind: "success", title: "Аватарка обновлена" });
  };

  const resetAvatar = async () => {
    setAvatar(null);
    if (!onlineEnabled || !user) return;
    const res = await setMyAvatar(null);
    if (res.error) toast({ kind: "error", title: "Не сохранилось", message: res.error });
    else toast({ kind: "success", title: "Аватарка убрана" });
  };

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
        <ProfileBannerLayer banner={profile.profileBanner} />
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-violet/20 blur-[90px]" />
        <div className="pointer-events-none absolute -left-16 bottom-[-40%] size-64 rounded-full bg-neon/15 blur-[90px]" />

        <div className="relative p-5 md:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="relative shrink-0">
              <div className="rounded-[24px] bg-gradient-to-br from-neon/70 via-violet/70 to-rare/60 p-[2px]">
                <span className="block rounded-[22px] bg-[#0d0d10]">
                  <Avatar
                    src={profile.avatarUrl}
                    nickname={profile.nickname}
                    size={92}
                    rounded="rounded-[22px]"
                    className="text-[38px]"
                  />
                </span>
              </div>

              <input
                ref={avatarInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickAvatar(file);
                }}
              />

              <div className="mt-2 flex flex-col gap-1">
                <button
                  type="button"
                  disabled={avatarBusy}
                  onClick={() => avatarInput.current?.click()}
                  className="rounded-lg border border-neon/30 bg-neon/10 px-2 py-1 text-[10px] font-bold text-neon transition hover:bg-neon/20 disabled:opacity-40"
                >
                  {avatarBusy ? "загрузка…" : profile.avatarUrl ? "сменить" : "загрузить"}
                </button>
                {profile.avatarUrl && !avatarBusy && (
                  <button
                    type="button"
                    onClick={() => void resetAvatar()}
                    className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-white/35 transition hover:text-white/70"
                  >
                    убрать
                  </button>
                )}
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
                      <GradientNick nickname={profile.nickname} gradient={profile.nameGradient} />
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
                  {profile.badges.map((b) => (
                    <GlowBadge key={b} badgeId={b} glow={profile.badgeGlow} />
                  ))}
                </div>
              )}

              {myPinned.length > 0 && (
                <div className="mt-3 max-w-xs">
                  <PinnedStrip giftIds={myPinned.map((g) => g.id)} />
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
            <Row label="Показывать мои подарки другим" hint="инвентарь в профиле игрока">
              <Toggle on={showInventory} onClick={onToggleInventory} />
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

            {/* Скин — вторая ось оформления: раскладка, а не цвет */}
            <p className="mt-4 text-[12.5px] font-bold text-white/85">Вид интерфейса</p>
            <p className="text-[10.5px] text-white/30">Раскладка и оформление панелей</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SKINS.map((v) => {
                const active = skin === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSkin(v.id as SkinId)}
                    aria-pressed={active}
                    className={`rounded-2xl border px-2.5 py-2 text-left transition ${
                      active
                        ? "border-white/35 bg-white/[0.07]"
                        : "border-white/8 bg-black/30 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-white/85">
                      {v.name}
                      {active && <span className="text-[9px] text-white/45">✓</span>}
                    </span>
                    <span className="mt-0.5 block text-[9.5px] leading-snug text-white/30">{v.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-white/6 pt-3">
            <p className="text-[12.5px] font-bold text-white/85">Промокод</p>
            <p className="text-[10.5px] text-white/30">Звёзды, TON или дни Premium — если владелец выдал код</p>
            <div className="mt-2 flex gap-2">
              <input
                value={promoDraft}
                onChange={(e) => setPromoDraft(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyPromo();
                }}
                placeholder="TELEGUP-XXXXXX"
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] font-bold tracking-[0.08em] text-white outline-none placeholder:text-white/20 focus:border-neon/50"
              />
              <button
                type="button"
                onClick={applyPromo}
                disabled={!promoDraft.trim()}
                className="shrink-0 rounded-xl border border-neon/35 bg-neon/15 px-3 py-2 text-[11.5px] font-extrabold text-neon transition hover:bg-neon/25 disabled:opacity-40"
              >
                Активировать
              </button>
            </div>
          </div>

          {/* ---------------- юзернеймы ---------------- */}
          <div className="mt-4 border-t border-white/6 pt-3">
            <p className="text-[12.5px] font-bold text-white/85">Юзернеймы</p>
            <p className="text-[10.5px] text-white/30">
              Основной и второй ник — переключаются здесь, в настройках
            </p>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                  Основной
                </span>
                <select
                  value={profile.nickname}
                  onChange={(e) => setMainUsername(e.target.value)}
                  disabled={!usernames.length}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-2.5 py-2 text-[12px] font-bold text-white/80 outline-none focus:border-neon/40 disabled:opacity-40"
                >
                  {usernames.length === 0 && <option value={profile.nickname}>@{profile.nickname}</option>}
                  {usernames.map((u) => (
                    <option key={u} value={u}>
                      @{u}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                  Второй (коллекционный)
                </span>
                <select
                  value={profile.collectibleUsername ?? ""}
                  onChange={(e) => setCollectibleUsername(e.target.value || null)}
                  disabled={!collectibleOptions.length}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-2.5 py-2 text-[12px] font-bold text-violet outline-none focus:border-violet/40 disabled:opacity-40"
                >
                  <option value="">— нет —</option>
                  {collectibleOptions.map((u) => (
                    <option key={u} value={u}>
                      @{u}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {usernames.length === 0 ? (
              <p className="mt-2 text-[11px] text-white/30">
                Купи юзернейм в{" "}
                <Link to="/app/shop" className="font-bold text-neon hover:underline">
                  магазине
                </Link>
                , чтобы переключаться между никами.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="flex items-end justify-between">
                  <p className="text-[11px] font-bold text-white/50">Мои юзернеймы</p>
                  <span className="text-[10px] text-white/25">{usernames.length} шт.</span>
                </div>
                {usernames.map((u) => {
                  const active = u === profile.nickname;
                  const shopPrice = SHOP_USERNAMES.find((s) => s.username === u)?.price;
                  const value = Math.round((shopPrice ?? 800) * 0.6);
                  return (
                    <div
                      key={u}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${
                        active ? "border-neon/30 bg-neon/[0.05]" : "border-white/8 bg-black/30"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-extrabold">@{u}</p>
                        <p className="text-[10px] text-white/30">
                          {active
                            ? "активный ник"
                            : profile.collectibleUsername === u
                              ? "второй ник"
                              : "свободен"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] font-bold tabular-nums text-neon">
                          <StarIcon className="size-3" /> {value.toLocaleString("ru-RU")}
                        </span>
                        <button
                          type="button"
                          disabled={active}
                          onClick={() => {
                            if (sellUsername(u, value)) {
                              toast({
                                kind: "success",
                                title: `@${u} продан`,
                                message: `+${value.toLocaleString("ru-RU")} ★`,
                              });
                            }
                          }}
                          className="rounded-xl border border-danger/35 bg-danger/10 px-2.5 py-1.5 text-[11px] font-extrabold text-danger transition hover:bg-danger/20 disabled:opacity-35"
                        >
                          {active ? "В игре" : "Продать"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-white/25">
                  Продать можно любой ник, кроме активного. Выплата — 60% цены.
                </p>
              </div>
            )}
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