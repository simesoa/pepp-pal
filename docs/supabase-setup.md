# Supabase Setup — Exact Order

Everything the backend needs, from a blank Supabase project to pilot-ready.
All SQL files are idempotent — re-running them is safe.

## 1. Create the project

1. [supabase.com](https://supabase.com) → New project. Any region. Save the database password somewhere safe (you rarely need it again).
2. Project → Settings → API: copy the **Project URL** and **anon public key**. These become `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (in `.env` locally, and in Vercel env vars for deploys).

## 2. Run the SQL (SQL Editor, in this exact order)

| # | File | Adds |
|---|------|------|
| 1 | `supabase/schema.sql` | users, pairs, messages, RLS, `match_user()`, `get_my_status()` |
| 2 | `supabase/migrations/001_beta.sql` | reports, blocks, `is_banned`, `pairs.active`, rematch + delete functions |
| 3 | `supabase/migrations/002_pilot.sql` | `is_admin`, `assert_admin()`, admin RPCs |
| 4 | `supabase/migrations/003_analytics.sql` | `analytics_events`, `log_event()`, `admin_get_pilot_stats()` |
| 5 | `supabase/migrations/004_web_rpc.sql` | `register_and_match()` (web signup path) |
| 6 | `supabase/migrations/005_pilot_fixes.sql` | **Required.** Matching hardening (no duplicate pairs, no banned/blocked matches, race-safe), RLS column protection (blocks is_admin/is_banned self-escalation), block-aware rematch, `poll_and_match()` |
| 7 | `supabase/migrations/006_feature_wave.sql` | **Feature wave 1.** Schools + same-school matching, cohorts + graduation reveal, push notification tables/queue, server-side rate limiting (`send_message`), read receipts, app_config switches, admin RPCs for all of it |

Paste each file's contents into a new query and Run. All six should finish
with "Success. No rows returned".

**Verify:** run

```sql
select proname from pg_proc
where proname in ('match_user','register_and_match','poll_and_match',
                  'deactivate_pair_and_rematch','log_event',
                  'admin_get_pilot_stats','delete_my_account',
                  'send_message','request_reveal','get_reveal_state',
                  'register_user_and_match','mark_pair_read','enqueue_notification')
order by proname;
```

You should get 13 rows.

## 3. Auth configuration

Authentication → URL Configuration:

- **Site URL:** `https://<your-vercel-domain>`
- **Redirect URLs:** add `https://<your-vercel-domain>/auth/callback`
  (and `http://localhost:8081/auth/callback` for local dev)

Authentication → Providers → Email:

- **Confirm email OFF** for testing (simplest flow: signup → instant match).
- **Confirm email ON** for public launch. The app fully supports both: with
  confirmation on, signups land on a "Check your email" screen, and the
  status screen finishes registration after the link is clicked. Password
  recovery uses the same `/auth/callback` route.

## 4. Make yourself admin

Sign up in the app first, then in the SQL Editor:

```sql
update public.users set is_admin = true where email = 'you@school.edu';
```

Sign out and back in — Settings now shows the Admin dashboard entry.

## 5. Seed data (dev projects ONLY — never production)

`supabase/seed.sql` creates six QA scenarios (waiting pair, matched pair with
messages, inactive pair, banned user, admin, open report) with fixed UUIDs
and password `password123` (admin: `adminpass123`). Direct inserts into
`auth.users` are unsupported-but-workable for dev; if login for seeded users
fails on a newer Supabase version, create users via the app instead.

## 6. Edge Functions (optional for web pilot, required for native delete)

Web uses the `register_and_match()` RPC — no Edge Function needed for
signup/matching. Account deletion calls the `delete-account` Edge Function;
until it is deployed the app shows a graceful "not available" message.

```bash
npm i -g supabase
supabase login
supabase functions deploy delete-account --project-ref <project-ref>
supabase functions deploy match-user --project-ref <project-ref>            # native registration path
supabase functions deploy send-notification --project-ref <project-ref>    # push delivery worker
supabase functions deploy generate-support-prompt --project-ref <project-ref>  # AI prompts (static fallback without it)

# AI provider key (optional — static templates are served without it):
supabase secrets set AI_API_KEY=<anthropic-api-key> --project-ref <project-ref>
supabase secrets set AI_MODEL=claude-opus-4-8 --project-ref <project-ref>   # optional override
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically by the platform.

**Push delivery cron** — notification events are enqueued by the database;
schedule the send-notification function to drain the queue (SQL Editor,
requires the `pg_cron` + `pg_net` extensions, Dashboard → Database →
Extensions):

```sql
select cron.schedule('deliver-push', '* * * * *', $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>',
                                  'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
$$);
```

Web-only pilots can skip all of this — events are queued and marked
'skipped' when a user has no push tokens.

## 7. Local SQL verification (optional)

With PostgreSQL 16 installed locally you can verify the whole schema +
migrations (idempotency + functional tests) without touching Supabase:

```bash
sudo -u postgres bash supabase/tests/run-local.sh
```

## 8. Quick end-to-end check

1. Open the deployed app → sign up with `test1@school.edu`, year 2027 → you land on Waiting.
2. Incognito window → sign up `test2@school.edu`, year 2027 → both land in Chat within ~5 seconds.
3. Send messages both ways — they appear in realtime.
4. Try sending "add me on instagram" — blocked by the identity filter.
