/**
 * "Help me respond" — AI-assisted support prompt picker.
 * Suggestions are inserted into the input for editing; NEVER auto-sent.
 */
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  SUPPORT_PROMPT_MODES,
  AI_DISCLAIMER,
  getSupportSuggestions,
} from '@/lib/ai/supportPrompts';
import { track } from '@/lib/analytics';

interface AiSuggestModalProps {
  visible: boolean;
  /** Optional short context, e.g. the partner's latest message */
  context: string | null;
  onClose: () => void;
  /** Insert the chosen suggestion into the message input (editable) */
  onInsert: (text: string) => void;
  /** Crisis language detected — open the safety resources modal */
  onCrisis: () => void;
}

export function AiSuggestModal({ visible, context, onClose, onInsert, onCrisis }: AiSuggestModalProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [fallback, setFallback] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleMode(mode: string) {
    setLoading(true);
    setNotice(null);
    setSuggestions([]);

    const result = await getSupportSuggestions(mode, context);
    setLoading(false);

    if (result.crisis) {
      reset();
      onClose();
      onCrisis();
      return;
    }
    if (result.rateLimited) {
      setNotice("You've used all your AI suggestions for today. Try again tomorrow.");
      return;
    }
    setSuggestions(result.suggestions);
    setFallback(result.fallback);
  }

  function reset() {
    setSuggestions([]);
    setFallback(false);
    setNotice(null);
    setLoading(false);
  }

  function close() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <Pressable className="flex-1 bg-black/70 justify-end" onPress={close}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="bg-penn-surface rounded-t-3xl px-6 pt-6 pb-10" style={{ maxHeight: 560 }}>
            <View className="w-10 h-1 bg-penn-border rounded-full self-center mb-5" />

            <Text className="text-penn-text text-xl font-semibold mb-1">
              Help me respond
            </Text>
            <Text className="text-penn-muted text-[12px] leading-4 mb-4">
              {AI_DISCLAIMER}
            </Text>

            {notice ? (
              <View className="bg-penn-card border border-penn-border rounded-xl px-4 py-3 mb-4">
                <Text className="text-penn-muted text-[13px]">{notice}</Text>
              </View>
            ) : null}

            {loading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#7c6af7" />
                <Text className="text-penn-muted text-[13px] mt-3">Writing suggestions…</Text>
              </View>
            ) : suggestions.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
                {fallback ? (
                  <Text className="text-penn-muted text-[11px] uppercase tracking-wider mb-2">
                    Suggested starting points
                  </Text>
                ) : null}
                <View className="gap-y-2 mb-4">
                  {suggestions.map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      className="bg-penn-card border border-penn-border rounded-2xl px-4 py-3.5"
                      onPress={() => {
                        track('ai_suggestion_inserted');
                        onInsert(s);
                        close();
                      }}
                      activeOpacity={0.75}
                    >
                      <Text className="text-penn-text text-[14px] leading-5">{s}</Text>
                      <Text className="text-penn-muted text-[11px] mt-1.5">
                        Tap to insert — edit before sending
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity className="items-center py-2 mb-2" onPress={reset}>
                  <Text className="text-penn-accent text-[13px]">← Different tone</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                <View className="gap-y-2">
                  {SUPPORT_PROMPT_MODES.map((m) => (
                    <TouchableOpacity
                      key={m.key}
                      className="bg-penn-card border border-penn-border rounded-xl px-4 py-3"
                      onPress={() => handleMode(m.key)}
                      activeOpacity={0.75}
                    >
                      <Text className="text-penn-text text-[14px]">{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            <TouchableOpacity className="bg-penn-border rounded-xl py-3 items-center mt-4" onPress={close}>
              <Text className="text-penn-text font-medium">Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
