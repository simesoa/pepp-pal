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
