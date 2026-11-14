-- telegUP — глобальные промокоды
-- Run in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Причина: промокоды и факт активации хранились в localStorage, поэтому
-- код, созданный владельцем, на другом аккаунте/устройстве «не найден».

create table if not exists public.promo_codes (
  code text primary key,
  kind text not null check (kind in ('stars', 'ton', 'premium')),
  amount int not null check (amount > 0),
  uses_left int not null default 1 check (uses_left >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  code text not null references public.promo_codes(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

-- коды может читать любой авторизованный (нужно проверить/показать в админке и валидировать)
drop policy if exists "promo_codes readable" on public.promo_codes;
create policy "promo_codes readable"
  on public.promo_codes for select
  to authenticated
  using (true);

-- создавать/удалять/править коды может только владелец
drop policy if exists "promo_codes owner write" on public.promo_codes;
create policy "promo_codes owner write"
  on public.promo_codes for all
  to authenticated
  using (
    exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and lower(u.email) = 'oleg123456789123456@gmail.com'
    )
  )
  with check (
    exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and lower(u.email) = 'oleg123456789123456@gmail.com'
    )
  );

-- записи активаций видит владелец (и сам пользователь при желании можно расширить)
drop policy if exists "promo_redemptions owner read" on public.promo_redemptions;
create policy "promo_redemptions owner read"
  on public.promo_redemptions for select
  to authenticated
  using (
    auth.uid() = user_id or exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and lower(u.email) = 'oleg123456789123456@gmail.com'
    )
  );

-- Атомарная активация: проверяет код, лимит и повтор, списывает использование
-- и записывает активацию. Возвращает данные кода или причину ошибки.
create or replace function public.redeem_promo(raw_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := upper(trim(coalesce(raw_code, '')));
  p public.promo_codes;
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if c = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  select * into p from public.promo_codes where code = c for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  if p.uses_left <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'spent');
  end if;

  if exists (
    select 1 from public.promo_redemptions r
    where r.code = c and r.user_id = uid
  ) then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  update public.promo_codes
     set uses_left = uses_left - 1
   where code = c;

  insert into public.promo_redemptions(code, user_id) values (c, uid);

  return jsonb_build_object(
    'ok', true,
    'promo', jsonb_build_object(
      'code', p.code,
      'kind', p.kind,
      'amount', p.amount,
      'usesLeft', p.uses_left - 1,
      'createdAt', floor(extract(epoch from p.created_at) * 1000),
      'note', p.note
    )
  );
end;
$$;

revoke all on function public.redeem_promo(text) from anon;
grant execute on function public.redeem_promo(text) to authenticated;
