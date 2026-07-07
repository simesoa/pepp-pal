-- ============================================================
-- Penn Pal – Migration 005: Pilot hardening fixes
-- Run after 004_web_rpc.sql. Idempotent — safe to re-run.
--
-- Fixes:
--   1. RLS privilege escalation: users could INSERT/UPDATE privileged
--      columns (is_admin, is_banned, status, pair_id) on their own row.
--   2. match_user(): could create duplicate active pairs, match banned
--      users, match blocked users, and race under concurrent signups.
--   3. deactivate_pair_and_rematch(): failed for a partner whose pair was
--      already deactivated (stuck 'matched' forever); blocking never
--      recorded a blocks row, so blocked users could be re-paired.
--   4. register_and_match(): could change grad_year / clobber state for an
--      already-matched user and ran matching for banned users.
--   5. New poll_and_match(): waiting-screen poll that retries matching,
--      self-healing missed matches.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Column-level write protection on public.users
--    Users may INSERT only identity columns (registration fallback) and
--    UPDATE only their prompt. Everything else goes through
--    security-definer RPCs.
-- ──────────────────────────────────────────────────────────────
revoke insert, update on table public.users from authenticated, anon;
grant insert (id, email, grad_year, prompt) on table public.users to authenticated;
grant update (prompt) on table public.users to authenticated;

-- Recreate the update policy with an explicit WITH CHECK
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ──────────────────────────────────────────────────────────────
-- 2. Race-safe, ban/block-aware matching
-- ──────────────────────────────────────────────────────────────
create or replace function public.match_user(requesting_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grad_year  int;
  v_status     user_status;
  v_banned     boolean;
  v_partner_id uuid;
  v_pair_id    uuid;
begin
  -- Lock the requester's row first: serializes concurrent attempts for the
  -- same user and lets other matchers skip us via SKIP LOCKED.
  select grad_year, status, is_banned
  into v_grad_year, v_status, v_banned
  from public.users
  where id = requesting_user_id
  for update;

  if not found then
    raise exception 'User % not found', requesting_user_id;
  end if;

  -- Banned users never match; matched users never get a second pair.
  if v_banned or v_status = 'matched' then
    return;
  end if;

  -- Find a waiting partner: same grad year, not self, not banned, and no
  -- block in either direction.
  select u.id into v_partner_id
  from public.users u
  where u.status = 'waiting'
    and u.grad_year = v_grad_year
    and u.id <> requesting_user_id
    and u.is_banned = false
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = requesting_user_id and b.blocked_user_id = u.id)
         or (b.blocker_id = u.id and b.blocked_user_id = requesting_user_id)
    )
  order by u.created_at asc   -- FIFO fairness
  limit 1
  for update skip locked;     -- skip rows locked by concurrent matchers

  if v_partner_id is null then
    return;
  end if;

  insert into public.pairs (user1_id, user2_id)
  values (requesting_user_id, v_partner_id)
  returning id into v_pair_id;

  update public.users
  set status = 'matched', pair_id = v_pair_id
  where id in (requesting_user_id, v_partner_id);
end;
$$;

revoke all on function public.match_user(uuid) from public;
grant execute on function public.match_user(uuid) to service_role;

-- ──────────────────────────────────────────────────────────────
-- 3. deactivate_pair_and_rematch: handle inactive pairs + record blocks
--    Drop the old 2-arg version first so PostgREST has no ambiguous overload.
-- ──────────────────────────────────────────────────────────────
drop function if exists public.deactivate_pair_and_rematch(uuid, boolean);

create or replace function public.deactivate_pair_and_rematch(
  p_pair_id uuid,
  p_both    boolean default true,
  p_block   boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user1   uuid;
  v_user2   uuid;
  v_active  boolean;
  v_partner uuid;
begin
  -- Membership check only — an already-inactive pair must still be leavable
  -- (the partner of a rematcher was previously stuck 'matched' forever).
  select user1_id, user2_id, active
  into v_user1, v_user2, v_active
  from public.pairs
  where id = p_pair_id
    and (user1_id = auth.uid() or user2_id = auth.uid());

  if not found then
    raise exception 'Pair % not found or not a member', p_pair_id;
  end if;

  v_partner := case when v_user1 = auth.uid() then v_user2 else v_user1 end;

  if v_active then
    update public.pairs set active = false where id = p_pair_id;
  end if;

  -- Blocking records a block so match_user never re-pairs these two.
  if p_block then
    insert into public.blocks (blocker_id, blocked_user_id)
    values (auth.uid(), v_partner)
    on conflict (blocker_id, blocked_user_id) do nothing;
  end if;

  -- Caller always returns to waiting (only if still attached to this pair).
  update public.users
  set status = 'waiting', pair_id = null
  where id = auth.uid() and (pair_id = p_pair_id or pair_id is null);

  -- Partner returns to waiting only for a both-sided end of an active pair,
  -- and only if they haven't already moved on to a new pair.
  if p_both and v_active then
    update public.users
    set status = 'waiting', pair_id = null
    where id = v_partner and pair_id = p_pair_id;
  end if;

  -- Attempt immediate re-match for the caller (no-ops if banned/matched).
  perform public.match_user(auth.uid());
end;
$$;

grant execute on function public.deactivate_pair_and_rematch(uuid, boolean, boolean) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4. register_and_match: never mutate a matched user's state, never match
--    banned users, and preserve the existing prompt when none is supplied.
-- ──────────────────────────────────────────────────────────────
create or replace function public.register_and_match(
  p_grad_year int,
  p_prompt    text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_status  user_status;
  v_pair_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_grad_year < 2024 or p_grad_year > 2040 then
    raise exception 'Invalid grad_year: %', p_grad_year;
  end if;

  select email into v_email
  from auth.users
  where id = v_uid;

  insert into public.users (id, email, grad_year, prompt, status)
  values (v_uid, v_email, p_grad_year, p_prompt, 'waiting')
  on conflict (id) do update
    set grad_year = case
          when public.users.status = 'waiting' then excluded.grad_year
          else public.users.grad_year
        end,
        prompt = coalesce(excluded.prompt, public.users.prompt);

  perform public.match_user(v_uid);

  select status, pair_id into v_status, v_pair_id
  from public.users
  where id = v_uid;

  return json_build_object('status', v_status, 'pair_id', v_pair_id);
end;
$$;

grant execute on function public.register_and_match(int, text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. poll_and_match(): called by the waiting screen every 5s. Retries
--    matching (self-heals races/missed matches) and returns current status.
--    Returns zero rows when the caller has no users row yet.
-- ──────────────────────────────────────────────────────────────
create or replace function public.poll_and_match()
returns table(status user_status, pair_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status user_status;
  v_banned boolean;
begin
  select u.status, u.is_banned into v_status, v_banned
  from public.users u
  where u.id = auth.uid();

  if not found then
    return;  -- no row → caller shows registration recovery
  end if;

  if v_status = 'waiting' and not v_banned then
    perform public.match_user(auth.uid());
  end if;

  return query
    select u.status, u.pair_id
    from public.users u
    where u.id = auth.uid();
end;
$$;

grant execute on function public.poll_and_match() to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 6. delete_user_account(p_user_id): service-role variant used by the
--    delete-account Edge Function. delete_my_account() relies on auth.uid(),
--    which is NULL in a service-role context — the Edge Function was
--    silently skipping pair cleanup and leaving the partner stuck 'matched'.
-- ──────────────────────────────────────────────────────────────
create or replace function public.delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair_id uuid;
begin
  select pair_id into v_pair_id
  from public.users
  where id = p_user_id;

  if v_pair_id is not null then
    update public.pairs
    set active = false
    where id = v_pair_id and active = true;

    -- Free the partner so they re-enter the matching pool
    update public.users
    set status = 'waiting', pair_id = null
    where pair_id = v_pair_id
      and id <> p_user_id;
  end if;

  -- Delete the auth account. Cascades: auth.users → public.users → pairs →
  -- messages/reports/blocks referencing them.
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_user_account(uuid) from public;
grant execute on function public.delete_user_account(uuid) to service_role;
