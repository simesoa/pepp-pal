import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { UserStatus } from '@/types';

interface MatchStatus {
  status: UserStatus | null;
  pairId: string | null;
  isLoading: boolean;
  error: string | null;
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

  const fetchStatus = useCallback(async () => {
    if (!userId) return;

    const { data, error: fetchError } = await supabase
      .from('users')
      .select('status, pair_id')
      .eq('id', userId)
      .single();

    if (fetchError) {
      setError('Could not reach the server. Check your connection.');
    } else if (data) {
      setError(null);
      setStatus(data.status as UserStatus);
      setPairId(data.pair_id);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    fetchStatus();

    const interval = setInterval(() => {
      if (status !== 'matched') fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [userId, status, fetchStatus]);

  return { status, pairId, isLoading, error, refresh: fetchStatus };
}
