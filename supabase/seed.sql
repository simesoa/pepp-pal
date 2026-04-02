-- ============================================================
-- Penn Pal – Development / QA Seed Data
--
-- Run AFTER schema.sql + all migrations.
-- Creates test users directly in auth.users (requires service-role
-- access or running inside the Supabase dashboard SQL editor).
--
-- WARNING: Do NOT run this in production.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Helper: create_test_auth_user(email, password)
-- Inserts a confirmed auth.users row for local testing.
-- ──────────────────────────────────────────────────────────────
create or replace function dev.create_test_user(
  p_email    text,
  p_password text,
  p_grad     int default 2026
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  -- Insert into auth.users (minimal fields needed for local dev)
  insert into auth.users (
    id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role
  )
  values (
    v_id,
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  )
  on conflict (email) do nothing;

  -- Insert public profile
  insert into public.users (id, email, grad_year, status)
  values (v_id, p_email, p_grad, 'waiting')
  on conflict (id) do nothing;

  return v_id;
end;
$$;

-- ──────────────────────────────────────────────────────────────
-- Create a dev schema for seed helpers
-- ──────────────────────────────────────────────────────────────
create schema if not exists dev;

-- ──────────────────────────────────────────────────────────────
-- Scenario 1: Two waiting users – same grad year → should match
-- ──────────────────────────────────────────────────────────────
do $$
declare
  v_alice uuid;
  v_bob   uuid;
begin
  -- alice@test.edu  (waiting, 2026)
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values (
    '00000000-0000-0000-0000-000000000001',
    'alice@test.edu',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    'authenticated', 'authenticated'
  ) on conflict do nothing;

  insert into public.users (id, email, grad_year, status)
  values ('00000000-0000-0000-0000-000000000001', 'alice@test.edu', 2026, 'waiting')
  on conflict do nothing;

  -- bob@test.edu  (waiting, 2026)
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values (
    '00000000-0000-0000-0000-000000000002',
    'bob@test.edu',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    'authenticated', 'authenticated'
  ) on conflict do nothing;

  insert into public.users (id, email, grad_year, status)
  values ('00000000-0000-0000-0000-000000000002', 'bob@test.edu', 2026, 'waiting')
  on conflict do nothing;
end $$;

-- ──────────────────────────────────────────────────────────────
-- Scenario 2: Already-matched pair with messages
-- ──────────────────────────────────────────────────────────────
do $$
declare
  v_pair_id uuid := '10000000-0000-0000-0000-000000000001';
begin
  -- carol + dave already matched
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values
    ('00000000-0000-0000-0000-000000000003', 'carol@test.edu', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    ('00000000-0000-0000-0000-000000000004', 'dave@test.edu',  crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict do nothing;

  insert into public.pairs (id, user1_id, user2_id, active)
  values (v_pair_id, '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', true)
  on conflict do nothing;

  insert into public.users (id, email, grad_year, status, pair_id)
  values
    ('00000000-0000-0000-0000-000000000003', 'carol@test.edu', 2026, 'matched', v_pair_id),
    ('00000000-0000-0000-0000-000000000004', 'dave@test.edu',  2026, 'matched', v_pair_id)
  on conflict (id) do update set status = excluded.status, pair_id = excluded.pair_id;

  -- Seed a few messages
  insert into public.messages (pair_id, sender_id, content, created_at)
  values
    (v_pair_id, '00000000-0000-0000-0000-000000000003', 'Hey, how are you doing?',        now() - interval '2 hours'),
    (v_pair_id, '00000000-0000-0000-0000-000000000004', 'Honestly, struggling a bit.',    now() - interval '1 hour 50 min'),
    (v_pair_id, '00000000-0000-0000-0000-000000000003', 'Me too. Finals are a lot.',      now() - interval '1 hour 40 min'),
    (v_pair_id, '00000000-0000-0000-0000-000000000004', 'Yeah. Thanks for being here.',   now() - interval '1 hour 30 min')
  on conflict do nothing;

  -- Update last_message_at
  update public.pairs set last_message_at = now() - interval '1 hour 30 min'
  where id = v_pair_id;
end $$;

-- ──────────────────────────────────────────────────────────────
-- Scenario 3: Inactive pair (last message > 14 days ago)
-- ──────────────────────────────────────────────────────────────
do $$
declare
  v_pair_id uuid := '10000000-0000-0000-0000-000000000002';
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values
    ('00000000-0000-0000-0000-000000000005', 'erin@test.edu',  crypt('password123', gen_salt('bf')), now(), now() - interval '20 days', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    ('00000000-0000-0000-0000-000000000006', 'frank@test.edu', crypt('password123', gen_salt('bf')), now(), now() - interval '20 days', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict do nothing;

  insert into public.pairs (id, user1_id, user2_id, active, last_message_at)
  values (v_pair_id, '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', true, now() - interval '20 days')
  on conflict do nothing;

  insert into public.users (id, email, grad_year, status, pair_id)
  values
    ('00000000-0000-0000-0000-000000000005', 'erin@test.edu',  2025, 'matched', v_pair_id),
    ('00000000-0000-0000-0000-000000000006', 'frank@test.edu', 2025, 'matched', v_pair_id)
  on conflict (id) do update set status = excluded.status, pair_id = excluded.pair_id;
end $$;

-- ──────────────────────────────────────────────────────────────
-- Scenario 4: Banned user
-- ──────────────────────────────────────────────────────────────
do $$
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values ('00000000-0000-0000-0000-000000000007', 'banned@test.edu', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict do nothing;

  insert into public.users (id, email, grad_year, status, is_banned)
  values ('00000000-0000-0000-0000-000000000007', 'banned@test.edu', 2026, 'waiting', true)
  on conflict (id) do update set is_banned = true;
end $$;

-- ──────────────────────────────────────────────────────────────
-- Scenario 5: Admin user
-- ──────────────────────────────────────────────────────────────
do $$
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values ('00000000-0000-0000-0000-000000000008', 'admin@test.edu', crypt('adminpass123', gen_salt('bf')), now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict do nothing;

  insert into public.users (id, email, grad_year, status, is_admin)
  values ('00000000-0000-0000-0000-000000000008', 'admin@test.edu', 2026, 'waiting', true)
  on conflict (id) do update set is_admin = true;
end $$;

-- ──────────────────────────────────────────────────────────────
-- Scenario 6: Open report against carol/dave pair
-- ──────────────────────────────────────────────────────────────
insert into public.reports (reporter_id, pair_id, reason, status)
values (
  '00000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'Harassment and inappropriate language',
  'open'
) on conflict do nothing;
