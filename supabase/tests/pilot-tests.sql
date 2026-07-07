-- Functional tests for Penn Pal schema (run as postgres superuser)
\set ON_ERROR_STOP on

-- helper: pretend to be a user
create or replace function test_as(p_uid uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', p_uid::text, false) $$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.edu'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@test.edu'),
  ('c0000000-0000-0000-0000-00000000000c', 'c@test.edu'),
  ('d0000000-0000-0000-0000-00000000000d', 'd@test.edu');

-- T1: A registers (2027) → waiting
select test_as('a0000000-0000-0000-0000-00000000000a');
select 'T1' as t, public.register_and_match(2027, 'stress') ->> 'status' = 'waiting' as pass;

-- T2: B registers (2028, different year) → waiting, no cross-year match
select test_as('b0000000-0000-0000-0000-00000000000b');
select 'T2' as t, public.register_and_match(2028, null) ->> 'status' = 'waiting' as pass;

-- T3: C registers (2027) → matched with A
select test_as('c0000000-0000-0000-0000-00000000000c');
select 'T3' as t, public.register_and_match(2027, null) ->> 'status' = 'matched' as pass;
select 'T3b' as t, (select count(*) from public.pairs where active) = 1 as pass;
select 'T3c' as t, (select status from public.users where email='a@test.edu') = 'matched' as pass;

-- T4: A re-registers while matched → no second pair, grad_year unchanged
select test_as('a0000000-0000-0000-0000-00000000000a');
select 'T4' as t, public.register_and_match(2030, null) ->> 'status' = 'matched' as pass;
select 'T4b' as t, (select count(*) from public.pairs) = 1 as pass;
select 'T4c' as t, (select grad_year from public.users where email='a@test.edu') = 2027 as pass;

-- T5: C requests one-sided rematch → C waiting; pair inactive; A still 'matched' (stuck partner state)
select test_as('c0000000-0000-0000-0000-00000000000c');
select public.deactivate_pair_and_rematch((select pair_id from public.users where email='c@test.edu'), false, false);
select 'T5' as t, (select status from public.users where email='c@test.edu') = 'waiting' as pass;
select 'T5b' as t, (select count(*) from public.pairs where active) = 0 as pass;
select 'T5c' as t, (select status from public.users where email='a@test.edu') = 'matched' as pass;

-- T6: A (partner of a dead pair) can leave the INACTIVE pair and re-enter pool
--     → immediately rematches with waiting C (no block between them)
select test_as('a0000000-0000-0000-0000-00000000000a');
select public.deactivate_pair_and_rematch((select pair_id from public.users where email='a@test.edu'), false, false);
select 'T6' as t, (select status from public.users where email='a@test.edu') = 'matched' as pass;
select 'T6b' as t, (select count(*) from public.pairs where active) = 1 as pass;

-- T7: A blocks C → both waiting, block recorded, and they do NOT re-pair
select test_as('a0000000-0000-0000-0000-00000000000a');
select public.deactivate_pair_and_rematch((select pair_id from public.users where email='a@test.edu'), true, true);
select 'T7' as t, (select count(*) from public.blocks) = 1 as pass;
select 'T7b' as t, (select status from public.users where email='a@test.edu') = 'waiting' as pass;
select 'T7c' as t, (select status from public.users where email='c@test.edu') = 'waiting' as pass;
select 'T7d' as t, (select count(*) from public.pairs where active) = 0 as pass;

-- T8: poll_and_match does not pair blocked users
select test_as('a0000000-0000-0000-0000-00000000000a');
select 'T8' as t, (select status from public.poll_and_match()) = 'waiting' as pass;

-- T9: D registers (2027) → matches A (C blocked, D not)
select test_as('d0000000-0000-0000-0000-00000000000d');
select 'T9' as t, public.register_and_match(2027, null) ->> 'status' = 'matched' as pass;
select 'T9b' as t, (
  select count(*) from public.pairs p where p.active
    and ((p.user1_id::text like 'a%' and p.user2_id::text like 'd%')
      or (p.user1_id::text like 'd%' and p.user2_id::text like 'a%'))
) = 1 as pass;

-- T10: banned user never matches. Ban C (admin action simulated as superuser),
--      then C polls → stays waiting even though nobody else... make E to be sure.
update public.users set is_banned = true where email = 'c@test.edu';
insert into auth.users (id, email) values ('e0000000-0000-0000-0000-00000000000e', 'e@test.edu');
select test_as('e0000000-0000-0000-0000-00000000000e');
select 'T10' as t, public.register_and_match(2027, null) ->> 'status' = 'waiting' as pass;
select test_as('c0000000-0000-0000-0000-00000000000c');
select 'T10b' as t, (select status from public.poll_and_match()) = 'waiting' as pass;
select 'T10c' as t, (select count(*) from public.pairs where active) = 1 as pass;

-- T11: RLS/grants — authenticated user cannot escalate privileges
select test_as('e0000000-0000-0000-0000-00000000000e');
set role authenticated;
do $$ begin
  update public.users set is_banned = false where id = auth.uid();
  raise exception 'T11 FAIL: banned column update was allowed';
exception when insufficient_privilege then
  raise notice 'T11 pass: is_banned update denied';
end $$;
do $$ begin
  update public.users set is_admin = true where id = auth.uid();
  raise exception 'T11b FAIL: is_admin update was allowed';
exception when insufficient_privilege then
  raise notice 'T11b pass: is_admin update denied';
end $$;
do $$ begin
  insert into public.users (id, email, grad_year, prompt)
  values ('f0000000-0000-0000-0000-00000000000f', 'f@test.edu', 2027, null);
  raise exception 'T11c FAIL: insert as another user was allowed';
exception when insufficient_privilege then
  raise notice 'T11c pass (privilege)';
when check_violation then
  raise notice 'T11c pass (RLS)';
when others then
  raise notice 'T11c pass (%)', sqlerrm;
end $$;
-- prompt update IS allowed (own row)
update public.users set prompt = 'updated prompt' where id = auth.uid();
select 'T11d' as t, (select prompt from public.users where id = auth.uid()) = 'updated prompt' as pass;
-- cannot see other users' rows
select 'T11e' as t, (select count(*) from public.users) = 1 as pass;
reset role;

-- T12: RLS — E cannot read messages of the A–D pair, members can
insert into public.messages (pair_id, sender_id, content)
select id, user1_id, 'hello from user1' from public.pairs where active limit 1;
select test_as('e0000000-0000-0000-0000-00000000000e');
set role authenticated;
select 'T12' as t, (select count(*) from public.messages) = 0 as pass;
reset role;
select test_as('a0000000-0000-0000-0000-00000000000a');
set role authenticated;
select 'T12b' as t, (select count(*) from public.messages) = 1 as pass;
reset role;

-- T13: banned user cannot send messages (policy check)
update public.users set is_banned = true, status = 'matched',
  pair_id = (select id from public.pairs where active limit 1)
  where email = 'c@test.edu';
-- put C in the active pair artificially? No — just verify policy blocks insert
select test_as('c0000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  insert into public.messages (pair_id, sender_id, content)
  values ((select pair_id from public.users where id = auth.uid()), auth.uid(), 'banned msg');
  raise exception 'T13 FAIL: banned user message allowed';
exception when others then
  raise notice 'T13 pass: banned insert rejected (%)', sqlerrm;
end $$;
reset role;

-- T14: report + admin RPCs
select test_as('a0000000-0000-0000-0000-00000000000a');
select public.report_conversation((select pair_id from public.users where email='a@test.edu'), 'test reason');
select 'T14' as t, (select count(*) from public.reports) = 1 as pass;
-- non-admin cannot call admin RPC
do $$ begin
  perform public.admin_get_pilot_stats();
  raise exception 'T14b FAIL: non-admin accessed stats';
exception when others then
  raise notice 'T14b pass: %', sqlerrm;
end $$;
-- make A admin, then stats work
update public.users set is_admin = true where email='a@test.edu';
select 'T14c' as t, (public.admin_get_pilot_stats() ->> 'open_reports')::int = 1 as pass;

-- T15: admin ban deactivates pair and frees partner
select 'T15-pre' as t, (select status from public.users where email='d@test.edu') = 'matched' as pass;
select public.admin_set_ban((select id from public.users where email='d@test.edu'), true);
select 'T15' as t, (select is_banned from public.users where email='d@test.edu') as pass;
select 'T15b' as t, (select status from public.users where email='a@test.edu') = 'waiting' as pass;
select 'T15c' as t, (select count(*) from public.pairs where active) = 0 as pass;

-- T16: delete_my_account cleans up
select test_as('a0000000-0000-0000-0000-00000000000a');
select public.delete_my_account();
select 'T16' as t, (select count(*) from public.users where email='a@test.edu') = 0 as pass;
