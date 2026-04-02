# Screenshot Copy — Penn Pal

Six screenshots covering the core user journey. Each entry includes:
- **Screen:** which screen to capture
- **Headline:** large overlay text (primary message)
- **Sub-copy:** smaller supporting text beneath the headline
- **Design notes:** framing / crop / UI state guidance

Aspect ratios needed:
- iOS: 9:19.5 (1290×2796 for iPhone 15 Pro Max) and 9:16 (1242×2208 for iPhone 8 Plus)
- Android: 9:16 or 9:19.5 phone screenshots

---

## Screenshot 1 — Welcome / Landing

**Screen to capture:** `/(auth)/welcome`

**Headline:**
> One person.
> Your whole college journey.

**Sub-copy:**
> Anonymous. Honest. Matched by graduation year.

**Design notes:**
- Show the full welcome screen centered on the Penn Pal wordmark and tagline
- Both "Sign up" and "Sign in" buttons visible at the bottom
- No overlay box needed if the screen background is dark — place headline text above the CTA area
- Text overlay: white headline, muted sub-copy

---

## Screenshot 2 — Sign Up / Matching

**Screen to capture:** `/(auth)/signup` — after grad year is selected, before submitting

**Headline:**
> Your .edu email.
> Your graduation year.
> That's how we match you.

**Sub-copy:**
> No name. No photo. No profile to fill out.

**Design notes:**
- Highlight the grad year pill buttons (one selected, shown in accent color)
- Email field visible but blurred/empty
- The optional prompt field can be empty
- Text overlay positioned in upper portion of screenshot, above the form
- Accent the selected year pill to show how matching works

---

## Screenshot 3 — Waiting to Be Matched

**Screen to capture:** `/(app)/waiting` — the state shown before a match is found

**Headline:**
> Finding your Penn Pal.

**Sub-copy:**
> We're looking for someone in your graduating class.
> Hang tight — this might take a moment.

**Design notes:**
- Show the animated waiting state / status indicator
- Keep the screen clean — minimal UI is a feature here
- Text overlay at top or bottom with semi-transparent background strip
- This screenshot tells the story of "it's working, just quiet"

---

## Screenshot 4 — Chat

**Screen to capture:** `/(app)/chat` — mid-conversation with a few messages visible

**Headline:**
> Just talk.

**Sub-copy:**
> No names. No photos. Just you, your Penn Pal, and the conversation.

**Design notes:**
- Use seed data messages that feel warm and real — not placeholder "Lorem ipsum"
  - Example messages to mock in: "how are you doing with finals?" / "honestly kind of struggling but getting through it" / "same. what's your major?" / "english lit, you?" / "cs. night and day lol"
- Identity filter chip / warning should NOT be visible (clean conversation)
- Show the message input bar at the bottom
- ⋯ menu button visible in top-right corner
- Text overlay at top of screenshot above the message thread

---

## Screenshot 5 — Safety & Reporting

**Screen to capture:** `ChatMenuModal` open to the main menu view (not the report sub-flow)

**Headline:**
> Your safety, built in.

**Sub-copy:**
> Report. Block. Leave. Crisis resources in one tap.
> Every report reviewed within 24 hours.

**Design notes:**
- Show the bottom sheet modal with all three options visible:
  "Report conversation", "Block and rematch", "Request rematch"
- The icons and option labels should be clearly readable
- Background (chat screen) dimmed behind the modal
- Text overlay positioned at the top of the screenshot above the modal

---

## Screenshot 6 — Settings / About

**Screen to capture:** `/(app)/settings` — scrolled to show the Support and About sections

**Headline:**
> Anonymous until you're ready.
> Your rules.

**Sub-copy:**
> Report conversations. Delete your account. Access crisis resources anytime.

**Design notes:**
- Show the Settings screen with the "Support" section and "Crisis resources" row visible
- The "Delete account" option in the Account section can also be visible — it reinforces user control
- This screenshot communicates trust and control
- Text overlay at the top above the settings list

---

## General Design Guidance

- **Background:** Use the app's native dark background (`#0e0d13`) — don't add a device frame unless required by store
- **Text overlay style:** Headline in white, ~32–36pt, semibold. Sub-copy in a muted/gray, ~16–18pt, regular weight
- **Overlay positioning:** Top-anchored overlays work better for screenshots that show UI in the lower half; bottom-anchored for UI in the upper half
- **No device frame on iOS required** (App Store Connect accepts raw screenshots); Google Play also accepts frameless
- **Localization:** English (US) only for pilot launch

---

## Screenshot Order (recommended submission order)

1. Welcome — the concept hook
2. Sign up — how it works
3. Waiting — the process
4. Chat — the core experience
5. Safety — trust and reporting
6. Settings — control and transparency
