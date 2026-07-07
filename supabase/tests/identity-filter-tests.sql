-- Server-side identity filter tests (migration 007).
-- Run on a FRESH database after shim.sql + schema + all migrations.
--
-- These tests call send_message() directly — exactly what a user bypassing
-- the client and hitting PostgREST would do — and prove the server rejects
-- identity disclosures, logs them, and applies the cooldown.
\set ON_ERROR_STOP on

create or replace function test_as(p_uid uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', p_uid::text, false) $$;

insert into public.schools (id, name, primary_domain) values
  ('60000000-0000-0000-0000-000000000001', 'Test University', 'testu.edu');
insert into auth.users (id, email) values
  ('b1000000-0000-0000-0000-000000000001', 'g@testu.edu'),
  ('b2000000-0000-0000-0000-000000000002', 'h@testu.edu');

select test_as('b1000000-0000-0000-0000-000000000001');
select 'F0a' as t, public.register_and_match(2029, null) ->> 'result' = 'waiting' as pass;
select test_as('b2000000-0000-0000-0000-000000000002');
select 'F0b' as t, public.register_and_match(2029, null) ->> 'result' = 'matched' as pass;

-- helper: the matched pair id
create or replace function test_pair() returns uuid language sql as
$$ select pair_id from public.users where id = auth.uid() $$;

-- F1: normal supportive messages send fine (returned row has an id)
select test_as('b1000000-0000-0000-0000-000000000001');
select 'F1a' as t, (public.send_message(test_pair(), 'i instantly felt better after we talked') ->> 'id') is not null as pass;
select 'F1b' as t, (public.send_message(test_pair(), 'i snapped at my roommate and feel awful') ->> 'id') is not null as pass;
select 'F1c' as t, (public.send_message(test_pair(), 'thank you for listening, it means a lot') ->> 'id') is not null as pass;
select 'F1d' as t, (public.send_message(test_pair(), 'call me crazy but i think you handled that well') ->> 'id') is not null as pass;

-- F2: disclosures rejected via DIRECT RPC — structured error + abuse log
select 'F2-phone' as t,
  public.send_message(test_pair(), 'you can reach my cell 555-867-5309 ok') ->> 'error' = 'identity_disclosure_blocked' as pass;
select 'F2-email' as t,
  public.send_message(test_pair(), 'write to someone@gmail.com instead') ->> 'error' = 'identity_disclosure_blocked' as pass;
select 'F2-url' as t,
  public.send_message(test_pair(), 'its all on linktree.com i promise') ->> 'error' = 'identity_disclosure_blocked' as pass;
select 'F2-social' as t,
  public.send_message(test_pair(), 'add me on instagram') ->> 'error' = 'identity_disclosure_blocked' as pass;
-- readable message + category present; not yet in cooldown after 4 attempts
select 'F2-msg' as t, (
  select count(*) from public.abuse_events
  where user_id = 'b1000000-0000-0000-0000-000000000001'
    and kind = 'identity_block' and meta ->> 'source' like 'server:%'
) = 4 as pass;
select 'F2-nocooldown' as t, (
  select cooldown_until is null from public.users
  where id = 'b1000000-0000-0000-0000-000000000001'
) as pass;

-- F3: 5th blocked attempt triggers the cooldown; then even innocent sends pause
select 'F3-name' as t,
  public.send_message(test_pair(), 'btw my name is John Smith') ->> 'error' = 'identity_disclosure_blocked' as pass;
select 'F3-cooldown-set' as t, (
  select cooldown_until > now() from public.users
  where id = 'b1000000-0000-0000-0000-000000000001'
) as pass;
select 'F3-cooldown-blocks' as t,
  public.send_message(test_pair(), 'hello again') ->> 'error' = 'cooldown_active' as pass;
select 'F3-cooldown-event' as t, (
  select count(*) from public.abuse_events
  where user_id = 'b1000000-0000-0000-0000-000000000001' and kind = 'cooldown_applied'
) = 1 as pass;

-- F4: remaining categories (as the partner, fresh counter)
select test_as('b2000000-0000-0000-0000-000000000002');
select 'F4-dorm' as t,
  public.send_message(test_pair(), 'meet me at my dorm after class') ->> 'error' = 'identity_disclosure_blocked' as pass;
select 'F4-textme' as t,
  public.send_message(test_pair(), 'just text me later tonight') ->> 'error' = 'identity_disclosure_blocked' as pass;
select 'F4-callme' as t,
  public.send_message(test_pair(), 'call me tonight ok?') ->> 'error' = 'identity_disclosure_blocked' as pass;
select 'F4-imcalled' as t,
  public.send_message(test_pair(), 'i''m called Jane Doe by everyone') ->> 'error' = 'identity_disclosure_blocked' as pass;
-- normal message still fine between blocked attempts (4 attempts < cooldown threshold)
select 'F4-normal' as t, (public.send_message(test_pair(), 'anyway, how was your exam?') ->> 'id') is not null as pass;

-- F5: direct table INSERT is still denied for the authenticated role
set role authenticated;
do $$
begin
  insert into public.messages (pair_id, sender_id, content)
  values (test_pair(), auth.uid(), 'raw bypass: my number is 555-867-5309');
  raise exception 'F5 FAIL: direct message insert allowed';
exception when insufficient_privilege then
  raise notice 'F5 pass: direct insert denied';
end $$;
reset role;

-- F6: detect_identity_disclosure itself never flags normal words
select 'F6a' as t, public.detect_identity_disclosure('i instantly felt better') is null as pass;
select 'F6b' as t, public.detect_identity_disclosure('i snapped at my roommate') is null as pass;
select 'F6c' as t, public.detect_identity_disclosure('finals have me so stressed out') is null as pass;
select 'F6d' as t, public.detect_identity_disclosure('my professor gave us 3 chapters, like 100 pages') is null as pass;
select 'F6e' as t, public.detect_identity_disclosure('i scored 92 on the midterm!') is null as pass;
select 'F6f' as t, public.detect_identity_disclosure('call me old fashioned but i love the library') is null as pass;

-- F7: after MUTUAL reveal, contact sharing is allowed (post-reveal contract)
update public.users set cooldown_until = null
where id in ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002');
insert into public.cohorts (school_id, graduation_year, reveal_opens_at)
values ('60000000-0000-0000-0000-000000000001', 2029, now() - interval '1 day');
select test_as('b1000000-0000-0000-0000-000000000001');
select public.request_reveal(test_pair(), true);
select test_as('b2000000-0000-0000-0000-000000000002');
select public.request_reveal(test_pair(), true);
select 'F7-revealed' as t, (select count(*) from public.reveals) = 1 as pass;
select 'F7-contact-ok' as t,
  (public.send_message(test_pair(), 'my instagram is coolstudent22, add me!') ->> 'id') is not null as pass;

drop function if exists test_pair();
