/**
 * Centralized registration + matching recovery.
 *
 * Every entry point into the app (signup, email-confirmation callback, the
 * status router screen, the complete-profile recovery screen) goes through
 * this module so the behavior is identical everywhere:
 *
 *   1. If a public.users row exists → report its status, route normally.
 *   2. If not, and we have a pending grad year saved locally → call the
 *      register_and_match RPC (creates the row + attempts matching).
 *   3. If the RPC is missing (migration 004 not run) → try a direct insert
 *      (allowed by the users_insert_own RLS policy) and surface a setup
 *      warning in development.
 *   4. If we have no grad year at all → the caller routes the user to the
 *      complete-profile screen, which collects it and calls registerAndMatch.
 *
 * "No public.users row yet" is NOT a connection failure and must never be
 * shown as one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { MIN_GRAD_YEAR, MAX_GRAD_YEAR } from '@/lib/config';
import { UserStatus } from '@/types';

const GRAD_YEAR_KEY = '@pennpal:pending_grad_year';
const PROMPT_KEY = '@pennpal:pending_prompt';

// ── Pending registration storage ──────────────────────────────────────────

export async function savePendingRegistration(gradYear: number, prompt: string): Promise<void> {
  try {
    await AsyncStorage.setItem(GRAD_YEAR_KEY, String(gradYear));
    await AsyncStorage.setItem(PROMPT_KEY, prompt);
  } catch {
    // Storage failures are non-fatal: the complete-profile screen re-collects.
  }
}

export async function getPendingRegistration(): Promise<{
  gradYear: number | null;
  prompt: string | null;
}> {
  try {
    const savedYear = await AsyncStorage.getItem(GRAD_YEAR_KEY);
    const savedPrompt = await AsyncStorage.getItem(PROMPT_KEY);
    const gradYear = savedYear ? parseInt(savedYear, 10) : NaN;
    return {
      gradYear: gradYear >= MIN_GRAD_YEAR && gradYear <= MAX_GRAD_YEAR ? gradYear : null,
      prompt: savedPrompt || null,
    };
  } catch {
    return { gradYear: null, prompt: null };
  }
}

export async function clearPendingRegistration(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GRAD_YEAR_KEY);
    await AsyncStorage.removeItem(PROMPT_KEY);
  } catch {
    // ignore
  }
}

// ── Registration + matching ───────────────────────────────────────────────

export type RegistrationResult =
  | { ok: true; status: UserStatus; pairId: string | null; recovered: boolean }
  | { ok: false; reason: 'needs-grad-year' }
  | { ok: false; reason: 'error'; message: string };

function isMissingFunctionError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function|function .* does not exist/i.test(error.message ?? '')
  );
}

/**
 * Register the current user with the given grad year and attempt matching.
 * Requires an active session.
 */
export async function registerAndMatch(
  gradYear: number,
  prompt: string | null,
  { recovered = false }: { recovered?: boolean } = {},
): Promise<RegistrationResult> {
  const { data, error } = await supabase.rpc('register_and_match', {
    p_grad_year: gradYear,
    p_prompt: prompt || null,
  });

  if (!error) {
    await clearPendingRegistration();
    if (recovered) track('registration_recovered');
    const result = (data ?? {}) as { status?: UserStatus; pair_id?: string | null };
    return {
      ok: true,
      status: result.status ?? 'waiting',
      pairId: result.pair_id ?? null,
      recovered,
    };
  }

  if (isMissingFunctionError(error)) {
    if (__DEV__) {
      console.error(
        '[registration] register_and_match RPC is missing. Run ' +
        'supabase/migrations/004_web_rpc.sql (and 005) in the Supabase SQL Editor. ' +
        'Falling back to direct insert (no matching will run).',
      );
    }
    // Fallback: direct insert via the users_insert_own RLS policy. The user
    // lands in "waiting" and gets matched once the RPC exists / someone else
    // registers through it.
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user;
    if (!authUser) {
      return { ok: false, reason: 'error', message: 'Your session expired. Please sign in again.' };
    }
    // Note: only (id, email, grad_year, prompt) are grantable columns for
    // authenticated inserts (see migration 005); status defaults to 'waiting'.
    const { error: insertError } = await supabase.from('users').insert({
      id: authUser.id,
      email: authUser.email ?? '',
      grad_year: gradYear,
      prompt: prompt || null,
    });
    // 23505 = row already exists (created concurrently) — treat as success.
    if (insertError && insertError.code !== '23505') {
      return {
        ok: false,
        reason: 'error',
        message: __DEV__
          ? `Server setup incomplete: register_and_match RPC is missing and direct insert failed (${insertError.message}). Run the SQL in supabase/migrations in order.`
          : 'We could not finish setting up your account. Please try again in a moment.',
      };
    }
    await clearPendingRegistration();
    if (recovered) track('registration_recovered');
    return { ok: true, status: 'waiting', pairId: null, recovered };
  }

  if (__DEV__) console.error('[registration] register_and_match failed:', error.message);
  return {
    ok: false,
    reason: 'error',
    message: 'Could not reach the server. Check your connection and try again.',
  };
}

/**
 * Ensure the signed-in user has a public.users row, recovering from an
 * interrupted signup if needed. Never treats a missing row as a network error.
 */
export async function ensureRegisteredUserAndMatch(userId: string): Promise<RegistrationResult> {
  const { data, error } = await supabase
    .from('users')
    .select('status, pair_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.error('[registration] users lookup failed:', error.message);
    return {
      ok: false,
      reason: 'error',
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }

  if (data) {
    // Row exists → clear any stale pending data and route normally.
    await clearPendingRegistration();
    return { ok: true, status: data.status as UserStatus, pairId: data.pair_id, recovered: false };
  }

  // No row: signup was interrupted (email confirmation gap, or an orphaned
  // auth user from before). Recover with the locally saved grad year if any.
  const { gradYear, prompt } = await getPendingRegistration();
  if (!gradYear) {
    return { ok: false, reason: 'needs-grad-year' };
  }
  return registerAndMatch(gradYear, prompt, { recovered: true });
}
