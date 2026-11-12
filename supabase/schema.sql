-- telegUP · Supabase schema
-- Run in Supabase → SQL Editor → New query → Run. Safe to re-run.

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text not null,
  nickname        text not null,
  tier            text not null default 'Free',
  stars           bigint not null default 0,
  inventory_value bigint not null default 0,
  items           int not null default 0,
  badges          text[] not null default '{}',
  marks           text[] not null default '{}',
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- public leaderboard / profiles are readable by everyone
drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Players must never grant themselves verification marks.
create or replace function public.guard_marks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and old.marks is distinct from new.marks then
    new.marks = old.marks;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_marks on public.profiles;
create trigger profiles_guard_marks
  before update on public.profiles
  for each row execute function public.guard_marks();

-- Only the project owner account can hand out marks.
-- The check uses the email stored in auth.users (not the editable nickname),
-- and the caller must also carry the 'owner' mark.
create or replace function public.grant_mark(target_id uuid, mark text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = auth.uid()
      and lower(u.email) = 'oleg123456789123456@gmail.com'
      and 'owner' = any(p.marks)
  ) then
    raise exception 'not allowed';
  end if;

  update public.profiles
     set marks = array(select distinct unnest(marks || mark)),
         owner_synced_at = now()
   where id = target_id;
end;
$$;

revoke all on function public.grant_mark(uuid, text) from anon;
grant execute on function public.grant_mark(uuid, text) to authenticated;

create index if not exists profiles_inventory_value_idx
  on public.profiles (inventory_value desc);

create index if not exists profiles_username_idx
  on public.profiles (lower(username));

-- ------------------------------------------------------------------ gifts
-- Gifts sent between players. The sender's client removes the item from its
-- own inventory; this table is the durable record plus the recipient inbox.
create table if not exists public.gifts (
  id          bigserial primary key,
  from_id     uuid not null references auth.users(id) on delete cascade,
  from_name   text not null,
  to_id       uuid references auth.users(id) on delete set null,
  to_name     text not null,
  gift_id     text not null,
  gift_name   text not null,
  gift_stars  int not null default 0,
  message     text,
  claimed     boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.gifts enable row level security;

-- a player sees the gifts they sent and the gifts sent to them
drop policy if exists "players read own gifts" on public.gifts;
create policy "players read own gifts"
  on public.gifts for select
  using (auth.uid() = from_id or auth.uid() = to_id);

drop policy if exists "players send gifts" on public.gifts;
create policy "players send gifts"
  on public.gifts for insert
  with check (auth.uid() = from_id);

-- the recipient marks their own gift as claimed
drop policy if exists "receivers claim gifts" on public.gifts;
create policy "receivers claim gifts"
  on public.gifts for update
  using (auth.uid() = to_id)
  with check (auth.uid() = to_id);

create index if not exists gifts_to_id_idx on public.gifts (to_id, created_at desc);
create index if not exists gifts_from_id_idx on public.gifts (from_id, created_at desc);

-- ----------------------------------------------------------------- auctions
-- Stars-only player-to-player auctions. An item listed by the seller is
-- escrowed for the duration of the auction (it is gone from their inventory);
-- the winning bidder pays in ★, the seller receives them on settlement.
create table if not exists public.auctions (
  id            bigserial primary key,
  seller_id     uuid not null references auth.users(id) on delete cascade,
  seller_name   text not null,
  item_id       text not null,
  item_name     text not null,
  item_kind     text not null default 'gift',   -- gift | username | number
  item_value    bigint not null default 0,      -- stars value of the item
  min_bid       bigint not null default 1,      -- starting price in ★
  buyout        bigint,                         -- optional instant-buy in ★
  top_bid       bigint not null default 0,
  top_bidder    uuid references auth.users(id) on delete set null,
  top_bidder_name text,
  sold          boolean not null default false,
  cancelled     boolean not null default false,
  ends_at       timestamptz not null,
  created_at    timestamptz not null default now()
);

alter table public.auctions enable row level security;

drop policy if exists "auctions readable" on public.auctions;
create policy "auctions readable"
  on public.auctions for select
  using (true);

drop policy if exists "own auctions insert" on public.auctions;
create policy "own auctions insert"
  on public.auctions for insert
  with check (auth.uid() = seller_id);

-- sellers may cancel their own open lots; winners may settle
drop policy if exists "own auctions update" on public.auctions;
create policy "own auctions update"
  on public.auctions for update
  using (auth.uid() = seller_id or auth.uid() = top_bidder)
  with check (auth.uid() = seller_id or auth.uid() = top_bidder);

-- Bid history (small, used for the lot activity feed).
create table if not exists public.auction_bids (
  id          bigserial primary key,
  auction_id  bigint not null references public.auctions(id) on delete cascade,
  bidder_id   uuid not null references auth.users(id) on delete cascade,
  bidder_name text not null,
  amount      bigint not null,
  created_at  timestamptz not null default now()
);

alter table public.auction_bids enable row level security;

drop policy if exists "bids readable" on public.auction_bids;
create policy "bids readable"
  on public.auction_bids for select
  using (true);

drop policy if exists "own bids insert" on public.auction_bids;
create policy "own bids insert"
  on public.auction_bids for insert
  with check (auth.uid() = bidder_id);

create index if not exists auctions_open_idx
  on public.auctions (ends_at)
  where sold = false and cancelled = false;

create index if not exists auctions_seller_idx
  on public.auctions (seller_id, created_at desc);

create index if not exists auction_bids_lot_idx
  on public.auction_bids (auction_id, created_at desc);

-- Place a bid atomically: the auction must be open, the bid must beat the
-- current top and the caller may not bid on their own lot.
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
  if a.ends_at <= now() then raise exception 'lot finished'; end if;
  if a.seller_id = auth.uid() then raise exception 'cannot bid on your own lot'; end if;
  if amount < a.min_bid or amount <= a.top_bid then raise exception 'bid too low'; end if;
  if a.buyout is not null and amount > a.buyout then raise exception 'above buyout'; end if;

  select nickname into name from public.profiles where id = auth.uid();

  -- `ends_at` is deliberately NOT touched: a bid never moves the deadline.
  -- The lot closes exactly when the seller scheduled it.
  update public.auctions
     set top_bid = amount,
         top_bidder = auth.uid(),
         top_bidder_name = coalesce(name, 'игрок')
   where id = lot;

  insert into public.auction_bids (auction_id, bidder_id, bidder_name, amount)
  values (lot, auth.uid(), coalesce(name, 'игрок'), amount);
end;
$$;

revoke all on function public.place_bid(bigint, bigint) from anon;
grant execute on function public.place_bid(bigint, bigint) to authenticated;

-- Bootstrap: after registering the owner account in the app, run this once
-- to give it the owner mark (the panel stays closed without it):
--
--   update public.profiles
--      set marks = array['owner','premium','basic','crown']
--    where id = (select id from auth.users
--                 where lower(email) = 'oleg123456789123456@gmail.com');
-- ------------------------------------------------------------------ chat
-- Global chat: everyone signed in can post and read. Authors can delete
-- their own messages; the owner can delete anything.
create table if not exists public.chat_messages (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nickname    text not null,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

drop policy if exists "chat readable" on public.chat_messages;
create policy "chat readable"
  on public.chat_messages for select
  using (true);

drop policy if exists "chat post own" on public.chat_messages;
create policy "chat post own"
  on public.chat_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "chat delete own" on public.chat_messages;
create policy "chat delete own"
  on public.chat_messages for delete
  using (auth.uid() = user_id);

create index if not exists chat_messages_created_idx
  on public.chat_messages (created_at desc);
