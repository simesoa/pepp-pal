import React from 'react';
import { View, Text } from 'react-native';
import { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, isSelf }: MessageBubbleProps) {
  return (
    <View
      className={`mb-3 max-w-[78%] ${isSelf ? 'self-end items-end' : 'self-start items-start'}`}
    >
      {/* Label */}
      <Text className="text-xs text-penn-muted mb-1 px-1">
        {isSelf ? 'You' : 'Your Penn Pal'}
      </Text>

      {/* Bubble */}
      <View
        className={`rounded-2xl px-4 py-3 ${
          isSelf
            ? 'bg-penn-accent rounded-br-sm'
            : 'bg-penn-card rounded-bl-sm'
        }`}
      >
        <Text className="text-penn-text text-[15px] leading-[22px]">
          {message.content}
        </Text>
      </View>

      {/* Timestamp */}
      <Text className="text-[11px] text-penn-muted mt-1 px-1">
        {formatTime(message.created_at)}
      </Text>
    </View>
  );
}
