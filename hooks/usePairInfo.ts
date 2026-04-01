import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Pair } from '@/types';

export function usePairInfo(pairId: string | null) {
  const [pair, setPair] = useState<Pair | null>(null);

  useEffect(() => {
    if (!pairId) return;

    supabase
      .from('pairs')
      .select('*')
      .eq('id', pairId)
      .single()
      .then(({ data }) => {
        if (data) setPair(data as Pair);
      });
  }, [pairId]);

  return { pair };
}
