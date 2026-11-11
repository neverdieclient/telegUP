-- telegUP · админский аукцион (лоты дома + предстоящие аукционы)
-- Run in Supabase → SQL Editor → New query → Run. Безопасно запускать повторно.
--
-- Что делает:
--  1. добавляет в `auctions` поля для лотов, которые выставляет владелец;
--  2. дом лотов — отдельный источник: ставки на лот дома разрешены всем,
--     включая владельца (раньше лот записывался на владельца и отвечал
--     «cannot bid on your own lot»);
--  3. предстоящие аукционы: лот виден всем, но закрыт до `starts_at`;
--  4. закрытие лотов: просроченный лот помечается `sold`, победитель получает
--     подарок и забирает звёзды, проигравший — возврат. Лот исчезает с доски.

-- ---------------------------------------------------------------- схема
-- 'player' — обычный лот игрока (как было), 'house' — лот владельца.
alter table public.auctions add column if not exists source    text not null default 'player';
alter table public.auctions add column if not exists starts_at  timestamptz;
alter table public.auctions add column if not exists lot_label  text;
alter table public.auctions add column if not exists settled_at timestamptz;

alter table public.auctions drop constraint if exists auctions_source_check;
alter table public.auctions add constraint auctions_source_check
  check (source in ('player', 'house'));

create index if not exists auctions_upcoming_idx
  on public.auctions (starts_at)
  where sold = false and cancelled = false;

create index if not exists auctions_open_end_idx
  on public.auctions (ends_at)
  where sold = false and cancelled = false;

-- --------------------------------------------------------------- владелец
-- Запасной аккаунт «дома» для FK seller_id → auth.users: нужен только чтобы
-- столбец не был пустым. Для лотов дома `seller_id` не сравнивается с
-- покупателем, поэтому ставить на них может любой.
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
  p_item_id    text,
  p_item_name  text,
  p_item_kind  text,
  p_item_value bigint,
  p_min_bid    bigint,
  p_buyout     bigint,
  p_minutes    int,
  p_start_in   int default 0,
  p_label      text default null
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

-- Снять лот: он пропадает с доски, ставки игрокам возвращаются через settle.
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

-- Переставить цену / выкуп / время у открытого лота.
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
-- То же, что было, плюс:
--   * на лот дома может ставить любой, даже владелец;
--   * пока лот не открылся — ставить нельзя.
create or replace function public.place_bid(lot bigint, amount bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  name text;
  already boolean;
begin
  select * into a from public.auctions where id = lot for update;
  if a is null then raise exception 'lot not found'; end if;
  if a.sold or a.cancelled then raise exception 'lot closed'; end if;
  if a.starts_at is not null and a.starts_at > now() then raise exception 'lot not started'; end if;
  if a.ends_at <= now() then raise exception 'lot finished'; end if;
  if a.source <> 'house' and a.seller_id = auth.uid() then
    raise exception 'cannot bid on your own lot';
  end if;
  if amount < a.min_bid or amount <= a.top_bid then raise exception 'bid too low'; end if;
  if a.buyout is not null and amount > a.buyout then raise exception 'above buyout'; end if;

  select nickname into name from public.profiles where id = auth.uid();

  -- прежний лидер получает свои звёзды назад, как только его перебили
  already := a.top_bidder is not null and a.top_bidder <> auth.uid();
  if already then
    update public.profiles
       set stars = greatest(0, stars + a.top_bid)
     where id = a.top_bidder;
  end if;

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

-- Просроченный лот с победителем → подарок победителю, звёзды уходят
-- продавцу (игроку) или сгорают (лот дома). Без ставок — просто отменяется.
create or replace function public.settle_expired_auctions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions;
  n int := 0;
begin
  for a in
    select * from public.auctions
     where sold = false
       and cancelled = false
       and ends_at <= now()
     order by ends_at
     limit 200
  loop
    if a.top_bidder is null or a.top_bid = 0 then
      -- без ставок: предстоящие не трогаем, старые лоты уходят с доски
      if a.starts_at is null or a.starts_at <= now() then
        update public.auctions
           set cancelled = true, settled_at = now()
         where id = a.id;
        n := n + 1;
      end if;
      continue;
    end if;

    -- предмет победителю
    if a.item_kind = 'gift' then
      insert into public.deliveries (user_id, gift_id, gift_name, from_name, message)
      values (a.top_bidder, a.item_id, a.item_name, 'Аукцион', 'Победил на аукционе');
    end if;

    -- звёзды продавцу (лоты дома — сгорают)
    if a.source <> 'house' then
      update public.profiles
         set stars = greatest(0, stars + a.top_bid),
             owner_synced_at = now()
       where id = a.seller_id;
    end if;

    update public.auctions
       set sold = true, settled_at = now()
     where id = a.id;
    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.settle_expired_auctions() from anon;
grant execute on function public.settle_expired_auctions() to authenticated;

-- «Лот без ставок вернётся владельцу» — предстоящие лоты не должны истекать,
-- пока не откроются.
create or replace function public.expire_stale_auctions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform public.settle_expired_auctions();

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