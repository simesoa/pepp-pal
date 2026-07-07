import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { UserStatus } from '@/types';

interface MatchStatus {
  status: UserStatus | null;
  pairId: string | null;
  isLoading: boolean;
  /** Real network/server failure — safe to show a connection error. */
  error: string | null;
  /** True when the user has no public.users row (setup incomplete, NOT a
   *  connection problem). Callers should route to registration recovery. */
  unregistered: boolean;
  refresh: () => Promise<void>;
}

/**
 * Polls the user's match status every 5 seconds while status = 'waiting'.
 * Stops polling once matched.
 */
export function useMatchStatus(userId: string | null): MatchStatus {
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [pairId, setPairId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unregistered, setUnregistered] = useState(false);
  const statusRef = useRef<UserStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) return;

    // poll_and_match retries matching server-side (self-heals races where two
    // simultaneous signups missed each other). Falls back to a plain select
    // when migration 005 hasn't been applied yet.
    let data: { status: UserStatus; pair_id: string | null } | null = null;
    let fetchError: { code?: string; message: string } | null = null;

    const rpc = await supabase.rpc('poll_and_match');
    if (!rpc.error) {
      const rows = (rpc.data ?? []) as { status: UserStatus; pair_id: string | null }[];
      data = rows[0] ?? null;
    } else {
      const fallback = await supabase
        .from('users')
        .select('status, pair_id')
        .eq('id', userId)
        .maybeSingle();
      data = fallback.data as typeof data;
      fetchError = fallback.error;
    }

    if (fetchError) {
      if (__DEV__) console.warn('[useMatchStatus] fetch failed:', fetchError.message);
      setError('Could not reach the server. Check your connection.');
      setUnregistered(false);
    } else if (!data) {
      // No users row: registration incomplete — recovery, not a network error.
      setError(null);
      setUnregistered(true);
    } else {
      setError(null);
      setUnregistered(false);
      statusRef.current = data.status as UserStatus;
      setStatus(data.status as UserStatus);
      setPairId(data.pair_id);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    fetchStatus();

    const interval = setInterval(() => {
      if (statusRef.current !== 'matched') fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [userId, fetchStatus]);

  return { status, pairId, isLoading, error, unregistered, refresh: fetchStatus };
}
