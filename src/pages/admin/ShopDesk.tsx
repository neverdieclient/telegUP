import { useMemo, useRef, useState } from "react";
import { useGame } from "../../store/useGame";
import { deleteOwnerAd, saveOwnerAd, toggleOwnerAd, useOwnerAds, type OwnerAdPlacement } from "../../lib/ownerAds";
import { ADS_ENABLED, AD_SLOTS } from "../../lib/ads";
import { discountPrice } from "../../lib/pricing";
import { logAdmin } from "../../lib/adminTools";
import { useAllGifts } from "../../lib/useCatalog";
import { RARITY_META } from "../../data/gifts";
import { Button } from "../../components/ui/Button";

/* --------------------------------------------------------------- gifts */

/**
 * What the shop may sell.
 *
 * The 2.0 shop hides *direct gift sales* and keeps *model upgrades* open: a
 * player can pay to make a gift they already own rarer, but cannot simply buy
 * the gift. Both switches live here because deciding that is an owner's job,
 * not a design decision baked into the code.
 *
 * Третий блок — точечный запрет: владелец сам выбирает, какие подарки нельзя
 * купить целиком (только улучшить). Список хранится слагами в
 * `admin.upgradeOnly` и проверяется на маркете через `canBuyGift`.
 */
export function GiftShopDesk() {
  const admin = useGame((s) => s.admin);
  const setAdmin = useGame((s) => s.setAdmin);
  const discount = admin.discount;

  const rows: { key: "giftBuyEnabled" | "giftUpgradesEnabled"; title: string; on: string; off: string }[] = [
    {
      key: "giftBuyEnabled",
      title: "Прямая покупка подарка",
      on: "Подарок можно купить целиком",
      off: "Кнопка цены ведёт в апгрейд — купить целиком нельзя",
    },
    {
      key: "giftUpgradesEnabled",
      title: "Апгрейд модели подарка",
      on: "Риск-ролл и гарантированный (100%) апгрейд со случайной моделью",
      off: "Апгрейд закрыт — остаётся только колесо",
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const on = admin[row.key];
        return (
          <button
            key={row.key}
            onClick={() => {
              setAdmin({ [row.key]: !on });
              logAdmin("магазин", `${row.title}: ${!on ? "включено" : "выключено"}`);
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
              on ? "border-neon/35 bg-neon/[0.08]" : "border-white/8 bg-black/30 hover:bg-white/[0.04]"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold">{row.title}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-white/35">
                {on ? row.on : row.off}
              </span>
            </span>
            <span className={`relative h-5.5 w-10 shrink-0 rounded-full transition ${on ? "bg-neon" : "bg-white/12"}`}>
              <span
                className={`absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-all ${
                  on ? "left-[20px]" : "left-0.5"
                }`}
              />
            </span>
          </button>
        );
      })}

      <UpgradeOnlyDesk />

      <p className="rounded-xl border border-white/7 bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-white/30">
        {discount > 0 ? (
          <>
            Действует скидка <span className="font-bold text-neon">{discount}%</span>: подарок за 500 ★
            сейчас стоит{" "}
            <span className="font-bold text-white/60 tabular-nums">{discountPrice(500, discount)} ★</span>.
          </>
        ) : (
          "Скидки нет — цены ровно как в прайсе магазина."
        )}
      </p>
    </div>
  );
}

/**
 * Точечный запрет прямой покупки.
 *
 * Список базовых подарков с поиском: включаешь тумблер у подарка — и он
 * перестаёт продаваться целиком, зато его модели остаются доступными как
 * апгрейд. Плюс обратная кнопка «только апгрейд у всех», чтобы не кликать 123
 * раза, когда менять правило хочется сразу для всего магазина.
 */
function UpgradeOnlyDesk() {
  const admin = useGame((s) => s.admin);
  const setAdmin = useGame((s) => s.setAdmin);
  const gifts = useAllGifts();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = useMemo(() => {
    const base = gifts.filter((g) => g.kind === "gift");
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? base.filter(
          (g) =>
            g.name.toLowerCase().includes(needle) ||
            g.slug.includes(needle) ||
            g.variant.toLowerCase().includes(needle),
        )
      : base;
    // уже запрещённые — наверх, чтобы их было видно без прокрутки
    const banned = new Set(admin.upgradeOnly);
    return [...filtered].sort((a, b) => Number(banned.has(b.slug)) - Number(banned.has(a.slug)));
  }, [gifts, q, admin.upgradeOnly]);

  const banned = new Set(admin.upgradeOnly);
  const toggle = (slug: string) => {
    const next = banned.has(slug)
      ? admin.upgradeOnly.filter((s) => s !== slug)
      : [...admin.upgradeOnly, slug];
    setAdmin({ upgradeOnly: next });
    logAdmin("магазин", `только апгрейд: ${slug} — ${banned.has(slug) ? "снято" : "включено"}`);
  };

  return (
    <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="block text-[12px] font-extrabold">
            Только апгрейд
            <span className="ml-1.5 rounded-md border border-violet/30 bg-violet/10 px-1.5 py-0.5 text-[9.5px] font-black text-violet">
              {admin.upgradeOnly.length}
            </span>
          </span>
          <span className="mt-0.5 block text-[10px] leading-snug text-white/35">
            Выбранные подарки нельзя купить целиком — только улучшить модель
          </span>
        </span>
        <span className="shrink-0 text-[10px] font-bold text-white/35">{open ? "свернуть" : "открыть"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск подарка…"
              className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 text-[11.5px] outline-none placeholder:text-white/15 focus:border-neon/40"
            />
            <button
              onClick={() => {
                const all = gifts.filter((g) => g.kind === "gift").map((g) => g.slug);
                setAdmin({ upgradeOnly: admin.upgradeOnly.length >= all.length ? [] : all });
                logAdmin(
                  "магазин",
                  admin.upgradeOnly.length >= all.length
                    ? "только апгрейд: снято у всех"
                    : "только апгрейд: включено у всех",
                );
              }}
              className="shrink-0 rounded-lg border border-white/12 px-2 text-[10px] font-bold text-white/45 hover:text-white"
            >
              {admin.upgradeOnly.length ? "снять все" : "все"}
            </button>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
            {list.slice(0, 60).map((g) => {
              const meta = RARITY_META[g.rarity];
              const on = banned.has(g.slug);
              return (
                <button
                  key={g.id}
                  onClick={() => toggle(g.slug)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                    on ? "border-violet/35 bg-violet/[0.10]" : "border-white/7 bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-bold">{g.name}</span>
                    <span className="block truncate text-[9.5px] text-white/30">
                      <span style={{ color: meta.hex }}>{meta.label}</span> · {g.variant}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      on ? "bg-violet text-white" : "border border-white/10 text-white/30"
                    }`}
                  >
                    {on ? "только апгрейд" : "продаётся"}
                  </span>
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="py-4 text-center text-[10.5px] text-white/25">Ничего не найдено</p>
            )}
            {list.length > 60 && (
              <p className="pt-1 text-center text-[9.5px] text-white/20">
                показано 60 из {list.length} — уточни поиск
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- ads */

const PLACEMENTS: { id: OwnerAdPlacement; label: string }[] = [
  { id: "dashboard", label: "Дашборд" },
  { id: "top", label: "Лендинг, вверху" },
  { id: "inline", label: "Внутри страниц" },
  { id: "footer", label: "Подвал" },
];

const emptyDraft = {
  title: "",
  text: "",
  cta: "",
  href: "",
  image: null as string | null,
  slot: "dashboard" as OwnerAdPlacement,
  active: true,
};

export function AdsDesk() {
  const toast = useGame((s) => s.toast);
  const adsEnabled = useGame((s) => s.admin.adsEnabled);
  const setAdmin = useGame((s) => s.setAdmin);
  const ads = useOwnerAds();
  const [draft, setDraft] = useState(emptyDraft);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const pickImage = (file: File | null) => {
    if (!file) return;
    if (file.size > 300_000) {
      toast({ kind: "error", title: "Файл большой", message: "Картинка до 300 КБ" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraft((d) => ({ ...d, image: typeof reader.result === "string" ? reader.result : null }));
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!draft.title.trim()) {
      toast({ kind: "error", title: "Нужен заголовок" });
      return;
    }
    saveOwnerAd({ ...draft, title: draft.title.trim(), text: draft.text.trim() });
    logAdmin("реклама", draft.title.trim());
    setDraft(emptyDraft);
    toast({ kind: "success", title: "Объявление добавлено" });
  };

  return (
    <div className="space-y-2.5">
      <button
        onClick={() => setAdmin({ adsEnabled: !adsEnabled })}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
          adsEnabled ? "border-neon/35 bg-neon/[0.08]" : "border-white/8 bg-black/30 hover:bg-white/[0.04]"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-[12px] font-extrabold">Свои объявления</span>
          <span className="mt-0.5 block text-[10px] text-white/35">
            {adsEnabled ? "Показываются игрокам в выбранных местах" : "Скрыты от игроков"}
          </span>
        </span>
        <span className={`relative h-5.5 w-10 shrink-0 rounded-full transition ${adsEnabled ? "bg-neon" : "bg-white/12"}`}>
          <span
            className={`absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-all ${
              adsEnabled ? "left-[20px]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Заголовок"
          className="h-9 rounded-xl border border-white/10 bg-black/40 px-2.5 text-[12px] outline-none placeholder:text-white/15 focus:border-neon/40"
        />
        <select
          value={draft.slot}
          onChange={(e) => setDraft({ ...draft, slot: e.target.value as OwnerAdPlacement })}
          className="h-9 rounded-xl border border-white/10 bg-black/40 px-2 text-[12px] outline-none"
        >
          {PLACEMENTS.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#0d0d10]">
              {p.label}
            </option>
          ))}
        </select>
        <input
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          placeholder="Текст (необязательно)"
          className="h-9 rounded-xl border border-white/10 bg-black/40 px-2.5 text-[12px] outline-none placeholder:text-white/15 focus:border-neon/40 sm:col-span-2"
        />
        <input
          value={draft.cta}
          onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
          placeholder="Кнопка: «Открыть»"
          className="h-9 rounded-xl border border-white/10 bg-black/40 px-2.5 text-[12px] outline-none placeholder:text-white/15 focus:border-neon/40"
        />
        <input
          value={draft.href}
          onChange={(e) => setDraft({ ...draft, href: e.target.value })}
          placeholder="/app/premium или https://t.me/…"
          className="h-9 rounded-xl border border-white/10 bg-black/40 px-2.5 text-[12px] outline-none placeholder:text-white/15 focus:border-neon/40"
        />
      </div>

      <div className="flex items-center gap-2">
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
        <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
          {draft.image ? "Другая картинка" : "Картинка"}
        </Button>
        {draft.image && (
          <>
            <img src={draft.image} alt="" className="size-8 rounded-md border border-white/10 object-cover" />
            <button
              onClick={() => setDraft({ ...draft, image: null })}
              className="text-[10px] font-bold text-white/35 hover:text-white/70"
            >
              убрать
            </button>
          </>
        )}
        <Button size="sm" className="ml-auto" onClick={submit}>
          Добавить
        </Button>
      </div>

      {ads.length > 0 && (
        <div className="space-y-1.5">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                ad.active ? "border-white/10 bg-black/25" : "border-white/6 bg-black/15 opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-bold">{ad.title}</p>
                <p className="truncate text-[9.5px] text-white/25">
                  {PLACEMENTS.find((p) => p.id === ad.slot)?.label}
                  {ad.text ? ` · ${ad.text}` : ""}
                </p>
              </div>
              <button
                onClick={() => toggleOwnerAd(ad.id)}
                className="shrink-0 rounded-md border border-white/12 px-1.5 py-0.5 text-[9.5px] font-bold text-white/50 hover:text-white"
              >
                {ad.active ? "скрыть" : "показать"}
              </button>
              <button
                onClick={() => deleteOwnerAd(ad.id)}
                className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[9.5px] font-bold text-white/30 hover:text-mythic"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-white/22">
        Сеть-баннеры Adsterra: {ADS_ENABLED ? "включены" : "выключены"}, заполнено слотов —{" "}
        {Object.values(AD_SLOTS).filter(Boolean).length} из 3. Свои объявления работают отдельно от них.
      </p>
    </div>
  );
}