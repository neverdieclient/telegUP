-- telegUP · свои аватарки
-- Запускать в Supabase → SQL Editor → New query → Run.
-- Безопасно запускать повторно. Ничего не удаляет.
--
-- Что делает:
--   1. создаёт бакет `avatars` (публичное чтение — аватарку видят все);
--   2. добавляет в `profiles` поле `avatar_url`;
--   3. открывает игроку запись ТОЛЬКО в свою папку `avatars/<свой uuid>/…`;
--   4. даёт владельцу ставить аватарку другому игроку через owner_set_avatar;
--   5. отдаёт `avatar_url` в player_pull_profile, чтобы она вернулась
--      на другом устройстве.
--
-- Почему URL в таблице, а не файл в localStorage: аватарку видят другие
-- игроки (топ, чат, карточка), значит она должна жить в общей базе.

-- ------------------------------------------------------------- схема
alter table public.profiles add column if not exists avatar_url text;

-- пустая строка — это «без аватарки», а не битая ссылка
update public.profiles
   set avatar_url = nullif(btrim(avatar_url), '')
 where avatar_url is not null;

-- ------------------------------------------------------------- бакет
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Каждый игрок пишет только в свою папку: первый сегмент пути = его auth.uid().
-- Владелец может писать куда угодно (аватарки для других игроков).
drop policy if exists "avatars own write" on storage.objects;
create policy "avatars own write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com'
    )
  );

drop policy if exists "avatars own delete" on storage.objects;
create policy "avatars own delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com'
    )
  );

-- ----------------------------------------------------- своя аватарка
-- Игрок меняет ТОЛЬКО avatar_url своей строки. Ник, бейджи и прочее этим
-- вызовом не трогаются, поэтому функцию можно звать без опаски.
create or replace function public.player_set_avatar(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  update public.profiles p
     set avatar_url = nullif(btrim(p_url), ''),
         owner_synced_at = now()
   where p.id = auth.uid();
end;
$$;

revoke all on function public.player_set_avatar(text) from anon;
grant execute on function public.player_set_avatar(text) to authenticated;

-- ----------------------------------------------- аватарка чужому игроку
create or replace function public.owner_set_avatar(
  target_id uuid,
  p_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();

  update public.profiles p
     set avatar_url = nullif(btrim(p_avatar_url), ''),
         owner_synced_at = now()
   where p.id = target_id;

  if not found then
    raise exception 'player not found';
  end if;
end;
$$;

revoke all on function public.owner_set_avatar(uuid, text) from anon;
grant execute on function public.owner_set_avatar(uuid, text) to authenticated;

-- ------------------------------------------- чтение аватарки игроком
-- Копия player_pull_profile из profile-cosmetics.sql плюс avatar_url.
create or replace function public.player_pull_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  out jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select jsonb_build_object(
           'stars',           p.stars,
           'inventory',       p.inventory,
           'inventory_value', p.inventory_value,
           'items',           p.items,
           'last_free_case',  p.last_free_case,
           'last_daily',      p.last_daily,
           'joined_at',       p.joined_at,
           'save_rev',        p.save_rev,
           'nickname',        p.nickname,
           'tier',            p.tier,
           'marks',           p.marks,
           'badges',          p.badges,
           'phone_number',    p.phone_number,
           'alt_names',       p.alt_names,
           'bio',             p.bio,
           'accent',          p.accent,
           'gradient',        p.gradient,
           'name_gradient',   p.name_gradient,
           'badge_glow',      p.badge_glow,
           'profile_banner',  p.profile_banner,
           'avatar_url',      p.avatar_url,
           'owner_synced_at', p.owner_synced_at
         )
    into out
    from public.profiles p
   where p.id = auth.uid();

  return coalesce(out, 'null'::jsonb);
end;
$$;

revoke all on function public.player_pull_profile() from anon;
grant execute on function public.player_pull_profile() to authenticated;