-- telegUP · бонус удачи в апгрейдере (x2 / x100)
-- Запускать в Supabase → SQL Editor → New query → Run.
-- Безопасно запускать повторно. Ничего не удаляет.
--
-- Что делает:
--   1. добавляет в `profiles` поле `upgrade_luck` (в процентах: 100 = обычный
--      шанс, 200 = ×2, 10000 = ×100);
--   2. даёт владельцу функцию выдать/забрать бонус любому игроку (или себе);
--   3. публикует прочтение бонуса игроком — без этого клиент не узнает,
--      что ему что-то выдали.
--
-- Почему поле, а не локальный тумблер: бонус выдаётся ДРУГОМУ игроку, значит
-- он должен лежать в базе, иначе тот игрок его никогда не увидит.

-- ---------------------------------------------------------------- схема
alter table public.profiles
  add column if not exists upgrade_luck int not null default 100;

-- мусорные значения (0, отрицательные) не должны отключать апгрейды навсегда
alter table public.profiles drop constraint if exists profiles_upgrade_luck_check;
alter table public.profiles add constraint profiles_upgrade_luck_check
  check (upgrade_luck between 0 and 100000);

-- ------------------------------------------------- владелец: выдать бонус
-- target_id = свою же строку → действует на себя; чужую → на другого игрока.
create or replace function public.owner_set_upgrade_luck(target_id uuid, p_luck int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();
  update public.profiles
     set upgrade_luck = greatest(0, least(100000, coalesce(p_luck, 100)))
   where id = target_id;
end;
$$;

revoke all on function public.owner_set_upgrade_luck(uuid, int) from anon;
grant execute on function public.owner_set_upgrade_luck(uuid, int) to authenticated;

-- ------------------------------------------------- игрок: прочитать бонус
-- Клиент зовёт это при синхронизации профиля, чтобы применять бонус на
-- своём устройстве. Возвращает только своё значение.
create or replace function public.player_get_upgrade_luck()
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select upgrade_luck from public.profiles where id = auth.uid()),
    100
  );
$$;

revoke all on function public.player_get_upgrade_luck() from anon;
grant execute on function public.player_get_upgrade_luck() to authenticated;

-- Проверка: кто сейчас с каким бонусом.
select id, nickname, upgrade_luck
  from public.profiles
 where upgrade_luck <> 100
 order by upgrade_luck desc
 limit 50;