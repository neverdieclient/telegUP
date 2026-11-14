-- telegUP · TON-маркет: занятые юзернеймы и номера
-- Запускать в Supabase → SQL Editor → New query → Run.
-- Безопасно запускать повторно. Ничего не удаляет.
--
-- Что делает:
--   1. создаёт таблицу `ton_claims` — «этот лот уже чей-то»;
--   2. разрешает всем авторизованным читать её (иначе игрок не увидит «занят»);
--   3. даёт игроку функцию `claim_ton_item`, которая атомарно занимает лот:
--      если ключ уже есть — возвращает false, и покупка не проходит.
--
-- Почему ключ, а не id строки: прилавок пересобирается каждый час, поэтому
-- «@luna» и «+7 999 555 12 34» должны оставаться занятыми навсегда, даже когда
-- лот ушёл с витрины.

create table if not exists public.ton_claims (
  key        text primary key,
  owner_id   uuid not null default auth.uid(),
  label      text not null,
  kind       text not null default 'username',
  ton        numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ton_claims_owner_idx on public.ton_claims (owner_id);

alter table public.ton_claims enable row level security;

-- читать может любой вошедший: список занятого — публичная информация
drop policy if exists ton_claims_read on public.ton_claims;
create policy ton_claims_read on public.ton_claims
  for select to authenticated using (true);

-- вставить можно только от своего имени
drop policy if exists ton_claims_insert on public.ton_claims;
create policy ton_claims_insert on public.ton_claims
  for insert to authenticated with check (owner_id = auth.uid());

-- забрать свою же запись можно (например, если покупка не прошла)
drop policy if exists ton_claims_delete on public.ton_claims;
create policy ton_claims_delete on public.ton_claims
  for delete to authenticated using (owner_id = auth.uid());

-- ------------------------------------------------------------ занят лот
create or replace function public.claim_ton_item(
  p_key   text,
  p_label text,
  p_kind  text default 'username',
  p_ton   numeric default 0
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.ton_claims (key, owner_id, label, kind, ton)
  values (p_key, auth.uid(), coalesce(p_label, p_key), coalesce(p_kind, 'username'), coalesce(p_ton, 0))
  on conflict (key) do nothing;

  inserted := found;
  return inserted;
end;
$$;

revoke all on function public.claim_ton_item(text, text, text, numeric) from anon;
grant execute on function public.claim_ton_item(text, text, text, numeric) to authenticated;

-- ------------------------------------------------------ освободить лот
-- Своя же запись: нужна, если покупка не прошла после занятия.
create or replace function public.release_ton_item(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ton_claims where key = p_key and owner_id = auth.uid();
$$;

revoke all on function public.release_ton_item(text) from anon;
grant execute on function public.release_ton_item(text) to authenticated;

-- Проверка: сколько лотов уже занято.
select kind, count(*) filter (where true) as занято
  from public.ton_claims
 group by kind;