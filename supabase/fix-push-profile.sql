-- telegUP · fix: player_push_profile never saved the inventory
-- Run in Supabase → SQL Editor → New query → Run.
--
-- Bug: the applied 11-arg `player_push_profile` opened with
--     select jsonb_build_object('inventory', p.inventory, ...) into cur;
-- with **no FROM clause**, so `p.inventory` resolved to nothing. Postgres compiles
-- each plpgsql statement lazily, so the call only blew up once money/inventory
-- reached that line — the client saw a 404 «missing FROM-clause entry for table p»
-- and silently kept the old (empty) jsonb. Result: `items` grew but the gift list
-- stayed `[]` for everyone.
--
-- This replacement drops the pointless first SELECT (its result was thrown away
-- anyway) and writes `p_inventory` straight into the row.

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

  if public.is_banned() then
    raise exception 'banned';
  end if;

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
         save_rev        = p.save_rev + 1
   where p.id = auth.uid();

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
           'save_rev',        p.save_rev,
           'stars',           p.stars,
           'inventory',       p.inventory,
           'inventory_value', p.inventory_value,
           'last_free_case',  p.last_free_case,
           'last_daily',      p.last_daily,
           'joined_at',       p.joined_at,
           'owner_synced_at', p.owner_synced_at
         )
    into cur
    from public.profiles p
   where p.id = auth.uid();

  return coalesce(cur, '{}'::jsonb);
end;
$$;

-- drop the old bare 7-arg signature so nothing keeps routing to it
drop function if exists public.player_push_profile(text, text, bigint, bigint, int, text[], text[]);

revoke all on function public.player_push_profile(text, text, bigint, bigint, int, text[], text[], jsonb, timestamptz, timestamptz, timestamptz) from anon;
grant execute on function public.player_push_profile(text, text, bigint, bigint, int, text[], text[], jsonb, timestamptz, timestamptz, timestamptz) to authenticated;
