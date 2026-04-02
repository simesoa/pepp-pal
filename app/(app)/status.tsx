/**
 * Status router screen.
 * Ensures the public.users row exists, then routes to /waiting or /chat.
 *
 * Recovery path (email confirmation required scenario):
 *   1. Try register_and_match RPC (needs migration 004)
 *   2. If that fails, direct-insert the user row using auth email + saved grad_year
 *   3. Either way, user reaches the waiting screen
 */
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function StatusScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const [label, setLabel] = useState('Loading…');

  useEffect(() => {
    if (!userId) return;

    async function bootstrap() {
      // 1. Check if the user row exists
      const { data, error } = await supabase
        .from('users')
        .select('status, pair_id')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        // Real DB/network error – go to waiting which surfaces the retry UI
        router.replace('/(app)/waiting');
        return;
      }

      // 2. Row exists → route normally
      if (data) {
        if (data.status === 'matched' && data.pair_id) {
          router.replace({ pathname: '/(app)/chat', params: { pairId: data.pair_id } });
        } else {
          router.replace('/(app)/waiting');
        }
        return;
      }

      // 3. No row → registration didn't complete (email confirmation gated it).
      //    Try to create the row now.
      setLabel('Finishing account setup…');

      const savedYear  = await AsyncStorage.getItem('@pennpal:pending_grad_year');
      const savedPrompt = await AsyncStorage.getItem('@pennpal:pending_prompt');
      const gradYear   = savedYear ? parseInt(savedYear, 10) : null;

      if (gradYear && gradYear >= 2024 && gradYear <= 2040) {
        // Try the full RPC first (creates row + attempts matching)
        const { error: rpcErr } = await supabase.rpc('register_and_match', {
          p_grad_year: gradYear,
          p_prompt: savedPrompt || null,
        });

        if (rpcErr) {
          // RPC unavailable (migration not run) – fall back to direct insert
          const { data: { user: authUser } } = await supabase.auth.getUser();
          await supabase.from('users').upsert({
            id: userId,
            email: authUser?.email ?? '',
            grad_year: gradYear,
            prompt: savedPrompt || null,
            status: 'waiting',
          }, { onConflict: 'id', ignoreDuplicates: false });
        }

        await AsyncStorage.removeItem('@pennpal:pending_grad_year');
        await AsyncStorage.removeItem('@pennpal:pending_prompt');
      } else {
        // No saved grad_year – can't auto-recover; send to waiting which
        // shows a clear error with sign-out option.
        router.replace('/(app)/waiting');
        return;
      }

      // Re-fetch after setup
      const { data: retryData } = await supabase
        .from('users')
        .select('status, pair_id')
        .eq('id', userId)
        .maybeSingle();

      if (retryData?.status === 'matched' && retryData.pair_id) {
        router.replace({ pathname: '/(app)/chat', params: { pairId: retryData.pair_id } });
      } else {
        router.replace('/(app)/waiting');
      }
    }

    bootstrap();
  }, [userId, router]);

  return (
    <View className="flex-1 bg-penn-bg items-center justify-center gap-4">
      <ActivityIndicator size="large" color="#7c6af7" />
      <Text className="text-penn-muted text-sm">{label}</Text>
    </View>
  );
}
