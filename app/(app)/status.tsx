/**
 * Status router screen.
 * Checks the user's match status and redirects to:
 *   - /waiting  if status = 'waiting'
 *   - /chat     if status = 'matched'
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useMatchStatus } from '@/hooks/useMatchStatus';

export default function StatusScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { status, pairId, isLoading } = useMatchStatus(userId);

  useEffect(() => {
    if (isLoading) return;

    if (status === 'matched' && pairId) {
      router.replace({ pathname: '/(app)/chat', params: { pairId } });
    } else {
      router.replace('/(app)/waiting');
    }
  }, [status, pairId, isLoading, router]);

  return (
    <View className="flex-1 bg-penn-bg items-center justify-center">
      <ActivityIndicator size="large" color="#7c6af7" />
    </View>
  );
}
