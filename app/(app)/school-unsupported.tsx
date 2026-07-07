/**
 * Shown when a user's .edu domain isn't an active school and
 * allow_unknown_schools is off. Waitlist-style message.
 */
import React from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { APP_NAME, SUPPORT_EMAIL } from '@/lib/config';

export default function SchoolUnsupportedScreen() {
  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-4xl mb-6">🏫</Text>
        <Text className="text-penn-text text-2xl font-bold text-center mb-3">
          {APP_NAME} isn't open at your school yet
        </Text>
        <Text className="text-penn-muted text-[15px] text-center leading-6 max-w-xs mb-10">
          We're rolling out school by school so every campus gets a real
          community. Want us at yours sooner? Let us know — schools with the
          most requests open first.
        </Text>

        <View className="w-full gap-y-3">
          <TouchableOpacity
            className="bg-penn-accent rounded-2xl py-4 items-center"
            onPress={() =>
              Linking.openURL(
                `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Bring ' + APP_NAME + ' to my school')}`,
              )
            }
          >
            <Text className="text-white font-semibold text-base">Join the waitlist</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-2xl py-4 items-center border border-penn-border"
            onPress={() => supabase.auth.signOut()}
          >
            <Text className="text-penn-muted font-medium text-base">Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
