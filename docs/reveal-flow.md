# Graduation Reveal Flow

The signature feature: after a cohort's reveal date, two matched students can
**mutually** reveal identities.

## Data model (migration 006)

| Table | Purpose |
|---|---|
| `cohorts` | One per (school, graduation_year): `reveal_opens_at`, optional `reveal_closes_at`, `status` |
| `reveal_requests` | One per (pair, user): `wants_reveal` + optional message. Upserted — users can change their mind until mutual |
| `reveals` | One per pair, created only on mutual opt-in. Irreversible |
| `users.display_name / major / contact_method / farewell_message` | Reveal profile — user-editable columns, delivered **only** through `get_reveal_state` after mutual reveal |
| `pairs.reveal_disabled` | Admin kill-switch per pair |

## Rules (enforced in SQL — `reveal_block_reason()`)

Reveal proceeds only when ALL hold:

1. Cohort exists for the user's school + grad year, `status = 'active'`
2. `now()` is inside the reveal window
3. Pair is not `reveal_disabled` (admin)
4. Neither user is banned
5. No block in either direction
6. No unresolved report (`open`/`reviewed`) between the two users
7. **Both** users opted in (`reveal_requests.wants_reveal = true`)

One-sided opt-in reveals nothing: the partner sees only "your Pal is open to
revealing" (+ their optional message). Identity fields are never readable
through any other path — `users` RLS still hides other users' rows entirely.

## RPCs

- `get_reveal_state(pair_id)` → unlocked, block_reason, window, my/partner
  opt-in, partner profile (only when revealed)
- `request_reveal(pair_id, wants, message?)` → upserts opt-in, creates the
  reveal on mutual, enqueues notifications; rate limited (5/day)

## Client

`app/(app)/reveal.tsx` (entered from the chat header "Reveal" link):

- **No cohort** → "reveal date not set yet"
- **Locked** → countdown to `reveal_opens_at`
- **Unlocked** → opt-in form: display name, major, contact method, farewell
  message (all optional — contact sharing is a choice), safety copy
  (optional, mutual, irreversible, never pressure your Pal)
- **Opted in, waiting** → status + "change my mind" (until mutual)
- **Revealed** → partner profile + farewell message
- **Blocked** → reason-specific copy

Safety: the report flow includes a "Reveal pressure or identity pressure"
category; any open report between the two blocks reveal.

## Admin

- Admin → Cohorts: create/edit cohorts, set open/close dates, **Open now
  (test)** to unlock a cohort early, disable a cohort, view member / opt-in /
  revealed counts.
- Disable reveal for one pair: `admin_set_pair_reveal_disabled(pair_id, true)`
  (SQL editor or wire into report detail as needed).

## Testing the reveal

1. Create two accounts, same school + grad year → they match.
2. Admin → Cohorts → Add: that school + year, opens date in the future →
   both users see the countdown.
3. "Open now (test)" → reveal unlocks.
4. User A opts in → B sees "your Pal is open to revealing"; A's identity is
   NOT visible (verify with `get_reveal_state` as B).
5. User B opts in → both see the revealed profiles; `reveals` has one row.
6. Negative tests: report the pair before opt-in → `unresolved_report`
   blocks; block the pair → `blocked`; disable the pair → `disabled_by_admin`.

The SQL suite (`supabase/tests/wave1-tests.sql`, W11–W13) covers all of
these paths automatically.
