import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const CURRENT_YEAR = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + i);

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gradYear, setGradYear] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!email.toLowerCase().endsWith('.edu')) {
      newErrors.email = 'Please use your .edu email address';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password || password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!gradYear) {
      newErrors.gradYear = 'Please select your graduation year';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSignup() {
    if (!validate()) return;

    setLoading(true);
    try {
      // 1. Create auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Signup failed – no user returned');

      // 2. Trigger matching via Edge Function
      const { error: fnError } = await supabase.functions.invoke('match-user', {
        body: {
          grad_year: gradYear,
          prompt: prompt.trim() || null,
        },
      });

      if (fnError) {
        console.warn('match-user function error:', fnError.message);
        // Non-fatal – user still created; they will stay in waiting state
      }

      // Router redirect happens automatically via AuthContext listener
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Sign up failed', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 pt-4 pb-10">
            {/* Back button */}
            <TouchableOpacity
              onPress={() => router.back()}
              className="mb-8"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text className="text-penn-accent text-base">← Back</Text>
            </TouchableOpacity>

            <Text className="text-penn-text text-3xl font-bold mb-2">
              Create account
            </Text>
            <Text className="text-penn-muted text-base mb-8">
              Use your .edu email to get started.
            </Text>

            {/* Email */}
            <View className="mb-5">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
                School email (.edu)
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
            <View className="mb-5">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
                Password
              </Text>
              <TextInput
                className={`bg-penn-surface rounded-xl px-4 py-4 text-penn-text text-base border ${
                  errors.password ? 'border-red-600' : 'border-penn-border'
                }`}
                placeholder="At least 8 characters"
                placeholderTextColor="#6b6880"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (errors.password) setErrors((e) => ({ ...e, password: '' }));
                }}
                secureTextEntry
                autoComplete="new-password"
              />
              {errors.password ? (
                <Text className="text-red-400 text-xs mt-1">{errors.password}</Text>
              ) : null}
            </View>

            {/* Grad year */}
            <View className="mb-5">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
                Graduation year
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {GRAD_YEARS.map((year) => (
                  <TouchableOpacity
                    key={year}
                    onPress={() => {
                      setGradYear(year);
                      if (errors.gradYear) setErrors((e) => ({ ...e, gradYear: '' }));
                    }}
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
              {errors.gradYear ? (
                <Text className="text-red-400 text-xs mt-1">{errors.gradYear}</Text>
              ) : null}
            </View>

            {/* Optional prompt */}
            <View className="mb-8">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">
                What are you going through? (optional)
              </Text>
              <TextInput
                className="bg-penn-surface rounded-xl px-4 py-4 text-penn-text text-base border border-penn-border"
                placeholder="e.g. Feeling overwhelmed by finals…"
                placeholderTextColor="#6b6880"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={200}
                style={{ minHeight: 80 }}
              />
              <Text className="text-penn-muted text-xs mt-1 text-right">
                {prompt.length}/200
              </Text>
            </View>

            {/* Community notice */}
            <View className="bg-penn-surface border border-penn-border rounded-2xl px-4 py-4 mb-6">
              <Text className="text-penn-accent text-xs font-semibold uppercase tracking-wider mb-2">
                A note before you join
              </Text>
              <Text className="text-penn-muted text-[13px] leading-5">
                Penn Pal is a private space. Be kind, stay anonymous, and reach out to support if
                anything feels unsafe. You can report or leave any conversation at any time.
              </Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              className={`rounded-2xl py-4 items-center ${
                loading ? 'bg-penn-accent-muted' : 'bg-penn-accent'
              }`}
              onPress={handleSignup}
              disabled={loading}
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
              className="mt-5 items-center"
              onPress={() => router.push('/(auth)/login')}
            >
              <Text className="text-penn-muted text-sm">
                Already have an account?{' '}
                <Text className="text-penn-accent">Sign in</Text>
              </Text>
            </TouchableOpacity>

            {/* Policy acknowledgement */}
            <View className="mt-5 flex-row flex-wrap justify-center gap-x-1">
              <Text className="text-penn-muted text-xs">By signing up you agree to our</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/policy/terms')}>
                <Text className="text-penn-accent text-xs">Terms</Text>
              </TouchableOpacity>
              <Text className="text-penn-muted text-xs">and</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/policy/privacy')}>
                <Text className="text-penn-accent text-xs">Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
