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
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { track } from '@/lib/analytics';

// Pull version info from app.json / app.config.js at build time
const APP_VERSION    = Constants.expoConfig?.version ?? '1.0.0';
const IOS_BUILD      = Constants.expoConfig?.ios?.buildNumber ?? '1';
const ANDROID_BUILD  = String(Constants.expoConfig?.android?.versionCode ?? 1);

const SUPPORT_EMAIL = 'support@pennpal.app';

function openSupport(subject = 'Penn Pal Support') {
  Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`);
}

// ── Shared components ─────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
  rightLabel?: string;
  disabled?: boolean;
}

function SettingsRow({
  label, sublabel, onPress, destructive = false, rightLabel, disabled,
}: RowProps) {
  return (
    <TouchableOpacity
      className="flex-row items-center justify-between py-4 border-b border-penn-border last:border-0"
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <View className="flex-1 pr-2">
        <Text
          className={`text-[15px] font-medium ${destructive ? 'text-red-400' : 'text-penn-text'} ${disabled ? 'opacity-40' : ''}`}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text className="text-penn-muted text-xs mt-0.5 leading-4">{sublabel}</Text>
        ) : null}
      </View>
      {rightLabel !== undefined ? (
        <Text className="text-penn-muted text-sm shrink-0">{rightLabel}</Text>
      ) : (
        <Text className="text-penn-muted text-base ml-2 shrink-0">›</Text>
      )}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-penn-muted text-xs uppercase tracking-wider mt-7 mb-2 px-0">
      {title}
    </Text>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

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
      'This permanently removes your account.\n\nYour messages will be anonymised so your Penn Pal\'s conversation history is preserved. This cannot be undone.',
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
      track('account_deleted');
      await supabase.auth.signOut();
      router.replace('/(auth)/welcome');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deletion failed. Please try again or contact support.';
      Alert.alert('Could not delete account', message, [
        { text: 'OK' },
        { text: 'Contact support', onPress: () => openSupport('Account Deletion Issue') },
      ]);
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
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
            sublabel="Anonymises your data and removes your login permanently"
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
            sublabel={SUPPORT_EMAIL}
            onPress={() => openSupport()}
          />
          <SettingsRow
            label="Crisis resources"
            sublabel="Call or text 988 · Text HOME to 741741"
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
                sublabel="Stats, reports, users, moderation"
                onPress={() => router.push('/(admin)/')}
              />
            </View>
          </>
        )}

        {/* About */}
        <SectionHeader title="About Penn Pal" />
        <View className="bg-penn-surface rounded-2xl px-4">
          <SettingsRow
            label="What is Penn Pal?"
            sublabel="One anonymous partner. Your whole college journey."
            onPress={() => router.push('/(app)/policy/privacy')}
            rightLabel=""
          />
        </View>
        <View className="bg-penn-surface rounded-2xl px-4 mt-1">
          <View className="py-4 border-b border-penn-border flex-row justify-between">
            <Text className="text-penn-text text-[15px] font-medium">Version</Text>
            <Text className="text-penn-muted text-sm">{APP_VERSION}</Text>
          </View>
          <View className="py-4 flex-row justify-between">
            <Text className="text-penn-text text-[15px] font-medium">Build</Text>
            <Text className="text-penn-muted text-sm">
              iOS {IOS_BUILD} · Android {ANDROID_BUILD}
            </Text>
          </View>
        </View>

        {/* Feedback nudge */}
        <View className="mt-6 bg-penn-card rounded-2xl px-4 py-4 border border-penn-border">
          <Text className="text-penn-muted text-[13px] leading-5 text-center">
            Penn Pal is in early pilot.{'\n'}
            Questions or feedback?{' '}
            <Text
              className="text-penn-accent"
              onPress={() => openSupport('Penn Pal Feedback')}
            >
              Drop us a note.
            </Text>
          </Text>
        </View>
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
