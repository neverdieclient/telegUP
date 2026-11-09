-- telegUP — owner admin functions
-- Run after schema.sql. Safe to re-run.
--
-- RLS only lets a player write their own profile row, so the owner needs
-- SECURITY DEFINER functions to change someone else's stars, badges or tier.
-- Every function repeats the same guard: caller is signed in, has the exact
-- owner email, and carries the 'owner' mark in their own profile.

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

-- ---------------------------------------------------------------- stars
create or replace function public.owner_give_stars(target_id uuid, amount bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();
  update public.profiles p
     set stars = greatest(0, p.stars + amount)
   where p.id = target_id;
end;
$$;

-- ---------------------------------------------------------------- marks
create or replace function public.owner_take_mark(target_id uuid, mark text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();

  -- the 'owner' mark is the key to this panel: removing it would lock the
  -- owner out of their own admin functions forever, so it stays
  if mark = 'owner' then
    raise exception 'owner mark cannot be removed';
  end if;

  update public.profiles p
     set marks = array(select m from unnest(p.marks) m where m <> mark),
         owner_synced_at = now()
   where p.id = target_id;
end;
$$;

-- ---------------------------------------------------------------- badges
create or replace function public.owner_give_badge(target_id uuid, badge text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();
  update public.profiles p
     set badges = array(select distinct unnest(p.badges || badge))
   where p.id = target_id;
end;
$$;

create or replace function public.owner_take_badge(target_id uuid, badge text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();
  update public.profiles p
     set badges = array(select b from unnest(p.badges) b where b <> badge)
   where p.id = target_id;
end;
$$;

-- ---------------------------------------------------------------- tier
-- Premium is a paid tier that must never be buyable; only the owner can flip
-- it. The mark list is kept in sync so the tick cannot reappear.
--
-- Written as a DO block on purpose: inside plain SQL a column name on the left
-- of `=` is a plpgsql variable, so `tier = tier` and `marks = marks` silently
-- refer to themselves and the update does nothing.
create or replace function public.owner_set_tier(target_id uuid, tier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
         end
   where p.id = target_id;
end;
$$;

-- ---------------------------------------------------------------- inbox
-- Owner-granted gifts land in the normal gifts table with the owner as the
-- sender, so the recipient's inbox picks them up without special casing.
-- (Nothing to create: the insert policy already allows from_id = auth.uid().)

revoke all on function public.owner_gate() from anon;
revoke all on function public.owner_give_stars(uuid, bigint) from anon;
revoke all on function public.owner_take_mark(uuid, text) from anon;
revoke all on function public.owner_give_badge(uuid, text) from anon;
revoke all on function public.owner_take_badge(uuid, text) from anon;
revoke all on function public.owner_set_tier(uuid, text) from anon;

grant execute on function public.owner_give_stars(uuid, bigint) to authenticated;
grant execute on function public.owner_take_mark(uuid, text) to authenticated;
grant execute on function public.owner_give_badge(uuid, text) to authenticated;
grant execute on function public.owner_take_badge(uuid, text) to authenticated;
grant execute on function public.owner_set_tier(uuid, text) to authenticated;

-- A player must not be able to flip their own tier through a plain UPDATE.
create or replace function public.guard_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and old.tier is distinct from new.tier then
    new.tier = old.tier;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_tier on public.profiles;
create trigger profiles_guard_tier
  before update on public.profiles
  for each row execute function public.guard_tier();

-- Bootstrap the owner (run once, after the owner account exists in the app):
--
--   update public.profiles
--      set marks = array['owner','premium','basic','crown'],
--          tier  = 'Premium'
--    where id = (select id from auth.users
--                 where lower(email) = 'oleg123456789123456@gmail.com');