import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Linking,
  Pressable,
} from 'react-native';
import { APP_NAME } from '@/lib/config';

interface SafetyModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SafetyModal({ visible, onClose }: SafetyModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-black/70 justify-end"
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View className="bg-penn-surface rounded-t-3xl px-6 pt-6 pb-10">
            {/* Drag handle */}
            <View className="w-10 h-1 bg-penn-border rounded-full self-center mb-6" />

            <Text className="text-penn-text text-xl font-semibold mb-2">
              Need support?
            </Text>

            <Text className="text-penn-muted text-[15px] leading-6 mb-6">
              You don't have to face this alone. Reaching out is an act of courage.
            </Text>

            {/* Crisis line */}
            <View className="bg-penn-card rounded-2xl p-4 mb-4">
              <Text className="text-penn-accent text-xs font-semibold uppercase tracking-wider mb-1">
                Crisis Support (US)
              </Text>
              <Text className="text-penn-text text-base font-medium mb-1">
                988 Suicide & Crisis Lifeline
              </Text>
              <Text className="text-penn-muted text-[13px] mb-3">
                Call or text 988, available 24/7
              </Text>
              <TouchableOpacity
                className="bg-penn-accent rounded-xl py-3 items-center"
                onPress={() => Linking.openURL('tel:988')}
              >
                <Text className="text-white font-semibold text-base">
                  Call 988
                </Text>
              </TouchableOpacity>
            </View>

            {/* Crisis Text Line */}
            <View className="bg-penn-card rounded-2xl p-4 mb-4">
              <Text className="text-penn-accent text-xs font-semibold uppercase tracking-wider mb-1">
                Crisis Text Line
              </Text>
              <Text className="text-penn-text text-base font-medium mb-1">
                Text HOME to 741741
              </Text>
              <Text className="text-penn-muted text-[13px]">
                Free, 24/7 support via text message
              </Text>
            </View>

            {/* Disclaimer */}
            <Text className="text-penn-muted text-[12px] leading-4 mb-6">
              {APP_NAME} is peer support between students. It is not therapy,
              crisis counseling, or emergency services. If you or someone you
              know is in immediate danger, call 911.
            </Text>

            <TouchableOpacity
              className="bg-penn-border rounded-xl py-3 items-center"
              onPress={onClose}
            >
              <Text className="text-penn-text font-medium text-base">
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
