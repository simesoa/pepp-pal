import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

interface IdentityWarningBannerProps {
  visible: boolean;
  message: string;
}

export function IdentityWarningBanner({ visible, message }: IdentityWarningBannerProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -10, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{ opacity, transform: [{ translateY }] }}
      className="mx-4 mb-2"
    >
      <View className="bg-red-900/80 border border-red-700 rounded-xl px-4 py-3 flex-row items-center">
        <Text className="text-red-200 text-[13px] leading-5 flex-1">
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
