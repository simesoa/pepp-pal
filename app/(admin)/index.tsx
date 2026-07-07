/**
 * Admin Dashboard – Stats + Reports + Users tabs
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { showAlert, showConfirm } from '@/lib/alerts';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportStatus = 'open' | 'reviewed' | 'resolved' | 'dismissed';
type Tab = 'stats' | 'reports' | 'users';
type ReportFilter = 'open' | 'all';

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

interface PilotStats {
  total_users: number;
  banned_users: number;
  waiting_users: number;
  matched_users: number;
  active_pairs: number;
  inactive_pairs: number;
  open_reports: number;
  total_messages: number;
  waiting_by_year: Record<string, number> | null;
  matched_by_year: Record<string, number> | null;
  event_counts: Record<string, number> | null;
}

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
  const [local, domain] = email.split('@');
  return `${local.slice(0, 3)}…@${domain ?? '?'}`;
}

// ── Stats components ──────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <View className={`flex-1 rounded-2xl p-4 ${accent ? 'bg-penn-accent/20 border border-penn-accent/30' : 'bg-penn-surface'}`}>
      <Text className={`text-2xl font-bold mb-1 ${accent ? 'text-penn-accent' : 'text-penn-text'}`}>
        {value}
      </Text>
      <Text className="text-penn-muted text-xs leading-4">{label}</Text>
    </View>
  );
}

function YearBreakdown({ title, data }: { title: string; data: Record<string, number> | null }) {
  if (!data || Object.keys(data).length === 0) return null;
  const entries = Object.entries(data).sort(([a], [b]) => Number(a) - Number(b));

  return (
    <View className="bg-penn-surface rounded-2xl p-4 mb-3">
      <Text className="text-penn-muted text-xs uppercase tracking-wider mb-3">{title}</Text>
      <View className="gap-y-2">
        {entries.map(([year, count]) => (
          <View key={year} className="flex-row items-center justify-between">
            <Text className="text-penn-text text-[14px]">Class of {year}</Text>
            <View className="flex-row items-center gap-x-2">
              {/* Mini bar */}
              <View className="h-1.5 rounded-full bg-penn-border overflow-hidden" style={{ width: 80 }}>
                <View
                  className="h-full rounded-full bg-penn-accent"
                  style={{ width: `${Math.min(100, (count / Math.max(...Object.values(data))) * 100)}%` }}
                />
              </View>
              <Text className="text-penn-muted text-[13px] w-6 text-right">{count}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function EventCounts({ data }: { data: Record<string, number> | null }) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <View className="bg-penn-surface rounded-2xl p-4 mb-3 items-center">
        <Text className="text-penn-muted text-[13px]">No events logged yet</Text>
      </View>
    );
  }
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  return (
    <View className="bg-penn-surface rounded-2xl p-4 mb-3">
      <Text className="text-penn-muted text-xs uppercase tracking-wider mb-3">Events (last 30 days)</Text>
      <View className="gap-y-2">
        {entries.map(([event, count]) => (
          <View key={event} className="flex-row items-center justify-between">
            <Text className="text-penn-text text-[13px] font-mono flex-1">{event}</Text>
            <Text className="text-penn-muted text-[13px]">{count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatsTab({ stats, loading, onRefresh, refreshing }: {
  stats: PilotStats | null;
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  if (loading) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator color="#7c6af7" /></View>;
  }
  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-penn-muted text-[15px] text-center">
          Could not load stats.{'\n'}Pull to refresh.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c6af7" />}
    >
      {/* Top-line numbers */}
      <Text className="text-penn-muted text-xs uppercase tracking-wider mb-3">Overview</Text>
      <View className="flex-row gap-x-3 mb-3">
        <StatCard label="Total users" value={stats.total_users} accent />
        <StatCard label="Active pairs" value={stats.active_pairs} />
      </View>
      <View className="flex-row gap-x-3 mb-5">
        <StatCard label="Waiting" value={stats.waiting_users} />
        <StatCard label="Matched" value={stats.matched_users} />
        <StatCard label="Open reports" value={stats.open_reports} />
      </View>

      {/* Secondary stats */}
      <View className="bg-penn-surface rounded-2xl p-4 mb-5">
        <Text className="text-penn-muted text-xs uppercase tracking-wider mb-3">All-time</Text>
        {(
          [
            ['Total messages', stats.total_messages],
            ['Inactive pairs', stats.inactive_pairs],
            ['Banned users',   stats.banned_users],
          ] as [string, number][]
        ).map(([label, value]) => (
          <View key={label} className="flex-row justify-between py-2 border-b border-penn-border last:border-0">
            <Text className="text-penn-text text-[14px]">{label}</Text>
            <Text className="text-penn-muted text-[14px]">{value}</Text>
          </View>
        ))}
      </View>

      {/* Year breakdowns */}
      <YearBreakdown title="Waiting by graduation year" data={stats.waiting_by_year} />
      <YearBreakdown title="Matched by graduation year" data={stats.matched_by_year} />

      {/* Event funnel */}
      <EventCounts data={stats.event_counts} />

      <View className="h-8" />
    </ScrollView>
  );
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
      <Text className="text-penn-text text-[14px] mb-1" numberOfLines={2}>{item.reason}</Text>
      <Text className="text-penn-muted text-xs">From: {obfuscateEmail(item.reporter_email)}</Text>
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
        <Text className="text-penn-muted text-xs">Class of {item.grad_year}</Text>
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
  const [tab, setTab] = useState<Tab>('stats');
  const [reportFilter, setReportFilter] = useState<ReportFilter>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<PilotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_pilot_stats');
    if (error) { setFetchError(error.message); return; }
    if (data) setStats(data as PilotStats);
  }, []);

  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_reports', {
      p_status: reportFilter === 'open' ? 'open' : null,
    });
    if (error) { setFetchError(error.message); return; }
    if (data) setReports(data as AdminReport[]);
  }, [reportFilter]);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_users', {
      p_limit: 100, p_offset: 0,
    });
    if (error) { setFetchError(error.message); return; }
    if (data) setUsers(data as AdminUser[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    await Promise.all([fetchStats(), fetchReports(), fetchUsers()]);
    setLoading(false);
  }, [fetchStats, fetchReports, fetchUsers]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab === 'reports') fetchReports();
  }, [reportFilter, tab, fetchReports]);

  async function onRefresh() {
    setRefreshing(true);
    setFetchError(null);
    if (tab === 'stats')   await fetchStats();
    if (tab === 'reports') await fetchReports();
    if (tab === 'users')   await fetchUsers();
    setRefreshing(false);
  }

  function handleBanToggle(user: AdminUser) {
    const action = user.is_banned ? 'unban' : 'ban';
    showConfirm(
      `${action.charAt(0).toUpperCase() + action.slice(1)} user`,
      `Are you sure you want to ${action} this user?`,
      {
        confirmLabel: action.charAt(0).toUpperCase() + action.slice(1),
        destructive: !user.is_banned,
        onConfirm: async () => {
          const { error } = await supabase.rpc('admin_set_ban', {
            p_user_id: user.id,
            p_banned: !user.is_banned,
          });
          if (error) {
            showAlert('Error', error.message);
          } else {
            await Promise.all([fetchUsers(), fetchStats()]);
            showAlert('Done', `User ${action}ned successfully.`);
          }
        },
      },
    );
  }

  const openCounts   = reports.filter((r) => r.status === 'open').length;
  const TABS: { key: Tab; label: string }[] = [
    { key: 'stats',   label: 'Stats' },
    { key: 'reports', label: `Reports${openCounts > 0 ? ` (${openCounts})` : ''}` },
    { key: 'users',   label: `Users (${users.length})` },
  ];

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
        <TouchableOpacity
          onPress={load}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text className="text-penn-muted text-sm">Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {fetchError && (
        <View className="mx-4 mt-3 bg-red-900/40 border border-red-800 rounded-xl px-4 py-2.5 flex-row items-center justify-between">
          <Text className="text-red-300 text-[13px] flex-1">{fetchError}</Text>
          <TouchableOpacity onPress={load} className="ml-3">
            <Text className="text-red-300 text-xs font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Feature pages */}
      <View className="flex-row px-4 pt-3 gap-x-2">
        {([
          ['Schools', '/(admin)/schools'],
          ['Cohorts', '/(admin)/cohorts'],
          ['System', '/(admin)/system'],
        ] as const).map(([label, path]) => (
          <TouchableOpacity
            key={path}
            onPress={() => router.push(path)}
            className="flex-1 rounded-xl py-2 items-center bg-penn-card border border-penn-border"
          >
            <Text className="text-xs font-semibold text-penn-muted">{label} →</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 pt-3 pb-2 gap-x-2">
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            className={`flex-1 rounded-xl py-2 items-center border ${
              tab === key ? 'bg-penn-accent border-penn-accent' : 'bg-penn-surface border-penn-border'
            }`}
          >
            <Text className={`text-xs font-semibold ${tab === key ? 'text-white' : 'text-penn-muted'}`}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Report filter pills */}
      {tab === 'reports' && (
        <View className="flex-row px-5 pb-2 gap-x-2">
          {(['open', 'all'] as ReportFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setReportFilter(f)}
              className={`rounded-full px-3 py-1 ${reportFilter === f ? 'bg-penn-border' : ''}`}
            >
              <Text className={`text-xs ${reportFilter === f ? 'text-penn-text' : 'text-penn-muted'}`}>
                {f === 'open' ? 'Open only' : 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {tab === 'stats' ? (
        <StatsTab
          stats={stats}
          loading={loading}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      ) : tab === 'reports' ? (
        loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#7c6af7" /></View>
        ) : (
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
                <Text className="text-penn-muted text-[15px]">
                  {reportFilter === 'open' ? 'No open reports' : 'No reports yet'}
                </Text>
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
        )
      ) : (
        loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color="#7c6af7" /></View>
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
        )
      )}
    </SafeAreaView>
  );
}
