import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { pickPrompts, StarterPrompt } from '@/lib/starterPrompts';

interface StarterPromptsProps {
  /** Stable seed so prompts don't reshuffle (use pairId or userId) */
  seed: string;
  /** Called when the user taps a prompt – passes the prompt text */
  onSelect: (text: string) => void;
  /** If true, renders a compact inline "nudge" variant instead of the full card */
  nudge?: boolean;
}

export function StarterPrompts({ seed, onSelect, nudge = false }: StarterPromptsProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      delay: nudge ? 200 : 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, nudge]);

  const prompts: StarterPrompt[] = pickPrompts(nudge ? 3 : 5, seed);

  if (nudge) {
    // Compact single-line nudge shown after silence
    return (
      <Animated.View style={{ opacity: fadeAnim }} className="mx-4 mb-3">
        <View className="bg-penn-surface border border-penn-border rounded-2xl px-4 py-3">
          <Text className="text-penn-muted text-[12px] uppercase tracking-wider mb-2">
            A thought to share
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-x-2">
              {prompts.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => onSelect(p.text)}
                  className="bg-penn-card border border-penn-border rounded-xl px-3 py-2 max-w-[220px]"
                  activeOpacity={0.75}
                >
                  <Text className="text-penn-muted text-[13px] leading-5">{p.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    );
  }

  // Full empty-state card
  return (
    <Animated.View style={{ opacity: fadeAnim }} className="flex-1 px-5 justify-center">
      <View className="items-center mb-8">
        <Text className="text-penn-muted text-5xl mb-4">✉️</Text>
        <Text className="text-penn-text text-lg font-semibold text-center mb-2">
          Say hello
        </Text>
        <Text className="text-penn-muted text-[15px] text-center leading-6 max-w-xs">
          Your Penn Pal is here. This is a safe, private space.
        </Text>
      </View>

      <Text className="text-penn-muted text-xs uppercase tracking-wider text-center mb-3">
        Or start with a prompt
      </Text>

      <View className="gap-y-2">
        {prompts.map((p) => (
          <TouchableOpacity
            key={p.id}
            onPress={() => onSelect(p.text)}
            className="bg-penn-surface border border-penn-border rounded-2xl px-4 py-3.5"
            activeOpacity={0.75}
          >
            <Text className="text-penn-muted text-[14px] leading-5 text-center">
              {p.text}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
}
