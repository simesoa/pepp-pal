import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0e0e12' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="status" />
      <Stack.Screen name="waiting" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="policy/privacy" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="policy/terms" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="policy/guidelines" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
