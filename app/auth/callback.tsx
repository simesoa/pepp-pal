/**
 * Auth callback page – lands here from Supabase email links:
 *   - signup confirmation  → wait for session → /(app)/status
 *   - password recovery    → wait for session → /auth/reset-password
 *   - expired/invalid link → readable error + route to login
 *
 * The Supabase client (detectSessionInUrl: true on web) picks the session out
 * of the URL hash automatically; we watch onAuthStateChange and also read the
 * hash ourselves to distinguish recovery links and surface link errors.
 */
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

function parseHashParams(): Record<string, string> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return {};
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params: Record<string, string> = {};
  new URLSearchParams(hash).forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('Confirming your account…');

  useEffect(() => {
    const hashParams = parseHashParams();
    const isRecovery = hashParams.type === 'recovery';
    const linkError = hashParams.error_description || hashParams.error;

    if (linkError) {
      setMessage(`${decodeURIComponent(linkError.replace(/\+/g, ' '))}. Redirecting to sign in…`);
      const t = setTimeout(() => router.replace('/(auth)/login'), 3000);
      return () => clearTimeout(t);
    }

    if (isRecovery) setMessage('Opening password reset…');

    function proceed() {
      if (isRecovery) {
        router.replace('/auth/reset-password');
      } else {
        router.replace('/(app)/status');
      }
    }

    // Primary path: onAuthStateChange fires when Supabase detects the URL session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        router.replace('/auth/reset-password');
      } else if (event === 'SIGNED_IN' && session) {
        proceed();
      }
    });

    // Fallback: check the session directly after the client has had time to
    // process the URL hash.
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        proceed();
      } else {
        setMessage('Confirmation failed or the link expired. Please try signing in.');
        setTimeout(() => router.replace('/(auth)/login'), 2500);
      }
    }, 1500);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <View className="flex-1 bg-penn-bg items-center justify-center px-8">
      <ActivityIndicator size="large" color="#7c6af7" />
      <Text className="text-penn-muted text-base text-center mt-6">
        {message}
      </Text>
    </View>
  );
}
