/**
 * Admin Dashboard – Reports + Users tabs
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

type ReportStatus = 'open' | 'reviewed' | 'resolved' | 'dismissed';

interface AdminReport {
  id: string;
  reporter_id: string;
  pair_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
  reporter_email: string;
  pair_user1_id: string;
  pair_user2_id: string;
}

interface AdminUser {
  id: string;
  email: string;
  grad_year: number;
  status: 'waiting' | 'matched';
  is_banned: boolean;
  is_admin: boolean;
  pair_id: string | null;
  created_at: string;
}

type Tab = 'reports' | 'users';
type ReportFilter = 'open' | 'all';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ReportStatus, string> = {
  open:      'text-orange-400',
  reviewed:  'text-blue-400',
  resolved:  'text-green-400',
  dismissed: 'text-penn-muted',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
}

function obfuscateEmail(email: string) {
  // Show first 3 chars + domain for admin review
  const [local, domain] = email.split('@');
  return `${local.slice(0, 3)}…@${domain ?? '?'}`;
}

// ── Report row ────────────────────────────────────────────────────────────────

function ReportRow({ item, onPress }: { item: AdminReport; onPress: () => void }) {
  return (
    <TouchableOpacity
      className="bg-penn-surface rounded-2xl p-4 mb-3"
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className={`text-xs font-semibold uppercase tracking-wider ${STATUS_COLORS[item.status]}`}>
          {item.status}
        </Text>
        <Text className="text-penn-muted text-xs">{formatDate(item.created_at)}</Text>
      </View>
      <Text className="text-penn-text text-[14px] mb-1" numberOfLines={2}>
        {item.reason}
      </Text>
      <Text className="text-penn-muted text-xs">
        From: {obfuscateEmail(item.reporter_email)}
      </Text>
    </TouchableOpacity>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({ item, onBanToggle }: { item: AdminUser; onBanToggle: () => void }) {
  return (
    <View className="bg-penn-surface rounded-2xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center gap-x-2">
          {item.is_banned && (
            <View className="bg-red-900/50 rounded px-1.5 py-0.5">
              <Text className="text-red-400 text-[10px] font-semibold">BANNED</Text>
            </View>
          )}
          {item.is_admin && (
            <View className="bg-penn-accent/20 rounded px-1.5 py-0.5">
              <Text className="text-penn-accent text-[10px] font-semibold">ADMIN</Text>
            </View>
          )}
        </View>
        <Text className="text-penn-muted text-xs">
          Class of {item.grad_year}
        </Text>
      </View>
      <Text className="text-penn-text text-[14px] mb-1" numberOfLines={1}>
        {obfuscateEmail(item.email)}
      </Text>
      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-penn-muted text-xs">
          {item.status} · joined {formatDate(item.created_at)}
        </Text>
        {!item.is_admin && (
          <TouchableOpacity
            onPress={onBanToggle}
            className={`rounded-lg px-3 py-1.5 ${item.is_banned ? 'bg-green-900/40 border border-green-800' : 'bg-red-900/40 border border-red-900'}`}
          >
            <Text className={`text-xs font-semibold ${item.is_banned ? 'text-green-400' : 'text-red-400'}`}>
              {item.is_banned ? 'Unban' : 'Ban'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('reports');
  const [reportFilter, setReportFilter] = useState<ReportFilter>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_reports', {
      p_status: reportFilter === 'open' ? 'open' : null,
    });
    if (!error && data) setReports(data as AdminReport[]);
  }, [reportFilter]);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_users', {
      p_limit: 100,
      p_offset: 0,
    });
    if (!error && data) setUsers(data as AdminUser[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchReports(), fetchUsers()]);
    setLoading(false);
  }, [fetchReports, fetchUsers]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await (tab === 'reports' ? fetchReports() : fetchUsers());
    setRefreshing(false);
  }

  // Re-fetch reports when filter changes
  useEffect(() => {
    if (tab === 'reports') fetchReports();
  }, [reportFilter, tab, fetchReports]);

  async function handleBanToggle(user: AdminUser) {
    const action = user.is_banned ? 'unban' : 'ban';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} user`,
      `Are you sure you want to ${action} this user?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: user.is_banned ? 'default' : 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('admin_set_ban', {
              p_user_id: user.id,
              p_banned: !user.is_banned,
            });
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              await fetchUsers();
            }
          },
        },
      ],
    );
  }

  const openCounts = reports.filter((r) => r.status === 'open').length;

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-penn-border">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text className="text-penn-accent text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-penn-text font-bold text-base">Admin</Text>
        <View className="w-12" />
      </View>

      {/* Tabs */}
      <View className="flex-row px-5 pt-4 pb-2 gap-x-3">
        {(['reports', 'users'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            className={`flex-1 rounded-xl py-2.5 items-center border ${
              tab === t
                ? 'bg-penn-accent border-penn-accent'
                : 'bg-penn-surface border-penn-border'
            }`}
          >
            <Text className={`text-sm font-semibold ${tab === t ? 'text-white' : 'text-penn-muted'}`}>
              {t === 'reports'
                ? `Reports${openCounts > 0 ? ` (${openCounts})` : ''}`
                : `Users (${users.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Report filter pills */}
      {tab === 'reports' && (
        <View className="flex-row px-5 pb-3 gap-x-2">
          {(['open', 'all'] as ReportFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setReportFilter(f)}
              className={`rounded-full px-3 py-1 ${
                reportFilter === f ? 'bg-penn-border' : ''
              }`}
            >
              <Text className={`text-xs ${reportFilter === f ? 'text-penn-text' : 'text-penn-muted'}`}>
                {f === 'open' ? 'Open' : 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7c6af7" />
        </View>
      ) : tab === 'reports' ? (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c6af7" />
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-penn-muted text-[15px]">No reports</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ReportRow
              item={item}
              onPress={() =>
                router.push({
                  pathname: '/(admin)/report/[id]',
                  params: {
                    id: item.id,
                    pairId: item.pair_id,
                    reason: item.reason,
                    status: item.status,
                    reporterEmail: item.reporter_email,
                  },
                })
              }
            />
          )}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c6af7" />
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-penn-muted text-[15px]">No users</Text>
            </View>
          }
          renderItem={({ item }) => (
            <UserRow item={item} onBanToggle={() => handleBanToggle(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}
