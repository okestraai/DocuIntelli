import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotificationsAsync,
  setupNotificationListeners,
} from '../services/pushNotifications';

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Register for push notifications
    registerForPushNotificationsAsync().then((token) => {
      setExpoPushToken(token);
    });

    // Set up listeners
    cleanupRef.current = setupNotificationListeners();

    // Foreground notification listener for state
    const subscription = Notifications.addNotificationReceivedListener((notif) => {
      setNotification(notif);
    });

    return () => {
      subscription.remove();
      cleanupRef.current?.();
    };
  }, []);

  return { expoPushToken, notification };
}
