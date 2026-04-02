/**
 * Auth callback page – handles Supabase email confirmation redirects.
 *
 * Supabase redirects here after the user clicks the confirmation link.
 * The Supabase client (detectSessionInUrl: true on web) automatically
 * picks up the session from the URL hash. We just need to wait for
 * onAuthStateChange and then hand off to the root navigator.
 */
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('Confirming your account…');

  useEffect(() => {
    // Give the Supabase client a moment to process the URL hash,
    // then check the session manually as a fallback.
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/(app)/status');
      } else {
        setMessage('Confirmation failed. Please try signing in.');
        setTimeout(() => router.replace('/(auth)/login'), 2500);
      }
    }, 1500);

    // Primary path: onAuthStateChange fires when Supabase detects the URL session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        clearTimeout(timeout);
        router.replace('/(app)/status');
      }
    });

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
