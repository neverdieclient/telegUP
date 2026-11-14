-- telegUP — глобальные настройки магазина/подарков
-- Run in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Причина: настройки «только улучшенный подарок» / покупка / апгрейд
-- хранились только в localStorage браузера владельца, поэтому у других
-- пользователей подарки оставались доступны. Эта таблица делает их общими.

create table if not exists public.app_config (
  id int primary key default 1 check (id = 1),
  gift_buy_enabled boolean not null default true,
  gift_upgrades_enabled boolean not null default true,
  upgrade_only text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (1) on conflict do nothing;

alter table public.app_config enable row level security;

-- читать могут все (нужно каждому клиенту, чтобы скрыть покупку)
drop policy if exists "app_config readable" on public.app_config;
create policy "app_config readable"
  on public.app_config for select
  using (true);

-- менять может только владелец (по email из JWT, доступно в RLS без auth.users)
drop policy if exists "app_config owner update" on public.app_config;
create policy "app_config owner update"
  on public.app_config for update
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');
