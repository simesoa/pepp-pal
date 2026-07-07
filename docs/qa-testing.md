# Penn Pal – QA Test Plan

This document covers manual test scenarios for the Penn Pal pilot. Each scenario lists the precondition, steps, and expected outcome.

## Setup

```bash
# 1. Start Supabase locally
supabase start

# 2. Apply schema + migrations
supabase db reset            # applies schema.sql + all migrations in order

# 3. Seed test data
psql $DATABASE_URL -f supabase/seed.sql

# 4. Start the Expo dev build
npx expo start
```

Test accounts (all passwords: `password123` unless noted):

| Email | Password | State |
|---|---|---|
| alice@test.edu | password123 | waiting, class 2026 |
| bob@test.edu | password123 | waiting, class 2026 |
| carol@test.edu | password123 | matched, class 2026, has messages |
| dave@test.edu | password123 | matched, class 2026, has messages |
| erin@test.edu | password123 | matched, class 2025, INACTIVE (20 days) |
| frank@test.edu | password123 | matched, class 2025, INACTIVE (20 days) |
| banned@test.edu | password123 | banned |
| admin@test.edu | adminpass123 | admin |

---

## 1. Match Flow

### 1A – Happy path: two waiting users in same year

**Precondition:** alice and bob are both `status = 'waiting'`, `grad_year = 2026`.

1. Sign in as `alice@test.edu`
2. Observe: Waiting screen with pulsing orb
3. In another session (incognito), trigger matching via: `supabase rpc match_user --data '{"requesting_user_id":"<bob_id>"}'` OR let the 5s poll run after bob signs in
4. **Expected:** Both alice and bob are redirected to chat within 5 seconds of the match

### 1B – No partner available

**Precondition:** Only one waiting user in a grad year.

1. Create a new user with a unique grad year (e.g. 2039)
2. **Expected:** User sees Waiting screen and stays there; no errors

### 1C – Concurrent sign-ups

**Precondition:** Two users with same grad year sign up within seconds of each other.

1. Sign up `testA@test.edu` (year 2027) and `testB@test.edu` (year 2027) rapidly
2. **Expected:** Exactly one pair is created; no duplicate pairs; both users end up in chat

---

## 2. Chat Flow

### 2A – Basic send and receive

1. Sign in as `carol@test.edu` and `dave@test.edu` in two sessions
2. Carol types "Hello" and sends
3. **Expected:** Message appears immediately for Carol (optimistic), then confirmed; Dave sees it in real time

### 2B – Typing indicator

1. Carol starts typing (does not send)
2. **Expected:** Dave sees "Penn Pal is typing…" within 2 seconds; indicator disappears 3s after Carol stops

### 2C – Starter prompts (empty chat)

**Precondition:** A freshly matched pair with zero messages.

1. Sign in as a newly matched user
2. **Expected:** Chat screen shows 5 starter prompt cards
3. Tap a prompt → **Expected:** Input field is pre-filled with prompt text

### 2D – Silence nudge

**Precondition:** Carol and Dave with existing messages.

1. Set `SILENCE_NUDGE_MINUTES = 0.05` (3 seconds) in `lib/starterPrompts.ts` temporarily for testing
2. Open chat, wait 3 seconds without typing
3. **Expected:** Horizontal nudge strip appears above input bar
4. Tap a nudge prompt → **Expected:** Input pre-filled; nudge hides

---

## 3. Identity Filter

Test each pattern should be **blocked**:

| Input | Reason |
|---|---|
| `call me at 555-867-5309` | Phone number |
| `my number is 5 5 5 8 6 7 5 3 0 9` | Spaced phone number |
| `email me at user@example.com` | Email address |
| `reach me at user [at] domain [dot] com` | Obfuscated email |
| `find me on instagram` | Social keyword |
| `my i g is @handle` | Obfuscated Instagram |
| `tik tok / myhandle` | Obfuscated TikTok |
| `snap me` | Snapchat keyword |
| `check my website at mysite.com` | URL |
| `my name is John Smith, I'm in CS` | Name disclosure |
| `hmu on discord` | Intent keyword |
| `find me on reddit` | Intent keyword |

Test each input should **pass** (not blocked):

| Input | Reason |
|---|---|
| `I'm having a rough week` | No PII |
| `The professor called me out today` | Contains "called" but no name intent |
| `I'm really struggling with CS 101` | Normal message |
| `My dog is named Max` | Name but no sharing intent |

After each blocked message: **Expected** – red warning banner appears; message NOT sent; input is preserved.

---

## 4. Report Flow

**Precondition:** carol and dave are matched.

1. Sign in as `carol@test.edu`, open chat
2. Tap `⋯` menu → "Report conversation"
3. Select reason "Harassment or bullying"
4. Tap "Submit report"
5. **Expected:** Confirmation alert; report inserted into `reports` table with `status = 'open'`

### 4B – Admin sees report

1. Sign in as `admin@test.edu`
2. Settings → Admin dashboard
3. **Expected:** Report from carol appears under "Reports (1)"
4. Tap the report → **Expected:** Detail screen shows reason, reporter email, and recent messages
5. Tap "Mark reviewed" → **Expected:** Status updates to `reviewed`

---

## 5. Block and Rematch Flow

**Precondition:** carol and dave are matched.

1. Sign in as `carol@test.edu`, open chat
2. Tap `⋯` → "Block and rematch"
3. Confirm in alert
4. **Expected:**
   - Carol is immediately navigated to waiting screen
   - `pairs` row has `active = false`
   - Both `carol` and `dave` have `status = 'waiting'` and `pair_id = null`
   - If another user in 2026 is waiting, carol is matched immediately

---

## 6. Request Rematch Flow (one-sided)

**Precondition:** erin and frank are matched (inactive pair).

1. Sign in as `erin@test.edu`
2. **Expected:** Inactive pair banner shown ("No messages in 14 days")
3. Tap "Rematch" → open menu → "Request rematch"
4. Confirm
5. **Expected:**
   - Erin goes to waiting screen
   - Frank's account still has `pair_id` but pair is `active = false` — he sees no new messages can be sent (RLS blocks inserts)
   - Erin is immediately matched if a partner is available

---

## 7. Inactive Pair Handling

**Precondition:** erin and frank last messaged 20 days ago (from seed).

1. Sign in as `erin@test.edu`
2. Navigate to chat
3. **Expected:** Yellow/muted banner at top: "No messages in 14 days. Looking for a fresh start?"
4. Banner has "Rematch" button → opens chat menu

---

## 8. Delete Account Flow

1. Sign in as `carol@test.edu`
2. Settings → "Delete account"
3. Read the confirmation text (should mention data anonymisation)
4. Confirm deletion
5. **Expected:**
   - `carol` auth row deleted
   - `public.users` row for carol: email anonymised to `deleted-<uuid>@deleted.invalid`, pair_id = null
   - Dave's account: `status = 'waiting'`, `pair_id = null`
   - Carol's pair: `active = false`
   - Carol is signed out and lands on welcome screen
   - Attempting to sign in as `carol@test.edu` again should fail

---

## 9. Banned User Access

**Precondition:** `banned@test.edu` has `is_banned = true`.

1. Sign in as `banned@test.edu`
2. **Expected:** Immediately redirected to banned screen (not to chat or waiting)
3. Banned screen shows "Account suspended" with support email CTA
4. Tapping "Contact support" opens mail app with pre-filled subject
5. Tapping "Sign out" logs out and returns to welcome screen

### 9B – Banned user cannot send messages (RLS)

Using the Supabase dashboard or a direct DB query, attempt to insert a message as `banned@test.edu`'s user ID into their (now deactivated) pair.

**Expected:** Insert rejected by RLS policy `messages_insert_own_pair`.

---

## 10. Admin Ban / Unban Flow

**Precondition:** admin@test.edu is signed in.

1. Settings → Admin dashboard → Users tab
2. Find `carol@test.edu`
3. Tap "Ban"
4. Confirm
5. **Expected:**
   - `carol.is_banned = true`
   - Carol's active pair deactivated
   - Dave returned to waiting
   - If carol is currently signed in (in another session), the app redirects carol to banned screen on next poll/refresh

### 10B – Unban

1. Find `banned@test.edu` in user list
2. Tap "Unban"
3. **Expected:** `is_banned = false`; user can now sign in normally

---

## 11. Policy and Support Screens

1. Open welcome screen → footer links (Privacy, Terms, Guidelines) → each opens correct screen
2. Signup screen → "By signing up…" links → correct screens
3. Settings → Legal & Safety → all three policies open
4. Settings → Support → "Contact support" opens mail app; "Crisis resources" dials 988
5. Chat screen → "Support" button → Safety modal with 988 and Crisis Text Line

---

## 12. App Review Checklist

Before submitting to the App Store / Google Play:

- [ ] `.edu` email validation works (try `user@gmail.com` — should be rejected)
- [ ] Password minimum 8 chars enforced
- [ ] All policy screens accessible without being logged in (welcome footer)
- [ ] Crisis resources reachable in one tap from chat
- [ ] "Delete account" clearly explains what happens to data
- [ ] No personal information (real name, location) is collected or displayed
- [ ] No in-app purchases or paywalls present
- [ ] App does not crash on iOS 16+ or Android 12+
- [ ] Dark mode renders correctly on both platforms
- [ ] Keyboard does not obscure input bar on any test device
- [ ] Landscape orientation is disabled (portrait only)

---

## 13. Registration Recovery (added with the web-auth fixes)

### 13A – Confirm email OFF, fresh signup

1. Supabase Auth → Email → Confirm email OFF
2. Sign up with a fresh `.edu` email + grad year
3. **Expected:** lands directly on Waiting (or Chat if a same-year user is waiting). No "check your email" step.

### 13B – Confirm email ON, fresh signup

1. Confirm email ON
2. Sign up → **Expected:** "Check your email" screen with the entered address and a working Resend button
3. Click the emailed link → `/auth/callback` → **Expected:** "Setting things up…" then Waiting/Chat. The grad year picked at signup is used (saved locally before the auth call).

### 13C – Orphaned auth user (no public.users row, no saved grad year)

1. Create the orphan: sign up on device A with confirm-email ON, then confirm the link on device B (different browser storage)
2. **Expected:** device B routes to the **Complete profile** screen asking for graduation year; picking one completes registration and matching. No dead end, no "No connection".

### 13D – Missing env vars

1. Deploy/build without `EXPO_PUBLIC_SUPABASE_URL`
2. **Expected:** readable configuration-error screen naming the missing variables — never a blank white page.

## 14. Password Reset

1. Login screen → "Forgot password?" → enter email → **Expected:** confirmation state ("check your email")
2. Open the emailed link → **Expected:** `/auth/callback` detects recovery and routes to the new-password form
3. Set a new password (min 8 chars, must match confirmation) → **Expected:** routed into the app; old password no longer works
4. Open an expired/re-used link → **Expected:** "Link expired" screen with a path to request a new one

## 15. Crisis Resources

1. In chat, send a message containing crisis language (e.g. "I've been thinking about suicide")
2. **Expected:** the message SENDS (never blocked) and the Need Support modal opens with 988 + Crisis Text Line + the not-therapy disclaimer
3. "this exam is killing me lol" must NOT trigger the modal

## 16. Ended Conversation (partner left)

1. Match two users A + B; as A, Request rematch
2. As B (without navigating): try to send a message
3. **Expected:** send fails with a readable error, and the "This conversation has ended" card with **Find a new match** replaces the input bar; tapping it returns B to the pool

## 17. Block Prevention

1. Match A + B; as A choose **Block and rematch**
2. Both return to waiting — **Expected:** A and B are never matched together again (blocks are recorded and matching excludes them both directions)

---

## Pilot verification status (2026-07-07)

Verified automatically against a local Postgres with the full schema +
migrations (`npm run test:filter` for the filter; SQL suite for the DB):

| Check | Result |
|---|---|
| schema.sql + migrations 001–005 apply cleanly, twice (idempotent) | ✅ pass |
| Same-year matching, FIFO | ✅ pass |
| Different-year users never match | ✅ pass |
| No duplicate active pairs (re-register while matched is a no-op) | ✅ pass |
| grad_year immutable while matched | ✅ pass |
| One-sided rematch frees caller; partner can leave the inactive pair | ✅ pass |
| Block recorded; blocked users never re-matched (both directions) | ✅ pass |
| Banned users never match and cannot send messages | ✅ pass |
| Users cannot set is_admin / is_banned / status / pair_id on their own row | ✅ pass |
| Users can update only their prompt; cannot read other users' rows/emails | ✅ pass |
| Non-members cannot read a pair's messages | ✅ pass |
| Non-admin blocked from admin RPCs; admin stats/reports/ban work | ✅ pass |
| Admin ban deactivates pair and frees the partner | ✅ pass |
| delete_user_account frees partner and removes all user rows | ✅ pass |
| Identity filter matrix (57 cases: block/allow/crisis) | ✅ pass |
| `tsc --noEmit` | ✅ pass |
| `expo export --platform web` | ✅ pass |

Requires a live Supabase project + deployed build to verify manually
(covered by suites 1–17 above): realtime chat between two browsers, email
confirmation delivery, password-reset email delivery, Vercel deploy,
mobile-layout sanity, Edge Function deployment.
