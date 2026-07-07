# Penn Pal – Pilot Release Checklist

Work through every section top-to-bottom before submitting to TestFlight or Google Play Internal Testing.

---

## 1. Environment Variables

Create a `.env` file in the project root (never commit it):

```bash
cp .env.example .env
```

Fill in both values from the Supabase dashboard → **Settings → API**:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Verify at runtime: the app will throw a descriptive error on launch if either variable is missing.

---

## 2. Supabase Setup

### 2a. Create project

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a strong database password and save it in your password manager
3. Select a region closest to your pilot users

### 2b. Apply migrations (in order)

Open **SQL Editor** and run each file sequentially:

| Order | File | Purpose |
|---|---|---|
| 1 | `supabase/schema.sql` | Core tables, RLS, `match_user()`, `get_my_status()` |
| 2 | `supabase/migrations/001_beta.sql` | `reports`, `blocks`, `pairs.active`, `last_message_at`, `is_banned`, admin-ready fields |
| 3 | `supabase/migrations/002_pilot.sql` | `is_admin`, all `admin_*` RPC functions, `assert_admin()` |
| 4 | `supabase/migrations/003_analytics.sql` | `analytics_events`, `log_event()`, `admin_get_pilot_stats()` |
| 5 | `supabase/migrations/004_web_rpc.sql` | `register_and_match()` — web signup/registration path |
| 6 | `supabase/migrations/005_pilot_fixes.sql` | **Required.** Security + matching hardening: RLS column protection, block-aware matching, `poll_and_match()`, `delete_user_account()` |

> ⚠️ **Never run `supabase/seed.sql` in production.** It is for local development only.

### 2c. Enable Realtime

In the Supabase dashboard → **Database → Replication**, confirm `messages` is listed under `supabase_realtime`. The schema already runs `alter publication supabase_realtime add table public.messages` but verify it is active.

### 2d. Set your first admin user

After signing up with your own `.edu` email, find your user ID in the Supabase dashboard → **Authentication → Users**, then run:

```sql
update public.users set is_admin = true where id = '<your-user-id>';
```

---

## 3. Edge Function Deployment

Install the Supabase CLI if needed:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <project-ref>
```

Deploy both functions:

```bash
supabase functions deploy match-user
supabase functions deploy delete-account
```

Verify each shows **Active** in the dashboard → **Edge Functions**.

### Required secrets

The Edge Functions read secrets from the Supabase environment automatically:

| Secret | Where it comes from |
|---|---|
| `SUPABASE_URL` | Set automatically by Supabase runtime |
| `SUPABASE_ANON_KEY` | Set automatically |
| `SUPABASE_SERVICE_ROLE_KEY` | Set automatically |

No manual secret configuration is needed for these functions.

---

## 4. Dev / Seed Data Handling

| Environment | Action |
|---|---|
| Local dev | Run `supabase/seed.sql` freely against local DB |
| Staging | Run `supabase/seed.sql` if testing flows end-to-end |
| **Production** | **Never run seed.sql** — it creates fake users with predictable UUIDs |

To reset a local database completely:

```bash
supabase db reset   # re-applies schema.sql + all migrations in supabase/migrations/
```

---

## 5. EAS / app.json Configuration

### 5a. One-time EAS setup

```bash
npm install -g eas-cli
eas login
eas build:configure   # generates app.json projectId if not set
```

Copy the generated `projectId` into `app.json → extra.eas.projectId`.

### 5b. app.json checklist

- [ ] `version` is correct (e.g. `"1.0.0"`)
- [ ] `ios.buildNumber` matches the build you're submitting (increment for each TestFlight upload)
- [ ] `android.versionCode` is incremented for each Play Store upload
- [ ] `ios.bundleIdentifier` = `com.pennpal.app` (or your registered ID)
- [ ] `android.package` = `com.pennpal.app`
- [ ] `extra.eas.projectId` is set to your real project ID

### 5c. eas.json checklist

Fill in the submit section before first store submission:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "you@example.com",
      "ascAppId": "1234567890",       // App Store Connect app ID
      "appleTeamId": "ABCDE12345"
    },
    "android": {
      "serviceAccountKeyPath": "./google-service-account.json",
      "track": "internal"            // start with "internal", promote to "production"
    }
  }
}
```

---

## 6. TestFlight (iOS)

### 6a. Prerequisites

- [ ] Apple Developer Program membership active
- [ ] App record created in [App Store Connect](https://appstoreconnect.apple.com)
- [ ] Bundle ID `com.pennpal.app` registered in the Developer portal
- [ ] Distribution certificate and provisioning profile valid (EAS manages these)

### 6b. Build and upload

```bash
# Production build (uploads to App Store Connect automatically)
eas build --profile production --platform ios

# Submit to TestFlight
eas submit --profile production --platform ios
```

### 6c. TestFlight setup

1. App Store Connect → **TestFlight** → Internal Testing → Add the build
2. Add internal testers (up to 100 people, no review needed)
3. For external testing (up to 10,000): submit for TestFlight Beta Review (~24 hours)

### 6d. Review notes for Apple

When submitting for external review, include this note:

> Penn Pal is a private 1-on-1 anonymous messaging app for college students. Users sign up with a .edu email, are matched with one anonymous partner in their graduating class, and chat until graduation. No social feed, no profiles, no payments. Crisis resources (988 Lifeline) are accessible in one tap. The app contains a Community Guidelines screen accessible from Settings.
>
> Test credentials: (provide a test .edu email + password you created)

---

## 7. Google Play Internal Testing (Android)

### 7a. Prerequisites

- [ ] Google Play Developer account active ($25 one-time fee)
- [ ] App created in [Play Console](https://play.google.com/console)
- [ ] Service account created with **Release Manager** role; JSON key downloaded to `./google-service-account.json`

### 7b. Build and upload

```bash
eas build --profile production --platform android
eas submit --profile production --platform android
```

The build produces an `.aab` (Android App Bundle) which Play Console requires.

### 7c. Internal testing setup

1. Play Console → **Testing → Internal testing** → Create release → select the AAB
2. Add testers by email (up to 100)
3. Testers install via the opt-in link Play Console provides

### 7d. Promote to production

1. Play Console → **Production → Create release**
2. Copy release notes from the internal release
3. Submit for review (~3–7 days for first submission)

---

## 8. Required Store Metadata

Prepare these before submitting for review:

### App name
`Penn Pal`

### Subtitle / short description (30 chars max for iOS)
`Your anonymous college companion`

### Description (both stores)
```
Penn Pal connects you with one anonymous partner in your graduating class.
Chat throughout college and reveal your identity at graduation.

This is a private 1-on-1 space — not a social network, not a dating app.
Just one person, walking the same path.

• Matched by graduation year using your .edu email
• Completely anonymous until you both choose to reveal yourselves
• Calm, minimal design — no notifications, no metrics, no feed
• Built-in safety tools: report, block, crisis resources in one tap

Penn Pal is for college students who want one quiet, honest connection.
```

### Keywords (iOS, comma-separated)
`college, anonymous, pen pal, support, mental health, student, companion, chat`

### Category
- iOS: **Social Networking**
- Android: **Communication**

### Age rating
- iOS: **17+** (unrestricted web access, user-generated content)
- Android: **Teen** (social interaction)

### Privacy Policy URL
Host the content of `app/(app)/policy/privacy.tsx` at a public URL (e.g. `https://pennpal.app/privacy`) before submitting. Both stores require a live URL.

### Support URL / email
`https://pennpal.app` (or `mailto:support@pennpal.app`)

### Screenshots required
- iOS: 6.7" (iPhone 15 Pro Max), 5.5" (iPhone 8 Plus), iPad 12.9" (if tablet enabled — it is not)
- Android: Phone screenshots (16:9 or 9:16)

Minimum 3 screenshots per device size. Recommended screens:
1. Welcome / landing
2. Waiting screen
3. Chat screen

---

## 9. Pre-Launch Smoke Test

Run through this on a real device (not simulator) before opening to pilot users:

- [ ] Sign up with a `.edu` email → lands on waiting screen
- [ ] Sign up with a second account (same grad year) → both users matched within 5 seconds
- [ ] Send a message → appears in real time on both devices
- [ ] Send a message containing a phone number → blocked, warning shown
- [ ] Tap ⋯ → Report conversation → submit reason → confirmation alert shown
- [ ] Tap ⋯ → Request rematch → confirm → both land on waiting/status screen
- [ ] Settings → Delete account → confirm → signed out, welcome screen shown
- [ ] Sign in as admin → Settings → Admin dashboard → Stats tab loads
- [ ] Sign in as banned user → lands directly on banned screen
- [ ] Tap "Support" in chat → Safety modal opens with 988 and Crisis Text Line
- [ ] Tap "Contact support" in Settings → mail app opens with pre-filled subject
- [ ] Policy screens (Privacy, Terms, Guidelines) scroll to bottom without clipping

---

## 10. Post-Launch Monitoring

| Signal | Where to check | Action threshold |
|---|---|---|
| Open reports | Admin dashboard → Reports | Review within 24 hours |
| Waiting users without matches | Admin dashboard → Stats → Waiting by year | Invite more users from same grad year |
| Signup rate vs match rate | Analytics events table | If signups >> matches, accelerate invites |
| Error rate | Supabase dashboard → Logs | Any 5xx in Edge Functions → investigate |
| Banned users | Admin → Users → filter BANNED | Review associated reports |

---

## 11. Rollback Plan

If a critical bug is found post-launch:

1. **iOS**: Submit a new build via `eas build + eas submit`. TestFlight distributes within minutes; App Store takes ~24 hours.
2. **Android**: Upload a new AAB to Play Console → Internal testing → Promote when verified.
3. **Database**: All migrations are additive (no destructive changes). Roll back application code only.
4. **Edge Functions**: `supabase functions deploy <name>` with a previous working commit checked out.
