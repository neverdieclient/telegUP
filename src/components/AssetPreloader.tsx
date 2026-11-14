import { useEffect, useState } from "react";

/**
 * Лёгкий APK грузит сайт с сервера, а тяжёлые ассеты подарков (картинки)
 * докачиваются при первом входе — так сам .apk остаётся маленьким.
 *
 * Показывает экран загрузки с прогрессом и складывает файлы в HTTP-кэш
 * браузера/WebView. «Пропустить» убирает экран, но докачка продолжается в фоне.
 * После полного завершения больше не показывается.
 */
const DONE_KEY = "telegup:assets-preloaded:v1";
const CONCURRENCY = 48;

export function AssetPreloader() {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading"; done: number; total: number }
    | { phase: "background"; done: number; total: number }
    | { phase: "hidden" }
  >(() => {
    try {
      return localStorage.getItem(DONE_KEY) ? { phase: "hidden" } : { phase: "idle" };
    } catch {
      return { phase: "idle" };
    }
  });

  useEffect(() => {
    if (state.phase === "hidden") return;
    let active = true;

    const markDone = () => {
      try {
        localStorage.setItem(DONE_KEY, "1");
      } catch {
        /* ignore */
      }
    };

    (async () => {
      try {
        const res = await fetch("/preload-assets.json", { cache: "no-store" });
        if (!res.ok) {
          markDone();
          if (active) setState({ phase: "hidden" });
          return;
        }
        const list = (await res.json()) as string[];
        const total = list.length;
        if (!total) {
          markDone();
          if (active) setState({ phase: "hidden" });
          return;
        }
        if (active) setState({ phase: "loading", done: 0, total });

        let done = 0;
        let index = 0;
        const bump = () => {
          done += 1;
          if (!active) return;
          setState((s) =>
            s.phase === "loading" || s.phase === "background" ? { ...s, done } : s,
          );
        };

        const worker = async () => {
          while (index < list.length) {
            const i = index++;
            const url = list[i];
            try {
              // кладём в HTTP-кэш WebView/браузера (быстро, в фоне)
              await fetch(url, { cache: "force-cache", mode: "no-cors" });
            } catch {
              /* пропускаем битый/недоступный файл — не валим загрузку */
            }
            bump();
          }
        };

        const workers = Array.from(
          { length: Math.min(CONCURRENCY, list.length) },
          () => worker(),
        );
        await Promise.all(workers);
      } catch {
        /* сеть недоступна — не блокируем вход */
      }
      markDone();
      if (active) setState({ phase: "hidden" });
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.phase === "hidden" || state.phase === "idle") return null;

  const { done, total } = state;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const left = Math.max(0, total - done);

  if (state.phase === "background") {
    return (
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[500] w-[min(92vw,360px)] -translate-x-1/2">
        <div className="rounded-2xl border border-white/10 bg-[#121218]/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-white/70">
            <span>Докачка подарков…</span>
            <span className="tabular-nums text-white/45">{pct}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-neon transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10.5px] tabular-nums text-white/35">
            осталось {left.toLocaleString("ru-RU")} из {total.toLocaleString("ru-RU")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-[#0a0a0a] p-6 text-white">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-xl font-black tracking-tight">
          teleg<span className="text-neon">UP</span>
        </h1>
        <p className="mt-2 text-[13px] text-white/60">Загрузка подарков…</p>

        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-neon transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[12px] tabular-nums text-white/40">
          {done.toLocaleString("ru-RU")} / {total.toLocaleString("ru-RU")} · {pct}%
        </p>
        <p className="mt-1 text-[11px] text-white/25">
          Первый запуск — докачиваем картинки подарков
        </p>

        <button
          type="button"
          onClick={() => setState((s) => (s.phase === "loading" ? { ...s, phase: "background" } : s))}
          className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-bold text-white/60 hover:bg-white/10 hover:text-white"
        >
          Пропустить
        </button>
        <p className="mt-2 text-[10px] text-white/20">Докачка продолжится в фоне</p>
      </div>
    </div>
  );
}
