import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { showAlert, showConfirm } from '@/lib/alerts';
import { APP_NAME, SUPPORT_EMAIL, CRISIS_LINE, CRISIS_TEXT_LINE } from '@/lib/config';
import { NotificationPrefs } from '@/components/NotificationPrefs';
import { track } from '@/lib/analytics';

// Pull version info from app.json / app.config.js at build time
const APP_VERSION    = Constants.expoConfig?.version ?? '1.0.0';
const IOS_BUILD      = Constants.expoConfig?.ios?.buildNumber ?? '1';
const ANDROID_BUILD  = String(Constants.expoConfig?.android?.versionCode ?? 1);

function openSupport(subject = `${APP_NAME} Support`) {
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

  function handleSignOut() {
    showConfirm('Sign out', 'Are you sure?', {
      confirmLabel: 'Sign out',
      destructive: true,
      onConfirm: async () => {
        await supabase.auth.signOut();
        router.replace('/(auth)/welcome');
      },
    });
  }

  function handleDeleteAccount() {
    showConfirm(
      'Delete account',
      `This permanently removes your account.\n\nYour messages will be anonymised so your ${APP_NAME}'s conversation history is preserved. This cannot be undone.`,
      {
        confirmLabel: 'Delete my account',
        destructive: true,
        onConfirm: confirmDelete,
      },
    );
  }

  async function confirmDelete() {
    setDeletingAccount(true);
    track('account_delete_requested');
    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      if (data && data.ok !== true) throw new Error('Deletion did not complete');
      track('account_deleted');
      await supabase.auth.signOut();
      router.replace('/(auth)/welcome');
    } catch (err: unknown) {
      // The delete-account Edge Function may not be deployed yet (it requires
      // the Supabase CLI — see docs/supabase-setup.md §6). Be honest about it:
      // the account was NOT deleted.
      const raw = err instanceof Error ? err.message : '';
      const notDeployed = /failed to send|fetch|404|not found|relay/i.test(raw);
      showAlert(
        'Account not deleted',
        notDeployed
          ? `Account deletion isn't available in this environment yet. Your account has NOT been deleted. Email ${SUPPORT_EMAIL} and we'll delete it for you within 48 hours.`
          : `Something went wrong and your account has NOT been deleted. Please try again, or email ${SUPPORT_EMAIL} and we'll handle it for you.`,
        () => openSupport('Account Deletion Request'),
      );
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

        {/* Notifications + privacy */}
        <NotificationPrefs />

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
            sublabel={`Call or text ${CRISIS_LINE} · Text HOME to ${CRISIS_TEXT_LINE}`}
            onPress={() => Linking.openURL(`tel:${CRISIS_LINE}`)}
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
        <SectionHeader title={`About ${APP_NAME}`} />
        <View className="bg-penn-surface rounded-2xl px-4">
          <SettingsRow
            label={`What is ${APP_NAME}?`}
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
            {APP_NAME} is in early pilot.{'\n'}
            Questions or feedback?{' '}
            <Text
              className="text-penn-accent"
              onPress={() => openSupport(`${APP_NAME} Feedback`)}
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
