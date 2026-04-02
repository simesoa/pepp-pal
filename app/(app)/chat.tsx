import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/hooks/useChat';
import { usePairInfo } from '@/hooks/usePairInfo';
import { MessageBubble } from '@/components/MessageBubble';
import { SafetyModal } from '@/components/SafetyModal';
import { IdentityWarningBanner } from '@/components/IdentityWarningBanner';
import { ChatMenuModal } from '@/components/ChatMenuModal';
import { StarterPrompts } from '@/components/StarterPrompts';
import { filterMessage } from '@/lib/identityFilter';
import { SILENCE_NUDGE_MINUTES } from '@/lib/starterPrompts';
import { supabase } from '@/lib/supabase';
import { Message } from '@/types';

const INACTIVE_DAYS = 14;

export default function ChatScreen() {
  const { pairId } = useLocalSearchParams<{ pairId: string }>();
  const router = useRouter();
  const { userId } = useAuth();
  const { messages, isLoading, partnerTyping, sendMessage, sendTyping } =
    useChat(pairId ?? null, userId);
  const { pair } = usePairInfo(pairId ?? null);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [safetyVisible, setSafetyVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningText, setWarningText] = useState('');
  const [showSilenceNudge, setShowSilenceNudge] = useState(false);

  const flatListRef = useRef<FlatList<Message>>(null);
  const warningTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (warningTimeout.current) clearTimeout(warningTimeout.current);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
    };
  }, []);

  // Silence nudge: show after SILENCE_NUDGE_MINUTES of no new messages
  useEffect(() => {
    if (isLoading || messages.length === 0) return;

    setShowSilenceNudge(false);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);

    silenceTimer.current = setTimeout(
      () => setShowSilenceNudge(true),
      SILENCE_NUDGE_MINUTES * 60 * 1000,
    );
  }, [messages, isLoading]);

  // Determine if the pair is inactive (no messages for 14 days)
  const isInactive = (() => {
    if (!pair) return false;
    const ref = pair.last_message_at ?? pair.created_at;
    const days = (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24);
    return days >= INACTIVE_DAYS;
  })();

  const showWarning = useCallback((msg: string) => {
    setWarningText(msg);
    setWarningVisible(true);
    if (warningTimeout.current) clearTimeout(warningTimeout.current);
    warningTimeout.current = setTimeout(() => setWarningVisible(false), 4000);
  }, []);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    const filterResult = filterMessage(content);
    if (filterResult.blocked) {
      showWarning(filterResult.reason ?? 'Identity sharing is not allowed until graduation.');
      return;
    }

    setSending(true);
    setInput('');
    setShowSilenceNudge(false);

    const { error } = await sendMessage(content);
    if (error) {
      Alert.alert('Message failed', error);
      setInput(content);
    }

    setSending(false);
  }, [input, sending, sendMessage, showWarning]);

  const handleInputChange = useCallback((text: string) => {
    setInput(text);
    if (typingTimeout.current) return;
    sendTyping();
    typingTimeout.current = setTimeout(() => { typingTimeout.current = null; }, 2000);
  }, [sendTyping]);

  /** When user taps a starter prompt, pre-fill the input */
  const handlePromptSelect = useCallback((text: string) => {
    setInput(text);
    setShowSilenceNudge(false);
  }, []);

  function handlePairDeactivated() {
    router.replace('/(app)/status');
  }

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble message={item} isSelf={item.sender_id === userId} />
    ),
    [userId],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-penn-border">
        <View>
          <Text className="text-penn-text text-base font-semibold">Your Penn Pal</Text>
          <Text className="text-penn-muted text-xs">Anonymous until graduation</Text>
        </View>
        <View className="flex-row items-center gap-x-5">
          <TouchableOpacity
            onPress={() => setSafetyVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-penn-muted text-sm">Support</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(app)/settings')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-penn-muted text-sm">Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="w-8 h-8 items-center justify-center"
          >
            <Text className="text-penn-muted text-xl leading-none">⋯</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Inactive match banner ───────────────────────────────────────── */}
      {isInactive && (
        <View className="mx-4 mt-3 bg-penn-surface border border-penn-border rounded-2xl px-4 py-3 flex-row items-center justify-between">
          <Text className="text-penn-muted text-[13px] flex-1 leading-5">
            No messages in {INACTIVE_DAYS} days. Looking for a fresh start?
          </Text>
          <TouchableOpacity
            className="ml-3 bg-penn-accent rounded-xl px-3 py-2"
            onPress={() => setMenuVisible(true)}
          >
            <Text className="text-white text-[12px] font-semibold">Rematch</Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* ── Message list / empty state ───────────────────────────────── */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#7c6af7" />
          </View>
        ) : messages.length === 0 ? (
          <StarterPrompts
            seed={pairId ?? 'default'}
            onSelect={handlePromptSelect}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            className="flex-1 px-4"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        {partnerTyping && (
          <View className="px-5 pb-2">
            <Text className="text-penn-muted text-[13px] italic">
              Penn Pal is typing…
            </Text>
          </View>
        )}

        {/* ── Silence nudge ─────────────────────────────────────────────── */}
        {showSilenceNudge && messages.length > 0 && (
          <StarterPrompts
            seed={pairId ?? 'default'}
            onSelect={handlePromptSelect}
            nudge
          />
        )}

        <IdentityWarningBanner visible={warningVisible} message={warningText} />

        {/* ── Input bar ────────────────────────────────────────────────── */}
        <View className="flex-row items-end px-4 py-3 border-t border-penn-border gap-x-3">
          <TextInput
            className="flex-1 bg-penn-surface rounded-2xl px-4 py-3 text-penn-text text-[15px] border border-penn-border"
            style={{ maxHeight: 120 }}
            placeholder="Message your Penn Pal…"
            placeholderTextColor="#6b6880"
            value={input}
            onChangeText={handleInputChange}
            multiline
            returnKeyType="default"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || sending}
            className={`w-11 h-11 rounded-2xl items-center justify-center ${
              input.trim() && !sending ? 'bg-penn-accent' : 'bg-penn-border'
            }`}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white text-base font-bold">↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <SafetyModal visible={safetyVisible} onClose={() => setSafetyVisible(false)} />

      {pairId && (
        <ChatMenuModal
          visible={menuVisible}
          pairId={pairId}
          onClose={() => setMenuVisible(false)}
          onPairDeactivated={handlePairDeactivated}
        />
      )}
    </SafeAreaView>
  );
}
