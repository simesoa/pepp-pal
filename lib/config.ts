/**
 * Central app configuration and branding.
 *
 * The product has gone by both "Pepp Pal" and "Penn Pal" — change APP_NAME
 * here (and app.json's expo.name for native builds) to rebrand cleanly.
 * Everything user-facing should read from this file, never hardcode.
 */

export const APP_NAME = 'Penn Pal';

/** Public web domain (no protocol). Update when the real domain is purchased. */
export const APP_DOMAIN = 'pennpal.app';

/** Support inbox. Update when the real inbox exists. */
export const SUPPORT_EMAIL = 'support@pennpal.app';

/** Governing state for the Terms of Service. Set before publishing policies. */
export const LEGAL_STATE = 'Pennsylvania';

/** Shown as "Last updated" on in-app policy screens. */
export const POLICY_EFFECTIVE_DATE = 'April 2026';

/** Grad-year bounds — must match the DB check constraint in supabase/schema.sql. */
export const MIN_GRAD_YEAR = 2024;
export const MAX_GRAD_YEAR = 2040;

/** Crisis resources (US). */
export const CRISIS_LINE = '988';
export const CRISIS_TEXT_LINE = '741741';

/**
 * Registration/matching transport.
 *   'rpc'  – register_and_match() Postgres RPC (web default)
 *   'edge' – match-user Edge Function (requires deployment)
 *   'auto' – Edge Function on native builds, RPC on web
 * Both paths share the same SQL contract (register_user_and_match).
 */
export type RegistrationMode = 'rpc' | 'edge' | 'auto';
export const REGISTRATION_MODE: RegistrationMode =
  (process.env.EXPO_PUBLIC_REGISTRATION_MODE as RegistrationMode) || 'auto';

/**
 * AI-assisted support prompts. The client flag only controls UI copy; the
 * server (app_config.ai_prompts_enabled + AI_API_KEY on the Edge Function)
 * decides whether real AI suggestions or static templates are served.
 */
export const AI_FEATURES_ENABLED =
  process.env.EXPO_PUBLIC_AI_FEATURES_ENABLED === 'true';
