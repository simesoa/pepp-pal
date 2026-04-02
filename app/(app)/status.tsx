/**
 * Status router screen.
 * On first load after login/confirmation, ensures the public.users row
 * exists (calls register_and_match with the pending grad_year if not),
 * then redirects to /waiting or /chat.
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
      // 1. Check if user record exists
      const { data, error } = await supabase
        .from('users')
        .select('status, pair_id')
        .eq('id', userId)
        .maybeSingle();           // returns null (not error) when row missing

      if (error) {
        // Real network error – go to waiting which shows the retry UI
        router.replace('/(app)/waiting');
        return;
      }

      // 2. Row missing → registration didn't complete (email confirmation
      //    was required and register_and_match ran before the session existed).
      //    Re-run it now using the locally saved grad_year.
      if (!data) {
        setLabel('Finishing account setup…');
        const savedYear = await AsyncStorage.getItem('@pennpal:pending_grad_year');
        const savedPrompt = await AsyncStorage.getItem('@pennpal:pending_prompt');

        if (savedYear) {
          const { error: rpcError } = await supabase.rpc('register_and_match', {
            p_grad_year: parseInt(savedYear, 10),
            p_prompt: savedPrompt || null,
          });

          if (!rpcError) {
            await AsyncStorage.removeItem('@pennpal:pending_grad_year');
            await AsyncStorage.removeItem('@pennpal:pending_prompt');
          }
        }

        // Re-fetch after registration attempt
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
        return;
      }

      // 3. Row exists – route normally
      if (data.status === 'matched' && data.pair_id) {
        router.replace({ pathname: '/(app)/chat', params: { pairId: data.pair_id } });
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
