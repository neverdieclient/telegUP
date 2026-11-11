-- telegUP · тестовый подарок «UFC Strike» (бывший UFC Mystery Box)
-- Run in Supabase → SQL Editor → New query → Run. Безопасно запускать повторно.
--
-- Подарок создаётся как «тест»: виден всем, купить в маркете может только
-- владелец. Улучшения (модели) владелец добавит сам в админке.
--
-- Картинку положи файлом на диск и вставь публичную ссылку в @image ниже
-- (или добавь картинку позже прямо в админке — поле «Картинка подарка»).
-- Пока ссылки нет, в маркете будет аккуратная плашка-заглушка с буквами UFC.

-- Картинки подарков: публичное чтение, загрузка только владельцу.
insert into storage.buckets (id, name, public)
values ('gift-art', 'gift-art', true)
on conflict (id) do update set public = true;

drop policy if exists "gift art is readable" on storage.objects;
create policy "gift art is readable"
  on storage.objects for select
  using (bucket_id = 'gift-art');

drop policy if exists "owner uploads gift art" on storage.objects;
create policy "owner uploads gift art"
  on storage.objects for insert
  with check (
    bucket_id = 'gift-art'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com'
  );

-- ---------------------------------------------------------------- подарок

do $$
declare
  v_image text := null;   -- можно вписать готовую https-ссылку на картинку
begin
  insert into public.custom_gifts (slug, name, visibility, price, image, accent, description, models)
  values (
    'ufc-strike',
    'UFC Strike',
    'test',
    3700,
    v_image,
    '#ff3b30',
    'UFC Strike (ранее UFC Mystery Box) — статуэтки, экипировка и чемпионские пояса бойцов UFC: Чимаев, Двалишвили, О’Мэлли, Джонс, Топурия, Адесанья, Оливейра, Волкановски, Перейра, Пантожа.',
    '[]'::jsonb
  )
  on conflict (slug) do update
    set name        = excluded.name,
        visibility  = excluded.visibility,
        accent      = excluded.accent,
        description = excluded.description,
        price       = excluded.price,
        -- картинку и модели не затираем: их мог уже заполнить владелец
        image       = coalesce(public.custom_gifts.image, excluded.image);

  raise notice 'UFC Strike готов: slug = ufc-strike, id в инвентаре = custom-ufc-strike';
end $$;