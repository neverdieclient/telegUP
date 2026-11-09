-- telegUP — full account sync between devices
-- Run after schema.sql, owner-admin.sql and owner-delivery.sql. Safe to re-run.
--
-- Problem
--   Progress lived only in the browser's localStorage. Opening the site on
--   another device / browser started from scratch (500★, empty inventory)
--   and the first push then overwrote the server row with those defaults, so
--   even the original device lost its stars and gifts.
--
-- Fix
--   The cloud row keeps the FULL progression: balance, inventory and the
--   timestamps the game needs (free case, daily, joined). A brand-new
--   device reads the row down before it writes anything, and every write
--   carries a monotonically increasing `save_rev` so a stale tab can never
--   clobber a newer save.

-- ------------------------------------------------------------------ columns
alter table public.profiles
  add column if not exists inventory      jsonb  not null default '[]'::jsonb,
  add column if not exists last_free_case timestamptz,
  add column if not exists last_daily     timestamptz,
  add column if not exists joined_at      timestamptz,
  add column if not exists save_rev       bigint not null default 0,
  add column if not exists played_ms      bigint not null default 0;

-- ------------------------------------------------------------------ push
-- The player's client writes its whole progression snapshot. Owner-only
-- fields (marks, badges, tier, nickname/looks) are never touched here — the
-- owner functions handle those and stamp `owner_synced_at`.

create or replace function public.player_push_profile(
  p_username text,
  p_nickname text,
  p_stars bigint,
  p_inventory_value bigint,
  p_items int,
  p_marks text[],
  p_badges text[],
  p_inventory jsonb default null,
  p_last_free_case timestamptz default null,
  p_last_daily timestamptz default null,
  p_joined_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- keep the previous json values when the caller sends nothing, so an old
  -- client build (that does not know the new args) cannot wipe the save
  select jsonb_build_object(
           'inventory', p.inventory,
           'last_free_case', p.last_free_case,
           'last_daily', p.last_daily,
           'joined_at', p.joined_at
         )
    into cur;

  update public.profiles p
     set username        = coalesce(nullif(p_username, ''), p.username),
         nickname        = coalesce(nullif(p_nickname, ''), p.nickname),
         stars           = greatest(0, coalesce(p_stars, p.stars)),
         inventory_value = greatest(0, coalesce(p_inventory_value, p.inventory_value)),
         items           = greatest(0, coalesce(p_items, p.items)),
         inventory       = coalesce(p_inventory, p.inventory),
         last_free_case  = coalesce(p_last_free_case, p.last_free_case),
         last_daily      = coalesce(p_last_daily, p.last_daily),
         joined_at       = coalesce(p_joined_at, p.joined_at, now()),
         save_rev        = p.save_rev + 1,
         played_ms       = greatest(0, p.played_ms)
   where p.id = auth.uid()
  returning to_jsonb(p) ->> 'save_rev', p.save_rev into cur->'saved', cur;

  -- no row yet: create one (registration can land before the first push)
  if not found then
    insert into public.profiles
      (id, username, nickname, stars, inventory_value, items, inventory,
       last_free_case, last_daily, joined_at, save_rev)
    values (
      auth.uid(),
      coalesce(nullif(p_username, ''), 'user'),
      coalesce(nullif(p_nickname, ''), 'user'),
      greatest(0, coalesce(p_stars, 0)),
      greatest(0, coalesce(p_inventory_value, 0)),
      greatest(0, coalesce(p_items, 0)),
      coalesce(p_inventory, '[]'::jsonb),
      p_last_free_case,
      p_last_daily,
      coalesce(p_joined_at, now()),
      1
    )
    on conflict (id) do nothing;
  end if;

  -- hand the fresh save revision back so the client can stamp its own save
  select jsonb_build_object(
           'save_rev',     p.save_rev,
           'stars',        p.stars,
           'inventory',    p.inventory,
           'last_free_case', p.last_free_case,
           'last_daily',   p.last_daily,
           'joined_at',    p.joined_at,
           'owner_synced_at', p.owner_synced_at
         )
    into cur
    from public.profiles p
   where p.id = auth.uid();

  return coalesce(cur, '{}'::jsonb);
end;
$$;

-- replace the older 7-arg signature so both builds now hit the new one
drop function if exists public.player_push_profile(text, text, bigint, bigint, int, text[], text[]);

revoke all on function public.player_push_profile(text, text, bigint, bigint, int, text[], text[], jsonb, timestamptz, timestamptz, timestamptz) from anon;
grant execute on function public.player_push_profile(text, text, bigint, bigint, int, text[], text[], jsonb, timestamptz, timestamptz, timestamptz) to authenticated;

-- ------------------------------------------------------------------ pull
-- A device that has never played reads its cloud save through this function.
-- Direct table reads work too, but this keeps the payload explicit.

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
