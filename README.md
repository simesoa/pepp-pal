# Penn Pal

> One anonymous partner. Your whole college journey. Revealed at graduation.

Penn Pal connects college students with a single anonymous partner in the same graduating class. They chat throughout college and only reveal identities at graduation. This is a private, 1-on-1 emotional support system — not a dating app, not social media.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo (React Native) + TypeScript |
| Navigation | Expo Router (file-based) |
| Styling | NativeWind (Tailwind CSS for React Native) |
| Backend | Supabase (Auth, PostgreSQL, Realtime, Edge Functions) |
| Build / Deploy | EAS Build + EAS Submit |

---

## Project Structure

```
pepp-pal/
├── app/                        # Expo Router screens
│   ├── _layout.tsx             # Root layout + auth guard
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── welcome.tsx         # Landing / intro screen
│   │   ├── signup.tsx          # Signup with .edu validation + grad year
│   │   └── login.tsx
│   └── (app)/
│       ├── _layout.tsx
│       ├── status.tsx          # Routing hub (waiting vs chat)
│       ├── waiting.tsx         # "Finding your Penn Pal…"
│       └── chat.tsx            # Anonymous realtime chat
├── components/
│   ├── MessageBubble.tsx
│   ├── SafetyModal.tsx         # "Need support?" crisis resources
│   └── IdentityWarningBanner.tsx
├── context/
│   └── AuthContext.tsx         # Session state via Supabase Auth
├── hooks/
│   ├── useMatchStatus.ts       # Polls match status every 5s
│   └── useChat.ts              # Realtime chat + typing indicators
├── lib/
│   ├── supabase.ts             # Supabase client
│   └── identityFilter.ts       # Blocks identity-sharing messages
├── types/
│   └── index.ts
├── supabase/
│   ├── schema.sql              # Full DB schema + RLS + matching function
│   └── functions/
│       └── match-user/
│           └── index.ts        # Supabase Edge Function
├── app.json                    # Expo + EAS config
├── eas.json                    # EAS build profiles
├── tailwind.config.js
├── metro.config.js
└── global.css
```

---

## Setup

Useful scripts: `npm run typecheck` (tsc), `npm run test:filter`
(identity-filter unit tests), `npm run build` (web export to `dist/`).


### 1. Clone and install dependencies

```bash
git clone <repo>
cd pepp-pal
npm install --legacy-peer-deps --ignore-scripts
```

(The flags are baked into `.npmrc`, so plain `npm install` also works.)

### 2. Create Supabase project

Follow **[docs/supabase-setup.md](docs/supabase-setup.md)** — in short: run
`supabase/schema.sql` then `supabase/migrations/001 → 005` in order in the
SQL Editor, configure the Auth URLs, and (optionally) deploy the
`delete-account` Edge Function. The web app needs **no** Edge Function for
signup/matching — it uses the `register_and_match()` RPC.

For the full deploy runbook (Vercel, env vars, admin setup, two-user match
testing, common errors) see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Both values are in your Supabase project under **Settings → API**.

### 4. Run locally

```bash
npx expo start
```

- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan QR code with Expo Go for physical device

---

## EAS Build & Submit

### One-time setup

```bash
npm install -g eas-cli
eas login
eas build:configure
```

Update `app.json`:
- `extra.eas.projectId` → your EAS project ID (from `eas build:configure`)

Update `eas.json`:
- `submit.production.ios.appleId` → your Apple ID
- `submit.production.ios.ascAppId` → App Store Connect App ID
- `submit.production.ios.appleTeamId` → Apple Team ID
- `submit.production.android.serviceAccountKeyPath` → path to Google service account JSON

### Build

```bash
# Development build (includes dev client)
eas build --profile development --platform all

# Production build
eas build --profile production --platform all
```

### Submit to stores

```bash
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | FK → auth.users |
| `email` | text | |
| `grad_year` | int | 2024–2040 |
| `prompt` | text | Optional "What are you going through?" |
| `status` | enum | `waiting` \| `matched` |
| `pair_id` | uuid | FK → pairs, nullable |
| `created_at` | timestamptz | |

### `pairs`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user1_id` | uuid | FK → users |
| `user2_id` | uuid | FK → users |
| `created_at` | timestamptz | |

### `messages`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `pair_id` | uuid | FK → pairs |
| `sender_id` | uuid | FK → users |
| `content` | text | Max 2000 chars |
| `created_at` | timestamptz | |

---

## Security

- **Row Level Security** is enabled on all tables
- Users can only read their own user row
- Users can only read/write messages within their own pair
- **Identity filter** blocks phone numbers, email addresses, social media handles, and contact-sharing language before the message is sent
- The `match_user` DB function uses `security definer` + `FOR UPDATE SKIP LOCKED` to prevent race conditions during concurrent signups

---

## App Store Notes

### iOS
- `Info.plist` privacy keys are automatically handled by Expo
- No microphone, camera, or location permissions required
- Safe for ages 17+ (chat between strangers)

### Android
- Targets API 34+
- `android.package` = `com.pennpal.app`

---

## Feature Flags (MVP Scope)

The following are intentionally **out of scope** for MVP:

- Push notifications
- Multiple chat partners
- User profiles / photos
- Payments
- Voice messages
- Friend lists

---

## Crisis Resources Referenced In-App

- **988 Suicide & Crisis Lifeline** — call or text 988
- **Crisis Text Line** — text HOME to 741741
