-- telegUP · кошелёк TON и срок Premium в облаке
-- Запускать в Supabase → SQL Editor → New query → Run. Безопасно повторять.
--
-- Зачем это нужно
--   1. У аккаунта появилась вторая валюта — TON. Без поля в базе она жила бы
--      только в браузере: зашёл с телефона — кошелёк «пропал», а выданный
--      владельцем TON игрок никогда бы не увидел.
--   2. Premium теперь датирован (`premiumUntil`). Дату тоже надо хранить на
--      сервере, иначе на новом устройстве подписка выглядела бы вечной.
--
-- Что создаётся
--   • колонки `ton` и `premium_until` в `profiles`;
--   • `owner_give_ton(target_id, amount)` — выдача/списание TON владельцем;
--   • `player_push_wallet(p_ton, p_premium_until)` — игрок сохраняет свой
--     кошелёк (только свой: id берётся из auth.uid());
--   • `player_get_wallet()` — игрок читает свой кошелёк;
--   • обновлённый `player_pull_profile()` — теперь отдаёт и кошелёк.

-- ---------------------------------------------------------------- схема
alter table public.profiles
  add column if not exists ton numeric(20, 8) not null default 0;

alter table public.profiles
  add column if not exists premium_until timestamptz;

-- отрицательного кошелька не бывает
alter table public.profiles drop constraint if exists profiles_ton_check;
alter table public.profiles add constraint profiles_ton_check check (ton >= 0);

-- ------------------------------------------------- владелец: выдать TON
-- target_id = своя строка → себе; чужая → другому игроку.
-- Списание — отрицательной суммой, поэтому итог прижимается к нулю.
create or replace function public.owner_give_ton(target_id uuid, amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  left_over numeric;
begin
  perform public.owner_gate();

  update public.profiles
     set ton = greatest(0, round(ton + coalesce(amount, 0), 8))
   where profiles.id = target_id
  returning ton into left_over;

  return coalesce(left_over, 0);
end;
$$;

revoke all on function public.owner_give_ton(uuid, numeric) from anon;
grant execute on function public.owner_give_ton(uuid, numeric) to authenticated;

-- ------------------------------------------------- игрок: сохранить кошелёк
-- Владелец мог выдать TON только что, поэтому берём МАКСИМУМ из присланного и
-- сохранённого: обычная игра не должна затирать подарок владельца, а списание
-- делается отдельной RPC (`owner_give_ton` с минусом).
create or replace function public.player_push_wallet(
  p_ton numeric default null,
  p_premium_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  out jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  if public.is_banned() then
    raise exception 'banned';
  end if;

  update public.profiles
     set ton = greatest(ton, round(coalesce(p_ton, ton), 8)),
         premium_until = greatest(premium_until, p_premium_until)
   where id = auth.uid();

  select jsonb_build_object('ton', ton, 'premium_until', premium_until)
    into out
    from public.profiles
   where id = auth.uid();

  return coalesce(out, '{}'::jsonb);
end;
$$;

revoke all on function public.player_push_wallet(numeric, timestamptz) from anon;
grant execute on function public.player_push_wallet(numeric, timestamptz) to authenticated;

-- ------------------------------------------------- игрок: прочитать кошелёк
create or replace function public.player_get_wallet()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('ton', ton, 'premium_until', premium_until)
       from public.profiles where id = auth.uid()),
    '{}'::jsonb
  );
$$;

revoke all on function public.player_get_wallet() from anon;
grant execute on function public.player_get_wallet() to authenticated;

-- ------------------------------------------ полный профиль: добавить кошелёк
create or replace function public.player_pull_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  out jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select jsonb_build_object(
           'stars',           p.stars,
           'ton',             p.ton,
           'premium_until',   p.premium_until,
           'inventory',       p.inventory,
           'inventory_value', p.inventory_value,
           'items',           p.items,
           'last_free_case',  p.last_free_case,
           'last_daily',      p.last_daily,
           'joined_at',       p.joined_at,
           'save_rev',        p.save_rev,
           'nickname',        p.nickname,
           'tier',            p.tier,
           'marks',           p.marks,
           'badges',          p.badges,
           'phone_number',    p.phone_number,
           'alt_names',       p.alt_names,
           'bio',             p.bio,
           'accent',          p.accent,
           'gradient',        p.gradient,
           'owner_synced_at', p.owner_synced_at
         )
    into out
    from public.profiles p
   where p.id = auth.uid();

  return coalesce(out, 'null'::jsonb);
end;
$$;

revoke all on function public.player_pull_profile() from anon;
grant execute on function public.player_pull_profile() to authenticated;

-- Проверка: у кого есть TON и у кого живой Premium.
select id, nickname, ton, premium_until
  from public.profiles
 where ton > 0 or premium_until is not null
 order by ton desc
 limit 50;