import { supabase } from "../lib/supabase";
import { Button } from "./ui/Button";

/**
 * Full-screen notice shown when the server reports the account / IP / device
 * is banned. Purely informational — the ban is enforced in the database, so
 * hiding this screen does not restore any access.
 */
export function BannedScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#08080b] px-5">
      <div className="w-full max-w-md rounded-3xl border border-mythic/30 bg-white/[0.03] p-8 text-center shadow-[0_30px_120px_-40px_rgba(255,60,90,0.5)]">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-mythic/40 bg-mythic/10">
          <span className="text-3xl">⛔</span>
        </div>

        <h1 className="mt-6 text-xl font-extrabold tracking-tight text-white">
          Блокировка аккаунта по IP
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-white/50">
          Доступ к telegUP заблокирован. Это устройство / IP-адрес были отмечены
          как нарушающие правила проекта.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-white/35">
          Если вы считаете, что это ошибка — свяжитесь с администрацией и укажите
          свой ник и примерное время входа.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="outline"
            full
            onClick={() => {
              void supabase?.auth.signOut();
              location.hash = "#/";
            }}
          >
            Выйти из аккаунта
          </Button>
        </div>

        <p className="mt-5 text-[10px] leading-relaxed text-white/20">
          Блокировка действует на стороне сервера и не снимается очисткой данных
          браузера. Это игра: все подарки вымышлены, реальный вывод средств
          невозможен.
        </p>
      </div>
    </div>
  );
}
