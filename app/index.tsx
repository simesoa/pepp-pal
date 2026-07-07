/**
 * Root index route ("/"). Redirects based on auth state so a direct visit to
 * the domain never shows an unmatched route or blank screen.
 */
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 bg-penn-bg items-center justify-center">
        <ActivityIndicator size="large" color="#7c6af7" />
      </View>
    );
  }

  return <Redirect href={session ? '/(app)/status' : '/(auth)/welcome'} />;
}
