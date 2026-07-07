/**
 * Status router screen — the single self-healing entry point after auth.
 *
 * Delegates to ensureRegisteredUserAndMatch() (lib/registration.ts):
 *   - users row exists  → route to /waiting or /chat
 *   - row missing + saved grad year → register_and_match, then route
 *   - row missing + no grad year    → /complete-profile recovery screen
 *   - real network/server error     → inline error with Retry (never a
 *     misleading "No connection" for a missing row)
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ensureRegisteredUserAndMatch } from '@/lib/registration';
import { ErrorState } from '@/components/ErrorState';
import { supabase } from '@/lib/supabase';

export default function StatusScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const [label, setLabel] = useState('Loading…');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    if (!userId) return;
    setErrorMessage(null);

    const result = await ensureRegisteredUserAndMatch(userId);

    if (result.ok) {
      if (result.status === 'matched' && result.pairId) {
        router.replace({ pathname: '/(app)/chat', params: { pairId: result.pairId } });
      } else {
        router.replace('/(app)/waiting');
      }
      return;
    }

    if (result.reason === 'needs-grad-year') {
      router.replace('/(app)/complete-profile');
      return;
    }

    if (result.reason === 'unsupported-school') {
      router.replace('/(app)/school-unsupported');
      return;
    }

    setErrorMessage(result.message);
  }, [userId, router]);

  useEffect(() => {
    setLabel('Setting things up…');
    bootstrap();
  }, [bootstrap]);

  if (errorMessage) {
    return (
      <View className="flex-1 bg-penn-bg">
        <ErrorState
          title="Something went wrong"
          message={errorMessage}
          retryLabel="Retry"
          onRetry={bootstrap}
        />
        <View className="pb-10 items-center">
          <TouchableOpacity onPress={() => supabase.auth.signOut()}>
            <Text className="text-penn-muted text-sm">Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-penn-bg items-center justify-center gap-4">
      <ActivityIndicator size="large" color="#7c6af7" />
      <Text className="text-penn-muted text-sm">{label}</Text>
    </View>
  );
}
