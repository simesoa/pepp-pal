/**
 * Admin – System: global config switches, notification delivery stats,
 * abuse/rate-limit stats, test notification, cooldown management.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alerts';

interface NotifStats {
  active_tokens: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  recent_failures: { id: string; type: string; created_at: string }[];
}

interface AbuseStats {
  by_kind_7d: Record<string, number>;
  top_offenders_7d: { user_id: string; email: string; events: number }[];
  active_cooldowns: { id: string; email: string; cooldown_until: string }[];
}

const CONFIG_LABELS: Record<string, { label: string; sublabel: string }> = {
  allow_unknown_schools: {
    label: 'Allow unknown schools',
    sublabel: 'Auto-create a school for new .edu domains (pilot). Off = unsupported-school message.',
  },
  cross_school_matching_enabled: {
    label: 'Cross-school matching (global)',
    sublabel: 'Match students across schools. Leave OFF unless running an explicit cross-school pilot.',
  },
  ai_prompts_enabled: {
    label: 'AI support prompts',
    sublabel: 'Serve real AI suggestions (needs AI_API_KEY on the Edge Function). Off = static templates.',
  },
};

function obfuscate(email: string) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 3)}…@${domain ?? '?'}`;
}

export default function AdminSystemScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<Record<string, boolean>>({});
  const [notif, setNotif] = useState<NotifStats | null>(null);
  const [abuse, setAbuse] = useState<AbuseStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [cfg, n, a] = await Promise.all([
      supabase.rpc('admin_get_config'),
      supabase.rpc('admin_get_notification_stats'),
      supabase.rpc('admin_get_abuse_stats'),
    ]);
    if (cfg.data) {
      const parsed: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(cfg.data as Record<string, unknown>)) {
        parsed[k] = v === true || v === 'true';
      }
      setConfig(parsed);
    }
    if (n.data) setNotif(n.data as NotifStats);
    if (a.data) setAbuse(a.data as AbuseStats);
    const firstError = cfg.error ?? n.error ?? a.error;
    if (firstError) showAlert('Error', firstError.message);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleConfig(key: string, value: boolean) {
    setConfig((c) => ({ ...c, [key]: value }));
    const { error } = await supabase.rpc('admin_set_config', {
      p_key: key,
      p_value: value,
    });
    if (error) {
      showAlert('Error', error.message);
      setConfig((c) => ({ ...c, [key]: !value }));
    }
  }

  async function sendTest() {
    const { error } = await supabase.rpc('admin_send_test_notification');
    if (error) showAlert('Error', error.message);
    else {
      showAlert(
        'Test queued',
        'A test notification event was enqueued for your account. It delivers on the next send-notification run (requires the Edge Function + an active push token).',
      );
    }
  }

  async function clearCooldown(userId: string) {
    const { error } = await supabase.rpc('admin_set_user_cooldown', {
      p_user_id: userId,
      p_minutes: null,
    });
    if (error) showAlert('Error', error.message);
    else load();
  }

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-penn-border">
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text className="text-penn-accent text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-penn-text font-bold text-base">System</Text>
        <TouchableOpacity onPress={load} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text className="text-penn-muted text-sm">Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#7c6af7" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* Config switches */}
          <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">Configuration</Text>
          <View className="bg-penn-surface rounded-2xl px-4 mb-5">
            {Object.entries(CONFIG_LABELS).map(([key, { label, sublabel }]) => (
              <View key={key} className="flex-row items-center justify-between py-3.5 border-b border-penn-border last:border-0">
                <View className="flex-1 pr-3">
                  <Text className="text-penn-text text-[14px] font-medium">{label}</Text>
                  <Text className="text-penn-muted text-[11px] mt-0.5 leading-4">{sublabel}</Text>
                </View>
                <Switch
                  value={config[key] ?? false}
                  onValueChange={(v) => toggleConfig(key, v)}
                  trackColor={{ false: '#2a2837', true: '#7c6af7' }}
                  thumbColor="#f2f1f7"
                />
              </View>
            ))}
          </View>

          {/* Notification stats */}
          <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">Push notifications</Text>
          <View className="bg-penn-surface rounded-2xl p-4 mb-2">
            <Text className="text-penn-text text-[14px] mb-2">
              Active tokens: <Text className="font-bold">{notif?.active_tokens ?? 0}</Text>
            </Text>
            {Object.entries(notif?.by_status ?? {}).map(([status, count]) => (
              <View key={status} className="flex-row justify-between py-1">
                <Text className="text-penn-muted text-[13px]">{status}</Text>
                <Text className="text-penn-muted text-[13px]">{count}</Text>
              </View>
            ))}
            {notif?.recent_failures?.length ? (
              <Text className="text-red-400 text-[12px] mt-2">
                {notif.recent_failures.length} recent delivery failure(s) — check Edge Function logs.
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            className="bg-penn-card border border-penn-border rounded-xl py-3 items-center mb-5"
            onPress={sendTest}
          >
            <Text className="text-penn-text text-[14px] font-medium">Send test notification to myself</Text>
          </TouchableOpacity>

          {/* Abuse stats */}
          <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">Safety & rate limits (7 days)</Text>
          <View className="bg-penn-surface rounded-2xl p-4 mb-3">
            {Object.keys(abuse?.by_kind_7d ?? {}).length === 0 ? (
              <Text className="text-penn-muted text-[13px]">No rate-limit or abuse events.</Text>
            ) : (
              Object.entries(abuse?.by_kind_7d ?? {}).map(([kind, count]) => (
                <View key={kind} className="flex-row justify-between py-1">
                  <Text className="text-penn-text text-[13px] font-mono">{kind}</Text>
                  <Text className="text-penn-muted text-[13px]">{count}</Text>
                </View>
              ))
            )}
          </View>

          {abuse?.top_offenders_7d?.length ? (
            <View className="bg-penn-surface rounded-2xl p-4 mb-3">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">Repeated abuse attempts</Text>
              {abuse.top_offenders_7d.map((o) => (
                <View key={o.user_id} className="flex-row justify-between py-1">
                  <Text className="text-penn-text text-[13px]">{obfuscate(o.email)}</Text>
                  <Text className="text-penn-muted text-[13px]">{o.events} events</Text>
                </View>
              ))}
              <Text className="text-penn-muted text-[11px] mt-2">
                Ban or force cooldowns from the Users tab on the dashboard.
              </Text>
            </View>
          ) : null}

          {abuse?.active_cooldowns?.length ? (
            <View className="bg-penn-surface rounded-2xl p-4 mb-3">
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-2">Active cooldowns</Text>
              {abuse.active_cooldowns.map((c) => (
                <View key={c.id} className="flex-row items-center justify-between py-1.5">
                  <View className="flex-1">
                    <Text className="text-penn-text text-[13px]">{obfuscate(c.email)}</Text>
                    <Text className="text-penn-muted text-[11px]">
                      until {new Date(c.cooldown_until).toLocaleTimeString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    className="bg-green-900/40 border border-green-800 rounded-lg px-3 py-1.5"
                    onPress={() => clearCooldown(c.id)}
                  >
                    <Text className="text-green-400 text-xs font-semibold">Clear</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          <View className="h-8" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
