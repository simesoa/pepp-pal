/**
 * Registration recovery screen.
 *
 * Shown when an auth user exists but has no public.users row AND no locally
 * saved grad year (e.g. confirmed their email on a different device, or an
 * orphaned account from before the registration fixes). Collects the
 * graduation year and completes registration + matching.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { registerAndMatch } from '@/lib/registration';
import { supabase } from '@/lib/supabase';
import { MIN_GRAD_YEAR, MAX_GRAD_YEAR } from '@/lib/config';

const CURRENT_YEAR = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + i).filter(
  (y) => y >= MIN_GRAD_YEAR && y <= MAX_GRAD_YEAR,
);

export default function CompleteProfileScreen() {
  const router = useRouter();
  const [gradYear, setGradYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!gradYear || loading) return;
    setLoading(true);
    setError(null);

    const result = await registerAndMatch(gradYear, null, { recovered: true });

    if (result.ok) {
      if (result.status === 'matched' && result.pairId) {
        router.replace({ pathname: '/(app)/chat', params: { pairId: result.pairId } });
      } else {
        router.replace('/(app)/waiting');
      }
      return;
    }

    setError(
      result.reason === 'needs-grad-year'
        ? 'Please pick your graduation year.'
        : result.message,
    );
    setLoading(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 pt-10 pb-10">
          <Text className="text-penn-text text-3xl font-bold mb-2">
            One last step
          </Text>
          <Text className="text-penn-muted text-base mb-8 leading-6">
            Your account is confirmed, but we still need your graduation year
            to match you with a classmate.
          </Text>

          <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
            Graduation year
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {GRAD_YEARS.map((year) => (
              <TouchableOpacity
                key={year}
                onPress={() => setGradYear(year)}
                className={`px-4 py-2.5 rounded-xl border ${
                  gradYear === year
                    ? 'bg-penn-accent border-penn-accent'
                    : 'bg-penn-surface border-penn-border'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    gradYear === year ? 'text-white' : 'text-penn-muted'
                  }`}
                >
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? (
            <View className="bg-red-900/40 border border-red-800 rounded-xl px-4 py-3 mb-6">
              <Text className="text-red-300 text-[13px] leading-5">{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            className={`rounded-2xl py-4 items-center ${
              gradYear && !loading ? 'bg-penn-accent' : 'bg-penn-accent-muted'
            }`}
            onPress={handleContinue}
            disabled={!gradYear || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">
                Find my Penn Pal
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-6 items-center"
            onPress={() => supabase.auth.signOut()}
          >
            <Text className="text-penn-muted text-sm">Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
