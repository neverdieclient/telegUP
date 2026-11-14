import { useEffect, useState } from "react";

/**
 * Лёгкий APK грузит сайт с сервера, а тяжёлые ассеты подарков (картинки)
 * докачиваются при первом входе — так сам .apk остаётся маленьким.
 *
 * Показывает экран загрузки с прогрессом и складывает файлы в HTTP-кэш
 * браузера/WebView. После завершения (или пропуска) больше не показывается.
 */
const DONE_KEY = "telegup:assets-preloaded:v1";
const CONCURRENCY = 32;

export function AssetPreloader() {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading"; done: number; total: number }
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
    let cancelled = false;

    const finish = () => {
      try {
        localStorage.setItem(DONE_KEY, "1");
      } catch {
        /* ignore */
      }
      if (!cancelled) setState({ phase: "hidden" });
    };

    (async () => {
      try {
        const res = await fetch("/preload-assets.json", { cache: "no-store" });
        if (!res.ok) {
          finish();
          return;
        }
        const list = (await res.json()) as string[];
        const total = list.length;
        if (!total) {
          finish();
          return;
        }
        if (!cancelled) setState({ phase: "loading", done: 0, total });

        let done = 0;
        let index = 0;
        const bump = () => {
          done += 1;
          if (!cancelled) setState({ phase: "loading", done, total });
        };

        const worker = async () => {
          while (index < list.length) {
            const i = index++;
            const url = list[i];
            try {
              // кладём в HTTP-кэш WebView/браузера
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
      finish();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.phase === "hidden" || state.phase === "idle") return null;

  const { done, total } = state;
  const pct = total ? Math.round((done / total) * 100) : 0;

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
          onClick={() => {
            try {
              localStorage.setItem(DONE_KEY, "1");
            } catch {
              /* ignore */
            }
            setState({ phase: "hidden" });
          }}
          className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-bold text-white/60 hover:bg-white/10 hover:text-white"
        >
          Пропустить
        </button>
      </div>
    </div>
  );
}
