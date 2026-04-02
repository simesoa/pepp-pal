-- ============================================================
-- Penn Pal – Pilot Migration (run after 001_beta.sql)
-- Adds: is_admin flag, admin RPC functions, RLS for admin access
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Admin flag on users
-- ──────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists is_admin boolean not null default false;

-- Index for fast admin lookup
create index if not exists users_is_admin_idx on public.users(is_admin) where is_admin = true;

-- ──────────────────────────────────────────────────────────────
-- 2. Helper: assert_admin()
-- Raises an exception if the calling user is not an admin.
-- Called at the top of every admin function.
-- ──────────────────────────────────────────────────────────────
create or replace function public.assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Forbidden: admin access required';
  end if;
end;
$$;

revoke all on function public.assert_admin() from public;
grant execute on function public.assert_admin() to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3. admin_get_reports(p_status)
-- Returns reports filtered by status (null = all).
-- ──────────────────────────────────────────────────────────────
create or replace function public.admin_get_reports(p_status text default null)
returns table(
  id          uuid,
  reporter_id uuid,
  pair_id     uuid,
  reason      text,
  status      text,
  created_at  timestamptz,
  -- joined fields
  reporter_email  text,
  pair_user1_id   uuid,
  pair_user2_id   uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
    select
      r.id,
      r.reporter_id,
      r.pair_id,
      r.reason,
      r.status,
      r.created_at,
      u.email        as reporter_email,
      p.user1_id     as pair_user1_id,
      p.user2_id     as pair_user2_id
    from public.reports r
    join public.users u on u.id = r.reporter_id
    join public.pairs p on p.id = r.pair_id
    where (p_status is null or r.status = p_status)
    order by r.created_at desc;
end;
$$;

grant execute on function public.admin_get_reports(text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4. admin_update_report_status(p_report_id, p_status)
-- ──────────────────────────────────────────────────────────────
create or replace function public.admin_update_report_status(
  p_report_id uuid,
  p_status    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  if p_status not in ('open', 'reviewed', 'resolved', 'dismissed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update public.reports
  set status = p_status
  where id = p_report_id;
end;
$$;

grant execute on function public.admin_update_report_status(uuid, text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5. admin_get_users(p_limit, p_offset)
-- Returns paginated user list with pair info.
-- ──────────────────────────────────────────────────────────────
create or replace function public.admin_get_users(
  p_limit  int default 50,
  p_offset int default 0
)
returns table(
  id         uuid,
  email      text,
  grad_year  int,
  status     user_status,
  is_banned  boolean,
  is_admin   boolean,
  pair_id    uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
    select
      u.id,
      u.email,
      u.grad_year,
      u.status,
      u.is_banned,
      u.is_admin,
      u.pair_id,
      u.created_at
    from public.users u
    order by u.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;

grant execute on function public.admin_get_users(int, int) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 6. admin_set_ban(p_user_id, p_banned)
-- Ban or unban a user. Banning also deactivates their active pair.
-- ──────────────────────────────────────────────────────────────
create or replace function public.admin_set_ban(
  p_user_id uuid,
  p_banned  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair_id uuid;
begin
  perform public.assert_admin();

  -- Fetch current pair
  select pair_id into v_pair_id
  from public.users
  where id = p_user_id;

  -- When banning: deactivate pair and return partner to waiting
  if p_banned and v_pair_id is not null then
    update public.pairs
    set active = false
    where id = v_pair_id and active = true;

    update public.users
    set status = 'waiting', pair_id = null
    where pair_id = v_pair_id and id <> p_user_id;
  end if;

  update public.users
  set is_banned = p_banned,
      -- Also clear pair from banned user
      pair_id   = case when p_banned then null else pair_id end,
      status    = case when p_banned then 'waiting' else status end
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 7. admin_get_report_messages(p_pair_id, p_limit)
-- Returns recent messages for a reported pair (for review).
-- ──────────────────────────────────────────────────────────────
create or replace function public.admin_get_report_messages(
  p_pair_id uuid,
  p_limit   int default 50
)
returns table(
  id         uuid,
  sender_id  uuid,
  content    text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
    select m.id, m.sender_id, m.content, m.created_at
    from public.messages m
    where m.pair_id = p_pair_id
    order by m.created_at desc
    limit p_limit;
end;
$$;

grant execute on function public.admin_get_report_messages(uuid, int) to authenticated;
