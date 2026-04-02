-- ============================================================
-- Penn Pal – Migration 004: Web-compatible RPC
-- Replaces the match-user Edge Function with a single
-- security-definer RPC callable by authenticated users.
-- Run this in Supabase SQL Editor after schema.sql + 001-003.
-- ============================================================

-- register_and_match(p_grad_year, p_prompt)
-- Creates/updates the caller's public.users row then attempts
-- immediate matching. Returns { status, pair_id }.
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

  -- Fetch email from auth schema
  select email into v_email
  from auth.users
  where id = v_uid;

  -- Upsert public profile (safe to call multiple times)
  insert into public.users (id, email, grad_year, prompt, status)
  values (v_uid, v_email, p_grad_year, p_prompt, 'waiting')
  on conflict (id) do update
    set grad_year = excluded.grad_year,
        prompt    = excluded.prompt;

  -- Attempt matching (security definer → runs as postgres, can call match_user)
  perform public.match_user(v_uid);

  -- Return current status
  select status, pair_id into v_status, v_pair_id
  from public.users
  where id = v_uid;

  return json_build_object('status', v_status, 'pair_id', v_pair_id);
end;
$$;

grant execute on function public.register_and_match(int, text) to authenticated;
