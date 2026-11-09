-- telegUP — owner deliveries + recipient sync
-- Run after schema.sql and owner-admin.sql. Safe to re-run.
--
-- Two problems this fixes:
--   1. A mark / badge / star change made by the owner only reached the
--      leaderboard row. The player's own browser re-pushed its stale local
--      profile a few seconds later and wiped the grant again.
--      → every profile row now remembers when the owner last touched it, and
--        the client refuses to overwrite a newer owner change.
--   2. Gifts sent to a player stayed in the `gifts` table forever: nothing
--      ever put them into the recipient's inventory.
--      → owner deliveries are written to `deliveries`, which the player's
--        client drains into its inventory (and re-fetches after a reload).

-- ------------------------------------------------------------------ columns

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

-- bumped only by the owner functions, so a player's own writes can never
-- pretend to be a grant
alter table public.profiles
  add column if not exists owner_synced_at timestamptz;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------- owner write marks
-- The owner functions touch `owner_synced_at`; the client compares it with
-- the value it last saw and only re-pushes its local profile when nothing
-- newer arrived from the owner.

create or replace function public.owner_gate()
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
end;
$$;

-- ------------------------------------------------------------- deliveries
-- Gift payloads created by the owner (or the shop) and drained by the
-- recipient's client. One row = one item that must end up in an inventory.

create table if not exists public.deliveries (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  gift_id    text not null,
  gift_name  text not null,
  from_name  text,
  message    text,
  claimed    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.deliveries enable row level security;

drop policy if exists "players read own deliveries" on public.deliveries;
create policy "players read own deliveries"
  on public.deliveries for select
  using (auth.uid() = user_id);

-- only the recipient may mark a delivery as claimed
drop policy if exists "players claim own deliveries" on public.deliveries;
create policy "players claim own deliveries"
  on public.deliveries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists deliveries_user_idx
  on public.deliveries (user_id, claimed);

-- ---------------------------------------------------------------- profiles
-- Player side: the client may only write its own progression fields. Marks,
-- badges and the premium tier are owner-only, so they are dropped from the
-- payload instead of being silently ignored (which used to look like the
-- grant "vanished" a few seconds later).

create or replace function public.player_push_profile(
  p_username text,
  p_nickname text,
  p_stars bigint,
  p_inventory_value bigint,
  p_items int,
  p_marks text[],
  p_badges text[]
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  synced timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  update public.profiles p
     set username        = coalesce(nullif(p_username, ''), p.username),
         nickname        = coalesce(nullif(p_nickname, ''), p.nickname),
         stars           = greatest(0, coalesce(p_stars, p.stars)),
         inventory_value = greatest(0, coalesce(p_inventory_value, p.inventory_value)),
         items           = greatest(0, coalesce(p_items, p.items)),
         marks           = case when p_marks is null then p.marks else p.marks end,
         badges          = case when p_badges is null then p.badges else p.badges end
   where p.id = auth.uid()
  returning owner_synced_at into synced;

  -- no row yet: create one (registration can land before the first push)
  if not found then
    insert into public.profiles (id, username, nickname, stars, inventory_value, items)
    values (
      auth.uid(),
      coalesce(nullif(p_username, ''), 'user'),
      coalesce(nullif(p_nickname, ''), 'user'),
      greatest(0, coalesce(p_stars, 0)),
      greatest(0, coalesce(p_inventory_value, 0)),
      greatest(0, coalesce(p_items, 0))
    )
    on conflict (id) do nothing;
  end if;

  return synced;
end;
$$;

revoke all on function public.player_push_profile(text, text, bigint, bigint, int, text[], text[]) from anon;
grant execute on function public.player_push_profile(text, text, bigint, bigint, int, text[], text[]) to authenticated;

-- ------------------------------------------------- owner edit: full profile
-- One call for the admin panel's "красота" tab: nickname, bio, accent, plus
-- the number and the extra names.

alter table public.profiles add column if not exists phone_number   text;
alter table public.profiles add column if not exists alt_names      text[] not null default '{}';
alter table public.profiles add column if not exists accent         text;
alter table public.profiles add column if not exists gradient       text;
alter table public.profiles add column if not exists bio            text;

create or replace function public.owner_set_profile(
  target_id uuid,
  p_nickname text default null,
  p_bio text default null,
  p_accent text default null,
  p_gradient text default null,
  p_phone text default null,
  p_alt_names text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();

  update public.profiles p
     set nickname    = coalesce(p_nickname, p.nickname),
         username    = coalesce(upper(p_nickname), p.username),
         bio         = p_bio,
         accent      = p_accent,
         gradient    = p_gradient,
         phone_number = p_phone,
         alt_names   = coalesce(p_alt_names, p.alt_names),
         owner_synced_at = now()
   where p.id = target_id;
end;
$$;

revoke all on function public.owner_set_profile(uuid, text, text, text, text, text, text[]) from anon;
grant execute on function public.owner_set_profile(uuid, text, text, text, text, text, text[]) to authenticated;

-- ------------------------------------------------------- owner edit: gifts
-- Writes to `deliveries` so the recipient's client can pick the item up.

create or replace function public.owner_deliver_gift(
  target_id uuid,
  p_gift_id text,
  p_gift_name text,
  message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();

  insert into public.deliveries (user_id, gift_id, gift_name, from_name, message)
  values (
    target_id,
    p_gift_id,
    p_gift_name,
    (select nickname from public.profiles where id = auth.uid()),
    message
  );
end;
$$;

revoke all on function public.owner_deliver_gift(uuid, text, text, text) from anon;
grant execute on function public.owner_deliver_gift(uuid, text, text, text) to authenticated;

-- Existing owner functions: stamp `owner_synced_at` so the recipient's
-- client knows not to overwrite the change with its stale local copy.

create or replace function public.owner_give_stars(target_id uuid, amount bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_gate();
  update public.profiles p
     set stars = greatest(0, p.stars + amount),
         owner_synced_at = now()
   where p.id = target_id;
end;
$$;

create or replace function public.owner_take_mark(target_id uuid, mark text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_gate();
  update public.profiles p
     set marks = array(select m from unnest(p.marks) m where m <> mark),
         owner_synced_at = now()
   where p.id = target_id;
end;
$$;

create or replace function public.owner_give_badge(target_id uuid, badge text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_gate();
  update public.profiles p
     set badges = array(select distinct unnest(p.badges || badge)),
         owner_synced_at = now()
   where p.id = target_id;
end;
$$;

create or replace function public.owner_take_badge(target_id uuid, badge text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_gate();
  update public.profiles p
     set badges = array(select b from unnest(p.badges) b where b <> badge),
         owner_synced_at = now()
   where p.id = target_id;
end;
$$;

create or replace function public.owner_set_tier(target_id uuid, tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_gate();
  if tier not in ('Free', 'Premium') then
    raise exception 'bad tier';
  end if;

  update public.profiles p
     set tier = owner_set_tier.tier,
         marks = case
           when owner_set_tier.tier = 'Free'
             then array(select m from unnest(p.marks) m where m <> 'premium')
           else p.marks
         end,
         owner_synced_at = now()
   where p.id = target_id;
end;
$$;

-- The owner may hand out a +888 number of any format.
create or replace function public.owner_set_phone(target_id uuid, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_gate();
  update public.profiles
     set phone_number = nullif(p_phone, ''),
         owner_synced_at = now()
   where id = target_id;
end;
$$;

revoke all on function public.owner_set_phone(uuid, text) from anon;
grant execute on function public.owner_set_phone(uuid, text) to authenticated;

-- ---------------------------------------------------------------- auction
-- "No bid for 30 minutes → the lot goes back to its owner."
-- The client also does this locally; this makes it true for everyone.

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
       and created_at <= now() - interval '30 minutes'
    returning id
  )
  select count(*) into n from gone;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.expire_stale_auctions() from anon;
grant execute on function public.expire_stale_auctions() to authenticated;

-- ------------------------------------------------------ verification query
-- After running this file, check that the columns really exist:
--
--   select column_name from information_schema.columns
--    where table_name = 'profiles'
--      and column_name in ('owner_synced_at','phone_number','alt_names','bio');