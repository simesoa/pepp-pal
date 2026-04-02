import React, { useEffect } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

export default function BannedScreen() {
  useEffect(() => {
    track('banned_screen_viewed');
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <View className="flex-1 items-center justify-center px-8">
        {/* Icon */}
        <View className="w-16 h-16 rounded-2xl bg-penn-surface border border-penn-border items-center justify-center mb-8">
          <Text className="text-3xl">⊘</Text>
        </View>

        <Text className="text-penn-text text-2xl font-bold text-center mb-3">
          Account suspended
        </Text>
        <Text className="text-penn-muted text-[15px] text-center leading-6 max-w-xs mb-10">
          Your account has been suspended following a review of reported activity.
          If you believe this is a mistake, please contact our support team.
        </Text>

        <View className="w-full gap-y-3">
          <TouchableOpacity
            className="bg-penn-accent rounded-2xl py-4 items-center"
            onPress={() =>
              Linking.openURL(
                'mailto:support@pennpal.app?subject=Account%20Suspension%20Appeal',
              )
            }
          >
            <Text className="text-white font-semibold text-base">
              Contact support
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded-2xl py-4 items-center border border-penn-border"
            onPress={handleSignOut}
          >
            <Text className="text-penn-muted font-medium text-base">
              Sign out
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="pb-8 items-center">
        <Text className="text-penn-muted text-xs text-center px-8 leading-5">
          Penn Pal is committed to keeping this space safe for everyone.{'\n'}
          Please review our Community Guidelines before appealing.
        </Text>
      </View>
    </SafeAreaView>
  );
}
