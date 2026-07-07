-- ============================================================
-- Penn Pal – Beta Migration (run after schema.sql)
-- Adds: reports, blocks, moderation fields, inactive match
--       support, and account-deletion helper function.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Admin-ready fields on existing tables
-- ──────────────────────────────────────────────────────────────

-- users: is_banned flag for moderation
alter table public.users
  add column if not exists is_banned boolean not null default false;

-- pairs: active flag + last_message_at for inactive-match handling
alter table public.pairs
  add column if not exists active boolean not null default true;

alter table public.pairs
  add column if not exists last_message_at timestamptz;

-- Index to find stale active pairs quickly
create index if not exists pairs_active_last_message_idx
  on public.pairs(active, last_message_at)
  where active = true;

-- ──────────────────────────────────────────────────────────────
-- 2. Table: reports
-- ──────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id          uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  pair_id     uuid not null references public.pairs(id) on delete cascade,
  reason      text not null check (char_length(reason) > 0 and char_length(reason) <= 500),
  status      text not null default 'open'
                check (status in ('open', 'reviewed', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);

create index if not exists reports_pair_id_idx on public.reports(pair_id);
create index if not exists reports_status_idx  on public.reports(status);

alter table public.reports enable row level security;

-- Users can only insert reports for pairs they belong to
drop policy if exists "reports_insert_own_pair" on public.reports;
create policy "reports_insert_own_pair"
  on public.reports for insert
  with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and (p.user1_id = auth.uid() or p.user2_id = auth.uid())
    )
  );

-- Users cannot read reports (prevents gaming the system)
-- Admins access via service role

-- ──────────────────────────────────────────────────────────────
-- 3. Table: blocks
-- ──────────────────────────────────────────────────────────────
create table if not exists public.blocks (
  id              uuid primary key default uuid_generate_v4(),
  blocker_id      uuid not null references public.users(id) on delete cascade,
  blocked_user_id uuid not null references public.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint no_self_block check (blocker_id <> blocked_user_id),
  constraint blocks_unique unique (blocker_id, blocked_user_id)
);

alter table public.blocks enable row level security;

-- Users can insert their own blocks
drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
  on public.blocks for insert
  with check (blocker_id = auth.uid());

-- Users can read their own blocks
drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own"
  on public.blocks for select
  using (blocker_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- 4. Function: report_conversation(p_pair_id, p_reason)
-- Inserts a report record; safe to call from client via RPC.
-- ──────────────────────────────────────────────────────────────
create or replace function public.report_conversation(
  p_pair_id uuid,
  p_reason  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify caller is a member of this pair
  if not exists (
    select 1 from public.pairs
    where id = p_pair_id
      and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'Not a member of this pair';
  end if;

  insert into public.reports (reporter_id, pair_id, reason)
  values (auth.uid(), p_pair_id, p_reason);
end;
$$;

grant execute on function public.report_conversation(uuid, text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. Function: deactivate_pair_and_rematch(p_pair_id, p_both)
-- Deactivates a pair and returns one or both users to waiting.
-- p_both = true  → both users go to waiting (block/rematch)
-- p_both = false → only caller goes to waiting (request rematch)
-- ──────────────────────────────────────────────────────────────
create or replace function public.deactivate_pair_and_rematch(
  p_pair_id uuid,
  p_both    boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user1 uuid;
  v_user2 uuid;
  v_partner uuid;
begin
  -- Verify caller is a member and pair is active
  select user1_id, user2_id into v_user1, v_user2
  from public.pairs
  where id = p_pair_id
    and active = true
    and (user1_id = auth.uid() or user2_id = auth.uid());

  if not found then
    raise exception 'Active pair % not found or not a member', p_pair_id;
  end if;

  v_partner := case when v_user1 = auth.uid() then v_user2 else v_user1 end;

  -- Deactivate the pair
  update public.pairs
  set active = false
  where id = p_pair_id;

  if p_both then
    -- Both users return to waiting (block or mutual rematch)
    update public.users
    set status = 'waiting', pair_id = null
    where id in (auth.uid(), v_partner);
  else
    -- Only the requesting user returns to waiting
    update public.users
    set status = 'waiting', pair_id = null
    where id = auth.uid();
    -- Partner keeps their pair_id / matched status until they also act
    -- (they will see an inactive pair notice and can also rematch)
  end if;

  -- Attempt immediate re-match for the requesting user
  perform public.match_user(auth.uid());
end;
$$;

grant execute on function public.deactivate_pair_and_rematch(uuid, boolean) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 6. Function: delete_my_account()
-- Anonymizes user profile data then deletes the auth.users row.
-- Deletion of auth.users cascades to public.users via FK.
-- ──────────────────────────────────────────────────────────────
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair_id uuid;
begin
  -- Capture current pair so we can deactivate it
  select pair_id into v_pair_id
  from public.users
  where id = auth.uid();

  -- Deactivate active pair if exists
  if v_pair_id is not null then
    update public.pairs
    set active = false
    where id = v_pair_id and active = true;

    -- Return partner to waiting
    update public.users
    set status = 'waiting', pair_id = null
    where pair_id = v_pair_id
      and id <> auth.uid();
  end if;

  -- Anonymize the public profile (soft-delete approach)
  -- Messages are preserved under anonymised sender for context/moderation
  update public.users
  set email      = 'deleted-' || auth.uid() || '@deleted.invalid',
      prompt     = null,
      status     = 'waiting',
      pair_id    = null
  where id = auth.uid();

  -- Hard-delete the auth account (cascades to public.users via FK)
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only service role should call this; the mobile app calls via Edge Function
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to service_role;

-- ──────────────────────────────────────────────────────────────
-- 7. Trigger: keep pairs.last_message_at in sync
-- ──────────────────────────────────────────────────────────────
create or replace function public.update_pair_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pairs
  set last_message_at = new.created_at
  where id = new.pair_id;
  return new;
end;
$$;

drop trigger if exists trg_update_pair_last_message on public.messages;
create trigger trg_update_pair_last_message
  after insert on public.messages
  for each row execute function public.update_pair_last_message();

-- ──────────────────────────────────────────────────────────────
-- 8. RLS: messages must belong to an active pair
--    (prevents sending to deactivated pairs)
-- ──────────────────────────────────────────────────────────────
drop policy if exists "messages_insert_own_pair" on public.messages;

create policy "messages_insert_own_pair"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and p.active = true
        and (p.user1_id = auth.uid() or p.user2_id = auth.uid())
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 9. Banned users cannot do anything
-- ──────────────────────────────────────────────────────────────
drop policy if exists "messages_insert_own_pair" on public.messages;
create policy "messages_insert_own_pair"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and (select not is_banned from public.users where id = auth.uid())
    and exists (
      select 1 from public.pairs p
      where p.id = pair_id
        and p.active = true
        and (p.user1_id = auth.uid() or p.user2_id = auth.uid())
    )
  );
