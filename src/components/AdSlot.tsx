import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/useGame";
import { ADS_ENABLED, AD_SLOTS, type AdSlotId } from "../lib/ads";
import { useOwnerAdFor } from "../lib/ownerAds";
import { OwnerAdCard } from "./OwnerAdCard";

/**
 * Один рекламный блок Adsterra (баннер 300×250 или 728×90).
 *
 * Почему не «вставил div и забыл»:
 *
 * 1. **Выключен по умолчанию.** Пустой слот = ничего не рисуется. Сайт
 *    выглядит обычным, пока нет одобрения Adsterra.
 * 2. **Не показывается владельцу.** В админке баннер только мешает.
 * 3. **`atOptions` глобальна.** Скрипт Adsterra читает `window.atOptions`,
 *    поэтому его надо выставить ДО загрузки `invoke.js`, а поле `key`
 *    делает каждый вызов уникальным — иначе второй блок на странице не
 *    отрисуется.
 * 4. **Пустое место убирается.** Если баннер не загрузился (adblock, сеть
 *    недоступна), через таймаут блок прячется, а не оставляет дыру.
 */

/** How long to wait for the ad iframe before hiding the empty box. */
const FILL_TIMEOUT_MS = 9_000;

export function AdSlot({ id, className = "" }: { id: AdSlotId; className?: string }) {
  const admin = useGame((s) => s.admin);
  const cfg = AD_SLOTS[id];
  /** The owner's own announcement for this slot, if they wrote one. */
  const ownerAdRaw = useOwnerAdFor(id);
  // the «свои объявления» switch hides them everywhere without deleting them
  const ownerAd = admin.adsEnabled ? ownerAdRaw : null;
  const [filled, setFilled] = useState(false);
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  /**
   * Every mount gets its own key: Adsterra serves one creative per key, so a
   * React StrictMode remount (or a second slot of the same size) still draws.
   */
  const key = useRef<string>("");

  // an owner ad owns the slot: loading a network banner underneath it would
  // count an impression nobody sees
  const active = ADS_ENABLED && !!cfg && !admin.unlocked && !ownerAd;

  useEffect(() => {
    if (active && cfg && !key.current) {
      key.current = `${cfg.key}${id === "top" ? "-h" : "-b"}`;
    }
  }, [active, cfg, id]);

  useEffect(() => {
    if (!active || !cfg || !key.current) return;
    const box = host.current;
    if (!box) return;

    setFilled(false);
    setFailed(false);
    box.innerHTML = "";

    // Adsterra's loader is global and reads this object before rendering.
    const w = window as unknown as Record<string, unknown>;
    w.atOptions = {
      key: key.current,
      format: "iframe",
      height: cfg.height,
      width: cfg.width,
      params: { display: "iframe" },
    };

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = `https://${cfg.host}/invoke.js`;
    script.dataset.adSlot = id;
    box.appendChild(script);

    // A served banner drops an <iframe> into the box. Nothing after the
    // timeout means it never filled (adblock / no fill) — hide the hole.
    const timer = window.setTimeout(() => {
      const drawn = !!host.current?.querySelector("iframe");
      setFilled(drawn);
      setFailed(!drawn);
    }, FILL_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [active, cfg, id]);

  if (ownerAd) return <OwnerAdCard ad={ownerAd} className={className} />;
  if (!active || !cfg) return null;
  if (failed && !filled) return null;

  return (
    <div className={`ad-slot ${className}`} aria-label="Реклама">
      <span className="mb-1 block text-center text-[9px] font-bold uppercase tracking-[0.16em] text-white/20">
        реклама
      </span>
      <div
        className="mx-auto w-full overflow-hidden rounded-xl"
        style={{ maxWidth: cfg.width, minHeight: filled ? undefined : Math.round(cfg.height * 0.6) }}
      >
        <div ref={host} />
      </div>
    </div>
  );
}