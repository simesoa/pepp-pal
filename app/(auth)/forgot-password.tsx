/**
 * Forgot-password screen. Sends a Supabase recovery email that lands on
 * /auth/callback, which detects type=recovery and routes to /auth/reset-password.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

function recoveryRedirectUrl(): string | undefined {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  // Native uses the Site URL configured in Supabase (deep linking comes with
  // the native launch).
  return undefined;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter the email you signed up with.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: recoveryRedirectUrl(),
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    track('password_reset_requested');
    setSent(true);
  }

  if (sent) {
    return (
      <SafeAreaView className="flex-1 bg-penn-bg">
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-2xl bg-penn-surface border border-penn-border items-center justify-center mb-8">
            <Text className="text-3xl">✉️</Text>
          </View>
          <Text className="text-penn-text text-2xl font-bold text-center mb-3">
            Check your email
          </Text>
          <Text className="text-penn-muted text-[15px] text-center leading-6 max-w-xs mb-10">
            If an account exists for {email.trim().toLowerCase()}, we sent a
            link to reset your password. The link opens a page where you can
            choose a new one.
          </Text>
          <TouchableOpacity
            className="rounded-2xl py-4 px-8 items-center border border-penn-border"
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text className="text-penn-text font-medium text-base">Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 px-6 pt-4">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mb-10"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text className="text-penn-accent text-base">← Back</Text>
          </TouchableOpacity>

          <Text className="text-penn-text text-3xl font-bold mb-2">
            Reset password
          </Text>
          <Text className="text-penn-muted text-base mb-10 leading-6">
            Enter your school email and we'll send you a link to set a new
            password.
          </Text>

          <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
            Email
          </Text>
          <TextInput
            className={`bg-penn-surface rounded-xl px-4 py-4 text-penn-text text-base border ${
              error ? 'border-red-600' : 'border-penn-border'
            }`}
            placeholder="you@university.edu"
            placeholderTextColor="#6b6880"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
          {error ? (
            <Text className="text-red-400 text-xs mt-2">{error}</Text>
          ) : null}

          <TouchableOpacity
            className={`rounded-2xl py-4 items-center mt-8 ${
              loading ? 'bg-penn-accent-muted' : 'bg-penn-accent'
            }`}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">
                Send reset link
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
