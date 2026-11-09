-- telegUP — fix: badges / verification marks / phone number kept disappearing
-- Run after schema.sql (and any owner-*.sql). Safe to re-run.
--
-- Symptom
--   The owner grants a badge, a tick or a phone number to a player. It shows
--   up for a few seconds, then vanishes again (~every 20-30 s), on the profile
--   page and in the leaderboard alike.
--
-- Cause
--   The player's own browser periodically mirrors its LOCAL profile back into
--   the shared row with a full-column upsert that included `badges` and
--   `marks`. Until this build the only column protected from a self-write was
--   `marks` (guard_marks); `badges` and `phone_number` were wide open, so an
--   auth refresh pushed the stale local arrays over the owner's grant.
--
--   The client is now fixed (useAccountMirror no longer pushes those fields),
--   but this trigger makes the DB authoritative regardless of what any client
--   build sends: only the verified owner may change badges / marks / phone.
--
-- Fix
--   A BEFORE UPDATE trigger rewinds `badges`, `marks` and `phone_number` to
--   their old values unless the caller is the verified owner email. Owner
--   functions run as SECURITY DEFINER with the owner's JWT, so they pass;
--   a normal player editing their own cosmetics never can.

create or replace function public.guard_owner_fields()
returns trigger
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

  if not is_owner_email then
    new.badges       = old.badges;
    new.marks        = old.marks;
    new.phone_number = old.phone_number;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_owner_fields on public.profiles;
create trigger profiles_guard_owner_fields
  before update on public.profiles
  for each row execute function public.guard_owner_fields();
