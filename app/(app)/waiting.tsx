import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  Animated,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useMatchStatus } from '@/hooks/useMatchStatus';
import { supabase } from '@/lib/supabase';

export default function WaitingScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { status, pairId } = useMatchStatus(userId);

  // Pulse animation for the orb
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1.6,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = createPulse(pulse1, 0);
    const a2 = createPulse(pulse2, 600);
    a1.start();
    a2.start();

    return () => {
      a1.stop();
      a2.stop();
    };
  }, [pulse1, pulse2]);

  // Navigate when matched
  useEffect(() => {
    if (status === 'matched' && pairId) {
      router.replace({ pathname: '/(app)/chat', params: { pairId } });
    }
  }, [status, pairId, router]);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <View className="flex-1 items-center justify-center px-8">
        {/* Pulsing orb */}
        <View className="items-center justify-center mb-12" style={{ width: 160, height: 160 }}>
          <Animated.View
            style={{ transform: [{ scale: pulse1 }], opacity: 0.12 }}
            className="absolute w-40 h-40 rounded-full bg-penn-accent"
          />
          <Animated.View
            style={{ transform: [{ scale: pulse2 }], opacity: 0.18 }}
            className="absolute w-28 h-28 rounded-full bg-penn-accent"
          />
          <View className="w-16 h-16 rounded-full bg-penn-accent items-center justify-center">
            <Text className="text-white text-2xl">P</Text>
          </View>
        </View>

        {/* Heading */}
        <Text className="text-penn-text text-2xl font-bold text-center mb-3">
          Finding your Penn Pal…
        </Text>
        <Text className="text-penn-muted text-base text-center leading-6 max-w-xs">
          We'll connect you with someone walking the same path.
        </Text>

        {/* Subtle info */}
        <View className="mt-12 bg-penn-surface rounded-2xl px-6 py-5 w-full max-w-sm">
          <Text className="text-penn-muted text-[13px] leading-5 text-center">
            Matching is done by graduation year. This can take a moment if others in
            your class aren't signed up yet — you'll be matched as soon as someone
            joins.
          </Text>
        </View>
      </View>

      {/* Sign out link */}
      <View className="pb-8 items-center">
        <TouchableOpacity onPress={handleSignOut}>
          <Text className="text-penn-muted text-sm">Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
