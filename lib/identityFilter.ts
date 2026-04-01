/**
 * Identity filter – blocks messages that attempt to share personal
 * identifiable information before the graduation reveal.
 *
 * Returns { blocked: true, reason: string } if the message should be blocked,
 * or { blocked: false } if it is safe to send.
 */

// Phone number patterns (US and international)
const PHONE_PATTERN =
  /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

// Social media / contact platform keywords (case-insensitive)
const SOCIAL_KEYWORDS = [
  'instagram',
  'insta',
  '@',
  'snapchat',
  'snap',
  'tiktok',
  'twitter',
  'facebook',
  'fb',
  'linkedin',
  'venmo',
  'cashapp',
  'cash app',
  'discord',
  'telegram',
  'whatsapp',
  'text me',
  'dm me',
  'my number',
  'my email',
  'call me',
  'facetime',
  'zoom me',
];

// Email pattern
const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

// Full name patterns (heuristic: two capitalized words in a row)
// We intentionally keep this light to avoid false positives.
const FULL_NAME_PATTERN = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/;

export interface FilterResult {
  blocked: boolean;
  reason?: string;
}

export function filterMessage(content: string): FilterResult {
  const lower = content.toLowerCase();

  if (PHONE_PATTERN.test(content)) {
    return {
      blocked: true,
      reason: 'Identity sharing is not allowed until graduation.',
    };
  }

  if (EMAIL_PATTERN.test(content)) {
    return {
      blocked: true,
      reason: 'Identity sharing is not allowed until graduation.',
    };
  }

  for (const keyword of SOCIAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        blocked: true,
        reason: 'Identity sharing is not allowed until graduation.',
      };
    }
  }

  // Heuristic name check – only flag if combined with sharing-intent language
  const sharingIntentPattern = /\b(my name is|i('m| am)|call me|i go by)\b/i;
  if (sharingIntentPattern.test(content) && FULL_NAME_PATTERN.test(content)) {
    return {
      blocked: true,
      reason: 'Identity sharing is not allowed until graduation.',
    };
  }

  return { blocked: false };
}
