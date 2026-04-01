import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '@/lib/supabase';

type MenuView = 'menu' | 'report';

const REPORT_REASONS = [
  'Harassment or bullying',
  'Inappropriate or sexual content',
  'Threats or violent language',
  'Spam',
  'Other',
];

interface ChatMenuModalProps {
  visible: boolean;
  pairId: string;
  onClose: () => void;
  onPairDeactivated: () => void; // called after block or rematch so parent can navigate away
}

export function ChatMenuModal({
  visible,
  pairId,
  onClose,
  onPairDeactivated,
}: ChatMenuModalProps) {
  const [view, setView] = useState<MenuView>('menu');
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [loading, setLoading] = useState(false);

  function resetAndClose() {
    setView('menu');
    setSelectedReason('');
    setCustomReason('');
    onClose();
  }

  async function handleReport() {
    const reason = selectedReason === 'Other' ? customReason.trim() : selectedReason;
    if (!reason) return;

    setLoading(true);
    const { error } = await supabase.rpc('report_conversation', {
      p_pair_id: pairId,
      p_reason: reason,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Report failed', error.message);
      return;
    }

    resetAndClose();
    Alert.alert(
      'Report submitted',
      'Thank you. Our team will review this conversation.',
      [{ text: 'OK' }],
    );
  }

  async function handleBlock() {
    Alert.alert(
      'Block and rematch',
      'This will end your current conversation. You'll both be re-entered into the matching pool.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block and rematch',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const { error } = await supabase.rpc('deactivate_pair_and_rematch', {
              p_pair_id: pairId,
              p_both: true,
            });
            setLoading(false);

            if (error) {
              Alert.alert('Error', error.message);
              return;
            }

            resetAndClose();
            onPairDeactivated();
          },
        },
      ],
    );
  }

  async function handleRematch() {
    Alert.alert(
      'Request rematch',
      'You'll be re-entered into the matching pool. Your current Penn Pal will stay matched until they also request a rematch.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request rematch',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const { error } = await supabase.rpc('deactivate_pair_and_rematch', {
              p_pair_id: pairId,
              p_both: false,
            });
            setLoading(false);

            if (error) {
              Alert.alert('Error', error.message);
              return;
            }

            resetAndClose();
            onPairDeactivated();
          },
        },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={resetAndClose}
    >
      <Pressable className="flex-1 bg-black/70 justify-end" onPress={resetAndClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="bg-penn-surface rounded-t-3xl px-6 pt-6 pb-10">
            {/* Drag handle */}
            <View className="w-10 h-1 bg-penn-border rounded-full self-center mb-6" />

            {view === 'menu' ? (
              <>
                <Text className="text-penn-text text-xl font-semibold mb-6">
                  Conversation options
                </Text>

                {/* Report */}
                <TouchableOpacity
                  className="flex-row items-center py-4 border-b border-penn-border"
                  onPress={() => setView('report')}
                  disabled={loading}
                >
                  <View className="w-9 h-9 rounded-xl bg-orange-900/40 items-center justify-center mr-4">
                    <Text className="text-base">⚑</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-penn-text text-[15px] font-medium">
                      Report conversation
                    </Text>
                    <Text className="text-penn-muted text-xs mt-0.5">
                      Flag inappropriate content for review
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Block */}
                <TouchableOpacity
                  className="flex-row items-center py-4 border-b border-penn-border"
                  onPress={handleBlock}
                  disabled={loading}
                >
                  <View className="w-9 h-9 rounded-xl bg-red-900/40 items-center justify-center mr-4">
                    <Text className="text-base">⊘</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-red-400 text-[15px] font-medium">
                      Block and rematch
                    </Text>
                    <Text className="text-penn-muted text-xs mt-0.5">
                      End this conversation for both of you
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Rematch */}
                <TouchableOpacity
                  className="flex-row items-center py-4"
                  onPress={handleRematch}
                  disabled={loading}
                >
                  <View className="w-9 h-9 rounded-xl bg-penn-accent-muted/40 items-center justify-center mr-4">
                    <Text className="text-base">↺</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-penn-text text-[15px] font-medium">
                      Request rematch
                    </Text>
                    <Text className="text-penn-muted text-xs mt-0.5">
                      Leave the conversation and find a new Penn Pal
                    </Text>
                  </View>
                </TouchableOpacity>

                {loading && (
                  <ActivityIndicator className="mt-4" color="#7c6af7" />
                )}

                <TouchableOpacity
                  className="bg-penn-border rounded-xl py-3 items-center mt-5"
                  onPress={resetAndClose}
                >
                  <Text className="text-penn-text font-medium">Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* ── Report flow ─────────────────────────────────────────── */
              <>
                <TouchableOpacity
                  className="mb-4"
                  onPress={() => setView('menu')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text className="text-penn-accent text-base">← Back</Text>
                </TouchableOpacity>

                <Text className="text-penn-text text-xl font-semibold mb-2">
                  Report conversation
                </Text>
                <Text className="text-penn-muted text-[13px] mb-5 leading-5">
                  Select a reason. Reports are anonymous and reviewed by our team.
                </Text>

                <View className="gap-y-2 mb-4">
                  {REPORT_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      onPress={() => setSelectedReason(reason)}
                      className={`rounded-xl px-4 py-3 border ${
                        selectedReason === reason
                          ? 'border-penn-accent bg-penn-accent/10'
                          : 'border-penn-border bg-penn-card'
                      }`}
                    >
                      <Text
                        className={`text-[14px] ${
                          selectedReason === reason ? 'text-penn-accent' : 'text-penn-text'
                        }`}
                      >
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedReason === 'Other' && (
                  <TextInput
                    className="bg-penn-card border border-penn-border rounded-xl px-4 py-3 text-penn-text text-[14px] mb-4"
                    placeholder="Describe the issue…"
                    placeholderTextColor="#6b6880"
                    value={customReason}
                    onChangeText={setCustomReason}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    maxLength={500}
                    style={{ minHeight: 72 }}
                  />
                )}

                <TouchableOpacity
                  className={`rounded-2xl py-4 items-center ${
                    selectedReason && !loading ? 'bg-penn-accent' : 'bg-penn-border'
                  }`}
                  onPress={handleReport}
                  disabled={!selectedReason || loading || (selectedReason === 'Other' && !customReason.trim())}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold text-base">
                      Submit report
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
