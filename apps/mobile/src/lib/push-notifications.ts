import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { AndroidImportance } from 'expo-notifications'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export type PushPlatform = 'ios' | 'android'

function nativePlatform(): PushPlatform | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null
}

/**
 * Asks for permission (a no-op if already granted or already denied — the
 * system prompt only ever shows once) and returns this device's Expo push
 * token, or null when push isn't available: web, no EAS project configured,
 * permission refused, or the token request itself failed (offline, etc).
 */
export async function registerForPushNotificationsAsync(): Promise<{ token: string, platform: PushPlatform } | null> {
  const platform = nativePlatform()
  if (!platform) return null

  if (platform === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: AndroidImportance.MAX,
    })
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync()
    finalStatus = requested.status
  }
  if (finalStatus !== 'granted') return null

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (!projectId) return null

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    return { token, platform }
  } catch {
    return null
  }
}
