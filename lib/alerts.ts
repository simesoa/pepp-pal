/**
 * Cross-platform alert/confirm.
 *
 * react-native-web does NOT implement Alert.alert — on web it is a silent
 * no-op, which made every confirmation dialog (sign out, block, rematch,
 * report, ban, delete account) do nothing in the browser. These helpers use
 * window.alert/window.confirm on web and Alert on native.
 */
import { Alert, Platform } from 'react-native';

export function showAlert(title: string, message?: string, onDone?: () => void): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
    onDone?.();
    return;
  }
  Alert.alert(title, message, [{ text: 'OK', onPress: onDone }]);
}

interface ConfirmOptions {
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function showConfirm(title: string, message: string, options: ConfirmOptions): void {
  const { confirmLabel = 'OK', destructive = false, onConfirm, onCancel } = options;

  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    } else {
      onCancel?.();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: onCancel },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
