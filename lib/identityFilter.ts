/**
 * Identity filter – blocks messages that attempt to share personal
 * identifiable information before the graduation reveal.
 *
 * Returns { blocked: true, reason: string } if the message should be blocked,
 * or { blocked: false } if it is safe to send.
 *
 * NOTE: the SERVER is the source of truth — migration 007's
 * detect_identity_disclosure() runs these same patterns inside send_message(),
 * so direct RPC calls cannot bypass anonymity. This client copy exists for
 * instant UX feedback. Keep the two in sync.
 *
 * Design principles:
 *   - Deterministic, regex/keyword based (no ML, no external calls)
 *   - Platform names and contact phrases match on WORD BOUNDARIES so normal
 *     emotional-support language ("instantly", "snapped", "offbeat") is
 *     never blocked
 *   - No PII logged
 *
 * Also exports detectCrisis(): non-blocking detection of crisis language so
 * the app can surface 988 / Crisis Text Line resources.
 */

// ── Phone numbers ──────────────────────────────────────────────────────────
// Matches US/international numbers with common separators AND obfuscated forms:
//   (555) 867-5309   555.867.5309   5 5 5 8 6 7 5 3 0 9   +1-555-867-5309
const PHONE_STRICT = /(\+?1[\s.\-()]*)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/;
const PHONE_SPACED = /\b(\d[\s\-.,]{0,2}){10,}\b/; // 10+ digits with noise between

// ── Email addresses ────────────────────────────────────────────────────────
// Catches standard emails and common obfuscation: user [at] domain [dot] com
const EMAIL_STANDARD = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const EMAIL_OBFUSCATED =
  /\b[a-zA-Z0-9._%+\-]+\s*[\[(]?\s*at\s*[\])]?\s*[a-zA-Z0-9.\-]+\s*[\[(]?\s*dot\s*[\])]?\s*[a-zA-Z]{2,}/i;

// ── Social media platforms with symbol / spacing obfuscation ──────────────
// Matches things like:  i g : myhandle   snap_chat: foo   t i k t o k / foo
const SOCIAL_HANDLE_PATTERN =
  /\b(i[\s._\-]*g|insta[\s._\-]*gram?|snap[\s._\-]*chat|tik[\s._\-]*tok|twitt?er|face[\s._\-]*book|linked[\s._\-]*in|discord|telegram|what[\s._\-]*s[\s._\-]*app)\b/i;

// ── @handle mentions ───────────────────────────────────────────────────────
// "@someusername" outside of an email context
const AT_HANDLE = /(^|\s)@[a-zA-Z0-9_.]{3,}/;

// ── Explicit contact / sharing intent ─────────────────────────────────────
// Each entry is matched as a whole word/phrase (word boundaries added below),
// so "insta" matches "insta" but never "instantly".
const SHARING_INTENT_KEYWORDS: string[] = [
  // Platform names
  'instagram', 'insta', 'ig', 'snapchat', 'snap', 'tiktok', 'twitter', 'facebook',
  'fb', 'linkedin', 'venmo', 'cashapp', 'cash app', 'discord', 'telegram',
  'whatsapp', 'facetime', 'bereal', 'reddit', 'signal app', 'groupme',
  // Action phrases
  'text me', 'dm me', 'find me on', 'follow me', 'add me on', 'add me at',
  'my handle', 'my user', 'my username', 'my @ is', 'my number', 'my phone',
  'my email', 'my ig', 'my snap', 'my discord', 'add my', 'call me at', 'zoom me',
  'reach me at', 'contact me at', 'hit me up', 'hmu', 'slide into', 'slide in my',
  // In-person meetup / location disclosure
  'come to my dorm', 'come to my room', 'my dorm is', 'my room number',
  'my address', 'i live in', 'i live at', 'meet me at', 'meet me in',
  'my building is',
];

const SHARING_INTENT_PATTERNS: RegExp[] = SHARING_INTENT_KEYWORDS.map(
  (kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
);

// Bare "call me" is contact intent, but spare common idioms ("call me crazy").
// Mirrors detect_identity_disclosure() in migration 007 — keep in sync.
const CALL_ME_PATTERN =
  /\bcall me\b(?!\s+(crazy|dramatic|old[- ]?fashioned|paranoid|silly|weird|naive|cynical)\b)/i;

// ── Name + identity disclosure ─────────────────────────────────────────────
// Only fires if intent phrase AND two-capitalized-word name pattern appear together
const NAME_INTENT =
  /\b(my name is|my name's|i('m| am)\s+[A-Z]|i'?m called|call me|i go by|you can call me|they call me|known as)\b/i;
const CAPITALIZED_NAME = /\b[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}\b/;

// ── URL / link sharing ──────────────────────────────────────────────────────
// Catches http(s), bare domains, and obfuscated domain references
const URL_PATTERN = /https?:\/\/|www\.[a-z0-9]+\.[a-z]{2,}|\b[a-z0-9\-]+\.(com|io|co|me|app|net|org)\b/i;

export interface FilterResult {
  blocked: boolean;
  reason?: string;
}

const REASONS = {
  phone: "Phone numbers can't be shared. Penn Pal stays anonymous until graduation.",
  email: "Email addresses can't be shared. Penn Pal stays anonymous until graduation.",
  social: "Social media handles can't be shared. Penn Pal stays anonymous until graduation.",
  url: "Links can't be shared. Penn Pal stays anonymous until graduation.",
  contact: 'Sharing contact info or meetup details is not allowed until graduation.',
  name: 'Sharing your real name is not allowed until graduation.',
};

export function filterMessage(content: string): FilterResult {
  // Phone numbers
  if (PHONE_STRICT.test(content) || PHONE_SPACED.test(content.replace(/[^0-9\s\-.,]/g, ''))) {
    return { blocked: true, reason: REASONS.phone };
  }

  // Email addresses
  if (EMAIL_STANDARD.test(content) || EMAIL_OBFUSCATED.test(content)) {
    return { blocked: true, reason: REASONS.email };
  }

  // Social handles with obfuscation, and @handle mentions
  if (SOCIAL_HANDLE_PATTERN.test(content) || AT_HANDLE.test(content)) {
    return { blocked: true, reason: REASONS.social };
  }

  // URLs / links
  if (URL_PATTERN.test(content)) {
    return { blocked: true, reason: REASONS.url };
  }

  // Contact / meetup intent (whole-word matching)
  for (const pattern of SHARING_INTENT_PATTERNS) {
    if (pattern.test(content)) {
      return { blocked: true, reason: REASONS.contact };
    }
  }
  if (CALL_ME_PATTERN.test(content)) {
    return { blocked: true, reason: REASONS.contact };
  }

  // Name disclosure (intent phrase + capitalized name)
  if (NAME_INTENT.test(content) && CAPITALIZED_NAME.test(content)) {
    return { blocked: true, reason: REASONS.name };
  }

  return { blocked: false };
}

// ── Crisis language detection (non-blocking) ────────────────────────────────
// Never blocks the message — peers SHOULD be able to talk about hard things.
// Used to surface 988 / Crisis Text Line resources alongside the conversation.
const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(ing)? myself\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend (my|it all|my own) life\b/i,
  /\bwant to die\b/i,
  /\bdon'?t want to (be alive|live|exist)\b/i,
  /\bno reason to live\b/i,
  /\bbetter off dead\b/i,
  /\bself[\s-]?harm/i,
  /\bhurt(ing)? myself\b/i,
  /\bcutting myself\b/i,
  /\bkms\b/i,
];

export function detectCrisis(content: string): boolean {
  return CRISIS_PATTERNS.some((p) => p.test(content));
}
