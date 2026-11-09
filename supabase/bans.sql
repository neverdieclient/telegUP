-- telegUP — блокировки по IP и устройству
-- Запустить после schema.sql, owner-admin.sql, account-sync.sql, chat.sql.
-- Безопасно перезапускать.
--
-- Идея
--   Сайт чисто клиентский (GitHub Pages), между игроком и страницей нет своего
--   сервера, поэтому «забанить на входе» физически некуда поставить. Бан живёт
--   в БД и проверяется на КАЖДОМ серверном вызове (запись профиля, чат).
--   Даже если человек открыл DevTools и подменил клиент, RPC ответит 'banned'.
--
--   Клиент присылает свой IP (узнаёт себе бесплатно через api.ipify.org) и
--   фингерпринт браузера. IP/устройство пишутся в login_events, владелец
--   видит их в админке и банит одним тапом.
--
-- Оговорка (честно)
--   IP — динамический идентификатор: смена сети/VPN его меняет. Бан по IP
--   ловит тех же людей и тех, кто делит адрес, но не является «навсегда».
--   Бан по устройству (fingerprint) переживает смену IP.
--   Клиентские проверки обходятся через DevTools — поэтому они только
--   дополняют серверный бан, а не заменяют его.

-- ------------------------------------------------------------------ bans
create table if not exists public.bans (
  id          bigserial primary key,
  kind        text not null check (kind in ('ip', 'device', 'user')),
  value       text not null,                 -- ip / fingerprint / account uuid
  label       text,                          -- ник на момент бана, для админки
  reason      text,
  banned_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists bans_kind_value_uniq on public.bans (kind, value);

alter table public.bans enable row level security;

-- bans читает только владелец (проверка идёт через owner_gate в SECURITY DEFINER)
drop policy if exists "bans owner read" on public.bans;
create policy "bans owner read"
  on public.bans for select
  using (
    exists (
      select 1 from auth.users u
      join public.profiles p on p.id = u.id
      where u.id = auth.uid()
        and lower(u.email) = 'oleg123456789123456@gmail.com'
        and 'owner' = any(p.marks)
    )
  );

-- ------------------------------------------------------------------ login events
create table if not exists public.login_events (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  username    text,
  nickname    text,
  ip          text,
  fingerprint text,
  user_agent  text,
  vpn_flag    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists login_events_ip_idx     on public.login_events (ip);
create index if not exists login_events_device_idx on public.login_events (fingerprint);
create index if not exists login_events_user_idx   on public.login_events (user_id, created_at desc);

alter table public.login_events enable row level security;

drop policy if exists "login events owner read" on public.login_events;
create policy "login events owner read"
  on public.login_events for select
  using (
    exists (
      select 1 from auth.users u
      join public.profiles p on p.id = u.id
      where u.id = auth.uid()
        and lower(u.email) = 'oleg123456789123456@gmail.com'
        and 'owner' = any(p.marks)
    )
  );

-- ------------------------------------------------------------------ check
-- Возвращает true, если текущий вызов должен быть отклонён.
-- Бан проверяется по: аккаунту (uuid), последнему известному IP и последнему
-- известному устройству (fingerprint) этого аккаунта.
create or replace function public.is_banned()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_ip     text;
  v_device text;
begin
  if v_uid is null then
    return false;
  end if;

  -- бан аккаунта
  if exists (select 1 from public.bans b where b.kind = 'user' and b.value = v_uid::text) then
    return true;
  end if;

  -- последний известный ip / устройство этого аккаунта
  select ip, fingerprint into v_ip, v_device
    from public.login_events
   where user_id = v_uid
   order by created_at desc
   limit 1;

  if v_ip is not null and exists (
    select 1 from public.bans b where b.kind = 'ip' and b.value = v_ip
  ) then
    return true;
  end if;

  if v_device is not null and exists (
    select 1 from public.bans b where b.kind = 'device' and b.value = v_device
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.is_banned() from anon;
grant execute on function public.is_banned() to authenticated;

-- Тот же вывод, но параметризованный ip/device — используется сразу после
-- log_login, чтобы клиент не гонял лишний round-trip. security definer может
-- вернуть true только для текущего аккаунта.
create or replace function public.ban_state_for(
  p_ip          text,
  p_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  if exists (select 1 from public.bans b where b.kind = 'user' and b.value = v_uid::text) then
    return true;
  end if;

  if coalesce(p_ip, '') <> '' and exists (
    select 1 from public.bans b where b.kind = 'ip' and b.value = p_ip
  ) then
    return true;
  end if;

  if coalesce(p_fingerprint, '') <> '' and exists (
    select 1 from public.bans b where b.kind = 'device' and b.value = p_fingerprint
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.ban_state_for(text, text) from anon;
grant execute on function public.ban_state_for(text, text) to authenticated;

-- ------------------------------------------------------------------ log
-- Клиент заносит себя в журнал при входе. Возвращает статус бана, чтобы клиент
-- сразу показал заглушку (не дожидаясь следующего серверного вызова).
create or replace function public.log_login(
  p_ip          text,
  p_fingerprint text,
  p_user_agent  text default null,
  p_vpn_flag    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_user text;
  v_nick text;
  v_ban  boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'banned', false);
  end if;

  select username, nickname into v_user, v_nick
    from public.profiles where id = v_uid;

  -- не плодим дубли: если тот же ip+device уже писался за последние 10 мин — не пишем
  if not exists (
    select 1 from public.login_events
     where user_id = v_uid
       and ip is not distinct from nullif(p_ip, '')
       and fingerprint is not distinct from nullif(p_fingerprint, '')
       and created_at > now() - interval '10 minutes'
  ) then
    insert into public.login_events (user_id, username, nickname, ip, fingerprint, user_agent, vpn_flag)
    values (v_uid, v_user, v_nick, nullif(p_ip, ''), nullif(p_fingerprint, ''),
            left(coalesce(p_user_agent, ''), 400), coalesce(p_vpn_flag, false));
  end if;

  v_ban := public.ban_state_for(nullif(p_ip, ''), nullif(p_fingerprint, ''));

  return jsonb_build_object('ok', true, 'banned', v_ban);
end;
$$;

revoke all on function public.log_login(text, text, text, boolean) from anon;
grant execute on function public.log_login(text, text, text, boolean) to authenticated;

-- ------------------------------------------------------------------ owner bans
create or replace function public.owner_ban(
  p_kind   text,          -- 'ip' | 'device' | 'user'
  p_value  text,
  p_label  text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();
  if p_kind not in ('ip', 'device', 'user') then
    raise exception 'bad ban kind';
  end if;
  if coalesce(trim(p_value), '') = '' then
    raise exception 'empty ban value';
  end if;

  insert into public.bans (kind, value, label, reason, banned_by)
  values (p_kind, trim(p_value), p_label, p_reason, auth.uid())
  on conflict (kind, value) do nothing;
end;
$$;

create or replace function public.owner_unban(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();
  delete from public.bans where id = p_id;
end;
$$;

-- список банов для админки (плюс ник последнего входа, чтобы было понятно, кто это)
create or replace function public.owner_list_bans()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  out jsonb;
begin
  perform public.owner_gate();

  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb)
    into out
    from (
      select jsonb_build_object(
               'id',         b.id,
               'kind',       b.kind,
               'value',      b.value,
               'label',      b.label,
               'reason',     b.reason,
               'created_at', b.created_at,
               'nickname',   le.nickname,
               'ip',         le.ip,
               'fingerprint', le.fingerprint,
               'user_id',    le.user_id
             ) as row
        from public.bans b
        left join lateral (
          select nickname, ip, fingerprint, user_id
            from public.login_events e
           where (b.kind = 'user'   and e.user_id::text = b.value)
              or (b.kind = 'ip'     and e.ip = b.value)
              or (b.kind = 'device' and e.fingerprint = b.value)
           order by e.created_at desc
           limit 1
        ) le on true
    ) t;

  return coalesce(out, '[]'::jsonb);
end;
$$;

-- журнал входов для админки: кто, откуда, с какого устройства, когда
create or replace function public.owner_login_events(p_limit int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  out jsonb;
begin
  perform public.owner_gate();

  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb)
    into out
    from (
      select jsonb_build_object(
               'id',          e.id,
               'user_id',     e.user_id,
               'username',    e.username,
               'nickname',    e.nickname,
               'ip',          e.ip,
               'fingerprint', e.fingerprint,
               'user_agent',  e.user_agent,
               'vpn_flag',    e.vpn_flag,
               'created_at',  e.created_at
             ) as row
        from public.login_events e
        order by e.created_at desc
        limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) t;

  return coalesce(out, '[]'::jsonb);
end;
$$;

revoke all on function public.owner_ban(text, text, text, text) from anon;
revoke all on function public.owner_unban(bigint) from anon;
revoke all on function public.owner_list_bans() from anon;
revoke all on function public.owner_login_events(int) from anon;
grant execute on function public.owner_ban(text, text, text, text) to authenticated;
grant execute on function public.owner_unban(bigint) to authenticated;
grant execute on function public.owner_list_bans() to authenticated;
grant execute on function public.owner_login_events(int) to authenticated;

-- ------------------------------------------------------------------ enforcement
-- Перекрываем запись профиля: забаненный не пройдёт даже в обход клиента.
-- Тело совпадает с account-sync.sql, добавлена только проверка is_banned().
create or replace function public.player_push_profile(
  p_username text,
  p_nickname text,
  p_stars bigint,
  p_inventory_value bigint,
  p_items int,
  p_marks text[],
  p_badges text[],
  p_inventory jsonb default null,
  p_last_free_case timestamptz default null,
  p_last_daily timestamptz default null,
  p_joined_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- БАН: единственное отличие от account-sync.sql
  if public.is_banned() then
    raise exception 'banned';
  end if;

  select jsonb_build_object(
           'inventory', p.inventory,
           'last_free_case', p.last_free_case,
           'last_daily', p.last_daily,
           'joined_at', p.joined_at
         )
    into cur;

  update public.profiles p
     set username        = coalesce(nullif(p_username, ''), p.username),
         nickname        = coalesce(nullif(p_nickname, ''), p.nickname),
         stars           = greatest(0, coalesce(p_stars, p.stars)),
         inventory_value = greatest(0, coalesce(p_inventory_value, p.inventory_value)),
         items           = greatest(0, coalesce(p_items, p.items)),
         inventory       = coalesce(p_inventory, p.inventory),
         last_free_case  = coalesce(p_last_free_case, p.last_free_case),
         last_daily      = coalesce(p_last_daily, p.last_daily),
         joined_at       = coalesce(p_joined_at, p.joined_at, now()),
         save_rev        = p.save_rev + 1,
         played_ms       = greatest(0, p.played_ms)
   where p.id = auth.uid();

  -- no row yet: create one (registration can land before the first push)
  if not found then
    insert into public.profiles
      (id, username, nickname, stars, inventory_value, items, inventory,
       last_free_case, last_daily, joined_at, save_rev)
    values (
      auth.uid(),
      coalesce(nullif(p_username, ''), 'user'),
      coalesce(nullif(p_nickname, ''), 'user'),
      greatest(0, coalesce(p_stars, 0)),
      greatest(0, coalesce(p_inventory_value, 0)),
      greatest(0, coalesce(p_items, 0)),
      coalesce(p_inventory, '[]'::jsonb),
      p_last_free_case,
      p_last_daily,
      coalesce(p_joined_at, now()),
      1
    )
    on conflict (id) do nothing;
  end if;

  -- hand the fresh save revision back so the client can stamp its own save
  select jsonb_build_object(
           'save_rev',     p.save_rev,
           'stars',        p.stars,
           'inventory',    p.inventory,
           'last_free_case', p.last_free_case,
           'last_daily',   p.last_daily,
           'joined_at',    p.joined_at,
           'owner_synced_at', p.owner_synced_at
         )
    into cur
    from public.profiles p
   where p.id = auth.uid();

  return coalesce(cur, '{}'::jsonb);
end;
$$;

revoke all on function public.player_push_profile(text, text, bigint, bigint, int, text[], text[], jsonb, timestamptz, timestamptz, timestamptz) from anon;
grant execute on function public.player_push_profile(text, text, bigint, bigint, int, text[], text[], jsonb, timestamptz, timestamptz, timestamptz) to authenticated;

-- чат: запрет поста забаненным (перекрываем политику из chat.sql)
drop policy if exists "chat post own" on public.chat_messages;
create policy "chat post own"
  on public.chat_messages for insert
  with check (auth.uid() = user_id and not public.is_banned());
