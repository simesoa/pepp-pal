import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface ErrorStateProps {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Check your connection and try again.',
  retryLabel = 'Try again',
  onRetry,
}: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Text className="text-penn-muted text-4xl mb-4">⚠</Text>
      <Text className="text-penn-text text-base font-semibold text-center mb-2">{title}</Text>
      <Text className="text-penn-muted text-[14px] text-center leading-5 mb-6">{message}</Text>
      {onRetry && (
        <TouchableOpacity
          className="bg-penn-surface border border-penn-border rounded-xl px-6 py-3"
          onPress={onRetry}
        >
          <Text className="text-penn-text text-[14px] font-medium">{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
