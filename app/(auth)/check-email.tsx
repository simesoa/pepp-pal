/**
 * Post-signup screen shown when email confirmation is required
 * (supabase.auth.signUp returned a user but no session).
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alerts';

export default function CheckEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [resending, setResending] = useState(false);

  async function handleResend() {
    if (!email || resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    if (error) {
      showAlert('Could not resend', error.message);
    } else {
      showAlert('Email sent', `We sent a new confirmation link to ${email}.`);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-16 h-16 rounded-2xl bg-penn-surface border border-penn-border items-center justify-center mb-8">
          <Text className="text-3xl">✉️</Text>
        </View>

        <Text className="text-penn-text text-2xl font-bold text-center mb-3">
          Check your email
        </Text>
        <Text className="text-penn-muted text-[15px] text-center leading-6 max-w-xs mb-2">
          We sent a confirmation link to
        </Text>
        <Text className="text-penn-text text-[15px] font-semibold text-center mb-8">
          {email ?? 'your .edu inbox'}
        </Text>
        <Text className="text-penn-muted text-[13px] text-center leading-5 max-w-xs mb-10">
          Open the link on this device to finish setting up your account. Check
          your spam folder if you don't see it within a couple of minutes.
        </Text>

        <View className="w-full gap-y-3">
          <TouchableOpacity
            className="bg-penn-surface border border-penn-border rounded-2xl py-4 items-center"
            onPress={handleResend}
            disabled={resending}
          >
            <Text className="text-penn-text font-medium text-base">
              {resending ? 'Sending…' : 'Resend email'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded-2xl py-4 items-center"
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text className="text-penn-muted text-sm">Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
