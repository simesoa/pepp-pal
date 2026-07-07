/**
 * Password recovery landing screen. The user arrives here from
 * /auth/callback after clicking the reset link (Supabase creates a recovery
 * session via detectSessionInUrl). Sets the new password and continues.
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
import { useAuth } from '@/context/AuthContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.replace('/(app)/status');
  }

  // Recovery link expired or was opened without a session.
  if (!isLoading && !session) {
    return (
      <SafeAreaView className="flex-1 bg-penn-bg">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-penn-text text-2xl font-bold text-center mb-3">
            Link expired
          </Text>
          <Text className="text-penn-muted text-[15px] text-center leading-6 max-w-xs mb-10">
            This password reset link is invalid or has expired. Request a new
            one from the sign-in screen.
          </Text>
          <TouchableOpacity
            className="bg-penn-accent rounded-2xl py-4 px-8 items-center"
            onPress={() => router.replace('/(auth)/forgot-password')}
          >
            <Text className="text-white font-semibold text-base">
              Request new link
            </Text>
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
        <View className="flex-1 px-6 pt-16">
          <Text className="text-penn-text text-3xl font-bold mb-2">
            Set a new password
          </Text>
          <Text className="text-penn-muted text-base mb-10 leading-6">
            Choose a new password for your account.
          </Text>

          <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
            New password
          </Text>
          <TextInput
            className="bg-penn-surface rounded-xl px-4 py-4 text-penn-text text-base border border-penn-border mb-5"
            placeholder="At least 8 characters"
            placeholderTextColor="#6b6880"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (error) setError(null);
            }}
            secureTextEntry
            autoComplete="new-password"
          />

          <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
            Confirm password
          </Text>
          <TextInput
            className="bg-penn-surface rounded-xl px-4 py-4 text-penn-text text-base border border-penn-border"
            placeholder="Repeat your new password"
            placeholderTextColor="#6b6880"
            value={confirm}
            onChangeText={(t) => {
              setConfirm(t);
              if (error) setError(null);
            }}
            secureTextEntry
            autoComplete="new-password"
          />

          {error ? (
            <Text className="text-red-400 text-xs mt-3">{error}</Text>
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
                Save new password
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
