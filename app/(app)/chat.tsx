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
import { MessageBubble } from '@/components/MessageBubble';
import { SafetyModal } from '@/components/SafetyModal';
import { IdentityWarningBanner } from '@/components/IdentityWarningBanner';
import { filterMessage } from '@/lib/identityFilter';
import { supabase } from '@/lib/supabase';
import { Message } from '@/types';

export default function ChatScreen() {
  const { pairId } = useLocalSearchParams<{ pairId: string }>();
  const router = useRouter();
  const { userId } = useAuth();
  const { messages, isLoading, partnerTyping, sendMessage, sendTyping } =
    useChat(pairId ?? null, userId);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [safetyVisible, setSafetyVisible] = useState(false);
  const [warningVisible, setWarningVisible] = useState(false);
  const [warningText, setWarningText] = useState('');

  const flatListRef = useRef<FlatList<Message>>(null);
  const warningTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (warningTimeout.current) clearTimeout(warningTimeout.current);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
  }, []);

  const showWarning = useCallback((msg: string) => {
    setWarningText(msg);
    setWarningVisible(true);
    if (warningTimeout.current) clearTimeout(warningTimeout.current);
    warningTimeout.current = setTimeout(() => setWarningVisible(false), 4000);
  }, []);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    // Identity filter check
    const filterResult = filterMessage(content);
    if (filterResult.blocked) {
      showWarning(filterResult.reason ?? 'Identity sharing is not allowed until graduation.');
      return;
    }

    setSending(true);
    setInput('');

    const { error } = await sendMessage(content);
    if (error) {
      Alert.alert('Message failed', error);
      setInput(content); // restore input
    }

    setSending(false);
  }, [input, sending, sendMessage, showWarning]);

  const handleInputChange = useCallback((text: string) => {
    setInput(text);

    // Broadcast typing indicator (throttled)
    if (typingTimeout.current) return;
    sendTyping();
    typingTimeout.current = setTimeout(() => {
      typingTimeout.current = null;
    }, 2000);
  }, [sendTyping]);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
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
          <Text className="text-penn-text text-base font-semibold">
            Your Penn Pal
          </Text>
          <Text className="text-penn-muted text-xs">Anonymous until graduation</Text>
        </View>
        <View className="flex-row items-center gap-x-4">
          <TouchableOpacity
            onPress={() => setSafetyVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-penn-muted text-sm">Need support?</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSignOut}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-penn-muted text-sm">Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* ── Message list ─────────────────────────────────────────────── */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#7c6af7" />
          </View>
        ) : messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10">
            <Text className="text-penn-muted text-5xl mb-4">✉️</Text>
            <Text className="text-penn-text text-lg font-semibold text-center mb-2">
              Say hello
            </Text>
            <Text className="text-penn-muted text-[15px] text-center leading-6">
              Your Penn Pal is here. Break the ice — this is a safe space.
            </Text>
          </View>
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

        {/* ── Typing indicator ─────────────────────────────────────────── */}
        {partnerTyping && (
          <View className="px-5 pb-2">
            <Text className="text-penn-muted text-[13px] italic">
              Penn Pal is typing…
            </Text>
          </View>
        )}

        {/* ── Identity warning banner ──────────────────────────────────── */}
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

      <SafetyModal
        visible={safetyVisible}
        onClose={() => setSafetyVisible(false)}
      />
    </SafeAreaView>
  );
}
