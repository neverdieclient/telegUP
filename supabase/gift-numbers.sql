-- telegUP · номера улучшенных подарков (#354 046, как в Телеграме)
-- Запускать в Supabase → SQL Editor → New query → Run.
-- Безопасно запускать повторно. Ничего не удаляет.
--
-- Что делает:
--   1. создаёт таблицу `gift_numbers` — по строке на занятый номер;
--   2. даёт игроку функцию `claim_gift_number(slug, number)`: она пытается
--      занять номер за текущим игроком;
--   3. номер уникален в рамках коллекции (`slug`, `number`) — второй такой же
--      не получит никто, даже другой игрок.
--
-- Зачем на сервере: локально номер не повторяется внутри аккаунта, но два
-- разных игрока могли бы получить один и тот же #354 046. С этой таблицей —
-- не могли бы.
--
-- Если скрипт не выполнен, клиент работает как раньше: номер берётся только
-- из локальной книги номеров (см. src/lib/giftNumbers.ts).

-- ---------------------------------------------------------------- схема
create table if not exists public.gift_numbers (
  slug        text        not null,           -- коллекция: slug подарка
  number      int         not null,           -- 1…10 000
  owner_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  gift_name   text,                           -- для админской проверки, необязательно
  claimed_at  timestamptz not null default now(),
  primary key (slug, number)
);

alter table public.gift_numbers enable row level security;

-- свой занятый номер игрок видит, чужой — нет
drop policy if exists gift_numbers_select_own on public.gift_numbers;
create policy gift_numbers_select_own on public.gift_numbers
  for select to authenticated
  using (owner_id = auth.uid());

-- вставка идёт только через функцию ниже: прямой insert мог бы занять номер
-- на чужое имя
revoke insert, update, delete on public.gift_numbers from anon, authenticated;

-- ------------------------------------------------- игрок: занять номер
-- Возвращает true, если номер теперь наш; false — уже занят.
-- Никаких исключений наружу: клиенту достаточно «да/нет».
create or replace function public.claim_gift_number(p_slug text, p_number int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return false;
  end if;
  if p_slug is null or length(btrim(p_slug)) = 0 then
    return false;
  end if;
  if p_number is null or p_number < 1 or p_number > 10000 then
    return false;
  end if;

  -- уже мой — считаем успехом (повторный вызов из синхронизации)
  if exists (
    select 1 from public.gift_numbers
     where slug = p_slug and number = p_number and owner_id = me
  ) then
    return true;
  end if;

  insert into public.gift_numbers (slug, number, owner_id)
  values (p_slug, p_number, me);

  return true;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.claim_gift_number(text, int) from anon;
grant execute on function public.claim_gift_number(text, int) to authenticated;

-- ------------------------------------------------------------ что дальше
-- Проверка: сколько номеров уже занято по коллекциям.
select slug, count(*) as taken, min(number) as min_num, max(number) as max_num
  from public.gift_numbers
 group by slug
 order by taken desc
 limit 30;