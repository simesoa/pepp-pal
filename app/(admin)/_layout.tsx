import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function AdminLayout() {
  const { isAdmin, isLoading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!session || !isAdmin) {
      // Silently redirect non-admins; no error message that leaks admin route existence
      router.replace('/(app)/status');
    }
  }, [isAdmin, isLoading, session, router]);

  if (isLoading || !isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0e0e12', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#7c6af7" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0e0e12' },
        animation: 'slide_from_right',
      }}
    />
  );
}
