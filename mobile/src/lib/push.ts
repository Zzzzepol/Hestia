import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerDevice, unregisterDevice } from '@/api';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

const deviceIdKey = (userId: string) => `hestia:push-device-id:${userId}`;

export async function enablePhoneNotifications(userId: string) {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return false;
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  // eslint-disable-next-line import/namespace
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('hestia-reminders', { name: 'Hestia reminders', importance: Notifications.AndroidImportance.DEFAULT });
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  let id = await AsyncStorage.getItem(deviceIdKey(userId));
  if (!id) id = Crypto.randomUUID();
  const registered = await registerDevice(id, token, Platform.OS as 'ios' | 'android');
  await AsyncStorage.setItem(deviceIdKey(userId), registered.id);
  return true;
}

export async function disablePhoneNotifications(userId: string) {
  const id = await AsyncStorage.getItem(deviceIdKey(userId));
  if (id) await unregisterDevice(id);
}

export function onPhoneNotificationOpen(open: (itemId: string | null) => void) {
  const handle = (response: Notifications.NotificationResponse) => {
    const itemId = response.notification.request.content.data?.itemId;
    open(typeof itemId === 'string' ? itemId : null);
  };
  void Notifications.getLastNotificationResponseAsync().then(response => { if (response) { handle(response); void Notifications.clearLastNotificationResponseAsync(); } });
  return Notifications.addNotificationResponseReceivedListener(handle);
}
