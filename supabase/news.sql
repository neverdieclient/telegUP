-- telegUP · official news channel
-- Run in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- One read-only announcement feed: only the owner account can post, everyone
-- (signed in or not) can read. Posts support text, an optional cover image and
-- an optional video (the trailers), plus a pinned flag — like a Telegram
-- channel. The owner check matches the other SQL files (custom-gifts.sql).

-- ---------------------------------------------------------------- the table

create table if not exists public.news_posts (
  id          bigserial primary key,
  author_id   uuid references auth.users(id) on delete set null,
  kind        text not null default 'post'
                check (kind in ('post', 'update', 'fix', 'event')),
  title       text,
  body        text not null check (char_length(body) between 1 and 8000),
  media_url   text,
  media_kind  text check (media_kind in ('image', 'video')),
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.news_posts enable row level security;

-- everyone may read the feed, even before signing in
drop policy if exists "news readable" on public.news_posts;
create policy "news readable"
  on public.news_posts for select
  using (true);

-- only the owner account may publish
drop policy if exists "news owner write" on public.news_posts;
create policy "news owner write"
  on public.news_posts for insert
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

drop policy if exists "news owner update" on public.news_posts;
create policy "news owner update"
  on public.news_posts for update
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

drop policy if exists "news owner delete" on public.news_posts;
create policy "news owner delete"
  on public.news_posts for delete
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com');

create index if not exists news_posts_created_idx
  on public.news_posts (pinned desc, created_at desc);

-- live updates so an open feed refreshes the moment the owner posts
do $$
begin
  begin
    alter publication supabase_realtime add table public.news_posts;
  exception when duplicate_object then null;
  end;
end $$;

-- ------------------------------------------------------------- storage bucket

-- Own bucket for covers + trailers so they do not compete with gift art.
insert into storage.buckets (id, name, public)
values ('news-media', 'news-media', true)
on conflict (id) do nothing;

drop policy if exists "news media public read" on storage.objects;
create policy "news media public read"
  on storage.objects for select
  using (bucket_id = 'news-media');

drop policy if exists "news media owner write" on storage.objects;
create policy "news media owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'news-media'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com'
  );

drop policy if exists "news media owner delete" on storage.objects;
create policy "news media owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'news-media'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'oleg123456789123456@gmail.com'
  );