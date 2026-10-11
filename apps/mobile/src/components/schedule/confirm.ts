// 확인 창 (앱: Alert, 웹: window.confirm)
import { Alert, Platform } from 'react-native';

export function confirmAsync(title: string, message: string, okLabel = '확인', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
