-- telegUP · limited drops
-- Run in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- One owner-controlled limited drop at a time. The owner picks a gift (a
-- built-in collection slug or one of his own `custom_gifts` slugs) and the app
-- frames it as «Лимитед»: while the countdown is running the gift can still be
-- bought, and when it runs out the gift stays in the catalogue but is no
-- longer purchasable. Closing a drop early does the same thing immediately.
--
-- `slug` is deliberately NOT a foreign key: built-in gifts live in the bundle,
-- not in the database, so either source is allowed. The client resolves it.
--
-- Security: everyone reads, only the owner account writes — same predicate the
-- other files use (see custom-gifts.sql).

create table if not exists public.live_drops (
  id          bigserial primary key,
  slug        text not null,
  label       text,
  starts_at   timestamptz not null default now(),
  -- null = no deadline (the owner closes it by hand)
  ends_at     timestamptz,
  closed      boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.live_drops enable row level security;

drop policy if exists "drops readable" on public.live_drops;
create policy "drops readable"
  on public.live_drops for select
  using (true);

drop policy if exists "drops owner write" on public.live_drops;
create policy "drops owner write"
  on public.live_drops for insert
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

drop policy if exists "drops owner update" on public.live_drops;
create policy "drops owner update"
  on public.live_drops for update
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

drop policy if exists "drops owner delete" on public.live_drops;
create policy "drops owner delete"
  on public.live_drops for delete
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

create index if not exists live_drops_started_idx
  on public.live_drops (starts_at desc);

-- ---------------------------------------------------------------------------
-- Star events (the «двойные звёзды» multiplier)
--
-- The CHOSEN multiplier is a single shared row everyone can read, so an active
-- boost shows up as a banner on every device the moment the owner turns it on.
-- The START/STOP timestamps are literally the switch: the effect is live only
-- while now() is between them, so the boost can never be left running by a
-- browser that was closed halfway through.
-- ---------------------------------------------------------------------------

create table if not exists public.star_events (
  id          integer primary key default 1 check (id = 1),
  multiplier  integer not null default 200 check (multiplier between 1 and 1000),
  ends_at     timestamptz,
  closed      boolean not null default true,
  started_at  timestamptz,
  title       text,
  updated_at  timestamptz not null default now()
);

insert into public.star_events (id, multiplier, closed)
values (1, 200, true)
on conflict (id) do nothing;

alter table public.star_events enable row level security;

drop policy if exists "star events readable" on public.star_events;
create policy "star events readable"
  on public.star_events for select
  using (true);

drop policy if exists "star events owner write" on public.star_events;
create policy "star events owner write"
  on public.star_events for insert
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

drop policy if exists "star events owner update" on public.star_events;
create policy "star events owner update"
  on public.star_events for update
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

-- live banner refresh
do $$
begin
  begin
    alter publication supabase_realtime add table public.live_drops;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.star_events;
  exception when duplicate_object then null;
  end;
end $$;