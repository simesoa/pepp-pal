import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface RowProps {
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
  rightLabel?: string;
  disabled?: boolean;
}

function SettingsRow({ label, sublabel, onPress, destructive = false, rightLabel, disabled }: RowProps) {
  return (
    <TouchableOpacity
      className="flex-row items-center justify-between py-4 border-b border-penn-border"
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <View className="flex-1">
        <Text className={`text-[15px] font-medium ${destructive ? 'text-red-400' : 'text-penn-text'} ${disabled ? 'opacity-40' : ''}`}>
          {label}
        </Text>
        {sublabel ? (
          <Text className="text-penn-muted text-xs mt-0.5 leading-4">{sublabel}</Text>
        ) : null}
      </View>
      {rightLabel ? (
        <Text className="text-penn-muted text-sm">{rightLabel}</Text>
      ) : (
        <Text className="text-penn-muted text-base ml-3">›</Text>
      )}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-penn-muted text-xs uppercase tracking-wider mt-7 mb-2">
      {title}
    </Text>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [deletingAccount, setDeletingAccount] = useState(false);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently removes your account. Your messages will be anonymised so your Penn Pal\'s conversation history is preserved. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete my account', style: 'destructive', onPress: confirmDelete },
      ],
    );
  }

  async function confirmDelete() {
    setDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await supabase.auth.signOut();
      router.replace('/(auth)/welcome');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deletion failed';
      Alert.alert('Error', message);
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center pt-4 pb-2">
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="mr-4"
          >
            <Text className="text-penn-accent text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-penn-text text-xl font-bold">Settings</Text>
        </View>

        {/* Account */}
        <SectionHeader title="Account" />
        <View className="bg-penn-surface rounded-2xl px-4">
          <SettingsRow label="Sign out" onPress={handleSignOut} />
          <SettingsRow
            label="Delete account"
            sublabel="Permanently anonymises your data and removes your login"
            onPress={handleDeleteAccount}
            destructive
          />
        </View>

        {/* Legal & Safety */}
        <SectionHeader title="Legal & Safety" />
        <View className="bg-penn-surface rounded-2xl px-4">
          <SettingsRow
            label="Privacy Policy"
            onPress={() => router.push('/(app)/policy/privacy')}
          />
          <SettingsRow
            label="Terms of Service"
            onPress={() => router.push('/(app)/policy/terms')}
          />
          <SettingsRow
            label="Community Guidelines"
            onPress={() => router.push('/(app)/policy/guidelines')}
          />
        </View>

        {/* Support */}
        <SectionHeader title="Support" />
        <View className="bg-penn-surface rounded-2xl px-4">
          <SettingsRow
            label="Contact support"
            sublabel="support@pennpal.app"
            onPress={() =>
              Linking.openURL('mailto:support@pennpal.app?subject=Penn%20Pal%20Support')
            }
          />
          <SettingsRow
            label="Crisis resources"
            sublabel="988 Lifeline · Text HOME to 741741"
            onPress={() => Linking.openURL('tel:988')}
          />
        </View>

        {/* Admin panel – only visible to admins */}
        {isAdmin && (
          <>
            <SectionHeader title="Admin" />
            <View className="bg-penn-surface rounded-2xl px-4">
              <SettingsRow
                label="Admin dashboard"
                sublabel="Reports, users, moderation"
                onPress={() => router.push('/(admin)/')}
              />
            </View>
          </>
        )}

        {/* App info */}
        <SectionHeader title="App" />
        <View className="bg-penn-surface rounded-2xl px-4">
          <SettingsRow label="Version" onPress={() => {}} rightLabel="1.0.0" />
        </View>

        <View className="h-12" />
      </ScrollView>

      {deletingAccount && (
        <View className="absolute inset-0 bg-black/60 items-center justify-center">
          <View className="bg-penn-surface rounded-2xl px-8 py-6 items-center">
            <ActivityIndicator color="#7c6af7" />
            <Text className="text-penn-text text-[15px] mt-3">Deleting account…</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
