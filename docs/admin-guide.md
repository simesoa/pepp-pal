# Admin Guide

Access: Settings → Admin dashboard (visible only when `users.is_admin`).
Every admin RPC re-checks `assert_admin()` server-side — the UI gate is
cosmetic; the SQL gate is the enforcement.

Promote an admin (SQL Editor):

```sql
update public.users set is_admin = true where email = 'you@school.edu';
```

## Dashboard (Stats / Reports / Users)

- **Stats** — pilot snapshot: users, pairs, waiting/matched by grad year,
  open reports, message totals, 30-day analytics event counts.
- **Reports** — queue with open/all filter → report detail: reason,
  reporter, recent messages of the reported pair, status actions
  (reviewed/resolved/dismissed). Resolving/dismissing notifies the reporter.
- **Users** — list with school year, status, ban/unban. Banning deactivates
  the pair, frees the partner, locks the user to the banned screen, and
  blocks message sends at the RLS layer.

## Schools

Admin → Schools:

- Auto-created rows appear here while "Allow unknown schools" is on
  (System tab) — rename them to proper school names.
- Add/edit: name, primary domain, extra allowed domains, status
  (active/pending/inactive), per-school cross-school toggle.
- Per-school student and active-pair counts.
- Students can never change their own `school_id` (no column grant).

## Cohorts & Reveal

Admin → Cohorts:

- Create a cohort per (school, graduation year) with a reveal open date
  (optional close date). No cohort → reveal stays locked with "date not set".
- **Open now (test)** unlocks reveal immediately for a test cohort.
- Disable/enable a cohort; view members / opt-ins / completed reveals.
- Kill reveal for a single pair after a serious report:
  `select admin_set_pair_reveal_disabled('<pair-id>', true);`

## System

Admin → System:

- **Configuration** — `allow_unknown_schools`, global
  `cross_school_matching_enabled` (leave OFF unless running an explicit
  cross-school pilot), `ai_prompts_enabled`.
- **Push notifications** — active token count, delivery counts by status,
  recent failures, "send test notification to myself".
- **Safety & rate limits** — 7-day abuse event counts (rate limits, blocked
  identity attempts, cooldowns applied), top repeat offenders, active
  cooldowns with one-tap clear. Force a cooldown:
  `select admin_set_user_cooldown('<user-id>', 60);`  -- minutes

## What admins can and cannot see

- Message bodies: only via report detail, for reported pairs.
- Push tokens: counts only, never token values.
- AI prompts: usage counts only, never content.
- Emails are shown obfuscated in lists (full email on report detail only).
