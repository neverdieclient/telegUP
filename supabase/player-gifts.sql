-- telegUP · player → player gifts actually arrive
-- Run in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Bug: `sendGift` only wrote a row into `gifts`. Nothing ever read that table,
-- so a gift a player sent to a friend vanished — the recipient's inventory was
-- never touched. Owner gifts worked because they go through `deliveries`,
-- which the recipient's client drains (`useGiftInbox`).
--
-- Fix: one SECURITY DEFINER function that writes the history row into `gifts`
-- AND the inbox row into `deliveries`. A player cannot insert into `deliveries`
-- directly (no INSERT policy), so this is the only way in.

create or replace function public.player_send_gift(
  target_id uuid,
  p_gift_id text,
  p_gift_name text,
  p_gift_stars int default 0,
  message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if target_id is null then
    raise exception 'no recipient';
  end if;
  if target_id = auth.uid() then
    raise exception 'cannot gift yourself';
  end if;

  select nickname into sender_name from public.profiles where id = auth.uid();

  -- history (what the sender sees under «отправленные»)
  insert into public.gifts
    (from_id, from_name, to_id, to_name, gift_id, gift_name, gift_stars, message)
  values (
    auth.uid(),
    coalesce(sender_name, 'player'),
    target_id,
    (select nickname from public.profiles where id = target_id),
    p_gift_id,
    p_gift_name,
    greatest(0, coalesce(p_gift_stars, 0)),
    message
  );

  -- inbox row: the recipient's client turns this into an inventory item
  insert into public.deliveries (user_id, gift_id, gift_name, from_name, message)
  values (target_id, p_gift_id, p_gift_name, coalesce(sender_name, 'player'), message);
end;
$$;

revoke all on function public.player_send_gift(uuid, text, text, int, text) from anon;
grant execute on function public.player_send_gift(uuid, text, text, int, text) to authenticated;
