/**
 * Admin – Report Detail Screen
 * Shows report metadata, recent messages in the pair, and status controls.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alerts';
import { track } from '@/lib/analytics';

type ReportStatus = 'open' | 'reviewed' | 'resolved' | 'dismissed';

interface AdminMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const STATUS_ACTIONS: { label: string; value: ReportStatus; color: string }[] = [
  { label: 'Mark reviewed',  value: 'reviewed',  color: 'bg-blue-900/50 border-blue-800'  },
  { label: 'Mark resolved',  value: 'resolved',  color: 'bg-green-900/50 border-green-800' },
  { label: 'Dismiss',        value: 'dismissed', color: 'bg-penn-surface border-penn-border' },
];

function formatDateFull(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ReportDetailScreen() {
  const router = useRouter();
  const { id, pairId, reason, status: initialStatus, reporterEmail } =
    useLocalSearchParams<{
      id: string;
      pairId: string;
      reason: string;
      status: string;
      reporterEmail: string;
    }>();

  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [currentStatus, setCurrentStatus] = useState<ReportStatus>(
    (initialStatus as ReportStatus) ?? 'open',
  );
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!pairId) return;
    supabase
      .rpc('admin_get_report_messages', { p_pair_id: pairId, p_limit: 50 })
      .then(({ data, error }) => {
        if (!error && data) setMessages(data as AdminMessage[]);
        setLoadingMsgs(false);
      });
  }, [pairId]);

  async function updateStatus(newStatus: ReportStatus) {
    setUpdating(true);
    const { error } = await supabase.rpc('admin_update_report_status', {
      p_report_id: id,
      p_status: newStatus,
    });
    setUpdating(false);

    if (error) {
      showAlert('Error', error.message);
    } else {
      setCurrentStatus(newStatus);
      track('admin_report_updated', { status: newStatus });
    }
  }

  const statusColor =
    currentStatus === 'open'      ? 'text-orange-400'  :
    currentStatus === 'reviewed'  ? 'text-blue-400'    :
    currentStatus === 'resolved'  ? 'text-green-400'   :
    'text-penn-muted';

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
        <Text className="text-penn-text font-bold text-base">Report</Text>
        <View className="w-12" />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        {/* Report metadata */}
        <View className="bg-penn-surface rounded-2xl p-4 mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className={`text-xs font-bold uppercase tracking-wider ${statusColor}`}>
              {currentStatus}
            </Text>
            {updating && <ActivityIndicator size="small" color="#7c6af7" />}
          </View>

          <View className="gap-y-2">
            <View>
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-0.5">Reason</Text>
              <Text className="text-penn-text text-[14px] leading-5">{reason}</Text>
            </View>
            <View>
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-0.5">Reporter</Text>
              <Text className="text-penn-text text-[14px]">{reporterEmail}</Text>
            </View>
            <View>
              <Text className="text-penn-muted text-xs uppercase tracking-wider mb-0.5">Pair ID</Text>
              <Text className="text-penn-muted text-[12px] font-mono">{pairId}</Text>
            </View>
          </View>
        </View>

        {/* Status actions */}
        {currentStatus === 'open' || currentStatus === 'reviewed' ? (
          <View className="mb-4 gap-y-2">
            <Text className="text-penn-muted text-xs uppercase tracking-wider mb-1">
              Update status
            </Text>
            {STATUS_ACTIONS.filter((a) => a.value !== currentStatus).map((action) => (
              <TouchableOpacity
                key={action.value}
                className={`rounded-xl py-3 items-center border ${action.color}`}
                onPress={() => updateStatus(action.value)}
                disabled={updating}
              >
                <Text className="text-penn-text text-[14px] font-medium">{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Messages */}
        <Text className="text-penn-muted text-xs uppercase tracking-wider mb-3">
          Recent messages (newest first)
        </Text>

        {loadingMsgs ? (
          <ActivityIndicator color="#7c6af7" />
        ) : messages.length === 0 ? (
          <Text className="text-penn-muted text-[14px]">No messages found for this pair.</Text>
        ) : (
          <View className="gap-y-3">
            {messages.map((msg) => (
              <View key={msg.id} className="bg-penn-surface rounded-xl p-3">
                <Text className="text-penn-muted text-[11px] mb-1 font-mono">
                  {msg.sender_id.slice(0, 8)}… · {formatDateFull(msg.created_at)}
                </Text>
                <Text className="text-penn-text text-[14px] leading-5">{msg.content}</Text>
              </View>
            ))}
          </View>
        )}

        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}
