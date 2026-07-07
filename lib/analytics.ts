/**
 * Penn Pal – minimal analytics layer
 *
 * Privacy principles:
 *   - No PII: no email, no message content, no device identifiers
 *   - No third-party SDKs: events go to our own Supabase table
 *   - Fire-and-forget: errors are silently swallowed so analytics never
 *     blocks or crashes a user flow
 *
 * Event catalogue (keep in sync with docs/qa-testing.md):
 *   signup_started         – user submitted the signup form
 *   signup_completed       – auth account created
 *   login                  – user signed in with password
 *   registration_recovered – missing users row recreated after confirmation
 *   waiting_entered        – user landed on waiting screen
 *   user_matched           – client observed status→matched transition
 *   conversation_started   – chat screen mounted with 0 prior messages
 *   first_message_sent     – sender's first message in a pair
 *   message_blocked        – identity filter blocked an outgoing message
 *   crisis_resources_shown – crisis language surfaced the support modal
 *   rematch_requested      – user confirmed request-rematch action
 *   block_action           – user confirmed block-and-rematch action
 *   report_submitted       – report RPC returned successfully
 *   admin_report_updated   – admin changed a report's status
 *   password_reset_requested – reset email requested
 *   account_delete_requested – user confirmed the delete-account dialog
 *   account_deleted        – delete-account edge fn returned OK
 *   banned_screen_viewed   – banned.tsx mounted
 *   starter_prompt_used    – user tapped a starter prompt
 *   safety_modal_opened    – "Need support?" modal opened
 */

import { supabase } from '@/lib/supabase';

export type AnalyticsEvent =
  | 'signup_started'
  | 'signup_completed'
  | 'login'
  | 'registration_recovered'
  | 'waiting_entered'
  | 'user_matched'
  | 'conversation_started'
  | 'first_message_sent'
  | 'message_blocked'
  | 'crisis_resources_shown'
  | 'rematch_requested'
  | 'block_action'
  | 'report_submitted'
  | 'admin_report_updated'
  | 'password_reset_requested'
  | 'account_delete_requested'
  | 'account_deleted'
  | 'banned_screen_viewed'
  | 'starter_prompt_used'
  | 'safety_modal_opened'
  | 'push_permission_requested'
  | 'push_permission_granted'
  | 'push_permission_denied'
  | 'push_token_registered'
  | 'school_detected'
  | 'unsupported_school'
  | 'reveal_viewed'
  | 'reveal_opted_in'
  | 'reveal_declined'
  | 'reveal_completed'
  | 'read_receipts_toggled'
  | 'rate_limit_hit'
  | 'ai_prompt_opened'
  | 'ai_prompt_generated'
  | 'ai_suggestion_inserted'
  | 'ai_fallback_used';

type Properties = Record<string, string | number | boolean | null>;

/**
 * Fire-and-forget event log. Never throws, never awaited by callers.
 */
export function track(event: AnalyticsEvent, properties?: Properties): void {
  try {
    supabase
      .rpc('log_event', { p_event: event, p_properties: properties ?? null })
      .then(undefined, () => {
        // Intentionally swallowed – analytics must never break UX
      });
  } catch {
    // Intentionally swallowed
  }
}
