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
import { showAlert } from '@/lib/alerts';
import { track } from '@/lib/analytics';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!email.trim()) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw error;
      track('login');
      // AuthContext listener + root layout handle redirect
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      showAlert('Sign in failed', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 px-6 pt-4 pb-10 justify-between">
          <View>
            {/* Back */}
            <TouchableOpacity
              onPress={() => router.back()}
              className="mb-10"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text className="text-penn-accent text-base">← Back</Text>
            </TouchableOpacity>

            <Text className="text-penn-text text-3xl font-bold mb-2">
              Welcome back
            </Text>
            <Text className="text-penn-muted text-base mb-10">
              Sign in to continue with your Penn Pal.
            </Text>

            {/* Email */}
            <View className="mb-5">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
                Email
              </Text>
              <TextInput
                className={`bg-penn-surface rounded-xl px-4 py-4 text-penn-text text-base border ${
                  errors.email ? 'border-red-600' : 'border-penn-border'
                }`}
                placeholder="you@university.edu"
                placeholderTextColor="#6b6880"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (errors.email) setErrors((e) => ({ ...e, email: '' }));
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
              {errors.email ? (
                <Text className="text-red-400 text-xs mt-1">{errors.email}</Text>
              ) : null}
            </View>

            {/* Password */}
            <View className="mb-8">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
                Password
              </Text>
              <TextInput
                className={`bg-penn-surface rounded-xl px-4 py-4 text-penn-text text-base border ${
                  errors.password ? 'border-red-600' : 'border-penn-border'
                }`}
                placeholder="Your password"
                placeholderTextColor="#6b6880"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (errors.password) setErrors((e) => ({ ...e, password: '' }));
                }}
                secureTextEntry
                autoComplete="current-password"
              />
              {errors.password ? (
                <Text className="text-red-400 text-xs mt-1">{errors.password}</Text>
              ) : null}
            </View>

            <TouchableOpacity
              className="items-end"
              onPress={() => router.push('/(auth)/forgot-password')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text className="text-penn-accent text-sm">Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <View>
            <TouchableOpacity
              className={`rounded-2xl py-4 items-center mb-4 ${
                loading ? 'bg-penn-accent-muted' : 'bg-penn-accent'
              }`}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Sign in</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="items-center"
              onPress={() => router.push('/(auth)/signup')}
            >
              <Text className="text-penn-muted text-sm">
                Don't have an account?{' '}
                <Text className="text-penn-accent">Sign up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
