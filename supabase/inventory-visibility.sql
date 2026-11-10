-- telegUP · public gift inventories
-- Run in Supabase → SQL Editor → New query → Run. Safe to re-run.

-- Players can let anyone browse their gift collection, and close it again.
-- Default is OPEN: a fresh profile shows its inventory.
alter table public.profiles
  add column if not exists show_inventory boolean not null default true;

-- A player flips their own switch. It only writes `show_inventory`, so it can
-- never be used to touch stars, marks or anything the server guards.
create or replace function public.player_set_inventory_visibility(p_show boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  update public.profiles
     set show_inventory = coalesce(p_show, true)
   where id = auth.uid();

  return coalesce(p_show, true);
end;
$$;

revoke all on function public.player_set_inventory_visibility(boolean) from anon;
grant execute on function public.player_set_inventory_visibility(boolean) to authenticated;
