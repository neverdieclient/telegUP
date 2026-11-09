-- telegUP — global chat
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.chat_messages (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nickname    text not null,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

-- everyone signed in (and guests, since the page is public) may read the chat
drop policy if exists "chat readable" on public.chat_messages;
create policy "chat readable"
  on public.chat_messages for select
  using (true);

-- a player may only post as themselves
drop policy if exists "chat post own" on public.chat_messages;
create policy "chat post own"
  on public.chat_messages for insert
  with check (auth.uid() = user_id);

-- a player may delete their own messages
drop policy if exists "chat delete own" on public.chat_messages;
create policy "chat delete own"
  on public.chat_messages for delete
  using (auth.uid() = user_id);

create index if not exists chat_messages_created_idx
  on public.chat_messages (created_at desc);

-- live updates (optional but makes the chat feel instant)
alter publication supabase_realtime add table public.chat_messages;
