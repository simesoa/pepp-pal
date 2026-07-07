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
      <Stack.Screen name="complete-profile" />
      <Stack.Screen name="waiting" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="reveal" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="school-unsupported" />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="banned" />
      <Stack.Screen name="policy/privacy" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="policy/terms" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="policy/guidelines" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
