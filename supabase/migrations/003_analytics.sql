-- ============================================================
-- Penn Pal – Analytics + Pilot Stats Migration (003)
-- Run after 002_pilot.sql
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. analytics_events table
-- Privacy-first: stores no PII, no message content.
-- user_id is nullable so pre-auth events can still be logged.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.analytics_events (
  id         bigserial primary key,
  user_id    uuid references public.users(id) on delete set null,
  event      text not null,
  properties jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_event_name_idx on public.analytics_events(event);
create index if not exists analytics_created_at_idx  on public.analytics_events(created_at desc);

alter table public.analytics_events enable row level security;

-- Users may only insert their own events
drop policy if exists "analytics_insert_own" on public.analytics_events;
create policy "analytics_insert_own"
  on public.analytics_events for insert
  with check (user_id = auth.uid() or user_id is null);

-- Users cannot read analytics (prevents gaming)
-- Admins access via service_role / admin RPC

-- ──────────────────────────────────────────────────────────────
-- 2. log_event(event, properties) – client-callable helper
-- Wraps the insert so the client never touches the table directly.
-- Fire-and-forget: errors are swallowed server-side.
-- ──────────────────────────────────────────────────────────────
create or replace function public.log_event(
  p_event      text,
  p_properties jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_events (user_id, event, properties)
  values (auth.uid(), p_event, p_properties);
exception when others then
  -- Never let analytics break user flows
  null;
end;
$$;

grant execute on function public.log_event(text, jsonb) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3. admin_get_pilot_stats()
-- Returns a single JSON object with current snapshot stats.
-- ──────────────────────────────────────────────────────────────
create or replace function public.admin_get_pilot_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.assert_admin();

  select jsonb_build_object(
    'total_users',       (select count(*) from public.users where not is_banned),
    'banned_users',      (select count(*) from public.users where is_banned),
    'waiting_users',     (select count(*) from public.users where status = 'waiting' and not is_banned),
    'matched_users',     (select count(*) from public.users where status = 'matched' and not is_banned),
    'active_pairs',      (select count(*) from public.pairs where active = true),
    'inactive_pairs',    (select count(*) from public.pairs where active = false),
    'open_reports',      (select count(*) from public.reports where status = 'open'),
    'total_messages',    (select count(*) from public.messages),
    'waiting_by_year', (
      select jsonb_object_agg(grad_year::text, cnt)
      from (
        select grad_year, count(*) as cnt
        from public.users
        where status = 'waiting' and not is_banned
        group by grad_year
        order by grad_year
      ) t
    ),
    'matched_by_year', (
      select jsonb_object_agg(grad_year::text, cnt)
      from (
        select grad_year, count(*) as cnt
        from public.users
        where status = 'matched' and not is_banned
        group by grad_year
        order by grad_year
      ) t
    ),
    'event_counts', (
      select jsonb_object_agg(event, cnt)
      from (
        select event, count(*) as cnt
        from public.analytics_events
        where created_at > now() - interval '30 days'
        group by event
        order by cnt desc
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.admin_get_pilot_stats() to authenticated;
