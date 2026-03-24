import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('Bible Study', {
      name: 'A channel is needed for the permissions prompt to appear',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    // if (finalStatus !== 'granted') {
    //   alert('Failed to get push token for push notification!');
    //   return;
    // }
    // Learn more about projectId:
    // https://docs.expo.dev/push-notifications/push-notifications-setup/#configure-projectid
    // EAS projectId is used here.
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      if (!projectId) {
        throw new Error('Project ID not found');
      }
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log('NOTIF TOKEN: ', token);
    } catch (e) {
      token = `${e}`;
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

/**
 * Compares the current Expo push token with the user's stored expo_token in Supabase.
 * If they differ (or stored is null), updates the profile. Otherwise does nothing.
 */
export async function syncExpoTokenIfNeeded(
  userId: string,
  storedToken: string | null | undefined
): Promise<void> {
  const deviceToken = await registerForPushNotificationsAsync();
  if (!deviceToken) return;
  if (deviceToken === (storedToken ?? null)) return;

  const { error } = await supabase
    .from('profiles')
    .update({ expo_token: deviceToken })
    .eq('id', userId);

  if (error) {
    console.error('Failed to update expo_token:', error);
  }
}