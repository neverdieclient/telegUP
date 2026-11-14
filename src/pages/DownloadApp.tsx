import { motion } from "framer-motion";
import { SPRING_SOFT } from "../lib/motion";

export default function DownloadApp() {
  return (
    <div className="mx-auto max-w-xl space-y-4 pb-24">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SOFT}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-neon/10 blur-3xl" />
        <div className="relative">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-neon/30 bg-neon/10 text-neon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-7"
              aria-hidden="true"
            >
              <path d="M12 3v10m0 0 4-4m-4 4-4-4" />
              <rect x="4" y="14" width="16" height="7" rx="2" />
            </svg>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neon/80">
            Приложение
          </p>
          <h1 className="mt-1 font-display text-2xl font-black tracking-tight">
            Скачать telegUP для Android
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/55">
            Лёгкий APK: приложение открывает сайт, а картинки подарков докачиваются при
            первом входе (с прогрессом и кнопкой «Пропустить» — загрузка продолжится в фоне).
          </p>

          <a
            href="/telegUP.apk"
            download="telegUP.apk"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-neon px-5 py-3 text-[13px] font-extrabold text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4.5"
              aria-hidden="true"
            >
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
            </svg>
            Скачать APK
          </a>
          <p className="mt-3 text-[11px] text-white/30">Файл: telegUP.apk · Android</p>
        </div>
      </motion.section>

      <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-[12px] leading-relaxed text-white/45">
        <p className="font-bold text-white/60">Если установка заблокирована</p>
        <p className="mt-1">
          Разреши установку из этого источника в настройках Android (обычно: «Установить
          неизвестные приложения» для браузера/файлового менеджера).
        </p>
      </section>
    </div>
  );
}