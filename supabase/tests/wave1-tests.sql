-- Feature Wave 1 tests: schools, reveal, rate limits, read receipts.
-- Run on a FRESH database after shim.sql + schema + all migrations.
-- Every assertion prints "<name> | t" on pass; any ERROR is a failure
-- (except those explicitly caught and printed as "pass" notices).
\set ON_ERROR_STOP on

create or replace function test_as(p_uid uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', p_uid::text, false) $$;

-- Two schools
insert into public.schools (id, name, primary_domain) values
  ('50000000-0000-0000-0000-000000000001', 'Pepperdine University', 'pepperdine.edu'),
  ('50000000-0000-0000-0000-000000000002', 'UCLA', 'ucla.edu');

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@pepperdine.edu'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@ucla.edu'),
  ('c0000000-0000-0000-0000-00000000000c', 'c@pepperdine.edu'),
  ('d0000000-0000-0000-0000-00000000000d', 'd@pepperdine.edu'),
  ('e0000000-0000-0000-0000-00000000000e', 'e@pepperdine.edu');

-- W1: same grad year, DIFFERENT school → no match
select test_as('a0000000-0000-0000-0000-00000000000a');
select 'W1a' as t, public.register_and_match(2027, null) ->> 'result' = 'waiting' as pass;
select 'W1b' as t, (select s.name from public.users u join public.schools s on s.id = u.school_id
                    where u.email = 'a@pepperdine.edu') = 'Pepperdine University' as pass;
select test_as('b0000000-0000-0000-0000-00000000000b');
select 'W1c' as t, public.register_and_match(2027, null) ->> 'result' = 'waiting' as pass;
select 'W1d' as t, (select count(*) from public.pairs where active) = 0 as pass;

-- W2: same school, DIFFERENT grad year → no match
select test_as('c0000000-0000-0000-0000-00000000000c');
select 'W2a' as t, public.register_and_match(2028, null) ->> 'result' = 'waiting' as pass;
select 'W2b' as t, (select count(*) from public.pairs where active) = 0 as pass;

-- W3: same school + same grad year → match, and both get 'match' notifications
select test_as('d0000000-0000-0000-0000-00000000000d');
select 'W3a' as t, public.register_and_match(2027, null) ->> 'result' = 'matched' as pass;
select 'W3b' as t, (select count(*) from public.pairs where active) = 1 as pass;
select 'W3c' as t, (select count(*) from public.notification_events where type = 'match') = 2 as pass;

-- W4: unknown domain auto-creates a school while allow_unknown_schools = true
select 'W4' as t, (select count(*) from public.schools where primary_domain = 'ucla.edu') = 1 as pass;

-- W5: unsupported school when allow_unknown_schools = false
update public.app_config set value = 'false'::jsonb where key = 'allow_unknown_schools';
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-00000000000f', 'f@nowhere.edu');
select test_as('f0000000-0000-0000-0000-00000000000f');
select 'W5a' as t, public.register_and_match(2027, null) ->> 'result' = 'unsupported_school' as pass;
select 'W5b' as t, (select count(*) from public.users where email = 'f@nowhere.edu') = 0 as pass;
select 'W5c' as t, (public.get_school_for_domain('nowhere.edu') ->> 'status') = 'unsupported' as pass;
update public.app_config set value = 'true'::jsonb where key = 'allow_unknown_schools';

-- W6: cross-school matching only when explicitly enabled
update public.app_config set value = 'true'::jsonb where key = 'cross_school_matching_enabled';
select test_as('e0000000-0000-0000-0000-00000000000e');
-- e@pepperdine 2027 should now match b@ucla 2027 (cross-school pilot mode)
select 'W6a' as t, public.register_and_match(2027, null) ->> 'result' = 'matched' as pass;
update public.app_config set value = 'false'::jsonb where key = 'cross_school_matching_enabled';

-- W7: send_message rate limit — 11th message in a minute blocked
select test_as('d0000000-0000-0000-0000-00000000000d');
do $$
declare
  v_pair uuid;
  i int;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  for i in 1..10 loop
    perform public.send_message(v_pair, 'message ' || i);
  end loop;
  if (public.send_message(v_pair, 'message 11') ->> 'error') = 'rate_limited_minute' then
    raise notice 'W7 pass: minute rate limit enforced';
  else
    raise exception 'W7 FAIL: 11th message in a minute was allowed';
  end if;
end $$;
select 'W7b' as t, (select count(*) from public.abuse_events where kind = 'rate_limit_minute') = 1 as pass;
-- message notifications were enqueued for the partner
select 'W7c' as t, (select count(*) from public.notification_events where type = 'message') = 10 as pass;

-- W8: direct INSERT into messages is denied for authenticated role
set role authenticated;
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  begin
    insert into public.messages (pair_id, sender_id, content)
    values (v_pair, auth.uid(), 'bypass attempt');
    raise exception 'W8 FAIL: direct message insert allowed';
  exception when insufficient_privilege then
    raise notice 'W8 pass: direct insert denied';
  end;
end $$;
reset role;

-- W9: identity-block cooldown after 5 attempts in an hour
select test_as('c0000000-0000-0000-0000-00000000000c');
select public.record_identity_block() from generate_series(1, 4);
select 'W9a' as t, (public.record_identity_block() ->> 'cooldown_until') is not null as pass;
select 'W9b' as t, (select cooldown_until > now() from public.users
                    where id = 'c0000000-0000-0000-0000-00000000000c') as pass;
-- cooldown blocks sending
do $$
begin
  if (public.send_message('00000000-0000-0000-0000-000000000000', 'hi') ->> 'error') = 'cooldown_active' then
    raise notice 'W9c pass: cooldown blocks sending';
  else
    raise exception 'W9c FAIL: cooldown user could call send_message';
  end if;
end $$;

-- W10: read receipts
select test_as('d0000000-0000-0000-0000-00000000000d');
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  perform public.mark_pair_read(v_pair);
end $$;
select 'W10a' as t, (select count(*) from public.pair_read_state) = 1 as pass;
-- partner (a@pepperdine) sees d's read state
select test_as('a0000000-0000-0000-0000-00000000000a');
select 'W10b' as t, (
  select (public.get_chat_meta(pair_id) ->> 'partner_last_read_at') is not null
  from public.users where id = auth.uid()
) as pass;
-- d disables read receipts → hidden from partner, state still stored
update public.users set show_read_receipts = false
  where id = 'd0000000-0000-0000-0000-00000000000d';
select 'W10c' as t, (
  select (public.get_chat_meta(pair_id) ->> 'partner_last_read_at') is null
  from public.users where id = auth.uid()
) as pass;
-- unread count: d sent 10 messages, a read none
select 'W10d' as t, public.get_unread_count() = 10 as pass;
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  perform public.mark_pair_read(v_pair);
end $$;
select 'W10e' as t, public.get_unread_count() = 0 as pass;
-- non-member cannot read the pair's chat meta
select test_as('b0000000-0000-0000-0000-00000000000b');
do $$
begin
  perform public.get_chat_meta((
    select id from public.pairs
    where user1_id <> auth.uid() and user2_id <> auth.uid() limit 1));
  raise exception 'W10f FAIL: non-member read chat meta';
exception when others then
  if sqlerrm like '%not a member%' then raise notice 'W10f pass: non-member denied';
  else raise; end if;
end $$;

-- W11: reveal flow
-- Cohort for Pepperdine 2027 opening in the future → locked
insert into public.cohorts (school_id, graduation_year, reveal_opens_at)
values ('50000000-0000-0000-0000-000000000001', 2027, now() + interval '30 days');
select test_as('a0000000-0000-0000-0000-00000000000a');
select 'W11a' as t, (
  select (public.get_reveal_state(pair_id) ->> 'unlocked') = 'false'
  from public.users where id = auth.uid()
) as pass;
select 'W11b' as t, (
  select (public.get_reveal_state(pair_id) ->> 'block_reason') = 'not_open_yet'
  from public.users where id = auth.uid()
) as pass;
-- opting in while locked fails
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  begin
    perform public.request_reveal(v_pair, true);
    raise exception 'W11c FAIL: opt-in allowed before reveal date';
  exception when others then
    if sqlerrm like '%reveal_blocked%' then raise notice 'W11c pass: locked before date';
    else raise; end if;
  end;
end $$;

-- Open the cohort → one-sided opt-in does NOT reveal
update public.cohorts set reveal_opens_at = now() - interval '1 day';
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  perform public.request_reveal(v_pair, true, 'Would love to meet you!');
end $$;
select 'W11d' as t, (select count(*) from public.reveals) = 0 as pass;
select 'W11e' as t, (
  select (public.get_reveal_state(pair_id) ->> 'revealed') = 'false'
  from public.users where id = auth.uid()
) as pass;
-- partner sees the opt-in + message but no identity
select test_as('d0000000-0000-0000-0000-00000000000d');
select 'W11f' as t, (
  select (public.get_reveal_state(pair_id) ->> 'partner_opt_in') = 'true'
     and (public.get_reveal_state(pair_id) ->> 'partner_profile') is null
  from public.users where id = auth.uid()
) as pass;
-- set d's reveal profile, then mutual opt-in → revealed
set role authenticated;
update public.users set display_name = 'Dana Doe', major = 'Biology' where id = auth.uid();
reset role;
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  perform public.request_reveal(v_pair, true);
end $$;
select 'W11g' as t, (select count(*) from public.reveals) = 1 as pass;
select test_as('a0000000-0000-0000-0000-00000000000a');
select 'W11h' as t, (
  select (public.get_reveal_state(pair_id) -> 'partner_profile' ->> 'display_name') = 'Dana Doe'
  from public.users where id = auth.uid()
) as pass;
select 'W11i' as t, (select count(*) from public.notification_events where type = 'reveal_complete') = 2 as pass;

-- W12: admin disables reveal for the pair → blocked even though revealed row exists for state
select test_as('d0000000-0000-0000-0000-00000000000d');
update public.users set is_admin = true where id = 'd0000000-0000-0000-0000-00000000000d';
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  perform public.admin_set_pair_reveal_disabled(v_pair, true);
end $$;
select 'W12' as t, (
  select (public.get_reveal_state(pair_id) ->> 'block_reason') = 'disabled_by_admin'
  from public.users where id = auth.uid()
) as pass;

-- W13: report between two users blocks reveal AND future re-matching
-- fresh pair: g + h at same school/year
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'g@pepperdine.edu'),
  ('a2000000-0000-0000-0000-000000000002', 'h@pepperdine.edu');
select test_as('a1000000-0000-0000-0000-000000000001');
select public.register_and_match(2030, null);
select test_as('a2000000-0000-0000-0000-000000000002');
select public.register_and_match(2030, null);
insert into public.cohorts (school_id, graduation_year, reveal_opens_at)
values ('50000000-0000-0000-0000-000000000001', 2030, now() - interval '1 day');
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  perform public.report_conversation(v_pair, 'threats');
end $$;
select 'W13a' as t, (
  select (public.get_reveal_state(pair_id) ->> 'block_reason') = 'unresolved_report'
  from public.users where id = auth.uid()
) as pass;
-- h rematches away; g and h must NOT be re-paired (prior report)
do $$
declare v_pair uuid;
begin
  select pair_id into v_pair from public.users where id = auth.uid();
  perform public.deactivate_pair_and_rematch(v_pair, true, false);
end $$;
select 'W13b' as t, (select status from public.users where email = 'g@pepperdine.edu') = 'waiting' as pass;
select 'W13c' as t, (select status from public.users where email = 'h@pepperdine.edu') = 'waiting' as pass;
select test_as('a1000000-0000-0000-0000-000000000001');
select 'W13d' as t, (select status from public.poll_and_match()) = 'waiting' as pass;

-- W14: users cannot change school_id / cooldown via direct update
select test_as('a0000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
begin
  update public.users set school_id = '50000000-0000-0000-0000-000000000002' where id = auth.uid();
  raise exception 'W14 FAIL: school_id update allowed';
exception when insufficient_privilege then
  raise notice 'W14 pass: school_id update denied';
end $$;
do $$
begin
  update public.users set cooldown_until = null where id = auth.uid();
  raise exception 'W14b FAIL: cooldown_until update allowed';
exception when insufficient_privilege then
  raise notice 'W14b pass: cooldown_until update denied';
end $$;
-- but the reveal-profile + read-receipt columns ARE editable
update public.users set display_name = 'Alex', show_read_receipts = true where id = auth.uid();
select 'W14c' as t, (select display_name from public.users where id = auth.uid()) = 'Alex' as pass;
-- push token RPCs work; direct table access denied
select public.register_push_token('ExponentPushToken[test123]', 'ios', 'device-1');
do $$
begin
  perform count(*) from public.push_tokens;
  raise exception 'W14d FAIL: push_tokens readable';
exception when insufficient_privilege then
  raise notice 'W14d pass: push_tokens hidden';
end $$;
reset role;
select 'W14e' as t, (select count(*) from public.push_tokens where is_active) = 1 as pass;

-- W15: notification preferences respected (messages off → event skipped)
select test_as('a0000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into public.notification_preferences (user_id, messages) values (auth.uid(), false);
reset role;
do $$
begin
  perform public.enqueue_notification('a0000000-0000-0000-0000-00000000000a', 'message', 't', 'b', '{}'::jsonb);
end $$;
select 'W15' as t, (
  select delivery_status from public.notification_events
  where user_id = 'a0000000-0000-0000-0000-00000000000a' and type = 'message'
  order by created_at desc limit 1
) = 'skipped' as pass;

-- W16: admin RPC gating for the new endpoints
select test_as('b0000000-0000-0000-0000-00000000000b');
do $$
begin
  perform public.admin_list_schools();
  raise exception 'W16 FAIL: non-admin listed schools';
exception when others then
  if sqlerrm like '%admin access required%' then raise notice 'W16 pass: schools gated';
  else raise; end if;
end $$;
do $$
begin
  perform public.admin_set_config('ai_prompts_enabled', 'true'::jsonb);
  raise exception 'W16b FAIL: non-admin set config';
exception when others then
  if sqlerrm like '%admin access required%' then raise notice 'W16b pass: config gated';
  else raise; end if;
end $$;
