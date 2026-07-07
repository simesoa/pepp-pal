# Push Notifications

## Architecture

```
DB event (message / match / reveal / moderation)
  └─ enqueue_notification()          — SQL, checks user preferences, never throws
       └─ notification_events row   — delivery_status = 'pending' (or 'skipped')
            └─ send-notification    — Edge Function, drained by cron or admin trigger
                 └─ Expo push API   — exp.host/--/api/v2/push/send
                      └─ device     — expo-notifications handles display + tap
```

Notifications are **queued in the database** by the same transactions that
create the underlying event (`send_message`, `match_user`, `request_reveal`,
`admin_set_ban`, `admin_update_report_status`). Delivery is asynchronous and
can never break a user action — `enqueue_notification` swallows every error.

**Payloads never contain message text.** A new message notifies as
"Your Pal sent you a message."

## Events that notify

| Type | Trigger | Preference key |
|---|---|---|
| `message` | Partner sent a message (via `send_message`) | `messages` |
| `match` | Pair created (`match_user`) | `matches` |
| `reveal_request` | Partner opted into reveal | `reveal` |
| `reveal_complete` | Mutual reveal unlocked | `reveal` |
| `report_update` | Admin resolved/dismissed your report | `safety_updates` |
| `ban` / `unban` | Moderation action on your account | `safety_updates` |
| `checkin` / `inactivity` | Reserved for check-in nudges | `checkins` |
| `test` | Admin "send test notification to myself" | — |

## Client (native)

- `lib/notifications.ts` — permission request, Expo token fetch,
  `register_push_token` RPC (upsert; refresh re-runs it), Android channel,
  tap routing (message/match → status → chat; reveal → reveal screen).
- Registered automatically on sign-in (`app/_layout.tsx`) and when a user
  turns a notification preference on.
- **Web**: complete no-op — settings still work and control what gets queued
  for the user's devices.
- **Permission denied**: settings show a hint to enable in system settings;
  nothing breaks.

## Preferences & quiet hours

`notification_preferences` (RLS: own row only) — per-category booleans plus
`quiet_hours_enabled/start/end` (UTC times). Preferences are enforced at
**enqueue** time (event marked 'skipped'); quiet hours are enforced at
**delivery** time (event stays 'pending' until the window ends).

## Setup

1. Run migration 006.
2. `supabase functions deploy send-notification --project-ref <ref>`
3. Schedule the cron (see `docs/supabase-setup.md` §6) — or trigger manually
   from Admin → System while testing.
4. Native builds need a real EAS `projectId` in `app.json` (`eas init`) —
   Expo push tokens are minted against it. The `expo-notifications` plugin is
   already configured.

## Testing

1. On a physical device (dev build or TestFlight), sign in → permission
   prompt → accept.
2. Admin → System → "Send test notification to myself" → run the
   send-notification function (cron or manual `curl` with the service key).
3. Verify Admin → System shows the token count and `sent` status.
4. Toggle "New messages" off in Settings, have your Pal send a message →
   event should be recorded as `skipped`.

Delivery failures are visible in Admin → System (recent failures) and in the
`notification_events.provider_response` column. Tokens Expo reports as
`DeviceNotRegistered` are deactivated automatically.
