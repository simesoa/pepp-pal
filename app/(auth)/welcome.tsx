import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { APP_NAME } from '@/lib/config';

const { height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 900,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <Animated.View
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        className="flex-1 px-8 justify-between"
      >
        {/* Top spacer */}
        <View style={{ height: height * 0.12 }} />

        {/* Hero content */}
        <View>
          {/* Wordmark / logo */}
          <View className="mb-10">
            <View className="w-14 h-14 rounded-2xl bg-penn-accent items-center justify-center mb-6">
              <Text className="text-white text-3xl font-bold">P</Text>
            </View>
            <Text className="text-penn-text text-4xl font-bold tracking-tight leading-tight mb-3">
              {APP_NAME}
            </Text>
            <Text className="text-penn-muted text-lg leading-7">
              One anonymous partner.{'\n'}
              Your whole college journey.{'\n'}
              Revealed at graduation.
            </Text>
          </View>

          {/* Value props */}
          <View className="gap-y-4">
            {[
              { icon: '🔒', text: 'Completely anonymous until you graduate' },
              { icon: '🤝', text: 'Matched with someone in your graduating class' },
              { icon: '💬', text: 'Private 1-on-1 support, no social feed' },
            ].map(({ icon, text }) => (
              <View key={text} className="flex-row items-center gap-x-3">
                <Text className="text-2xl">{icon}</Text>
                <Text className="text-penn-muted text-[15px] leading-5 flex-1">
                  {text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA buttons */}
        <View className="pb-8 gap-y-3">
          <TouchableOpacity
            className="bg-penn-accent rounded-2xl py-4 items-center"
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.85}
          >
            <Text className="text-white font-semibold text-base">
              Get started
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="rounded-2xl py-4 items-center border border-penn-border"
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.85}
          >
            <Text className="text-penn-text font-medium text-base">
              Sign in
            </Text>
          </TouchableOpacity>

          {/* Policy links */}
          <View className="flex-row justify-center flex-wrap gap-x-4 gap-y-1 pt-2">
            {[
              { label: 'Privacy', route: '/(app)/policy/privacy' },
              { label: 'Terms', route: '/(app)/policy/terms' },
              { label: 'Guidelines', route: '/(app)/policy/guidelines' },
            ].map(({ label, route }) => (
              <TouchableOpacity
                key={label}
                onPress={() => router.push(route as Parameters<typeof router.push>[0])}
              >
                <Text className="text-penn-muted text-xs">{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}
