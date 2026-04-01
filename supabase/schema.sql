-- ============================================================
-- Penn Pal – Full Database Schema
-- Run this in the Supabase SQL Editor (or apply as a migration)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Extensions
-- ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- ENUM types
-- ──────────────────────────────────────────────────────────────
create type user_status as enum ('waiting', 'matched');

-- ──────────────────────────────────────────────────────────────
-- Table: users (public profile, linked 1:1 to auth.users)
-- ──────────────────────────────────────────────────────────────
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  grad_year   int  not null check (grad_year >= 2024 and grad_year <= 2040),
  prompt      text,                              -- optional "What are you going through?"
  status      user_status not null default 'waiting',
  pair_id     uuid,                              -- FK added after pairs table is created
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────
-- Table: pairs
-- ──────────────────────────────────────────────────────────────
create table public.pairs (
  id         uuid primary key default uuid_generate_v4(),
  user1_id   uuid not null references public.users(id) on delete cascade,
  user2_id   uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint different_users check (user1_id <> user2_id)
);

-- Now that pairs exists, add FK from users.pair_id → pairs.id
alter table public.users
  add constraint users_pair_id_fkey
  foreign key (pair_id) references public.pairs(id) on delete set null;

-- ──────────────────────────────────────────────────────────────
-- Table: messages
-- ──────────────────────────────────────────────────────────────
create table public.messages (
  id         uuid primary key default uuid_generate_v4(),
  pair_id    uuid not null references public.pairs(id) on delete cascade,
  sender_id  uuid not null references public.users(id) on delete cascade,
  content    text not null check (char_length(content) > 0 and char_length(content) <= 2000),
  created_at timestamptz not null default now()
);

-- Index for fast message fetching per conversation
create index messages_pair_id_created_at_idx on public.messages(pair_id, created_at asc);

-- ──────────────────────────────────────────────────────────────
-- Realtime: enable for messages table
-- ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.messages;

-- ──────────────────────────────────────────────────────────────
-- Row Level Security
-- ──────────────────────────────────────────────────────────────

alter table public.users    enable row level security;
alter table public.pairs    enable row level security;
alter table public.messages enable row level security;

-- users: can only read/update own row
create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id);

create policy "users_insert_own"
  on public.users for insert
  with check (auth.uid() = id);

-- pairs: can read pair where you are a member
create policy "pairs_select_member"
  on public.pairs for select
  using (auth.uid() = user1_id or auth.uid() = user2_id);

-- messages: can read messages in your pair
create policy "messages_select_own_pair"
  on public.messages for select
  using (
    exists (
      select 1 from public.pairs p
      where p.id = messages.pair_id
        and (p.user1_id = auth.uid() or p.user2_id = auth.uid())
    )
  );

-- messages: can insert only into your own pair, as yourself
create policy "messages_insert_own_pair"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and (p.user1_id = auth.uid() or p.user2_id = auth.uid())
    )
  );

-- ──────────────────────────────────────────────────────────────
-- Function: match_user(requesting_user_id uuid)
-- Called server-side after signup to attempt matching
-- ──────────────────────────────────────────────────────────────
create or replace function public.match_user(requesting_user_id uuid)
returns void
language plpgsql
security definer  -- runs as the DB owner, bypasses RLS for matching
set search_path = public
as $$
declare
  v_grad_year    int;
  v_partner_id   uuid;
  v_pair_id      uuid;
begin
  -- Fetch the requesting user's grad year
  select grad_year into v_grad_year
  from public.users
  where id = requesting_user_id;

  -- Guard: user not found
  if v_grad_year is null then
    raise exception 'User % not found', requesting_user_id;
  end if;

  -- Find a waiting partner with the same grad year (not the same user)
  select id into v_partner_id
  from public.users
  where status = 'waiting'
    and grad_year = v_grad_year
    and id <> requesting_user_id
  order by created_at asc   -- FIFO fairness
  limit 1
  for update skip locked;   -- prevent race conditions

  -- No partner found → user stays waiting
  if v_partner_id is null then
    return;
  end if;

  -- Create pair
  insert into public.pairs (user1_id, user2_id)
  values (requesting_user_id, v_partner_id)
  returning id into v_pair_id;

  -- Update both users to matched
  update public.users
  set status = 'matched', pair_id = v_pair_id
  where id in (requesting_user_id, v_partner_id);
end;
$$;

-- Only authenticated users may call match_user on themselves
-- (Edge Function enforces caller = requesting_user_id)
revoke all on function public.match_user(uuid) from public;
grant execute on function public.match_user(uuid) to service_role;

-- ──────────────────────────────────────────────────────────────
-- Function: get_my_status()  – safe polling helper
-- Returns { status, pair_id } for the calling user
-- ──────────────────────────────────────────────────────────────
create or replace function public.get_my_status()
returns table(status user_status, pair_id uuid)
language sql
security definer
set search_path = public
as $$
  select status, pair_id
  from public.users
  where id = auth.uid();
$$;

grant execute on function public.get_my_status() to authenticated;
