-- ============================================================
-- Penn Pal – Migration 006: Feature Wave 1
-- Run after 005_pilot_fixes.sql. Idempotent — safe to re-run.
--
-- Adds:
--   1. app_config          – admin-managed global switches
--   2. schools             – same-school matching by .edu domain
--   3. cohorts + reveal    – graduation identity reveal flow
--   4. push notifications  – tokens, preferences, event queue
--   5. rate limiting       – server-side send_message + abuse events
--   6. read receipts       – pair-level read state
--   7. matching v2         – school-aware, report-aware, shared
--                            contract for RPC + Edge Function paths
--   8. admin RPCs for all of the above
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. app_config: global switches (admin writes via RPC only)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
revoke all on table public.app_config from authenticated, anon;

insert into public.app_config (key, value) values
  ('cross_school_matching_enabled', 'false'::jsonb),
  ('allow_unknown_schools',         'true'::jsonb),
  ('ai_prompts_enabled',            'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_config_bool(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value::text = 'true' from public.app_config where key = p_key), false);
$$;
revoke all on function public.get_config_bool(text) from public;

-- Client-readable snapshot of the non-sensitive switches
create or replace function public.get_public_config()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'ai_prompts_enabled',    public.get_config_bool('ai_prompts_enabled'),
    'allow_unknown_schools', public.get_config_bool('allow_unknown_schools')
  );
$$;
grant execute on function public.get_public_config() to authenticated, anon;

-- ──────────────────────────────────────────────────────────────
-- 2. Schools
-- ──────────────────────────────────────────────────────────────
create table if not exists public.schools (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  primary_domain  text not null unique,
  allowed_domains text[] not null default '{}',
  status          text not null default 'active'
                    check (status in ('active', 'pending', 'inactive')),
  cross_school_matching_enabled boolean not null default false,
  reveal_date     date,
  created_at      timestamptz not null default now()
);

alter table public.schools enable row level security;
revoke all on table public.schools from authenticated, anon;

alter table public.users add column if not exists school_id uuid references public.schools(id);
create index if not exists users_school_id_idx on public.users(school_id);

-- Domain → school resolution. Creates an active school on first sight when
-- allow_unknown_schools is on (pilot default); returns null otherwise.
create or replace function public.resolve_school_for_domain(p_domain text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := lower(trim(p_domain));
  v_id     uuid;
begin
  if v_domain is null or v_domain = '' then
    return null;
  end if;

  select id into v_id
  from public.schools
  where primary_domain = v_domain or v_domain = any(allowed_domains)
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  if public.get_config_bool('allow_unknown_schools') then
    insert into public.schools (name, primary_domain, status)
    values (initcap(replace(split_part(v_domain, '.', 1), '-', ' ')), v_domain, 'active')
    on conflict (primary_domain) do update set primary_domain = excluded.primary_domain
    returning id into v_id;
    return v_id;
  end if;

  return null;
end;
$$;
revoke all on function public.resolve_school_for_domain(text) from public;

-- Signup-time UX: "School detected: X" / "not open at this school yet".
-- Read-only — never creates a school row.
create or replace function public.get_school_for_domain(p_domain text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select json_build_object('name', s.name, 'status', s.status)
     from public.schools s
     where s.primary_domain = lower(trim(p_domain))
        or lower(trim(p_domain)) = any(s.allowed_domains)
     limit 1),
    case when public.get_config_bool('allow_unknown_schools')
         then json_build_object('name', null, 'status', 'new')
         else json_build_object('name', null, 'status', 'unsupported')
    end
  );
$$;
grant execute on function public.get_school_for_domain(text) to authenticated, anon;

-- Backfill existing users' school from their email domain
do $$
declare r record;
begin
  for r in select id, email from public.users where school_id is null loop
    update public.users
    set school_id = public.resolve_school_for_domain(split_part(r.email, '@', 2))
    where id = r.id;
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────
-- 3. Cohorts + graduation reveal
-- ──────────────────────────────────────────────────────────────
create table if not exists public.cohorts (
  id               uuid primary key default uuid_generate_v4(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  graduation_year  int not null,
  reveal_opens_at  timestamptz not null,
  reveal_closes_at timestamptz,
  status           text not null default 'active' check (status in ('active', 'disabled')),
  unique (school_id, graduation_year)
);

create table if not exists public.reveal_requests (
  id          uuid primary key default uuid_generate_v4(),
  pair_id     uuid not null references public.pairs(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  wants_reveal boolean not null,
  message     text check (message is null or char_length(message) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pair_id, user_id)
);

create table if not exists public.reveals (
  id          uuid primary key default uuid_generate_v4(),
  pair_id     uuid not null unique references public.pairs(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  user_a_id   uuid not null references public.users(id) on delete cascade,
  user_b_id   uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.cohorts         enable row level security;
alter table public.reveal_requests enable row level security;
alter table public.reveals         enable row level security;
revoke all on table public.cohorts, public.reveal_requests, public.reveals
  from authenticated, anon;

-- Admin can kill reveal for a pair after a serious report
alter table public.pairs add column if not exists reveal_disabled boolean not null default false;

-- Post-reveal profile fields (delivered ONLY via get_reveal_state; the
-- users_select_own policy still hides other users' rows entirely).
alter table public.users add column if not exists display_name     text check (display_name is null or char_length(display_name) <= 60);
alter table public.users add column if not exists major            text check (major is null or char_length(major) <= 80);
alter table public.users add column if not exists contact_method   text check (contact_method is null or char_length(contact_method) <= 200);
alter table public.users add column if not exists farewell_message text check (farewell_message is null or char_length(farewell_message) <= 500);
alter table public.users add column if not exists show_read_receipts boolean not null default true;
alter table public.users add column if not exists cooldown_until   timestamptz;

-- Users may edit their own reveal profile + read-receipt setting directly
grant update (prompt, display_name, major, contact_method, farewell_message, show_read_receipts)
  on table public.users to authenticated;

-- Reveal eligibility. Returns a reason string, or null when reveal may proceed.
create or replace function public.reveal_block_reason(p_pair_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pair    public.pairs%rowtype;
  v_u1      public.users%rowtype;
  v_u2      public.users%rowtype;
  v_cohort  public.cohorts%rowtype;
begin
  select * into v_pair from public.pairs where id = p_pair_id;
  if not found then return 'pair_not_found'; end if;
  if v_pair.reveal_disabled then return 'disabled_by_admin'; end if;

  select * into v_u1 from public.users where id = v_pair.user1_id;
  select * into v_u2 from public.users where id = v_pair.user2_id;
  if not found or v_u1.id is null then return 'pair_not_found'; end if;
  if v_u1.is_banned or v_u2.is_banned then return 'banned'; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_u1.id and b.blocked_user_id = v_u2.id)
       or (b.blocker_id = v_u2.id and b.blocked_user_id = v_u1.id)
  ) then return 'blocked'; end if;

  -- Unresolved report between the two blocks reveal
  if exists (
    select 1 from public.reports r
    join public.pairs p2 on p2.id = r.pair_id
    where r.status in ('open', 'reviewed')
      and ((p2.user1_id = v_u1.id and p2.user2_id = v_u2.id)
        or (p2.user1_id = v_u2.id and p2.user2_id = v_u1.id))
  ) then return 'unresolved_report'; end if;

  select * into v_cohort
  from public.cohorts
  where school_id = v_u1.school_id and graduation_year = v_u1.grad_year;
  if not found then return 'no_cohort'; end if;
  if v_cohort.status <> 'active' then return 'cohort_disabled'; end if;
  if now() < v_cohort.reveal_opens_at then return 'not_open_yet'; end if;
  if v_cohort.reveal_closes_at is not null and now() > v_cohort.reveal_closes_at then
    return 'window_closed';
  end if;

  return null;
end;
$$;
revoke all on function public.reveal_block_reason(uuid) from public;

-- Full reveal state for the calling pair member. Partner identity is only
-- included after MUTUAL opt-in with no blocking condition.
create or replace function public.get_reveal_state(p_pair_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pair     public.pairs%rowtype;
  v_partner  uuid;
  v_cohort   public.cohorts%rowtype;
  v_reason   text;
  v_mine     public.reveal_requests%rowtype;
  v_theirs   public.reveal_requests%rowtype;
  v_revealed boolean;
  v_profile  json;
begin
  select * into v_pair
  from public.pairs
  where id = p_pair_id and (user1_id = auth.uid() or user2_id = auth.uid());
  if not found then raise exception 'Pair not found or not a member'; end if;

  v_partner := case when v_pair.user1_id = auth.uid() then v_pair.user2_id else v_pair.user1_id end;
  v_reason  := public.reveal_block_reason(p_pair_id);

  select c.* into v_cohort
  from public.cohorts c
  join public.users u on u.school_id = c.school_id and u.grad_year = c.graduation_year
  where u.id = auth.uid();

  select * into v_mine   from public.reveal_requests where pair_id = p_pair_id and user_id = auth.uid();
  select * into v_theirs from public.reveal_requests where pair_id = p_pair_id and user_id = v_partner;

  v_revealed := exists (select 1 from public.reveals where pair_id = p_pair_id);

  if v_revealed then
    select json_build_object(
      'display_name',     u.display_name,
      'major',            u.major,
      'contact_method',   u.contact_method,
      'farewell_message', u.farewell_message,
      'grad_year',        u.grad_year
    ) into v_profile
    from public.users u where u.id = v_partner;
  end if;

  return json_build_object(
    'unlocked',         v_reason is null,
    'block_reason',     v_reason,
    'opens_at',         v_cohort.reveal_opens_at,
    'closes_at',        v_cohort.reveal_closes_at,
    'my_opt_in',        v_mine.wants_reveal,
    'partner_opt_in',   v_theirs.wants_reveal,
    'partner_message',  case when coalesce(v_theirs.wants_reveal, false) then v_theirs.message end,
    'revealed',         v_revealed,
    'partner_profile',  v_profile
  );
end;
$$;
grant execute on function public.get_reveal_state(uuid) to authenticated;

-- Opt in / out of reveal. Mutual opt-in (while unlocked) creates the reveal.
create or replace function public.request_reveal(
  p_pair_id uuid,
  p_wants   boolean,
  p_message text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair    public.pairs%rowtype;
  v_partner uuid;
  v_reason  text;
  v_theirs  boolean;
begin
  select * into v_pair
  from public.pairs
  where id = p_pair_id and (user1_id = auth.uid() or user2_id = auth.uid());
  if not found then raise exception 'Pair not found or not a member'; end if;

  -- Rate limit: 5 reveal actions per day
  if (select count(*) from public.abuse_events
      where user_id = auth.uid() and kind = 'reveal_request'
        and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited: too many reveal requests today';
  end if;
  insert into public.abuse_events (user_id, kind) values (auth.uid(), 'reveal_request');

  v_reason := public.reveal_block_reason(p_pair_id);
  if p_wants and v_reason is not null then
    raise exception 'reveal_blocked: %', v_reason;
  end if;

  v_partner := case when v_pair.user1_id = auth.uid() then v_pair.user2_id else v_pair.user1_id end;

  insert into public.reveal_requests (pair_id, user_id, wants_reveal, message)
  values (p_pair_id, auth.uid(), p_wants, p_message)
  on conflict (pair_id, user_id) do update
    set wants_reveal = excluded.wants_reveal,
        message      = excluded.message,
        updated_at   = now();

  select wants_reveal into v_theirs
  from public.reveal_requests
  where pair_id = p_pair_id and user_id = v_partner;

  if p_wants and coalesce(v_theirs, false)
     and not exists (select 1 from public.reveals where pair_id = p_pair_id) then
    insert into public.reveals (pair_id, user_a_id, user_b_id)
    values (p_pair_id, v_pair.user1_id, v_pair.user2_id);
    perform public.enqueue_notification(v_pair.user1_id, 'reveal_complete',
      'Reveal unlocked', 'You and your Pal both chose to reveal. Meet each other!', json_build_object('pair_id', p_pair_id)::jsonb);
    perform public.enqueue_notification(v_pair.user2_id, 'reveal_complete',
      'Reveal unlocked', 'You and your Pal both chose to reveal. Meet each other!', json_build_object('pair_id', p_pair_id)::jsonb);
  elsif p_wants then
    perform public.enqueue_notification(v_partner, 'reveal_request',
      'Your Pal is open to revealing', 'Your Pal has opted in to the graduation reveal.', json_build_object('pair_id', p_pair_id)::jsonb);
  end if;

  return public.get_reveal_state(p_pair_id);
end;
$$;
grant execute on function public.request_reveal(uuid, boolean, text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4. Push notifications: tokens, preferences, event queue
-- ──────────────────────────────────────────────────────────────
create table if not exists public.push_tokens (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.users(id) on delete cascade,
  token      text not null,
  platform   text check (platform in ('ios', 'android', 'web', 'unknown')),
  device_id  text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create table if not exists public.notification_preferences (
  user_id             uuid primary key references public.users(id) on delete cascade,
  messages            boolean not null default true,
  matches             boolean not null default true,
  checkins            boolean not null default true,
  reveal              boolean not null default true,
  safety_updates      boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start   time,
  quiet_hours_end     time,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.notification_events (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  type              text not null,
  title             text not null,
  body              text not null,
  data              jsonb not null default '{}'::jsonb,
  delivery_status   text not null default 'pending'
                      check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  provider_response jsonb,
  created_at        timestamptz not null default now(),
  delivered_at      timestamptz,
  read_at           timestamptz
);
create index if not exists notification_events_pending_idx
  on public.notification_events(delivery_status, created_at) where delivery_status = 'pending';
create index if not exists notification_events_user_idx
  on public.notification_events(user_id, created_at desc);

alter table public.push_tokens              enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events      enable row level security;

revoke all on table public.push_tokens from authenticated, anon;
revoke all on table public.notification_events from authenticated, anon;
-- preferences: users own their row entirely (no privileged columns)
grant select, insert, update on table public.notification_preferences to authenticated;

drop policy if exists "notification_prefs_own" on public.notification_preferences;
create policy "notification_prefs_own"
  on public.notification_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Token management via RPCs (keeps token values out of direct table access)
create or replace function public.register_push_token(
  p_token text, p_platform text default 'unknown', p_device_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.push_tokens (user_id, token, platform, device_id)
  values (auth.uid(), p_token, coalesce(p_platform, 'unknown'), p_device_id)
  on conflict (user_id, token) do update
    set is_active = true, platform = excluded.platform,
        device_id = excluded.device_id, updated_at = now();
end;
$$;
grant execute on function public.register_push_token(text, text, text) to authenticated;

create or replace function public.deactivate_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_tokens
  set is_active = false, updated_at = now()
  where user_id = auth.uid() and token = p_token;
$$;
grant execute on function public.deactivate_push_token(text) to authenticated;

-- Enqueue a notification for a user, respecting their preferences.
-- Delivery happens asynchronously via the send-notification Edge Function.
-- NEVER raises — notification failures must not break user actions.
create or replace function public.enqueue_notification(
  p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefs public.notification_preferences%rowtype;
  v_allowed boolean := true;
begin
  select * into v_prefs from public.notification_preferences where user_id = p_user_id;
  if found then
    v_allowed := case
      when p_type in ('message')                                     then v_prefs.messages
      when p_type in ('match')                                       then v_prefs.matches
      when p_type in ('checkin', 'inactivity')                       then v_prefs.checkins
      when p_type in ('reveal_request', 'reveal_complete')           then v_prefs.reveal
      when p_type in ('report_update', 'ban', 'unban')               then v_prefs.safety_updates
      else true
    end;
  end if;

  insert into public.notification_events (user_id, type, title, body, data, delivery_status)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb),
          case when v_allowed then 'pending' else 'skipped' end);
exception when others then
  null;  -- never let notification plumbing break the calling action
end;
$$;
revoke all on function public.enqueue_notification(uuid, text, text, text, jsonb) from public;

-- ──────────────────────────────────────────────────────────────
-- 5. Rate limiting + abuse events
-- ──────────────────────────────────────────────────────────────
create table if not exists public.abuse_events (
  id         bigserial primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists abuse_events_user_kind_idx
  on public.abuse_events(user_id, kind, created_at desc);

alter table public.abuse_events enable row level security;
revoke all on table public.abuse_events from authenticated, anon;

-- Server-side message send with rate limits. Direct INSERT on messages is
-- revoked below, so limits cannot be bypassed by calling PostgREST directly.
create or replace function public.send_message(p_pair_id uuid, p_content text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_pair     public.pairs%rowtype;
  v_partner  uuid;
  v_cooldown timestamptz;
  v_banned   boolean;
  v_msg      public.messages%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_content is null or char_length(trim(p_content)) = 0 then
    raise exception 'Message is empty';
  end if;
  if char_length(p_content) > 2000 then
    raise exception 'Message is too long (2000 characters max)';
  end if;

  select is_banned, cooldown_until into v_banned, v_cooldown
  from public.users where id = v_uid;
  if v_banned then raise exception 'account_banned'; end if;

  -- Limit/cooldown outcomes are returned as {error: ...} rather than raised:
  -- a raise would roll back the abuse_events insert, so admins would never
  -- see rate-limit activity. Structural failures below still raise.
  if v_cooldown is not null and v_cooldown > now() then
    return json_build_object('error', 'cooldown_active', 'until', v_cooldown);
  end if;

  select * into v_pair
  from public.pairs
  where id = p_pair_id and active = true
    and (user1_id = v_uid or user2_id = v_uid);
  if not found then raise exception 'Active pair not found or not a member'; end if;

  -- Rate limits: 10/minute, 100/day
  if (select count(*) from public.messages
      where sender_id = v_uid and created_at > now() - interval '1 minute') >= 10 then
    insert into public.abuse_events (user_id, kind) values (v_uid, 'rate_limit_minute');
    return json_build_object('error', 'rate_limited_minute');
  end if;
  if (select count(*) from public.messages
      where sender_id = v_uid and created_at > now() - interval '1 day') >= 100 then
    insert into public.abuse_events (user_id, kind) values (v_uid, 'rate_limit_day');
    return json_build_object('error', 'rate_limited_day');
  end if;

  insert into public.messages (pair_id, sender_id, content)
  values (p_pair_id, v_uid, p_content)
  returning * into v_msg;

  v_partner := case when v_pair.user1_id = v_uid then v_pair.user2_id else v_pair.user1_id end;
  -- Payload never contains message text — just "you have a message".
  perform public.enqueue_notification(v_partner, 'message',
    'Your Pal sent you a message', 'Open Penn Pal to read it.',
    json_build_object('pair_id', p_pair_id)::jsonb);

  return row_to_json(v_msg);
end;
$$;
grant execute on function public.send_message(uuid, text) to authenticated;

-- Close the direct-insert path (RLS policy stays as defense in depth)
revoke insert on table public.messages from authenticated, anon;

-- Client reports a blocked identity-share attempt. 5+ in an hour triggers a
-- 30-minute message cooldown. Returns the cooldown state.
create or replace function public.record_identity_block()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.abuse_events (user_id, kind) values (auth.uid(), 'identity_block');

  select count(*) into v_count
  from public.abuse_events
  where user_id = auth.uid() and kind = 'identity_block'
    and created_at > now() - interval '1 hour';

  if v_count >= 5 then
    v_until := now() + interval '30 minutes';
    update public.users set cooldown_until = v_until where id = auth.uid();
    insert into public.abuse_events (user_id, kind, meta)
    values (auth.uid(), 'cooldown_applied', json_build_object('until', v_until)::jsonb);
  end if;

  return json_build_object('attempts_last_hour', v_count, 'cooldown_until', v_until);
end;
$$;
grant execute on function public.record_identity_block() to authenticated;

-- Report rate limit: 5/hour (wraps the existing report_conversation)
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
  if (select count(*) from public.abuse_events
      where user_id = auth.uid() and kind = 'report'
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited: too many reports this hour';
  end if;

  if not exists (
    select 1 from public.pairs
    where id = p_pair_id
      and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'Not a member of this pair';
  end if;

  insert into public.abuse_events (user_id, kind) values (auth.uid(), 'report');
  insert into public.reports (reporter_id, pair_id, reason)
  values (auth.uid(), p_pair_id, p_reason);
end;
$$;
grant execute on function public.report_conversation(uuid, text) to authenticated;

-- Rematch rate limit: 3/day (recreate 005's function with the check added)
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
  if (select count(*) from public.abuse_events
      where user_id = auth.uid() and kind = 'rematch'
        and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited: too many rematches today';
  end if;

  select user1_id, user2_id, active
  into v_user1, v_user2, v_active
  from public.pairs
  where id = p_pair_id
    and (user1_id = auth.uid() or user2_id = auth.uid());

  if not found then
    raise exception 'Pair % not found or not a member', p_pair_id;
  end if;

  insert into public.abuse_events (user_id, kind) values (auth.uid(), 'rematch');

  v_partner := case when v_user1 = auth.uid() then v_user2 else v_user1 end;

  if v_active then
    update public.pairs set active = false where id = p_pair_id;
  end if;

  if p_block then
    insert into public.blocks (blocker_id, blocked_user_id)
    values (auth.uid(), v_partner)
    on conflict (blocker_id, blocked_user_id) do nothing;
  end if;

  update public.users
  set status = 'waiting', pair_id = null
  where id = auth.uid() and (pair_id = p_pair_id or pair_id is null);

  if p_both and v_active then
    update public.users
    set status = 'waiting', pair_id = null
    where id = v_partner and pair_id = p_pair_id;
  end if;

  perform public.match_user(auth.uid());
end;
$$;
grant execute on function public.deactivate_pair_and_rematch(uuid, boolean, boolean) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 6. Read receipts (pair-level state, RPC-only access)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.pair_read_state (
  pair_id              uuid not null references public.pairs(id) on delete cascade,
  user_id              uuid not null references public.users(id) on delete cascade,
  last_read_message_id uuid references public.messages(id) on delete set null,
  last_read_at         timestamptz,
  primary key (pair_id, user_id)
);

alter table public.pair_read_state enable row level security;
revoke all on table public.pair_read_state from authenticated, anon;

create or replace function public.mark_pair_read(p_pair_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last uuid;
begin
  if not exists (
    select 1 from public.pairs
    where id = p_pair_id and (user1_id = auth.uid() or user2_id = auth.uid())
  ) then
    raise exception 'Pair not found or not a member';
  end if;

  select id into v_last
  from public.messages
  where pair_id = p_pair_id
  order by created_at desc
  limit 1;

  insert into public.pair_read_state (pair_id, user_id, last_read_message_id, last_read_at)
  values (p_pair_id, auth.uid(), v_last, now())
  on conflict (pair_id, user_id) do update
    set last_read_message_id = excluded.last_read_message_id,
        last_read_at         = excluded.last_read_at;
end;
$$;
grant execute on function public.mark_pair_read(uuid) to authenticated;

-- Chat metadata: partner's read state (hidden if they disabled read receipts).
create or replace function public.get_chat_meta(p_pair_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pair    public.pairs%rowtype;
  v_partner uuid;
  v_show    boolean;
  v_state   public.pair_read_state%rowtype;
begin
  select * into v_pair
  from public.pairs
  where id = p_pair_id and (user1_id = auth.uid() or user2_id = auth.uid());
  if not found then raise exception 'Pair not found or not a member'; end if;

  v_partner := case when v_pair.user1_id = auth.uid() then v_pair.user2_id else v_pair.user1_id end;
  select show_read_receipts into v_show from public.users where id = v_partner;
  select * into v_state from public.pair_read_state where pair_id = p_pair_id and user_id = v_partner;

  return json_build_object(
    'partner_last_read_message_id', case when v_show then v_state.last_read_message_id end,
    'partner_last_read_at',         case when v_show then v_state.last_read_at end,
    'reveal_available', exists (
      select 1 from public.cohorts c
      join public.users u on u.school_id = c.school_id and u.grad_year = c.graduation_year
      where u.id = auth.uid()
    )
  );
end;
$$;
grant execute on function public.get_chat_meta(uuid) to authenticated;

-- Unread count across the caller's active pair (for badges)
create or replace function public.get_unread_count()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pair uuid;
  v_last timestamptz;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  if v_pair is null then return 0; end if;
  select last_read_at into v_last
  from public.pair_read_state where pair_id = v_pair and user_id = auth.uid();
  return (
    select count(*)::int from public.messages
    where pair_id = v_pair and sender_id <> auth.uid()
      and created_at > coalesce(v_last, 'epoch'::timestamptz)
  );
end;
$$;
grant execute on function public.get_unread_count() to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 7. Matching v2: school-aware, report-aware, shared contract
-- ──────────────────────────────────────────────────────────────
create or replace function public.match_user(requesting_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me         public.users%rowtype;
  v_cross      boolean;
  v_partner_id uuid;
  v_pair_id    uuid;
begin
  -- Lock the requester's row first (race safety, see migration 005)
  select * into v_me
  from public.users
  where id = requesting_user_id
  for update;

  if not found then
    raise exception 'User % not found', requesting_user_id;
  end if;

  if v_me.is_banned or v_me.status = 'matched' then
    return;
  end if;

  v_cross := public.get_config_bool('cross_school_matching_enabled')
             or coalesce((select s.cross_school_matching_enabled
                          from public.schools s where s.id = v_me.school_id), false);

  select u.id into v_partner_id
  from public.users u
  where u.status = 'waiting'
    and u.grad_year = v_me.grad_year
    and u.id <> requesting_user_id
    and u.is_banned = false
    -- Same school unless cross-school pilot mode is explicitly enabled
    and (v_cross or (u.school_id is not distinct from v_me.school_id))
    -- No block in either direction
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = requesting_user_id and b.blocked_user_id = u.id)
         or (b.blocker_id = u.id and b.blocked_user_id = requesting_user_id)
    )
    -- No prior report between these two users (any pair they shared)
    and not exists (
      select 1 from public.reports r
      join public.pairs p2 on p2.id = r.pair_id
      where (p2.user1_id = requesting_user_id and p2.user2_id = u.id)
         or (p2.user1_id = u.id and p2.user2_id = requesting_user_id)
    )
  order by u.created_at asc
  limit 1
  for update skip locked;

  if v_partner_id is null then
    return;
  end if;

  insert into public.pairs (user1_id, user2_id)
  values (requesting_user_id, v_partner_id)
  returning id into v_pair_id;

  update public.users
  set status = 'matched', pair_id = v_pair_id
  where id in (requesting_user_id, v_partner_id);

  perform public.enqueue_notification(requesting_user_id, 'match',
    'You have a new Pal', 'You just matched with a classmate. Say hello!',
    json_build_object('pair_id', v_pair_id)::jsonb);
  perform public.enqueue_notification(v_partner_id, 'match',
    'You have a new Pal', 'You just matched with a classmate. Say hello!',
    json_build_object('pair_id', v_pair_id)::jsonb);
end;
$$;

revoke all on function public.match_user(uuid) from public;
grant execute on function public.match_user(uuid) to service_role;

-- Shared registration contract used by BOTH the web RPC path and the native
-- Edge Function path (which calls it via service role with an explicit uid).
-- Returns: { result: registered|waiting|matched|banned|unsupported_school,
--            status, pair_id, school_name }
create or replace function public.register_user_and_match(
  p_user_id   uuid,
  p_grad_year int,
  p_prompt    text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text;
  v_school_id uuid;
  v_school    text;
  v_status    user_status;
  v_pair_id   uuid;
  v_banned    boolean;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_grad_year < 2024 or p_grad_year > 2040 then
    raise exception 'Invalid grad_year: %', p_grad_year;
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'Auth user % not found', p_user_id;
  end if;

  v_school_id := public.resolve_school_for_domain(split_part(v_email, '@', 2));
  if v_school_id is null then
    return json_build_object('result', 'unsupported_school', 'status', null,
                             'pair_id', null, 'school_name', null);
  end if;

  insert into public.users (id, email, grad_year, prompt, status, school_id)
  values (p_user_id, v_email, p_grad_year, p_prompt, 'waiting', v_school_id)
  on conflict (id) do update
    set grad_year = case
          when public.users.status = 'waiting' then excluded.grad_year
          else public.users.grad_year
        end,
        prompt    = coalesce(excluded.prompt, public.users.prompt),
        school_id = coalesce(public.users.school_id, excluded.school_id);

  select is_banned into v_banned from public.users where id = p_user_id;
  if v_banned then
    return json_build_object('result', 'banned', 'status', null,
                             'pair_id', null, 'school_name', null);
  end if;

  perform public.match_user(p_user_id);

  select u.status, u.pair_id, s.name
  into v_status, v_pair_id, v_school
  from public.users u
  left join public.schools s on s.id = u.school_id
  where u.id = p_user_id;

  return json_build_object(
    'result',      case when v_status = 'matched' then 'matched' else 'waiting' end,
    'status',      v_status,
    'pair_id',     v_pair_id,
    'school_name', v_school
  );
end;
$$;
revoke all on function public.register_user_and_match(uuid, int, text) from public;
grant execute on function public.register_user_and_match(uuid, int, text) to service_role;

-- Web RPC path: same contract, caller identity from the JWT.
-- (Replaces the 004/005 version; return shape is a superset — the old
-- status/pair_id keys are still present, so older clients keep working.)
create or replace function public.register_and_match(
  p_grad_year int,
  p_prompt    text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return public.register_user_and_match(auth.uid(), p_grad_year, p_prompt);
end;
$$;
grant execute on function public.register_and_match(int, text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 8. Notifications for moderation actions
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

  select pair_id into v_pair_id
  from public.users
  where id = p_user_id;

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
      pair_id   = case when p_banned then null else pair_id end,
      status    = case when p_banned then 'waiting' else status end
  where id = p_user_id;

  perform public.enqueue_notification(p_user_id,
    case when p_banned then 'ban' else 'unban' end,
    case when p_banned then 'Account suspended' else 'Account restored' end,
    case when p_banned
      then 'Your account was suspended after a review. Contact support to appeal.'
      else 'Your account has been restored. Welcome back.' end,
    '{}'::jsonb);
end;
$$;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;

create or replace function public.admin_update_report_status(
  p_report_id uuid,
  p_status    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid;
begin
  perform public.assert_admin();

  if p_status not in ('open', 'reviewed', 'resolved', 'dismissed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update public.reports
  set status = p_status
  where id = p_report_id
  returning reporter_id into v_reporter;

  if v_reporter is not null and p_status in ('resolved', 'dismissed') then
    perform public.enqueue_notification(v_reporter, 'report_update',
      'Your report was reviewed',
      'Our team reviewed the conversation you reported. Thank you for keeping Penn Pal safe.',
      '{}'::jsonb);
  end if;
end;
$$;
grant execute on function public.admin_update_report_status(uuid, text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 9. Admin RPCs for the new systems
-- ──────────────────────────────────────────────────────────────
create or replace function public.admin_list_schools()
returns table(
  id uuid, name text, primary_domain text, allowed_domains text[],
  status text, cross_school_matching_enabled boolean, reveal_date date,
  user_count bigint, active_pair_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
    select s.id, s.name, s.primary_domain, s.allowed_domains, s.status,
           s.cross_school_matching_enabled, s.reveal_date,
           (select count(*) from public.users u where u.school_id = s.id),
           (select count(*) from public.pairs p
            join public.users u1 on u1.id = p.user1_id
            where p.active and u1.school_id = s.id)
    from public.schools s
    order by s.created_at desc;
end;
$$;
grant execute on function public.admin_list_schools() to authenticated;

create or replace function public.admin_upsert_school(
  p_id uuid, p_name text, p_primary_domain text,
  p_allowed_domains text[] default '{}',
  p_status text default 'active',
  p_cross_school boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform public.assert_admin();
  if p_status not in ('active', 'pending', 'inactive') then
    raise exception 'Invalid status: %', p_status;
  end if;
  if p_id is null then
    insert into public.schools (name, primary_domain, allowed_domains, status, cross_school_matching_enabled)
    values (p_name, lower(p_primary_domain), coalesce(p_allowed_domains, '{}'), p_status, p_cross_school)
    returning id into v_id;
  else
    update public.schools
    set name = p_name, primary_domain = lower(p_primary_domain),
        allowed_domains = coalesce(p_allowed_domains, '{}'),
        status = p_status, cross_school_matching_enabled = p_cross_school
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function public.admin_upsert_school(uuid, text, text, text[], text, boolean) to authenticated;

create or replace function public.admin_list_cohorts()
returns table(
  id uuid, school_id uuid, school_name text, graduation_year int,
  reveal_opens_at timestamptz, reveal_closes_at timestamptz, status text,
  member_count bigint, opt_in_count bigint, reveal_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return query
    select c.id, c.school_id, s.name, c.graduation_year,
           c.reveal_opens_at, c.reveal_closes_at, c.status,
           (select count(*) from public.users u
            where u.school_id = c.school_id and u.grad_year = c.graduation_year),
           (select count(*) from public.reveal_requests rr
            join public.users u2 on u2.id = rr.user_id
            where rr.wants_reveal and u2.school_id = c.school_id
              and u2.grad_year = c.graduation_year),
           (select count(*) from public.reveals rv
            join public.users u3 on u3.id = rv.user_a_id
            where u3.school_id = c.school_id and u3.grad_year = c.graduation_year)
    from public.cohorts c
    join public.schools s on s.id = c.school_id
    order by c.reveal_opens_at;
end;
$$;
grant execute on function public.admin_list_cohorts() to authenticated;

create or replace function public.admin_upsert_cohort(
  p_school_id uuid, p_graduation_year int,
  p_opens_at timestamptz, p_closes_at timestamptz default null,
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform public.assert_admin();
  if p_status not in ('active', 'disabled') then
    raise exception 'Invalid status: %', p_status;
  end if;
  insert into public.cohorts (school_id, graduation_year, reveal_opens_at, reveal_closes_at, status)
  values (p_school_id, p_graduation_year, p_opens_at, p_closes_at, p_status)
  on conflict (school_id, graduation_year) do update
    set reveal_opens_at = excluded.reveal_opens_at,
        reveal_closes_at = excluded.reveal_closes_at,
        status = excluded.status
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.admin_upsert_cohort(uuid, int, timestamptz, timestamptz, text) to authenticated;

create or replace function public.admin_set_pair_reveal_disabled(p_pair_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  update public.pairs set reveal_disabled = p_disabled where id = p_pair_id;
end;
$$;
grant execute on function public.admin_set_pair_reveal_disabled(uuid, boolean) to authenticated;

create or replace function public.admin_get_notification_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v json;
begin
  perform public.assert_admin();
  select json_build_object(
    'active_tokens', (select count(*) from public.push_tokens where is_active),
    'by_status', (select coalesce(json_object_agg(delivery_status, cnt), '{}'::json)
                  from (select delivery_status, count(*) as cnt
                        from public.notification_events group by delivery_status) t),
    'by_type', (select coalesce(json_object_agg(type, cnt), '{}'::json)
                from (select type, count(*) as cnt
                      from public.notification_events
                      where created_at > now() - interval '30 days'
                      group by type order by cnt desc) t),
    'recent_failures', (select coalesce(json_agg(row_to_json(f)), '[]'::json)
                        from (select id, type, provider_response, created_at
                              from public.notification_events
                              where delivery_status = 'failed'
                              order by created_at desc limit 10) f)
  ) into v;
  return v;
end;
$$;
grant execute on function public.admin_get_notification_stats() to authenticated;

create or replace function public.admin_get_abuse_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v json;
begin
  perform public.assert_admin();
  select json_build_object(
    'by_kind_7d', (select coalesce(json_object_agg(kind, cnt), '{}'::json)
                   from (select kind, count(*) as cnt from public.abuse_events
                         where created_at > now() - interval '7 days'
                         group by kind order by cnt desc) t),
    'top_offenders_7d', (select coalesce(json_agg(row_to_json(o)), '[]'::json)
                         from (select a.user_id, u.email, count(*) as events
                               from public.abuse_events a
                               join public.users u on u.id = a.user_id
                               where a.created_at > now() - interval '7 days'
                                 and a.kind in ('identity_block', 'rate_limit_minute',
                                                'rate_limit_day', 'cooldown_applied')
                               group by a.user_id, u.email
                               order by events desc limit 10) o),
    'active_cooldowns', (select coalesce(json_agg(row_to_json(c)), '[]'::json)
                         from (select id, email, cooldown_until from public.users
                               where cooldown_until > now()) c)
  ) into v;
  return v;
end;
$$;
grant execute on function public.admin_get_abuse_stats() to authenticated;

create or replace function public.admin_set_user_cooldown(p_user_id uuid, p_minutes int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  update public.users
  set cooldown_until = case when coalesce(p_minutes, 0) > 0
                            then now() + (p_minutes || ' minutes')::interval
                            else null end
  where id = p_user_id;
end;
$$;
grant execute on function public.admin_set_user_cooldown(uuid, int) to authenticated;

create or replace function public.admin_get_config()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v json;
begin
  perform public.assert_admin();
  select coalesce(json_object_agg(key, value), '{}'::json) into v from public.app_config;
  return v;
end;
$$;
grant execute on function public.admin_get_config() to authenticated;

create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  if p_key not in ('cross_school_matching_enabled', 'allow_unknown_schools', 'ai_prompts_enabled') then
    raise exception 'Unknown config key: %', p_key;
  end if;
  insert into public.app_config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;

create or replace function public.admin_send_test_notification()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  perform public.enqueue_notification(auth.uid(), 'test',
    'Test notification', 'Push delivery is working.', '{}'::jsonb);
end;
$$;
grant execute on function public.admin_send_test_notification() to authenticated;

-- AI usage rate limit: called by the generate-support-prompt Edge Function
create or replace function public.record_ai_usage(p_user_id uuid)
returns boolean  -- true = allowed, false = rate limited
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.abuse_events
      where user_id = p_user_id and kind = 'ai_prompt'
        and created_at > now() - interval '1 day') >= 30 then
    return false;
  end if;
  insert into public.abuse_events (user_id, kind) values (p_user_id, 'ai_prompt');
  return true;
end;
$$;
revoke all on function public.record_ai_usage(uuid) from public;
grant execute on function public.record_ai_usage(uuid) to service_role;
