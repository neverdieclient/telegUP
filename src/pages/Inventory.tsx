import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { RARITY_META } from "../data/gifts";
import { backgroundCss, backgroundOf } from "../data/backgrounds";
import { patternLayer, patternOf } from "../data/patterns";
import { fmtGiftNumber } from "../lib/giftNumbers";
import { UPGRADE_STARS } from "../lib/pricing";
import { useAllGifts, useGiftIndex } from "../lib/useCatalog";
import { pinCap, useGame } from "../store/useGame";
import { useGiftInbox } from "../lib/useGiftInbox";
import { GiftArt, RarityChip, StarIcon } from "../components/gifts/GiftArt";
import { Button } from "../components/ui/Button";
import { SPRING_SNAPPY, SPRING_SOFT } from "../lib/motion";
import { sendGift, searchPlayers, type PlayerRow } from "../lib/players";
import { onlineEnabled } from "../lib/supabase";
import { Avatar } from "../components/profile/Cosmetics";

type Sort = "new" | "value" | "name";

/**
 * Подложка подарка: однотонный «тканевой» цвет, а поверх — узор, как в
 * Телеграме. Узор — отдельный слой картинки, поэтому оба слоя живут в одном
 * `background-image`: фон снизу, тиснение сверху. У базового подарка узора нет,
 * и остаётся только градиент.
 */
function lookStyle(
  bg: string | null | undefined,
  pattern: string | null | undefined,
  tint: string,
  size = 14,
): CSSProperties {
  const base = backgroundCss(bg, tint);
  const layer = patternLayer(pattern, { size });
  return { backgroundImage: layer ? `${layer}, ${base}` : base };
}

/** Telegram-style pin, used on the cards and the pinned strip. */
function PinIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 17v5" />
      <path d="M9 10.8V4h6v6.8l2.6 3.2H6.4L9 10.8Z" />
    </svg>
  );
}

/** Сколько пикселей нужно протащить карточку, чтобы это стало перетаскиванием. */
const PIN_DRAG_SLOP = 8;

const SOURCE_LABEL: Record<string, string> = {
  case: "кейс",
  market: "маркет",
  upgrade: "апгрейд",
  free: "бонус",
  admin: "admin",
  pvp: "pvp",
  mines: "mines",
  crash: "crash",
  dice: "dice",
  wheel: "wheel",
  coinflip: "coinflip",
  tower: "tower",
  craft: "крафт",
};

export default function Inventory() {
  const inventory = useGame((s) => s.inventory);
  const GIFT_BY_ID = useGiftIndex();
  const allGifts = useAllGifts();
  const sellItem = useGame((s) => s.sellItem);
  const sellAll = useGame((s) => s.sellAll);
  const togglePin = useGame((s) => s.togglePin);
  const movePin = useGame((s) => s.movePin);
  const setPinOrder = useGame((s) => s.setPinOrder);
  const pinOrder = useGame((s) => s.pinOrder);
  /** premium adds one slot; the cap follows the subscription, not a setting */
  const premiumUntil = useGame((s) => s.premiumUntil);
  const cap = pinCap(premiumUntil);
  const { flush: flushInventory } = useGiftInbox();
  const giftItem = useGame((s) => s.giftItem);
  const guaranteedUpgrade = useGame((s) => s.guaranteedUpgrade);
  const giftUpgradesEnabled = useGame((s) => s.admin.giftUpgradesEnabled);
  const stars = useGame((s) => s.stars);
  const toast = useGame((s) => s.toast);
  const profile = useGame((s) => s.profile);
  const setMainNumber = useGame((s) => s.setMainNumber);

  const [sort, setSort] = useState<Sort>("new");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  // ---- gift recipient picker ----
  const onlineUserId = useGame((s) => s.onlineUserId);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftQuery, setGiftQuery] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [found, setFound] = useState<PlayerRow[]>([]);
  const [recipient, setRecipient] = useState<PlayerRow | null>(null);

  useEffect(() => {
    if (!giftOpen || !onlineEnabled) return;
    const q = giftQuery.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchPlayers(q, 8).then((rows) => setFound(rows.filter((r) => r.id !== onlineUserId)));
    }, 300);
    return () => window.clearTimeout(t);
  }, [giftOpen, giftQuery, onlineUserId]);

  const list = useMemo(() => {
    const out = inventory.filter((i) => GIFT_BY_ID[i.giftId]);
    const sorted = [...out].sort((a, b) => {
      if (sort === "new") return b.acquiredAt - a.acquiredAt;
      if (sort === "value") return GIFT_BY_ID[b.giftId].stars - GIFT_BY_ID[a.giftId].stars;
      return GIFT_BY_ID[a.giftId].variant.localeCompare(GIFT_BY_ID[b.giftId].variant);
    });
    // pinned gifts float above the rest, like Telegram's pinned gifts
    return [...sorted].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  }, [inventory, sort]);

  const totalValue = useMemo(
    () => inventory.reduce((acc, i) => acc + (GIFT_BY_ID[i.giftId]?.stars ?? 0), 0),
    [inventory],
  );

  const active = selected ? inventory.find((i) => i.id === selected) ?? null : null;
  const activeGift = active ? GIFT_BY_ID[active.giftId] ?? null : null;
  const pinned = useMemo(() => {
    const pos = (id: string) => {
      const at = pinOrder.indexOf(id);
      // ids missing from the order list (old saves) fall back to newest-first
      return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    };
    return inventory
      .filter((i) => i.pinned && GIFT_BY_ID[i.giftId])
      .sort((a, b) => pos(a.id) - pos(b.id) || b.acquiredAt - a.acquiredAt);
  }, [inventory, pinOrder, GIFT_BY_ID]);

  /* --------------------------------------------------- перетаскивание закрепов */

  /**
   * Порядок закреплённых — «как в телеге»: зажал карточку и потащил туда, где
   * она должна стоять. Стор не трогаем на каждом движении пальца, иначе в
   * историю сохранений полетит десяток промежуточных порядков; работаем с
   * черновиком и записываем его один раз, на отпускании.
   *
   * Тап остаётся тапом: перетаскивание начинается только после смещения на
   * `PIN_DRAG_SLOP`, поэтому карточка продолжает открывать детали.
   */
  const [pinDraft, setPinDraft] = useState<string[] | null>(null);
  const [draggingPin, setDraggingPin] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const pinDraftRef = useRef<string[] | null>(null);
  const pinDrag = useRef<{ id: string; pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  /** после настоящего перетаскивания клик по карточке надо погасить */
  const pinTapBlocked = useRef(false);
  /**
   * Карточка, которую ведут пальцем.
   *
   * Позиция НЕ живёт в состоянии React: pointermove приходит до сотни раз в
   * секунду, и setState на каждое движение перерисовывал бы всю страницу —
   * отсюда и были лаги. Поэтому координаты пишутся прямо в узел (transform,
   * только композитор, без layout), а состояние меняется лишь когда меняется
   * сам порядок.
   */
  const [pinGhost, setPinGhost] = useState<{ giftId: string; w: number; h: number } | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const ghostPos = useRef({ x: 0, y: 0 });
  /** при захвате точки плиток фиксируются — их не надо мерить на каждом движении */
  const slotRects = useRef<{ left: number; right: number; top: number; bottom: number }[]>([]);
  const pinGrab = useRef({ dx: 0, dy: 0 });

  const paintGhost = useCallback(() => {
    const el = ghostRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${ghostPos.current.x}px, ${ghostPos.current.y}px, 0)`;
  }, []);

  // первое положение — до кадра отрисовки, иначе призрак мигнёт в левом углу
  useLayoutEffect(paintGhost, [pinGhost, paintGhost]);

  const setDraft = (next: string[] | null) => {
    pinDraftRef.current = next;
    setPinDraft(next);
  };

  /** Что показать в полосе: черновик, если он есть, иначе порядок из стора. */
  const pinnedView = useMemo(() => {
    if (!pinDraft) return pinned;
    const byId = new Map(pinned.map((i) => [i.id, i]));
    const out = pinDraft.map((id) => byId.get(id)).filter((i): i is (typeof pinned)[number] => Boolean(i));
    // закреп, которого нет в черновике, не выбрасываем — дописываем в конец
    for (const item of pinned) if (!out.includes(item)) out.push(item);
    return out;
  }, [pinned, pinDraft]);

  /** Ближайшая к пальцу плитка — по заранее снятой геометрии сетки. */
  const pinIndexAt = useCallback((x: number, y: number) => {
    const rects = slotRects.current;
    if (!rects.length) return -1;
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      // расстояние до прямоугольника, а не до центра: между плитками есть
      // зазоры, и попадать в них тоже надо
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, []);

  const pinDragStart = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pinDrag.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };

  const pinDragMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = pinDrag.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (!drag.moved) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (dx * dx + dy * dy < PIN_DRAG_SLOP * PIN_DRAG_SLOP) return;
      drag.moved = true;

      // сетка снимается один раз: пока палец едет, слоты стоят на месте,
      // меняется только то, какая карточка в каком слоте
      const nodes = stripRef.current?.querySelectorAll<HTMLElement>("[data-pin-id]");
      slotRects.current = Array.from(nodes ?? []).map((n) => {
        const r = n.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });

      const rect = e.currentTarget.getBoundingClientRect();
      // запоминаем, за какую точку карточки взялись, чтобы она не прыгнула под палец
      pinGrab.current = { dx: drag.x - rect.left, dy: drag.y - rect.top };
      ghostPos.current = { x: rect.left, y: rect.top };

      setDraft(pinned.map((i) => i.id));
      setDraggingPin(drag.id);
      setPinGhost({
        giftId: pinned.find((i) => i.id === drag.id)?.giftId ?? "",
        w: rect.width,
        h: rect.height,
      });
    }

    ghostPos.current = { x: e.clientX - pinGrab.current.dx, y: e.clientY - pinGrab.current.dy };
    paintGhost();

    const target = pinIndexAt(e.clientX, e.clientY);
    if (target < 0) return;
    const base = pinDraftRef.current ?? pinned.map((i) => i.id);
    const from = base.indexOf(drag.id);
    if (from < 0 || from === target) return;
    const next = [...base];
    next.splice(from, 1);
    next.splice(target, 0, drag.id);
    setDraft(next);
  };

  const pinDragEnd = (e: React.PointerEvent<HTMLElement>) => {
    const drag = pinDrag.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    pinDrag.current = null;
    setDraggingPin(null);
    setPinGhost(null);
    if (drag.moved) {
      const draft = pinDraftRef.current;
      if (draft) setPinOrder(draft);
      pinTapBlocked.current = true;
      // защита от «клик после drag» в браузерах, где click всё же приходит
      window.setTimeout(() => {
        pinTapBlocked.current = false;
      }, 250);
    }
    setDraft(null);
  };

  /** Клавиатура: та же перестановка, но стрелками — как обычная кнопка. */
  const pinKeyMove = (e: React.KeyboardEvent<HTMLElement>, id: string) => {
    const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
    const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
    if (!back && !fwd) return;
    e.preventDefault();
    e.stopPropagation();
    movePin(id, back ? -1 : 1);
  };

  /** Вся коллекция, кроме текущей модели: выпадает любая, шансы одинаковые. */
  const rollModels = useMemo(() => {
    if (!activeGift) return [];
    return allGifts.filter(
      (g) => g.slug === activeGift.slug && g.kind === "model" && g.id !== activeGift.id,
    );
  }, [activeGift, allGifts]);

  /**
   * Апгрейд модели: провала нет, какая именно модель выпадет — чистый случай
   * (может быть и топовая, и самая дешёвая, и дешевле текущей). Цена всегда
   * одна — 15★. Вместе с моделью подарок получает номер коллекции и фон.
   */
  const doGuaranteedUpgrade = () => {
    if (!active) return;
    const res = guaranteedUpgrade(active.id);
    if (res.ok) {
      const got = res.targetGiftId ? GIFT_BY_ID[res.targetGiftId] ?? null : null;
      toast({
        kind: "success",
        title: got ? `${got.name}: ${got.variant}` : "Модель выпала",
        message: `Случайная модель коллекции · −${(res.cost ?? UPGRADE_STARS).toLocaleString("ru-RU")} ★`,
      });
      setModelOpen(false);
      setSelected(null);
      return;
    }
    if (res.reason === "stars") {
      toast({
        kind: "info",
        title: `Нужно ${UPGRADE_STARS} ★`,
        message: `У тебя ${stars.toLocaleString("ru-RU")} ★ · апгрейд стоит ${UPGRADE_STARS} ★`,
      });
      return;
    }
    if (res.reason === "top") {
      toast({ kind: "info", title: "Нет других моделей", message: "В этой коллекции всего одна модель" });
      return;
    }
    if (res.reason === "model") {
      toast({
        kind: "info",
        title: "Уже улучшен",
        message: "Улучшать можно только базовый подарок — этот уже с моделью",
      });
      return;
    }
    if (res.reason === "disabled") {
      toast({ kind: "info", title: "Улучшения выключены", message: "Владелец закрыл апгрейд моделей" });
    }
  };

  const openGiftPicker = () => {
    setGiftQuery("");
    setGiftMessage("");
    setFound([]);
    setRecipient(null);
    setGiftOpen(true);
  };

  const confirmGift = async () => {
    if (!active || !activeGift || !recipient) return;
    const res = await sendGift({
      fromId: onlineUserId ?? "local",
      fromName: profile.nickname,
      toId: recipient.id,
      toName: recipient.nickname || recipient.username,
      giftId: activeGift.id,
      giftName: activeGift.name,
      giftStars: activeGift.stars,
      message: giftMessage.trim() || undefined,
    });
    if (res.error) {
      toast({ kind: "error", title: "Не отправлено", message: res.error });
      return;
    }
    giftItem(active.id);
    toast({
      kind: "gift",
      title: `Подарок для @${recipient.nickname || recipient.username}`,
      message: `${activeGift.name} отправлен`,
    });
    setGiftOpen(false);
    setSelected(null);
  };

  const doSell = (id: string) => {
    const gain = sellItem(id);
    if (gain > 0) {
      toast({ kind: "success", title: `+${gain.toLocaleString("ru-RU")} ★`, message: "Подарок продан" });
      setSelected(null);
    }
  };

  const doSellAll = () => {
    const { count, stars } = sellAll();
    setConfirmAll(false);
    if (!count) {
      toast({ kind: "info", title: "Инвентарь пуст" });
      return;
    }
    toast({
      kind: "success",
      title: `Продано ${count} шт.`,
      message: `+${stars.toLocaleString("ru-RU")} ★`,
    });
  };

  /** Pin/unpin, warning when the Telegram-style cap of three is reached. */
  const doTogglePin = (id: string) => {
    const item = inventory.find((i) => i.id === id);
    if (!item) return;
    if (!item.pinned && pinned.length >= cap) {
      toast({
        kind: "info",
        title: `Закреплено уже ${cap}`,
        message: `Больше ${cap} не закрепить — открепи один${cap > 3 ? "" : " или подключи Premium"}`,
      });
      return;
    }
    const nowPinned = togglePin(id);
    // pinned is part of the inventory row that other players read, so it has to
    // reach the cloud right away — otherwise the strip on the public card
    // keeps showing the old set until something else triggers a push
    if (nowPinned !== Boolean(item.pinned)) flushInventory();
    toast({
      kind: "success",
      title: nowPinned ? "Подарок закреплён" : "Подарок откреплён",
      message: nowPinned ? "Закреплённые висят сверху и видны в профиле" : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-rare">Storage</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Инвентарь</h1>
          <p className="mt-1 text-[12.5px] text-white/35">
            {inventory.length} предметов · {totalValue.toLocaleString("ru-RU")} ★ суммарно
          </p>
        </div>
        <Button
          variant={inventory.length ? "danger" : "ghost"}
          onClick={() => setConfirmAll(true)}
          disabled={!inventory.length}
          icon={<StarIcon className="size-3.5" />}
        >
          Продать всё · {totalValue.toLocaleString("ru-RU")} ★
        </Button>
      </header>

      {/* Свой номер: купленные в TON-маркете номера переключаются здесь.
          Ники живут в настройках профиля — им там и место. */}
      <section className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.05] to-transparent p-4 backdrop-blur-sm">
        <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-[#4aa8ff]/15 blur-[70px]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
              Мой номер
            </p>
            <p className="mt-1 font-display text-lg font-black tabular-nums tracking-tight">
              {profile.anonymousNumber && profile.phoneNumber ? profile.phoneNumber : "обычный номер"}
            </p>
            <p className="mt-0.5 text-[10.5px] text-white/25">
              {profile.purchasedNumbers.length > 0
                ? `${profile.purchasedNumbers.length} своих · переключение мгновенное`
                : "номер покупается в TON-маркете за TON"}
            </p>
          </div>

          {profile.purchasedNumbers.length > 0 ? (
            <label className="block w-full sm:w-auto">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                Переключить
              </span>
              <select
                value={profile.anonymousNumber ? profile.phoneNumber ?? "" : ""}
                onChange={(e) => setMainNumber(e.target.value || null)}
                className="w-full min-w-[170px] rounded-xl border border-white/10 bg-black/40 px-2.5 py-2 text-[12px] font-bold tabular-nums text-white/80 outline-none transition-colors focus:border-neon/40"
              >
                <option value="">обычный</option>
                {profile.purchasedNumbers.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Link to="/app/ton">
              <Button size="sm" variant="ghost">
                В TON-маркет
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* pinned gifts — kept at the top like Telegram's pinned gifts */}
      {pinned.length > 0 && (
        <section className="rounded-3xl border border-neon/20 bg-neon/[0.04] p-3">
          <div className="mb-2 flex items-end justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-[12px] font-extrabold tracking-tight text-neon">
                <PinIcon className="size-3.5" /> Закреплённые
              </h2>
              <p className="mt-0.5 text-[10px] text-white/30">
                Зажми карточку и перетащи — порядок сохранится
              </p>
            </div>
            <span className="shrink-0 text-[10.5px] text-white/25">
              {pinned.length} / {cap}
            </span>
          </div>
          <div ref={stripRef} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {pinnedView.map((item, idx) => {
              const gift = GIFT_BY_ID[item.giftId];
              const meta = RARITY_META[gift.rarity];
              const isDragging = draggingPin === item.id;
              return (
                <motion.div
                  key={item.id}
                  layout
                  transition={SPRING_SOFT}
                  data-pin-id={item.id}
                  role="button"
                  tabIndex={0}
                  aria-grabbed={isDragging}
                  onPointerDown={(e) => pinDragStart(e, item.id)}
                  onPointerMove={pinDragMove}
                  onPointerUp={pinDragEnd}
                  onPointerCancel={pinDragEnd}
                  onClick={() => {
                    // после перетаскивания клик не должен открывать детали
                    if (pinTapBlocked.current) return;
                    setSelected(item.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(item.id);
                      return;
                    }
                    pinKeyMove(e, item.id);
                  }}
                  style={{ touchAction: "none", ...lookStyle(item.bg, item.pattern, gift.tint, 10) }}
                  className={[
                    "group relative flex cursor-grab select-none items-center gap-2 overflow-hidden rounded-2xl border bg-black/30 p-2 text-left active:cursor-grabbing",
                    meta.ring,
                    isDragging
                      ? // «дырка» на месте карточки: сама карточка уехала под палец
                        "border-dashed border-neon/60 bg-neon/[0.06] opacity-40"
                      : "hover:border-white/25",
                  ].join(" ")}
                >
                  {/* «держалка» — показывает, что карточку можно взять */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-1 top-1 text-[9px] leading-none text-white/25"
                  >
                    ⠿
                  </span>

                  <GiftArt gift={gift} size={40} rounded="rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate pr-2 text-[11.5px] font-extrabold">
                      {gift.name}
                      {typeof item.num === "number" && (
                        <span className="ml-1 text-[9.5px] font-bold tabular-nums text-white/35">
                          {fmtGiftNumber(item.num)}
                        </span>
                      )}
                    </p>
                    <p className="flex items-center gap-0.5 text-[11px] font-bold tabular-nums text-neon/90">
                      {gift.stars.toLocaleString("ru-RU")}
                      <StarIcon className="size-2.5" />
                    </p>
                    <p className="mt-0.5 text-[9.5px] font-bold text-white/25">
                      место {idx + 1}
                    </p>
                  </div>

                  <button
                    type="button"
                    title="Открепить"
                    aria-label="Открепить подарок"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(item.id);
                    }}
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-neon/20 text-neon hover:bg-neon/30"
                  >
                    <PinIcon className="size-3" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* карточка, которую ведут пальцем — поверх всего, чтобы не залипала в сетке */}
      {pinGhost &&
        GIFT_BY_ID[pinGhost.giftId] &&
        createPortal(
          <div
            ref={ghostRef}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              width: pinGhost.w,
              height: pinGhost.h,
              zIndex: 90,
              pointerEvents: "none",
              willChange: "transform",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1.06, rotate: -2 }}
              transition={SPRING_SNAPPY}
              className="flex h-full w-full items-center gap-2 rounded-2xl border border-neon/60 bg-[#12131a] p-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]"
            >
              <GiftArt gift={GIFT_BY_ID[pinGhost.giftId]} size={40} rounded="rounded-xl" />
              <p className="truncate text-[11.5px] font-extrabold">
                {GIFT_BY_ID[pinGhost.giftId].name}
              </p>
            </motion.div>
          </div>,
          document.body,
        )}

      {/* filters */}
      <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/8 bg-white/[0.025] p-3">
        <p className="shrink-0 text-[11.5px] font-bold text-white/35">
          {inventory.length} {inventory.length === 1 ? "подарок" : "подарков"}
        </p>
        <div className="flex gap-1.5">
          {(
            [
              ["new", "новые"],
              ["value", "дорогие"],
              ["name", "имя"],
            ] as [Sort, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`rounded-xl px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${
                sort === k ? "bg-white/10 text-white" : "text-white/35 hover:text-white/70"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      {list.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 py-20 text-center">
          <p className="text-[14px] font-bold text-white/45">Тут пока пусто</p>
          <p className="mt-1 text-[11.5px] text-white/25">Открой кейс или купи подарок на маркете</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/app/cases">
              <Button size="sm">К кейсам</Button>
            </Link>
            <Link to="/app/market">
              <Button size="sm" variant="ghost">
                На маркет
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((item, i) => {
            const gift = GIFT_BY_ID[item.giftId];
            const meta = RARITY_META[gift.rarity];
            // улучшенный подарок: чип «обычный» исчезает, а вместо него —
            // случайный фон и номер коллекции, как в Телеграме
            const upgraded = Boolean(item.bg) || typeof item.num === "number";
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.01, 0.2), duration: 0.28 }}
                onClick={() => setSelected(item.id)}
                className={`group relative flex flex-col overflow-hidden rounded-3xl border bg-white/[0.025] text-left transition-transform duration-300 hover:-translate-y-1 ${meta.ring}`}
              >
                <div
                  className="relative grid h-[108px] place-items-center overflow-hidden"
                  style={lookStyle(item.bg, item.pattern, gift.tint)}
                >
                  <GiftArt gift={gift} size={70} rounded="rounded-xl" />
                  {!upgraded && (
                    <span className={`absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider ${meta.chip}`}>
                      {meta.label}
                    </span>
                  )}
                  {typeof item.num === "number" && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-extrabold tabular-nums text-white/70 backdrop-blur">
                      {fmtGiftNumber(item.num)}
                    </span>
                  )}
                  <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[8.5px] font-bold text-white/45 backdrop-blur">
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    title={item.pinned ? "Открепить" : "Закрепить"}
                    aria-label={item.pinned ? "Открепить подарок" : "Закрепить подарок"}
                    onClick={(e) => {
                      e.stopPropagation();
                      doTogglePin(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        doTogglePin(item.id);
                      }
                    }}
                    className={`absolute bottom-2 right-2 grid size-6 place-items-center rounded-full border backdrop-blur transition-colors ${
                      item.pinned
                        ? "border-neon/50 bg-neon/20 text-neon"
                        : "border-white/10 bg-black/50 text-white/35 opacity-0 hover:text-white focus:opacity-100 group-hover:opacity-100"
                    }`}
                  >
                    <PinIcon className={item.pinned ? "size-3" : "size-3 -rotate-45"} />
                  </span>
                </div>
                <div className="p-2.5">
                  <h3 className="truncate text-[12px] font-extrabold tracking-tight">{gift.name}</h3>
                  <p className="truncate text-[10px] text-white/35">
                    {gift.variant === "Gift" ? "коллекционный подарок" : gift.variant}
                  </p>
                  <p className="mt-1.5 flex items-center gap-0.5 text-[12px] font-extrabold tabular-nums text-neon/90">
                    {gift.stars.toLocaleString("ru-RU")}
                    <StarIcon className="size-2.5" />
                  </p>
                </div>
              </motion.button>
            );
          })}
        </section>
      )}

      {/* item sheet */}
      <AnimatePresence>
        {active && activeGift && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-[#0c0c0f] sm:rounded-3xl"
            >
              <div
                className="relative grid h-44 place-items-center"
                style={lookStyle(active.bg, active.pattern, activeGift.tint, 18)}
              >
                <GiftArt gift={activeGift} size={104} rounded="rounded-2xl" />
                <button
                  onClick={() => setSelected(null)}
                  className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/40 text-white/50 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[18px] font-extrabold tracking-tight">
                      {activeGift.name}
                      {typeof active.num === "number" && (
                        <span className="ml-1.5 align-middle text-[13px] font-bold tabular-nums text-white/40">
                          {fmtGiftNumber(active.num)}
                        </span>
                      )}
                    </h3>
                    <p className="truncate text-[12px] text-white/40">
                      {activeGift.variant === "Gift" ? "коллекционный подарок" : activeGift.variant}
                    </p>
                  </div>
                  {/* чип «обычный» есть только у базового подарка: у улучшенного
                      вместо него номер и фон, как в Телеграме */}
                  {Boolean(active.bg) || typeof active.num === "number" ? null : (
                    <RarityChip rarity={activeGift.rarity} />
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["стоимость", `${activeGift.stars.toLocaleString("ru-RU")} ★`],
                    ["TON", activeGift.ton > 0 ? activeGift.ton.toLocaleString("ru-RU") : "—"],
                    ["тираж", activeGift.supply > 0 ? activeGift.supply.toLocaleString("ru-RU") : "∞"],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-white/7 bg-white/[0.025] px-2.5 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">{l}</p>
                      <p className="truncate text-[12px] font-extrabold tabular-nums text-white/85">{v}</p>
                    </div>
                  ))}
                </div>

                {/* у улучшенного подарка, как в Телеграме, видно, что ему
                    досталось: название фона и узора */}
                {backgroundOf(active.bg) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-lg bg-white/[0.055] px-2 py-1 text-[10px] font-bold text-white/40">
                      фон · {backgroundOf(active.bg)!.name}
                    </span>
                    {patternOf(active.pattern) && (
                      <span className="rounded-lg bg-white/[0.055] px-2 py-1 text-[10px] font-bold text-white/40">
                        узор · {patternOf(active.pattern)!.glyph} {patternOf(active.pattern)!.name}
                      </span>
                    )}
                  </div>
                )}

                <p className="mt-3 line-clamp-3 text-[11px] leading-relaxed text-white/30">{activeGift.desc}</p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button full variant="primary" onClick={() => doSell(active.id)} icon={<StarIcon className="size-3.5" />}>
                    Продать
                  </Button>
                  <Button
                    full
                    variant="ghost"
                    onClick={openGiftPicker}
                  >
                    Подарить
                  </Button>
                </div>

                <Button
                  full
                  variant={active.pinned ? "violet" : "ghost"}
                  className="mt-2"
                  onClick={() => doTogglePin(active.id)}
                  icon={<PinIcon className="size-3.5" />}
                >
                  {active.pinned ? "Открепить" : "Закрепить"}
                </Button>

                {!giftUpgradesEnabled ? (
                  <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-center text-[10.5px] text-white/30">
                    улучшение моделей временно закрыто
                  </p>
                ) : activeGift.kind !== "gift" ? (
                  // улучшать можно только базовый подарок: то, что уже с моделью,
                  // — финальная вещь, второй раз её не трогаем
                  <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-center text-[10.5px] text-white/30">
                    этот подарок уже улучшен — второй раз нельзя
                  </p>
                ) : rollModels.length > 0 ? (
                  <Button
                    full
                    variant="violet"
                    className="mt-2"
                    onClick={() => setModelOpen(true)}
                    disabled={modelOpen}
                  >
                    🎲 Улучшить модель · {UPGRADE_STARS} ★
                  </Button>
                ) : (
                  <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-center text-[10.5px] text-white/30">
                    в этой коллекции всего одна модель
                  </p>
                )}

                <Link to="/app/upgrade" onClick={() => setSelected(null)} className="mt-2 block">
                  <Button full variant="ghost" size="sm">
                    Апгрейд на другой подарок
                  </Button>
                </Link>

                {modelOpen && rollModels.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING_SOFT}
                    className="mt-3 rounded-2xl border border-neon/25 bg-neon/[0.05] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neon/80">
                        Апгрейд модели · 100%
                      </p>
                      <button
                        onClick={() => setModelOpen(false)}
                        className="text-[11px] font-bold text-white/35 hover:text-white"
                      >
                        свернуть
                      </button>
                    </div>

                    <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/45">
                      Провала нет — предмет не сгорает. Выпадает{" "}
                      <span className="font-bold text-white/70">любая</span> модель коллекции: хоть
                      топовая, хоть самая дешёвая, шансы у всех одинаковые. Выбрать
                      конкретную нельзя. Вместе с моделью подарок получает{" "}
                      <span className="font-bold text-white/70">номер</span> коллекции и{" "}
                      <span className="font-bold text-white/70">фон</span> — как в Телеграме.
                    </p>

                    <div className="mt-2 flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-extrabold">
                          {activeGift.name} · {activeGift.variant}
                        </p>
                        <p className="text-[9.5px] tabular-nums text-white/35">
                          сейчас {activeGift.stars.toLocaleString("ru-RU")} ★ · моделей в коллекции{" "}
                          {rollModels.length}
                        </p>
                      </div>
                      <p className="shrink-0 text-[15px] font-black tabular-nums text-neon">
                        {UPGRADE_STARS} ★
                      </p>
                    </div>

                    <Button
                      full
                      className="mt-2"
                      size="sm"
                      onClick={doGuaranteedUpgrade}
                      disabled={stars < UPGRADE_STARS}
                    >
                      🎲 Улучшить · {UPGRADE_STARS} ★
                    </Button>

                    <p className="mt-1.5 text-center text-[9.5px] leading-relaxed text-white/25">
                      {stars >= UPGRADE_STARS
                        ? `Случайная модель + номер + фон. Баланс ${stars.toLocaleString("ru-RU")} ★.`
                        : `Нужно ${UPGRADE_STARS} ★ — у тебя ${stars.toLocaleString("ru-RU")} ★.`}
                    </p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* gift recipient picker */}
      <AnimatePresence>
        {giftOpen && activeGift && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setGiftOpen(false)}
            className="fixed inset-0 z-[96] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-[#0c0c0f] sm:rounded-3xl"
            >
              <div className="flex items-center gap-3 border-b border-white/8 p-4">
                <GiftArt gift={activeGift} size={44} rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-extrabold tracking-tight">Подарить «{activeGift.name}»</h3>
                  <p className="text-[11px] text-white/35">
                    {activeGift.variant === "Gift" ? "коллекционный подарок" : activeGift.variant} ·{" "}
                    {activeGift.stars.toLocaleString("ru-RU")} ★
                  </p>
                </div>
                <button
                  onClick={() => setGiftOpen(false)}
                  className="grid size-8 place-items-center rounded-full bg-black/40 text-white/50 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Кому отправить</p>
                <input
                  value={giftQuery}
                  onChange={(e) => {
                    setGiftQuery(e.target.value);
                    setRecipient(null);
                  }}
                  placeholder="@username или ник"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] font-semibold outline-none placeholder:text-white/20 focus:border-neon/40"
                />

                {!onlineEnabled && (
                  <p className="mt-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[10.5px] leading-relaxed text-white/30">
                    Онлайн не подключён — подарок уйдёт в локальную симуляцию.
                  </p>
                )}

                {giftQuery.trim().length >= 2 && found.length === 0 && onlineEnabled && (
                  <p className="mt-2 px-1 text-[11px] text-white/30">Никого не нашли</p>
                )}

                {found.length > 0 && (
                  <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                    {found.map((p) => {
                      const on = recipient?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setRecipient(p)}
                          className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                            on ? "border-neon/50 bg-neon/10" : "border-white/8 bg-white/[0.02] hover:border-white/20"
                          }`}
                        >
                          <Avatar
                            src={p.avatar_url}
                            nickname={p.nickname || p.username || "?"}
                            size={32}
                            rounded="rounded-full"
                            className="text-[12px]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-extrabold">@{p.nickname || p.username}</span>
                            <span className="block truncate text-[10px] text-white/30">
                              {p.inventory_value.toLocaleString("ru-RU")} ★ инвентарь · {p.items} шт.
                            </span>
                          </span>
                          {on && <span className="text-[10px] font-bold text-neon">выбран</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {recipient && (
                  <div className="mt-2 rounded-xl border border-neon/25 bg-neon/[0.06] px-3 py-2 text-[11px] text-white/60">
                    Получатель: <span className="font-bold text-neon">@{recipient.nickname || recipient.username}</span>
                  </div>
                )}

                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                  Сообщение <span className="normal-case tracking-normal text-white/20">(необязательно)</span>
                </p>
                <input
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value.slice(0, 120))}
                  placeholder="С днём рождения!"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-neon/40"
                />

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="ghost" full onClick={() => setGiftOpen(false)}>
                    Отмена
                  </Button>
                  <Button variant="primary" full onClick={confirmGift} disabled={!recipient} icon={<StarIcon className="size-3.5" />}>
                    Отправить
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* sell all confirm */}
      <AnimatePresence>
        {confirmAll && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmAll(false)}
            className="fixed inset-0 z-[95] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0d0d11] p-5 text-center"
            >
              <h3 className="text-[16px] font-extrabold tracking-tight">Продать всё?</h3>
              <p className="mt-1 text-[12px] text-white/40">
                {inventory.length} предметов уйдут за{" "}
                <span className="font-bold text-neon">{totalValue.toLocaleString("ru-RU")} ★</span>. Отменить нельзя.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="ghost" full onClick={() => setConfirmAll(false)}>
                  Отмена
                </Button>
                <Button variant="danger" full onClick={doSellAll}>
                  Продать
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}