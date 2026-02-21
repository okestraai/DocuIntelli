import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import Constants from 'expo-constants';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#059669',
    });

    await Notifications.setNotificationChannelAsync('documents', {
      name: 'Document Alerts',
      description: 'Expiration reminders and document updates',
      importance: Notifications.AndroidImportance.HIGH,
    });

    await Notifications.setNotificationChannelAsync('billing', {
      name: 'Billing',
      description: 'Payment and subscription updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });
    const token = tokenData.data;

    // Store token in Supabase user_profiles
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          expo_push_token: token,
          updated_at: new Date().toISOString(),
        });
    }

    return token;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

export function setupNotificationListeners() {
  // Handle notification received while app is foregrounded
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Notification received:', notification.request.content.title);
  });

  // Handle notification tap (app was in background or killed)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;

    // Route based on notification data
    if (data?.documentId) {
      router.push({ pathname: '/document/[id]', params: { id: data.documentId as string } });
    } else if (data?.route) {
      router.push(data.route as any);
    }
  });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

export async function clearPushToken() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ expo_push_token: null, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
  } catch (error) {
    console.error('Failed to clear push token:', error);
  }
}
