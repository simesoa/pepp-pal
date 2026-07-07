/**
 * Notification + privacy preferences section for Settings.
 * Preferences live in notification_preferences (RLS: own row only);
 * the read-receipts toggle lives on users.show_read_receipts.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { registerForPushNotifications, pushSupported } from '@/lib/notifications';
import { track } from '@/lib/analytics';

interface Prefs {
  messages: boolean;
  matches: boolean;
  checkins: boolean;
  reveal: boolean;
  safety_updates: boolean;
}

const DEFAULT_PREFS: Prefs = {
  messages: true,
  matches: true,
  checkins: true,
  reveal: true,
  safety_updates: true,
};

const PREF_LABELS: { key: keyof Prefs; label: string; sublabel: string }[] = [
  { key: 'messages', label: 'New messages', sublabel: 'When your Pal sends you a message' },
  { key: 'matches', label: 'Matches', sublabel: 'When you get matched with a new Pal' },
  { key: 'checkins', label: 'Check-ins', sublabel: 'Gentle nudges when things go quiet' },
  { key: 'reveal', label: 'Reveal', sublabel: 'Graduation reveal requests and unlocks' },
  { key: 'safety_updates', label: 'Safety updates', sublabel: 'Report outcomes and account notices' },
];

function Row({ label, sublabel, value, onChange }: {
  label: string; sublabel: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-3.5 border-b border-penn-border last:border-0">
      <View className="flex-1 pr-3">
        <Text className="text-penn-text text-[15px] font-medium">{label}</Text>
        <Text className="text-penn-muted text-xs mt-0.5 leading-4">{sublabel}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#2a2837', true: '#7c6af7' }}
        thumbColor="#f2f1f7"
      />
    </View>
  );
}

export function NotificationPrefs() {
  const { userId } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [showReadReceipts, setShowReadReceipts] = useState(true);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('notification_preferences')
      .select('messages, matches, checkins, reveal, safety_updates')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPrefs(data as Prefs);
      });
    supabase
      .from('users')
      .select('show_read_receipts')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && typeof data.show_read_receipts === 'boolean') {
          setShowReadReceipts(data.show_read_receipts);
        }
      });
  }, [userId]);

  async function updatePref(key: keyof Prefs, value: boolean) {
    if (!userId) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await supabase.from('notification_preferences').upsert({
      user_id: userId,
      ...next,
      updated_at: new Date().toISOString(),
    });
    // Register the push token on first opt-in (no-op on web)
    if (value && pushSupported) {
      const status = await registerForPushNotifications();
      if (status === 'denied') {
        setPushStatus('Push permission is off for this device. Enable it in system settings.');
      }
    }
  }

  async function updateReadReceipts(value: boolean) {
    if (!userId) return;
    setShowReadReceipts(value);
    await supabase.from('users').update({ show_read_receipts: value }).eq('id', userId);
    track('read_receipts_toggled', { enabled: value });
  }

  return (
    <>
      <Text className="text-penn-muted text-xs uppercase tracking-wider mt-7 mb-2">
        Notifications
      </Text>
      <View className="bg-penn-surface rounded-2xl px-4">
        {PREF_LABELS.map(({ key, label, sublabel }) => (
          <Row
            key={key}
            label={label}
            sublabel={sublabel}
            value={prefs[key]}
            onChange={(v) => updatePref(key, v)}
          />
        ))}
      </View>
      {Platform.OS === 'web' ? (
        <Text className="text-penn-muted text-[11px] mt-2 px-1 leading-4">
          Push notifications are delivered on the mobile app. On web these
          settings still control what gets queued for your devices.
        </Text>
      ) : pushStatus ? (
        <Text className="text-penn-muted text-[11px] mt-2 px-1 leading-4">{pushStatus}</Text>
      ) : null}

      <Text className="text-penn-muted text-xs uppercase tracking-wider mt-7 mb-2">
        Privacy
      </Text>
      <View className="bg-penn-surface rounded-2xl px-4">
        <Row
          label="Show read receipts"
          sublabel='When off, your Pal never sees "Seen" on their messages'
          value={showReadReceipts}
          onChange={updateReadReceipts}
        />
      </View>
    </>
  );
}
