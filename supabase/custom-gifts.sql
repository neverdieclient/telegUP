-- telegUP · admin-made gifts
-- Run in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- The owner can mint gifts and their models from the admin panel. They live in
-- one shared table so every player sees the same catalogue (a browser-local
-- admin flag would only ever be visible to the owner).

create table if not exists public.custom_gifts (
  id          bigserial primary key,
  slug        text not null,
  name        text not null,
  -- 'public' → everyone can see & buy it
  -- 'test'   → visible, but only the owner account may buy it
  visibility  text not null default 'public' check (visibility in ('public', 'test')),
  price       bigint not null default 0,
  image       text,
  accent      text not null default '#a3ff12',
  description text not null default '',
  -- [{ name, price, rarityPct, image }]
  models      jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists custom_gifts_slug_key on public.custom_gifts (slug);

alter table public.custom_gifts enable row level security;

-- everyone reads the catalogue; the client filters out 'test' rows for
-- non-owners, but keep the data public so the list stays in one place
drop policy if exists "custom gifts are readable" on public.custom_gifts;
create policy "custom gifts are readable"
  on public.custom_gifts for select
  using (true);

-- only the owner account may publish
drop policy if exists "owner writes custom gifts" on public.custom_gifts;
create policy "owner writes custom gifts"
  on public.custom_gifts for insert
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

drop policy if exists "owner updates custom gifts" on public.custom_gifts;
create policy "owner updates custom gifts"
  on public.custom_gifts for update
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

drop policy if exists "owner deletes custom gifts" on public.custom_gifts;
create policy "owner deletes custom gifts"
  on public.custom_gifts for delete
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

-- keep updated_at honest
create or replace function public.touch_custom_gift()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists custom_gifts_touch on public.custom_gifts;
create trigger custom_gifts_touch
  before update on public.custom_gifts
  for each row execute function public.touch_custom_gift();