# Penn Pal — Project Sendoff

**Last updated:** July 2026
**Branch:** `claude/penn-pal-mvp-0OISQ`
**Status:** Feature-complete for pilot. Web deployment live on Vercel. One open issue in the web auth/registration flow (see [Open Issue](#open-issue-registration-on-web)).

This document is the single starting point for anyone picking up this project — a future developer, a future AI session, or future you.

---

## 1. What Penn Pal Is

A mobile-first app that pairs each college student with **one anonymous classmate** from their graduation year. No feed, no profiles, no followers — one private 1:1 chat for the whole college journey.

- Sign up with a `.edu` email → pick graduation year → get matched with one waiting classmate
- Chat is anonymous; an identity filter blocks messages containing phones, emails, social handles, URLs, and name disclosures
- Safety: one-tap report, block-and-rematch, crisis resources (988 / Crisis Text Line), 14-day inactive-pair banner
- Admin dashboard for reports, user bans, and pilot stats

## 2. Tech Stack

| Layer | Choice |
|---|---|
| App framework | Expo SDK 51 / React Native 0.74 / Expo Router 3 (file-based routes) |
| Styling | NativeWind v4 (Tailwind), custom dark palette in `tailwind.config.js` |
| Backend | Supabase — Auth, Postgres + RLS, Realtime, RPCs |
| Web hosting | Vercel (static export via `expo export --platform web`) |
| Native builds | EAS Build (`eas.json` — dev/preview/production profiles) |
| Language | TypeScript throughout |

## 3. Repository Map

```
app/
  (auth)/        welcome, login, signup
  (app)/         status (router), waiting, chat, settings, banned, policy/{privacy,terms,guidelines}
  (admin)/       dashboard (stats/reports/users tabs), report/[id]
  auth/callback  web email-confirmation landing page
  _layout.tsx    root: auth redirect, banned-user lockout, admin group
components/      ChatMenuModal, StarterPrompts, ErrorState, …
context/         AuthContext (session, isBanned, isAdmin, refreshProfile)
hooks/           useChat (messages, optimistic send, typing), useMatchStatus (5s polling)
lib/             supabase client, identityFilter, starterPrompts, analytics
supabase/
  schema.sql             base schema — run FIRST
  migrations/001–004     beta, pilot, analytics, web RPC — run IN ORDER
  seed.sql               QA test data (6 scenarios, fixed UUIDs) — never on prod
  functions/             match-user, delete-account Edge Functions (see §6)
docs/
  qa-testing.md          12 manual test suites
  release-checklist.md   11-section native launch checklist
  assets/                App Store / Play Store / screenshot / landing / policy copy
```

## 4. Supabase Setup (required, in order)

Project ref in use during development: `oifcgldvfpyqwxuptyix`.

1. **SQL Editor — run in this exact order:**
   1. `supabase/schema.sql` — users, pairs, messages, RLS, `match_user()`, `get_my_status()`
   2. `migrations/001_beta.sql` — reports, blocks, `is_banned`, `pairs.active`, rematch + delete functions
   3. `migrations/002_pilot.sql` — `is_admin`, `assert_admin()`, admin RPCs
   4. `migrations/003_analytics.sql` — `analytics_events`, `log_event()`, `admin_get_pilot_stats()`
   5. `migrations/004_web_rpc.sql` — `register_and_match()` (replaces the match-user Edge Function for web)

2. **Authentication → URL Configuration:**
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: `https://<your-vercel-domain>/auth/callback`

3. **Authentication → Providers → Email:**
   - For testing, turn **"Confirm email" OFF**. This removes the biggest source of flow breakage. Re-enable before public launch.

4. **Make yourself admin:** `update public.users set is_admin = true where email = '<you>';`

## 5. Vercel Setup

Already configured in the repo:

- `vercel.json` — install: `npm install --legacy-peer-deps --ignore-scripts`; build: `npx expo export --platform web`; output `dist/`; SPA rewrite of all paths to `/index.html`
- `.npmrc` — `legacy-peer-deps` + `ignore-scripts` baked in
- `package.json` — `build` script + Node ≥18 engine

Required environment variables (Project → Settings → Environment Variables):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

A blank white page after deploy almost always means these are missing — the Supabase client throws at startup.

### Build errors already fixed (don't re-introduce)

| Symptom | Cause | Fix (committed) |
|---|---|---|
| `ETARGET @types/react-native@~0.74.0` | Package abandoned; RN 0.74 ships own types | Removed from devDependencies |
| `install exited with 1` (no detail) | Peer-dep conflicts + native postinstall scripts | `--legacy-peer-deps --ignore-scripts` |
| `react-native-web` missing | Required for web export | Added `~0.19.10` |
| Babel `.plugins is not a valid Plugin property` | `nativewind/babel` is a v2 API | Removed; v4 uses the Metro transformer only |
| Parse error in `starterPrompts.ts` | Apostrophes inside single-quoted strings | Switched to double quotes |

## 6. The Edge Function Situation (important design note)

The original design used two Supabase Edge Functions (`supabase/functions/`):

- **match-user** — called after signup to create the profile row and run matching
- **delete-account** — verifies JWT, calls `delete_my_account()`, then deletes the auth user

Deploying Edge Functions requires the Supabase CLI, which was not available during setup. So for the **web pilot**, `match-user` was replaced by the `register_and_match()` RPC (migration 004) called directly from the client. The Edge Function code is still in the repo and is still the right approach for the native app launch — deploy both with:

```bash
supabase functions deploy match-user --project-ref <ref>
supabase functions deploy delete-account --project-ref <ref>
```

**Account deletion currently depends on the delete-account Edge Function.** Until it is deployed, Settings → Delete account will fail. This is a known gap.

## 7. How the Core Flow Works Now (web)

1. **Signup** (`app/(auth)/signup.tsx`): `supabase.auth.signUp()` → grad year + prompt saved to AsyncStorage (`@pennpal:pending_grad_year`) → `register_and_match` RPC attempted. If email confirmation is on, this RPC fails silently (no session yet) — that's expected; recovery happens in step 3.
2. **Email confirmation** lands on `/auth/callback`, which waits for `onAuthStateChange` (the client has `detectSessionInUrl: true` on web) and routes to `/status`.
3. **Status screen** (`app/(app)/status.tsx`) is the self-healing router: fetches the user row with `maybeSingle()`. If the row is **missing**, it re-runs `register_and_match` with the saved grad year; if the RPC itself fails (migration 004 not run), it falls back to a direct `users` upsert. Then routes to `/waiting` or `/chat`.
4. **Waiting** polls status every 5s (`useMatchStatus`); on match, routes to chat.
5. **Matching** is `match_user()` in Postgres — FIFO by `created_at`, same `grad_year`, `FOR UPDATE SKIP LOCKED` to prevent races.

## 8. Open Issue: Registration on Web

**Symptom:** after signing in, user sees "No connection — Could not reach the server."

**What's known:** that error comes from `useMatchStatus` when the `users` query fails or (pre-fix) when the row doesn't exist. The last two commits (`50f18b4`, `b58b71d`) added the self-healing status screen + direct-insert fallback, but **the fix was not yet confirmed working** when this doc was written — the user reported "same thing" before the final commit deployed.

**Debug in this order:**
1. Confirm the deployed commit on Vercel is `b58b71d` or later (Deployments → check commit hash).
2. Open browser DevTools → Network tab → reload. Find the failing request to `*.supabase.co`:
   - `404` / relation-does-not-exist → `schema.sql` wasn't run (or ran in wrong project)
   - `401` / JWT errors → wrong anon key in Vercel env vars
   - RLS/permission error on `users` insert → check the `users_insert_own` policy exists (it's in schema.sql)
   - CORS failure → confirm the URL env var has no trailing slash and matches the project ref
3. Confirm migration 004 ran: SQL Editor → `select proname from pg_proc where proname = 'register_and_match';` — should return one row.
4. Check whether the auth user actually exists: Dashboard → Authentication → Users. If the user exists in auth but not in `public.users`, the recovery path in `status.tsx` is the code to debug.
5. Simplest clean test: turn Confirm-email OFF, delete the test user from both `auth.users` (dashboard) and any stale row in `public.users`, then sign up fresh. This exercises the happy path with no confirmation gap.

**Root-cause hypothesis (most likely):** the sequence signup → confirm → sign-in was performed with users created **before** the fixes deployed, leaving orphaned auth users with no `public.users` row and no saved grad year in that browser's storage. Those accounts hit the no-recovery path. Fresh signups on the current build should work; stale test accounts should be deleted.

## 9. Testing Two-User Matching

Matching needs two accounts with the **same graduation year**. Use a normal window + an incognito window (separate storage), sign up both with the same year, and they'll pair within one 5-second poll. Seed data (`supabase/seed.sql`) covers the other scenarios — matched pair with history, inactive pair, banned user, open report — but is for a dev project only.

## 10. What's Done vs. Not Done

**Done and committed:**
- Full app: auth, matching, realtime chat, typing indicator, optimistic sends, identity filter v2, report/block/rematch, account-deletion UI, settings, policy screens, banned lockout, starter prompts + silence nudge, inactive-pair banner
- Admin dashboard: pilot stats, reports queue + detail with messages, user ban/unban
- Analytics: 12 fire-and-forget events, never block UX
- Web deployment pipeline on Vercel (working build)
- All launch copy: `docs/assets/` (App Store, Play Store, 6 screenshot overlays, landing page, privacy/terms/guidelines/support/deletion drafts)
- `docs/release-checklist.md` (native launch) and `docs/qa-testing.md` (12 suites)

**Not done:**
- Resolve the open web-registration issue (§8)
- Deploy the two Edge Functions (§6) — account deletion is broken until then
- EAS: real `projectId` in `app.json`, credentials in `eas.json`, then TestFlight/Play builds
- Host policy pages at real URLs (store submissions require them; drafts are ready in `docs/assets/support-policy-copy.md`)
- Password-reset flow (support copy references "Forgot password"; no screen implements it)
- Fill `[Insert date]` and `[Your State]` placeholders in policy drafts; replace `pennpal.app` / `support@pennpal.app` with real domain and inbox
- Re-enable email confirmation before public launch if it was disabled for testing

## 11. Session History (git log tells the story)

| Commit | Milestone |
|---|---|
| `36b6de1` | MVP — full Expo + Supabase implementation |
| `ae57584` | Beta — report/block/rematch, settings, policies, identity filter v2 |
| `15c206b` | Pilot — admin dashboard, starter prompts, banned users, QA suite |
| `7f54346` | Launch-ready — analytics, pilot stats, error polish, release checklist |
| `97677df` | Launch asset pack — all store/landing/policy copy |
| `2026260`–`8dd3a99` | Vercel web deployment + five build fixes |
| `ed36d04`–`b58b71d` | Web auth flow: URL session detection, RPC replacing Edge Function, self-healing registration |

---

*Questions the docs don't answer are probably answered by the code — it's small, typed, and commented where it needs to be. Start at `app/_layout.tsx` and follow the routes.*
