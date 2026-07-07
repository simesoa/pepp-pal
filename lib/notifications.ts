/**
 * Push notification support (native only — graceful no-op on web).
 *
 * Registration flow: ask permission → fetch the Expo push token → store it
 * via the register_push_token RPC. Token refresh re-runs the same upsert.
 * Delivery happens server-side (notification_events + send-notification
 * Edge Function); this module never blocks user actions on failure.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

export const pushSupported = Platform.OS === 'ios' || Platform.OS === 'android';

type NotificationsModule = typeof import('expo-notifications');

async function loadModule(): Promise<NotificationsModule | null> {
  if (!pushSupported) return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/**
 * Request permission and register this device's Expo push token.
 * Returns 'granted' | 'denied' | 'unavailable'. Never throws.
 */
export async function registerForPushNotifications(): Promise<'granted' | 'denied' | 'unavailable'> {
  const Notifications = await loadModule();
  if (!Notifications) return 'unavailable';

  try {
    const Device = await import('expo-device');
    if (!Device.isDevice) return 'unavailable'; // simulators can't receive push

    track('push_permission_requested');
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      track('push_permission_denied');
      return 'denied';
    }
    track('push_permission_granted');

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId || projectId === 'YOUR_EAS_PROJECT_ID') {
      if (__DEV__) console.warn('[push] No real EAS projectId configured — cannot fetch a push token.');
      return 'unavailable';
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', {
      p_token: tokenResponse.data,
      p_platform: Platform.OS,
      p_device_id: Device.modelName ?? null,
    });
    if (error) {
      if (__DEV__) console.warn('[push] token registration failed:', error.message);
      return 'unavailable';
    }
    track('push_token_registered');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Penn Pal',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    return 'granted';
  } catch (err) {
    if (__DEV__) console.warn('[push] registration error:', err);
    return 'unavailable';
  }
}

/**
 * Route a notification tap to the right screen based on its payload.
 * Call once from the root layout; returns an unsubscribe function.
 */
export async function attachNotificationRouter(
  navigate: (path: string, params?: Record<string, string>) => void,
): Promise<() => void> {
  const Notifications = await loadModule();
  if (!Notifications) return () => {};

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
    const type = String(data.type ?? '');
    const pairId = typeof data.pair_id === 'string' ? data.pair_id : undefined;

    if (type === 'message' || type === 'match') {
      navigate('/(app)/status'); // status routes into the right chat
    } else if (type === 'reveal_request' || type === 'reveal_complete') {
      if (pairId) navigate('/(app)/reveal', { pairId });
      else navigate('/(app)/status');
    } else if (type === 'report_update' || type === 'ban' || type === 'unban') {
      navigate('/(app)/status');
    } else {
      navigate('/(app)/settings');
    }
  });

  return () => sub.remove();
}
