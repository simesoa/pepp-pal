/**
 * Reusable scrollable policy document screen.
 * Accepts a title and an array of sections: { heading, body }.
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';

export interface PolicySection {
  heading?: string;
  body: string;
}

interface PolicyScreenProps {
  title: string;
  lastUpdated: string;
  sections: PolicySection[];
}

export function PolicyScreen({ title, lastUpdated, sections }: PolicyScreenProps) {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-penn-bg">
      <View className="flex-row items-center px-6 pt-4 pb-2 border-b border-penn-border">
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="mr-4"
        >
          <Text className="text-penn-accent text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-penn-text text-base font-semibold flex-1" numberOfLines={1}>
          {title}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 48 }}
      >
        <Text className="text-penn-text text-2xl font-bold mb-1">{title}</Text>
        <Text className="text-penn-muted text-xs mb-8">Last updated: {lastUpdated}</Text>

        {sections.map((section, i) => (
          <View key={i} className="mb-6">
            {section.heading ? (
              <Text className="text-penn-text text-[15px] font-semibold mb-2">
                {section.heading}
              </Text>
            ) : null}
            <Text className="text-penn-muted text-[14px] leading-6">{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
