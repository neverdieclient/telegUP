-- telegUP — fix: the owner could never take the 'owner' mark (admin lockout)
-- Run after schema.sql (and any owner-*.sql). Safe to re-run.
--
-- Symptom
--   Every owner action that touches *another* player (give stars, grant a
--   mark/badge, set tier, deliver a gift) fails with the toast «Не вышло»,
--   and the RPC returns:  P0001  "not allowed".
--
-- Cause
--   owner_gate() (and grant_mark) require THREE things of the caller:
--     1. signed in                       (auth.uid() is not null)
--     2. lower(email) = owner email      (from auth.users)
--     3. 'owner' = any(profile.marks)    <-- must already carry the mark
--
--   But the owner's own row starts with marks = '{}' (no marks at all), and
--   the guard_marks trigger rewinds any marks change on "my own row" unless
--   the caller *already* has the 'owner' mark. That is a deadlock:
--     you need the 'owner' mark to be allowed to set the 'owner' mark.
--   So the bootstrap below is the only way out: the FIRST 'owner' grant must
--   key off the verified email alone.
--
-- Fix
--   - guard_marks: allow the verified owner email to edit its own marks,
--     even before the 'owner' mark exists.
--   - grant_mark: let the verified owner email grant the 'owner' mark to
--     itself (bootstrap). Every other mark still requires owner_gate().
--   Then actually stamp the 'owner' mark onto the owner row.

-- ---------------------------------------------------------------- guard_marks
create or replace function public.guard_marks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner_email boolean;
begin
  -- The verified owner email may edit its own marks. Note this does NOT
  -- require the 'owner' mark to already be present, so the first grant works.
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'oleg123456789123456@gmail.com'
  ) into is_owner_email;

  -- a regular player may never change their own ticks
  if not is_owner_email and auth.uid() = old.id then
    new.marks = old.marks;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_marks on public.profiles;
create trigger profiles_guard_marks
  before update on public.profiles
  for each row execute function public.guard_marks();

-- ---------------------------------------------------------------- grant_mark
create or replace function public.grant_mark(target_id uuid, mark text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner_email boolean;
begin
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'oleg123456789123456@gmail.com'
  ) into is_owner_email;

  -- The owner email alone may bootstrap the 'owner' mark onto its own row;
  -- every other grant still requires the full owner_gate() (email + mark).
  if mark = 'owner' and is_owner_email and auth.uid() = target_id then
    update public.profiles
       set marks = array(
             select distinct m
             from unnest(coalesce(marks, '{}'::text[]) || array[mark]) as m
           ),
           owner_synced_at = now()
     where id = target_id;
    return;
  end if;

  -- everyone else: normal owner gate (email AND existing 'owner' mark)
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
     set marks = array(
           select distinct m
           from unnest(coalesce(marks, '{}'::text[]) || array[mark]) as m
         ),
         owner_synced_at = now()
   where id = target_id;
end;
$$;

revoke all on function public.grant_mark(uuid, text) from anon;
grant execute on function public.grant_mark(uuid, text) to authenticated;

-- ------------------------------------------------- bootstrap the owner mark
-- Stamp the 'owner' mark onto the verified owner account directly, bypassing
-- the trigger's own-row protection by only touching rows whose email matches.
update public.profiles p
   set marks = array(
         select distinct m
         from unnest(coalesce(p.marks, '{}'::text[]) || array['owner']) as m
       ),
       owner_synced_at = now()
  from auth.users u
 where u.id = p.id
   and lower(u.email) = 'oleg123456789123456@gmail.com'
   and not ('owner' = any(coalesce(p.marks, '{}'::text[])));

-- ------------------------------------------------ drop the legacy 'basic' mark
-- One-off cleanup: the basic mark is no longer used at all.
update public.profiles p
   set marks = array(select m from unnest(p.marks) m where m <> 'basic'),
       owner_synced_at = now()
  from auth.users u
 where u.id = p.id
   and lower(u.email) = 'oleg123456789123456@gmail.com';
