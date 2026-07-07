import '../global.css';
import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { registerForPushNotifications, attachNotificationRouter, pushSupported } from '@/lib/notifications';
import { APP_NAME } from '@/lib/config';

SplashScreen.preventAutoHideAsync();

/**
 * Shown instead of a blank white page when the Supabase env vars are missing
 * (the most common cause of "blank deploy" on Vercel).
 */
function ConfigErrorScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0e0e12',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <Text style={{ color: '#f2f1f7', fontSize: 20, fontWeight: '700', marginBottom: 12, textAlign: 'center' }}>
        {APP_NAME} is not configured
      </Text>
      <Text style={{ color: '#8d8aa0', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 420 }}>
        Missing environment variables: EXPO_PUBLIC_SUPABASE_URL and/or
        EXPO_PUBLIC_SUPABASE_ANON_KEY.{'\n\n'}
        Local dev: copy .env.example to .env and fill in your Supabase project
        URL and anon key.{'\n'}
        Vercel: add both variables under Project → Settings → Environment
        Variables, then redeploy.
      </Text>
    </View>
  );
}

function RootNavigator() {
  const { session, isLoading, isBanned } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Native push: register the device token once signed in, and route
  // notification taps. No-op on web.
  useEffect(() => {
    if (!session || !pushSupported) return;
    let detach: (() => void) | undefined;
    registerForPushNotifications();
    attachNotificationRouter((path, params) => {
      if (params) router.push({ pathname: path as never, params });
      else router.push(path as never);
    }).then((fn) => { detach = fn; });
    return () => detach?.();
  }, [session, router]);

  useEffect(() => {
    if (isLoading) return;

    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    // /auth/callback and /auth/reset-password handle their own session logic
    // (the session may still be materializing from the URL hash) — never
    // yank the user away from them.
    const inAuthCallback = segments[0] === 'auth';
    const inBanned = segments[0] === '(app)' && segments[1] === 'banned';
    // Policy pages are public: signup/welcome link to them pre-auth, and
    // app stores require them to be reachable without an account.
    const inPolicy = segments[0] === '(app)' && segments[1] === 'policy';

    if (inAuthCallback) return;

    if (!session && !inAuthGroup && !inPolicy) {
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

      // Push logged-in users out of the auth group (also covers the user
      // confirming their email in another tab while parked on check-email).
      if (inAuthGroup) {
        router.replace('/(app)/status');
      }
    }
  }, [session, isLoading, isBanned, segments, router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  if (!isSupabaseConfigured) {
    SplashScreen.hideAsync();
    return <ConfigErrorScreen />;
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
