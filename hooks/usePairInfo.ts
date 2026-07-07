import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Pair } from '@/types';

export function usePairInfo(pairId: string | null) {
  const [pair, setPair] = useState<Pair | null>(null);

  const refresh = useCallback(async () => {
    if (!pairId) return;
    const { data } = await supabase
      .from('pairs')
      .select('*')
      .eq('id', pairId)
      .maybeSingle();
    if (data) setPair(data as Pair);
  }, [pairId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pair, refresh };
}
