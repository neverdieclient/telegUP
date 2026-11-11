-- telegUP · админский аукцион (лоты дома + предстоящие аукционы)
-- Run in Supabase → SQL Editor → New query → Run. Безопасно запускать повторно.
--
-- Что делает:
--  1. добавляет в `auctions` поля для лотов, которые выставляет владелец;
--  2. даёт владельцу функции создания / снятия лотов (по образцу owner_gate);
--  3. помечает предстоящие аукционы: лот виден всем, но закрыт до `starts_at`
--     — на подарке висит плашка «скоро», ставки и выкуп недоступны;
--  4. учит `place_bid` и `expire_stale_auctions` уважать `starts_at`.

-- ---------------------------------------------------------------- схема
-- 'player' — обычный лот игрока (как было), 'house' — лот владельца.
alter table public.auctions add column if not exists source   text not null default 'player';
alter table public.auctions add column if not exists starts_at timestamptz;
alter table public.auctions add column if not exists lot_label text;

alter table public.auctions drop constraint if exists auctions_source_check;
alter table public.auctions add constraint auctions_source_check
  check (source in ('player', 'house'));

create index if not exists auctions_upcoming_idx
  on public.auctions (starts_at)
  where sold = false and cancelled = false;

-- --------------------------------------------------------------- владелец
-- Запасной аккаунт «дома» для FK seller_id → auth.users: настоящая сессия
-- владельца никогда не должна терять лот при повторной регистрации.
create or replace function public.owner_auction_seller()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  -- 1. постоянный «дом»: живёт, даже если аккаунт владельца перерегистрируют
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000001') then
    insert into public.profiles (id, username, nickname)
    values ('00000000-0000-0000-0000-000000000001', 'owner', 'Дом')
    on conflict (id) do nothing;
    return '00000000-0000-0000-0000-000000000001'::uuid;
  end if;

  -- 2. иначе — сам владелец
  select id into uid
    from auth.users
   where lower(email) = 'oleg123456789123456@gmail.com'
   limit 1;

  if uid is null then
    raise exception 'owner account not found';
  end if;

  insert into public.profiles (id, username, nickname)
  values (uid, 'owner', 'Дом')
  on conflict (id) do nothing;

  return uid;
end;
$$;

revoke all on function public.owner_auction_seller() from anon;
grant execute on function public.owner_auction_seller() to authenticated;

-- Выставить лот от лица дома.
--   p_minutes     — сколько лот живёт после ОТКРЫТИЯ (после первой ставки он
--                   всё равно продлевается на 30 минут, как у игроков);
--   p_start_in    — через сколько минут лот откроется (0 = сразу).
-- Предстоящий лот (p_start_in > 0) считается «скоро»: ставки запрещены,
-- на карточке висит плашка, купить нельзя.
create or replace function public.owner_create_auction(
  p_item_id   text,
  p_item_name text,
  p_item_kind text,
  p_item_value bigint,
  p_min_bid   bigint,
  p_buyout    bigint,
  p_minutes   int,
  p_start_in  int default 0,
  p_label     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  seller uuid;
  opens  timestamptz;
  lot_id bigint;
begin
  perform public.owner_gate();

  if coalesce(p_item_id, '') = '' then
    raise exception 'no item';
  end if;
  if p_minutes is null or p_minutes < 1 then
    raise exception 'duration must be at least 1 minute';
  end if;
  if coalesce(p_min_bid, 0) < 1 then
    raise exception 'starting price must be at least 1';
  end if;
  if p_buyout is not null and p_buyout > 0 and p_buyout <= p_min_bid then
    raise exception 'buyout must be higher than the starting price';
  end if;

  seller := public.owner_auction_seller();
  opens  := now() + make_interval(mins => greatest(0, coalesce(p_start_in, 0)));

  insert into public.auctions (
    seller_id, seller_name, item_id, item_name, item_kind, item_value,
    min_bid, buyout, source, starts_at, lot_label, ends_at
  )
  values (
    seller, 'Дом', p_item_id, coalesce(nullif(p_item_name, ''), p_item_id),
    coalesce(nullif(p_item_kind, ''), 'gift'), greatest(0, coalesce(p_item_value, 0)),
    p_min_bid,
    case when p_buyout is null or p_buyout <= 0 then null else p_buyout end,
    'house',
    case when greatest(0, coalesce(p_start_in, 0)) = 0 then null else opens end,
    nullif(p_label, ''),
    opens + make_interval(mins => p_minutes)
  )
  returning id into lot_id;

  return lot_id;
end;
$$;

revoke all on function public.owner_create_auction(text, text, text, bigint, bigint, bigint, int, int, text) from anon;
grant execute on function public.owner_create_auction(text, text, text, bigint, bigint, bigint, int, int, text) to authenticated;

-- Снять лот (отмена; игроки, если были ставки, ничего не получают — лот
-- просто исчезает из списка).
create or replace function public.owner_cancel_auction(p_lot bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();

  update public.auctions
     set cancelled = true
   where id = p_lot
     and sold = false;
end;
$$;

revoke all on function public.owner_cancel_auction(bigint) from anon;
grant execute on function public.owner_cancel_auction(bigint) to authenticated;

-- Пересоздать лот: новые цена / выкуп / время. Старый снимается целиком.
create or replace function public.owner_update_auction(
  p_lot       bigint,
  p_min_bid   bigint,
  p_buyout    bigint,
  p_minutes   int,
  p_start_in  int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  opens timestamptz;
begin
  perform public.owner_gate();

  select * into a from public.auctions where id = p_lot for update;
  if a is null then raise exception 'lot not found'; end if;
  if a.sold or a.cancelled then raise exception 'lot closed'; end if;

  opens := case
    when p_start_in is null then coalesce(a.starts_at, now())
    else now() + make_interval(mins => greatest(0, p_start_in))
  end;

  update public.auctions
     set min_bid   = coalesce(p_min_bid, a.min_bid),
         buyout    = case when p_buyout is null or p_buyout <= 0 then null else p_buyout end,
         starts_at = case when p_start_in is null then a.starts_at else opens end,
         ends_at   = opens + make_interval(mins => greatest(1, coalesce(p_minutes, 60)))
   where id = p_lot;
end;
$$;

revoke all on function public.owner_update_auction(bigint, bigint, bigint, int, int) from anon;
grant execute on function public.owner_update_auction(bigint, bigint, bigint, int, int) to authenticated;

-- --------------------------------------------------------- ставки и сроки
-- То же, что было, плюс: пока лот не открылся — ставить нельзя.
create or replace function public.place_bid(lot bigint, amount bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  name text;
begin
  select * into a from public.auctions where id = lot for update;
  if a is null then raise exception 'lot not found'; end if;
  if a.sold or a.cancelled then raise exception 'lot closed'; end if;
  if a.starts_at is not null and a.starts_at > now() then raise exception 'lot not started'; end if;
  if a.ends_at <= now() then raise exception 'lot finished'; end if;
  if a.seller_id = auth.uid() then raise exception 'cannot bid on your own lot'; end if;
  if amount < a.min_bid or amount <= a.top_bid then raise exception 'bid too low'; end if;
  if a.buyout is not null and amount > a.buyout then raise exception 'above buyout'; end if;

  select nickname into name from public.profiles where id = auth.uid();

  -- every bid (re)starts a 30-minute window: if nobody outbids within it,
  -- the item belongs to the bidder
  update public.auctions
     set top_bid = amount,
         top_bidder = auth.uid(),
         top_bidder_name = coalesce(name, 'игрок'),
         ends_at = now() + interval '30 minutes'
   where id = lot;

  insert into public.auction_bids (auction_id, bidder_id, bidder_name, amount)
  values (lot, auth.uid(), coalesce(name, 'игрок'), amount);
end;
$$;

revoke all on function public.place_bid(bigint, bigint) from anon;
grant execute on function public.place_bid(bigint, bigint) to authenticated;

-- Предстоящие лоты не должны истекать «без ставок», пока не откроются.
create or replace function public.expire_stale_auctions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with gone as (
    update public.auctions
       set cancelled = true
     where sold = false
       and cancelled = false
       and top_bid = 0
       and (starts_at is null or starts_at <= now())
       and created_at <= now() - interval '30 minutes'
    returning id
  )
  select count(*) into n from gone;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.expire_stale_auctions() from anon;
grant execute on function public.expire_stale_auctions() to authenticated;