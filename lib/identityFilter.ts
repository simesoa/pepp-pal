/**
 * Identity filter – blocks messages that attempt to share personal
 * identifiable information before the graduation reveal.
 *
 * Returns { blocked: true, reason: string } if the message should be blocked,
 * or { blocked: false } if it is safe to send.
 *
 * Design principles:
 *   - Deterministic, regex/keyword based (no ML, no external calls)
 *   - Err on the side of blocking edge cases; false positives are handled
 *     by the warning UX (user can rephrase rather than being hard-blocked)
 *   - No PII logged
 */

// ── Phone numbers ──────────────────────────────────────────────────────────
// Matches US/international numbers with common separators AND obfuscated forms:
//   (555) 867-5309   555.867.5309   5 5 5 8 6 7 5 3 0 9   +1-555-867-5309
// The second pattern collapses spaces/symbols and checks for 10-digit runs.
const PHONE_STRICT = /(\+?1[\s.\-()]*)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/;
const PHONE_SPACED = /\b(\d[\s\-.,]{0,2}){10,}\b/; // 10+ digits with noise between

// ── Email addresses ────────────────────────────────────────────────────────
// Catches standard emails and common obfuscation: user [at] domain [dot] com
const EMAIL_STANDARD = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const EMAIL_OBFUSCATED =
  /\b[a-zA-Z0-9._%+\-]+\s*[\[(]?\s*at\s*[\])]?\s*[a-zA-Z0-9.\-]+\s*[\[(]?\s*dot\s*[\])]?\s*[a-zA-Z]{2,}/i;

// ── Social media handles with symbol / spacing obfuscation ────────────────
// Matches things like:  i g : myhandle   snap_chat: foo   t i k t o k / foo
const SOCIAL_HANDLE_PATTERN =
  /\b(i[\s._\-]*g|insta[\s._\-]*gram?|snap[\s._\-]*chat|tik[\s._\-]*tok|twitt?er|face[\s._\-]*book|linked[\s._\-]*in|discord|telegram|what[\s._\-]*s[\s._\-]*app)\b/i;

// ── Explicit contact / sharing intent ─────────────────────────────────────
const SHARING_INTENT_KEYWORDS: string[] = [
  // Platform names (direct, no obfuscation needed separately)
  'instagram', 'insta', 'snapchat', 'snap', 'tiktok', 'twitter', 'facebook',
  'fb', 'linkedin', 'venmo', 'cashapp', 'cash app', 'discord', 'telegram',
  'whatsapp', 'facetime', 'bereal', 'reddit',
  // Action phrases
  'text me', 'dm me', 'find me on', 'follow me', 'add me on', 'my handle',
  'my user', 'my username', 'my @ is', 'my number', 'my phone', 'my email',
  'my ig', 'my snap', 'call me', 'zoom me', 'reach me', 'contact me',
  'hit me up', 'hmu', 'slide into', 'slide in my',
];

// ── Name + identity disclosure ─────────────────────────────────────────────
// Only fires if intent phrase AND two-capitalized-word name pattern appear together
const NAME_INTENT = /\b(my name is|i('m| am)\s+[A-Z]|call me|i go by|you can call me|they call me|known as)\b/i;
const CAPITALIZED_NAME = /\b[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}\b/;

// ── URL / link sharing ──────────────────────────────────────────────────────
// Catches http(s), bare domains, and obfuscated domain references
const URL_PATTERN = /https?:\/\/|www\.[a-z0-9]+\.[a-z]{2,}|\b[a-z0-9\-]+\.(com|io|co|me|app|net|org)\b/i;

export interface FilterResult {
  blocked: boolean;
  reason?: string;
}

const BLOCKED_REASON = 'Identity sharing is not allowed until graduation.';

export function filterMessage(content: string): FilterResult {
  const lower = content.toLowerCase();

  // Phone numbers
  if (PHONE_STRICT.test(content) || PHONE_SPACED.test(content.replace(/[^0-9\s\-.,]/g, ''))) {
    return { blocked: true, reason: BLOCKED_REASON };
  }

  // Email addresses
  if (EMAIL_STANDARD.test(content) || EMAIL_OBFUSCATED.test(content)) {
    return { blocked: true, reason: BLOCKED_REASON };
  }

  // Social handles with obfuscation
  if (SOCIAL_HANDLE_PATTERN.test(content)) {
    return { blocked: true, reason: BLOCKED_REASON };
  }

  // URLs / links
  if (URL_PATTERN.test(content)) {
    return { blocked: true, reason: BLOCKED_REASON };
  }

  // Keyword / phrase matching (exact substring, case-insensitive)
  for (const keyword of SHARING_INTENT_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { blocked: true, reason: BLOCKED_REASON };
    }
  }

  // Name disclosure (intent phrase + capitalized name)
  if (NAME_INTENT.test(content) && CAPITALIZED_NAME.test(content)) {
    return { blocked: true, reason: BLOCKED_REASON };
  }

  return { blocked: false };
}
