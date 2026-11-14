import { useEffect, useState } from "react";
import { IS_DEV_CHANNEL } from "../lib/channel";
import { useOwner } from "../lib/useOwner";
import { getLocalSession, isOwnerEmail } from "../lib/localAuth";

/**
 * Ворота dev-канала.
 *
 * Stable-сборка проходит насквозь — компонент существует только ради
 * второй сборки. В dev-канале сайт открыт исключительно владельцу: сборка
 * ранняя, в ней бывают недоделанные вещи, и посторонним там делать нечего.
 *
 * Постороннего не держим на плашке и не просим пароль: адрес `/dev/`
 * открывается с основного сайта кнопкой в шапке, которая есть только у
 * владельца. Все остальные — включая случайных гостей — едут обратно на
 * основной сайт сразу, как только стало ясно, что это не владелец.
 */
export function ChannelGate({ children }: { children: React.ReactNode }) {
  if (!IS_DEV_CHANNEL) return <>{children}</>;
  return <DevOnly>{children}</DevOnly>;
}

/** Куда возвращать: у dev-сборки base — `/dev/`, у основной — `./` */
function mainSiteUrl(): string | null {
  const base = import.meta.env.BASE_URL || "/";
  // локальная сборка живёт в корне порта — уводить её «на основной сайт»
  // означает увести на саму себя, поэтому в этом случае просто показываем
  // плашку вместо редиректа
  if (!/^\/dev\//i.test(base)) return null;
  const root = base.replace(/dev\/?$/i, "") || "/";
  return new URL(root, window.location.origin).toString();
}

function DevOnly({ children }: { children: React.ReactNode }) {
  const { isOwner, checked } = useOwner();
  // офлайн-режим не подписывается на изменения сессии, поэтому сверяемся
  // с локальной сессией прямо здесь
  const localOwner = isOwnerEmail(getLocalSession()?.email);
  const allowed = isOwner || localOwner;
  const target = mainSiteUrl();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!checked || allowed || !target) return;
    setLeaving(true);
    window.location.replace(target);
  }, [checked, allowed, target]);

  if (!allowed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
          <p className="text-[11.5px] font-semibold text-white/35">
            {leaving || target ? "Открываем основной сайт…" : "Эта сборка открыта только владельцу"}
          </p>
          {!target && (
            <a href="/" className="text-[11px] font-bold text-neon/70 hover:text-neon">
              telegUP →
            </a>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}