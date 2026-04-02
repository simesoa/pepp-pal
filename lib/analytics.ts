/**
 * Penn Pal – minimal analytics layer
 *
 * Privacy principles:
 *   - No PII: no email, no message content, no device identifiers
 *   - No third-party SDKs: events go to our own Supabase table
 *   - Fire-and-forget: errors are silently swallowed so analytics never
 *     blocks or crashes a user flow
 *   - Opted-in by default: track() is a no-op if called before auth
 *
 * Event catalogue (keep in sync with docs/qa-testing.md):
 *   signup_completed      – user finished signup form + edge fn returned
 *   waiting_entered       – user landed on waiting screen
 *   user_matched          – client observed status→matched transition
 *   conversation_started  – chat screen mounted with 0 prior messages
 *   first_message_sent    – sender's first message in a pair
 *   rematch_requested     – user confirmed request-rematch action
 *   block_action          – user confirmed block-and-rematch action
 *   report_submitted      – report RPC returned successfully
 *   account_deleted       – delete-account edge fn returned OK
 *   banned_screen_viewed  – banned.tsx mounted
 *   starter_prompt_used   – user tapped a starter prompt
 *   safety_modal_opened   – "Need support?" modal opened
 */

import { supabase } from '@/lib/supabase';

export type AnalyticsEvent =
  | 'signup_completed'
  | 'waiting_entered'
  | 'user_matched'
  | 'conversation_started'
  | 'first_message_sent'
  | 'rematch_requested'
  | 'block_action'
  | 'report_submitted'
  | 'account_deleted'
  | 'banned_screen_viewed'
  | 'starter_prompt_used'
  | 'safety_modal_opened';

type Properties = Record<string, string | number | boolean | null>;

/**
 * Fire-and-forget event log. Never throws.
 * Call from anywhere in the app after auth is established.
 */
export async function track(
  event: AnalyticsEvent,
  properties?: Properties,
): Promise<void> {
  try {
    // Use rpc to avoid direct table access from client
    await supabase.rpc('log_event', {
      p_event: event,
      p_properties: properties ?? null,
    });
  } catch {
    // Intentionally swallowed – analytics must never break UX
  }
}
