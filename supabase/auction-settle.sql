-- telegUP · выдача выигранных лотов (этап 2)
--
-- Запускать в Supabase → SQL Editor → New query → Run.
-- Безопасно запускать повторно. Ничего не удаляет.
--
-- Зачем: в базе нет ни `settled_at`, ни `settle_expired_auctions`, поэтому
-- просроченный лот никто не закрывает — победитель остаётся без подарка.
-- Клиент при каждой загрузке маркета вызывает RPC и получает
-- «function not found», то есть лот висит вечно.
--
-- Что делает:
--   1. досоздаёт недостающие поля (source / starts_at / lot_label / settled_at);
--   2. закрывает просроченные лоты: подарок победителю в `deliveries`,
--      звёзды продавцу-игроку (лот дома — сгорают);
--   3. сразу же прогоняет её на уже просроченных лотах.

-- ---------------------------------------------------------------- схема
alter table public.auctions add column if not exists source     text not null default 'player';
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

-- -------------------------------------------------------- закрытие лотов
-- `deliveries` принимает (user_id, gift_id, gift_name, from_name, message):
-- клиент разбирает очередь и кладёт предмет в инвентарь.
create or replace function public.settle_expired_auctions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a        public.auctions;
  n        int := 0;
  delivered int;
begin
  for a in
    select * from public.auctions
     where sold = false
       and cancelled = false
       and ends_at <= now()
     order by ends_at
     limit 200
  loop
    -- без ставок: лот просто уходит с доски, подарок остаётся владельцу
    if a.top_bidder is null or coalesce(a.top_bid, 0) = 0 then
      update public.auctions
         set cancelled = true, settled_at = now()
       where id = a.id;
      n := n + 1;
      continue;
    end if;

    -- предмет победителю — ровно один раз на лот
    if a.item_kind = 'gift' then
      select count(*) into delivered
        from public.deliveries
       where user_id = a.top_bidder
         and gift_id = a.item_id
         and from_name = 'Аукцион'
         and message = 'Победил на аукционе #' || a.id;

      if delivered = 0 then
        insert into public.deliveries (user_id, gift_id, gift_name, from_name, message)
        values (a.top_bidder, a.item_id, a.item_name, 'Аукцион',
                'Победил на аукционе #' || a.id);
      end if;
    end if;

    -- звёзды продавцу-игроку; у лота дома сгорают
    if a.source <> 'house' then
      update public.profiles
         set stars = greatest(0, coalesce(stars, 0) + a.top_bid)
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

-- ------------------------------------------------ прогон по старым лотам
-- Закрывает всё, что уже истекло — включая тот лот, который никто не забрал.
select public.settle_expired_auctions();

-- Проверка: у кого что выиграно и что ждёт выдачи.
select a.id,
       a.item_name,
       a.top_bidder_name,
       a.top_bid,
       a.source,
       a.sold,
       a.cancelled,
       a.ends_at
  from public.auctions a
 order by a.id desc
 limit 20;