import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, isLoading, isBanned } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    SplashScreen.hideAsync();

    const inAuthGroup  = segments[0] === '(auth)';
    const inBanned     = segments[0] === '(app)' && segments[1] === 'banned';
    const inAdmin      = segments[0] === '(admin)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome');
      return;
    }

    if (session) {
      // Banned users are locked to the banned screen
      if (isBanned && !inBanned) {
        router.replace('/(app)/banned');
        return;
      }

      // Non-banned users should not sit on the banned screen
      if (!isBanned && inBanned) {
        router.replace('/(app)/status');
        return;
      }

      // Push logged-in users out of the auth group
      if (inAuthGroup) {
        router.replace('/(app)/status');
      }
    }
  }, [session, isLoading, isBanned, segments, router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
