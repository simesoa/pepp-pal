# Penn Pal — Deployment Guide

End-to-end instructions from a blank Supabase project to a live pilot on
Vercel, plus the native (EAS) path. Supabase specifics live in
[`docs/supabase-setup.md`](docs/supabase-setup.md); this file is the overall
runbook.

## 1. Prerequisites

- A Supabase project (free tier is fine for a pilot)
- A Vercel account connected to this GitHub repo
- Node ≥ 18 locally

## 2. Supabase (do this first)

Follow [`docs/supabase-setup.md`](docs/supabase-setup.md):

1. Run `supabase/schema.sql` then `supabase/migrations/001 → 005` **in order**
   in the SQL Editor. All files are idempotent. **Migration 005 is required** —
   it contains security and matching fixes (RLS column protection, block-aware
   matching, `poll_and_match()`, `delete_user_account()`).
2. Auth → URL Configuration: Site URL = your Vercel domain; add
   `https://<domain>/auth/callback` (and `http://localhost:8081/auth/callback`)
   to Redirect URLs.
3. Auth → Providers → Email: Confirm email **OFF** for pilot testing, **ON**
   for public launch (both flows are supported by the app).
4. Copy the Project URL + anon key (Settings → API).

## 3. Vercel

Repo config is already committed:

| File | Setting |
|---|---|
| `vercel.json` | install: `npm install --legacy-peer-deps --ignore-scripts`, build: `npx expo export --platform web`, output `dist/`, SPA rewrite → `/index.html` |
| `.npmrc` | `legacy-peer-deps` + `ignore-scripts` |
| `package.json` | `build` script, Node ≥ 18 engine, **`@supabase/supabase-js` pinned to 2.45.4** (newer versions break Metro web export — don't loosen the pin casually) |

**Environment variables** (Project → Settings → Environment Variables — set
for Production *and* Preview):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

If they're missing the app no longer renders a blank page — it shows a
configuration-error screen naming the missing variables. Redeploy after
adding them (env vars are baked in at build time).

Deploy: push to the production branch (or `vercel --prod`). Verify with:

```bash
npm install --legacy-peer-deps --ignore-scripts
npm run typecheck        # tsc --noEmit
npm run test:filter      # identity-filter unit tests
npm run build            # expo export --platform web → dist/
```

## 4. Make yourself admin

Sign up in the deployed app, then in the Supabase SQL Editor:

```sql
update public.users set is_admin = true where email = 'you@school.edu';
```

Sign out/in → Settings → Admin dashboard.

## 5. Test two-user matching

1. Normal browser window: sign up `test1@x.edu`, year 2027 → Waiting screen.
2. Incognito window: sign up `test2@x.edu`, year 2027 → both drop into Chat
   within ~5 seconds (the waiting screen's `poll_and_match` retries
   server-side, so even a missed race self-heals on the next poll).
3. Different-year accounts must NOT match.
4. Cleanup between test runs: delete the user in Supabase Auth → Users
   (cascades to `public.users`, pairs, and messages).

## 6. Edge Functions (account deletion)

Web signup/matching needs **no** Edge Function (it uses the
`register_and_match` RPC). Account deletion calls `delete-account`; until
deployed, the in-app button fails gracefully and tells the user their account
was NOT deleted.

```bash
npm i -g supabase
supabase login
supabase functions deploy delete-account --project-ref <ref>
supabase functions deploy match-user --project-ref <ref>   # future native path
```

## 7. Native builds (EAS)

Not required for the web pilot. When ready:

1. `npm i -g eas-cli && eas login`
2. `eas init` — replaces `YOUR_EAS_PROJECT_ID` in `app.json` with a real
   project id.
3. Check identifiers in `app.json`: `com.pennpal.app` (iOS + Android) —
   change if the final brand differs.
4. `eas build --profile preview --platform ios` (internal) then
   `--profile production` for TestFlight / Play internal testing.
5. Fill `submit.production` in `eas.json` (Apple ID, ASC app id, team id /
   Play service-account JSON).
6. Follow `docs/release-checklist.md`.

## 8. Common errors

| Symptom | Cause | Fix |
|---|---|---|
| Configuration-error screen | Missing env vars | Add both `EXPO_PUBLIC_*` vars in Vercel, redeploy |
| "Could not find the function register_and_match" in console | Migration 004/005 not run | Run them in the SQL Editor |
| Signup → "Check your email" but link 404s | Redirect URL not whitelisted | Add `https://<domain>/auth/callback` in Supabase Auth URL config |
| Two same-year users don't match | Migration 005 missing (no `poll_and_match`) or one user is banned/blocked | Run 005; check `public.users.status` |
| `expo export` fails resolving `@opentelemetry` | supabase-js unpinned | Keep `@supabase/supabase-js` at exactly 2.45.4 |
| Account deletion says unavailable | `delete-account` Edge Function not deployed | §6 above |
| Password reset link says expired | Link opened after 1h, or Site URL wrong | Request a new link; verify Auth URL config |

## 9. Pre-launch checklist (web pilot)

- [ ] Migrations 001–005 run, verification query returns 7 functions
- [ ] Env vars set in Vercel (prod + preview)
- [ ] Auth Site URL + redirect URLs configured
- [ ] Confirm email ON (public) and email templates reviewed
- [ ] Admin account promoted
- [ ] Two-user matching verified on production
- [ ] Identity filter spot-checked ("add me on insta" blocked)
- [ ] Report → admin dashboard → resolve verified
- [ ] Ban → banned user locked out verified
- [ ] `delete-account` Edge Function deployed (or accepted as email-support-only)
- [ ] Real values set in `lib/config.ts` (domain, support inbox, legal state, policy date)
