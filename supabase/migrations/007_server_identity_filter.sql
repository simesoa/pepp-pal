-- ============================================================
-- Penn Pal – Migration 007: Server-side identity filter
-- Run after 006_feature_wave.sql. Idempotent — safe to re-run.
--
-- The identity filter previously ran only in the client, so a user calling
-- the send_message RPC directly (PostgREST) could bypass anonymity. This
-- migration makes the SERVER the source of truth:
--
--   1. detect_identity_disclosure(text) — SQL port of lib/identityFilter.ts
--      (phones, emails incl. obfuscated, URLs, social platforms/handles,
--      @handles, contact/meetup intent phrases, name disclosures)
--   2. send_message() rejects disclosures BEFORE reveal with a structured
--      error {error: 'identity_disclosure_blocked', message: ...}, logs the
--      attempt into abuse_events, and increments the same cooldown counter
--      as client-side blocks (5/hour → 30-minute send cooldown)
--   3. After a mutual reveal for the pair, contact sharing is allowed —
--      that is the product's post-reveal contract.
--
-- The client-side filter remains as instant UX; the server enforces.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. detect_identity_disclosure(p_content) → category text | null
--    Postgres ARE notes: \y is the word boundary (JS \b), ~* is the
--    case-insensitive match. Patterns mirror lib/identityFilter.ts —
--    keep the two in sync when editing either.
-- ──────────────────────────────────────────────────────────────
create or replace function public.detect_identity_disclosure(p_content text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digits text;
begin
  if p_content is null or p_content = '' then
    return null;
  end if;

  -- Phone numbers: strict separators, plus 10+ digit runs with noise
  if p_content ~ '(\+?1[[:space:].()-]*)?\(?\d{3}\)?[[:space:].-]\d{3}[[:space:].-]\d{4}' then
    return 'phone';
  end if;
  v_digits := regexp_replace(p_content, '[^0-9[:space:].,-]', '', 'g');
  if v_digits ~ '(\d[[:space:].,-]{0,2}){10,}' then
    return 'phone';
  end if;

  -- Email addresses (standard + "user [at] domain [dot] com" obfuscation)
  if p_content ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    return 'email';
  end if;
  if p_content ~* '\y[a-z0-9._%+-]+[[:space:]]*[\[(]?[[:space:]]*at[[:space:]]*[\])]?[[:space:]]*[a-z0-9.-]+[[:space:]]*[\[(]?[[:space:]]*dot[[:space:]]*[\])]?[[:space:]]*[a-z]{2,}' then
    return 'email';
  end if;

  -- Social platforms with symbol/spacing obfuscation ("i g : handle")
  if p_content ~* '\y(i[[:space:]._-]*g|insta[[:space:]._-]*gram?|snap[[:space:]._-]*chat|tik[[:space:]._-]*tok|twitt?er|face[[:space:]._-]*book|linked[[:space:]._-]*in|discord|telegram|what[[:space:]._-]*s[[:space:]._-]*app)\y' then
    return 'social';
  end if;

  -- @handle mentions
  if p_content ~ '(^|[[:space:]])@[a-zA-Z0-9_.]{3,}' then
    return 'social';
  end if;

  -- URLs / links (http(s), www., bare common-TLD domains)
  if p_content ~* 'https?://' or p_content ~* 'www\.[a-z0-9]+\.[a-z]{2,}'
     or p_content ~* '\y[a-z0-9-]+\.(com|io|co|me|app|net|org)\y' then
    return 'url';
  end if;

  -- Contact / meetup intent phrases (whole-word; "instantly"/"snapped" never match)
  if p_content ~* '\y(instagram|insta|ig|snapchat|snap|tiktok|twitter|facebook|fb|linkedin|venmo|cashapp|cash app|discord|telegram|whatsapp|facetime|bereal|reddit|signal app|groupme|text me|dm me|find me on|follow me|add me on|add me at|add my|my handle|my user|my username|my @ is|my number|my phone|my email|my ig|my snap|my discord|call me at|zoom me|reach me at|contact me at|hit me up|hmu|slide into|slide in my|come to my dorm|come to my room|my dorm is|my room number|my address|i live in|i live at|meet me at|meet me in|my building is)\y' then
    return 'contact';
  end if;

  -- Bare "call me" (contact intent), sparing common idioms ("call me crazy").
  -- ARE has no lookahead, so check the idiom form separately.
  if p_content ~* '\ycall me\y'
     and p_content !~* '\ycall me (crazy|dramatic|old[- ]?fashioned|paranoid|silly|weird|naive|cynical)\y' then
    return 'contact';
  end if;

  -- Name disclosure: intent phrase + Two Capitalized Words (case-sensitive)
  if p_content ~* '\y(my name is|my name''s|i''?m called|i go by|you can call me|they call me|known as)\y'
     and p_content ~ '\y[A-Z][a-z]{1,20} [A-Z][a-z]{1,20}\y' then
    return 'name';
  end if;
  -- "I'm Jane Doe" / "I am Jane Doe"
  if p_content ~ '\y[Ii]''?m [A-Z][a-z]{1,20} [A-Z][a-z]{1,20}\y'
     or p_content ~ '\y[Ii] am [A-Z][a-z]{1,20} [A-Z][a-z]{1,20}\y' then
    return 'name';
  end if;

  return null;
end;
$$;

grant execute on function public.detect_identity_disclosure(text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 2. Shared identity-block accounting (used by the client-report RPC and
--    by send_message itself). Returns the cooldown timestamp if applied.
-- ──────────────────────────────────────────────────────────────
create or replace function public.apply_identity_block(p_user_id uuid, p_source text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_until timestamptz;
begin
  insert into public.abuse_events (user_id, kind, meta)
  values (p_user_id, 'identity_block', jsonb_build_object('source', p_source));

  select count(*) into v_count
  from public.abuse_events
  where user_id = p_user_id and kind = 'identity_block'
    and created_at > now() - interval '1 hour';

  if v_count >= 5 then
    v_until := now() + interval '30 minutes';
    update public.users set cooldown_until = v_until where id = p_user_id;
    insert into public.abuse_events (user_id, kind, meta)
    values (p_user_id, 'cooldown_applied', jsonb_build_object('until', v_until, 'source', p_source));
  end if;

  return v_until;
end;
$$;

revoke all on function public.apply_identity_block(uuid, text) from public;

-- record_identity_block (client UX reporting) now shares the same counter
create or replace function public.record_identity_block()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
  v_count int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_until := public.apply_identity_block(auth.uid(), 'client');

  select count(*) into v_count
  from public.abuse_events
  where user_id = auth.uid() and kind = 'identity_block'
    and created_at > now() - interval '1 hour';

  return json_build_object('attempts_last_hour', v_count, 'cooldown_until', v_until);
end;
$$;

grant execute on function public.record_identity_block() to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3. send_message: server-side enforcement. Identity disclosures are
--    rejected before reveal; limit/cooldown/disclosure outcomes return
--    {error, message} JSON (a raise would roll back the abuse_events log).
-- ──────────────────────────────────────────────────────────────
create or replace function public.send_message(p_pair_id uuid, p_content text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_pair      public.pairs%rowtype;
  v_partner   uuid;
  v_cooldown  timestamptz;
  v_banned    boolean;
  v_msg       public.messages%rowtype;
  v_category  text;
  v_revealed  boolean;
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

  if v_cooldown is not null and v_cooldown > now() then
    return json_build_object(
      'error', 'cooldown_active',
      'message', 'Messaging is paused for a little while. Take a break and review the anonymity rules.',
      'until', v_cooldown);
  end if;

  select * into v_pair
  from public.pairs
  where id = p_pair_id and active = true
    and (user1_id = v_uid or user2_id = v_uid);
  if not found then raise exception 'Active pair not found or not a member'; end if;

  -- ── Server-side identity filter (source of truth) ──────────────────────
  -- Contact sharing becomes legitimate after a MUTUAL reveal for this pair.
  v_revealed := exists (select 1 from public.reveals r where r.pair_id = p_pair_id);
  if not v_revealed then
    v_category := public.detect_identity_disclosure(p_content);
    if v_category is not null then
      perform public.apply_identity_block(v_uid, 'server:' || v_category);
      return json_build_object(
        'error', 'identity_disclosure_blocked',
        'message', 'Identifying info is not allowed before reveal.',
        'category', v_category);
    end if;
  end if;

  -- Rate limits: 10/minute, 100/day
  if (select count(*) from public.messages
      where sender_id = v_uid and created_at > now() - interval '1 minute') >= 10 then
    insert into public.abuse_events (user_id, kind) values (v_uid, 'rate_limit_minute');
    return json_build_object(
      'error', 'rate_limited_minute',
      'message', 'You''re sending messages too quickly. Try again in a minute.');
  end if;
  if (select count(*) from public.messages
      where sender_id = v_uid and created_at > now() - interval '1 day') >= 100 then
    insert into public.abuse_events (user_id, kind) values (v_uid, 'rate_limit_day');
    return json_build_object(
      'error', 'rate_limited_day',
      'message', 'You''ve hit today''s message limit. It resets tomorrow.');
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
