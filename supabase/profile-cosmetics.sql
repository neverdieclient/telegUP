-- telegUP · косметика профиля (градиент ника, свечение бейджа, баннер)
-- Запускать в Supabase → SQL Editor → New query → Run.
-- Безопасно запускать повторно. Ничего не удаляет.
--
-- Что делает:
--   1. добавляет три поля в `profiles`:
--        name_gradient  — id пресета градиента ника (см. src/data/cosmetics.ts)
--        badge_glow     — id пресета свечения бейджей
--        profile_banner — id пресета баннера шапки профиля
--   2. расширяет `owner_set_profile`, чтобы владелец ставил их другому
--      игроку (или себе) прямо из админки;
--   3. отдаёт их в `player_pull_profile`, чтобы игрок увидел свой градиент
--      после входа с другого устройства.
--
-- Почему поля, а не локально: косметику выдают ДРУГОМУ игроку, и её видят
-- все, кто открывает карточку. Значит жить она должна в базе.

-- ---------------------------------------------------------------- схема
alter table public.profiles add column if not exists name_gradient  text;
alter table public.profiles add column if not exists badge_glow     text;
alter table public.profiles add column if not exists profile_banner text;

-- пустые строки — это «без косметики», не мусорный id
update public.profiles
   set name_gradient  = nullif(btrim(name_gradient), ''),
       badge_glow     = nullif(btrim(badge_glow), ''),
       profile_banner = nullif(btrim(profile_banner), '')
 where name_gradient is not null
    or badge_glow is not null
    or profile_banner is not null;

-- ------------------------------------------------------- выдача владельцем
-- Параметры с значениями по умолчанию, чтобы старые вызовы без косметики
-- продолжали работать. `p_set_* = false` значит «это поле не трогать» —
-- иначе сохранение одного поля стирало бы остальные.
create or replace function public.owner_set_cosmetics(
  target_id uuid,
  p_name_gradient  text default null,
  p_set_name_gradient  boolean default false,
  p_badge_glow     text default null,
  p_set_badge_glow     boolean default false,
  p_profile_banner text default null,
  p_set_profile_banner boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.owner_gate();

  update public.profiles p
     set name_gradient  = case when p_set_name_gradient
                               then nullif(btrim(p_name_gradient), '')
                               else p.name_gradient end,
         badge_glow     = case when p_set_badge_glow
                               then nullif(btrim(p_badge_glow), '')
                               else p.badge_glow end,
         profile_banner = case when p_set_profile_banner
                               then nullif(btrim(p_profile_banner), '')
                               else p.profile_banner end,
         owner_synced_at = now()
   where p.id = target_id;

  if not found then
    raise exception 'player not found';
  end if;
end;
$$;

revoke all on function public.owner_set_cosmetics(
  uuid, text, boolean, text, boolean, text, boolean
) from anon;
grant execute on function public.owner_set_cosmetics(
  uuid, text, boolean, text, boolean, text, boolean
) to authenticated;

-- ------------------------------------------- чтение косметики игроком
-- Копия `player_pull_profile` из account-sync.sql с тремя новыми полями.
-- Остальные поля не меняются.
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
           'owner_synced_at', p.owner_synced_at
         )
    into out
    from public.profiles p
   where p.id = auth.uid();

  return coalesce(out, 'null'::jsonb);
end;
$$;