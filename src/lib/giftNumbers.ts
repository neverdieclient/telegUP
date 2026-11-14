import { supabase, onlineEnabled } from "./supabase";
import { randInt } from "./rng";

/**
 * Номера подарков — как в Телеграме.
 *
 * У каждого улучшенного подарка в Телеграме есть номер внутри своей
 * коллекции: `#354 046`. Номер выдаётся один раз и больше не повторяется —
 * он регистрируется за владельцем, и второй такой же не получит никто.
 *
 * Здесь номер берётся из диапазона 1…10 000 и записывается в «книгу номеров»
 * коллекции (переживает перезагрузку — лежит в сохранении). Если сервер
 * доступен, номер ещё и резервируется в таблице `gift_numbers`: тогда
 * уникальность держится между игроками, а не только внутри одного аккаунта.
 * Без таблицы (SQL из `supabase/gift-numbers.sql` не выполнен) всё работает
 * локально — номер всё равно никогда не повторится у этого аккаунта.
 */

export const GIFT_NUMBER_MAX = 10_000;

/** `#1 234` — как в Телеграме, с пробелом между разрядами. */
export const fmtGiftNumber = (n: number) => `#${Math.round(n).toLocaleString("ru-RU")}`;

/**
 * Свободный номер коллекции.
 *
 * Сначала несколько случайных попыток (обычно первая же свободна), потом —
 * честный проход по свободным. Так «случайно» не превращается в «перебор
 * десяти тысяч чисел» на забитой коллекции.
 */
export function rollGiftNumber(used: readonly number[]): number | null {
  const taken = new Set(used);
  if (taken.size >= GIFT_NUMBER_MAX) return null;
  for (let i = 0; i < 64; i++) {
    const n = randInt(GIFT_NUMBER_MAX) + 1;
    if (!taken.has(n)) return n;
  }
  const free: number[] = [];
  for (let n = 1; n <= GIFT_NUMBER_MAX; n++) if (!taken.has(n)) free.push(n);
  return free.length ? free[randInt(free.length)] : null;
}

/**
 * Зарегистрировать номер на сервере.
 *
 * `true` — номер наш. `false` — уже чей-то (крайне редкий случай: тот же
 * номер только что взял другой игрок). `null` — сервер не ответил или
 * таблицы ещё нет; тогда доверяем локальной книге номеров.
 */
export async function claimGiftNumber(slug: string, number: number): Promise<boolean | null> {
  if (!onlineEnabled || !supabase) return null;
  try {
    const { data, error } = await supabase.rpc("claim_gift_number", {
      p_slug: slug,
      p_number: number,
    });
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}