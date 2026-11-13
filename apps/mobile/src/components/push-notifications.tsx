import * as Notifications from 'expo-notifications'
import { useEffect, useRef } from 'react'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { go } from '@/lib/go'
import { registerForPushNotificationsAsync } from '@/lib/push-notifications'

/**
 * Registers this device's Expo push token on sign-in, and unregisters it on
 * sign-out so a shared or signed-out device stops receiving that account's
 * notifications. A refused permission or a token request failure (offline,
 * no EAS project) just means no pushes — never a broken sign-in.
 */
export function PushNotificationRegistration() {
  const { session, ready } = useAuth()
  const registered = useRef<string | null>(null)
  const signedIn = useRef(false)

  useEffect(() => {
    if (!ready) return
    const now = session != null
    if (!signedIn.current && now) {
      void (async () => {
        const result = await registerForPushNotificationsAsync()
        if (!result) return
        try {
          await api.me.registerPushToken(result)
          registered.current = result.token
        } catch {
          // Best-effort. A missing registration just means no pushes.
        }
      })()
    } else if (signedIn.current && !now && registered.current) {
      const token = registered.current
      registered.current = null
      void api.me.unregisterPushToken({ token }).catch(() => undefined)
    }
    signedIn.current = now
  }, [session, ready])

  return null
}

// A notification's `data.url` round-trips through the server and Expo's
// push service, so it's untrusted by the time it reaches the device. `go()`
// never calls `Linking.openURL` — it's Expo Router's own, `Href`-typed
// navigation — so this isn't a classic external-redirect phishing vector,
// but a relative-looking path can still smuggle a protocol-relative or
// absolute URL (`//evil.com`, `https://evil.com`) past a careless check.
function isSafeInternalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.includes('://') && !url.includes('\\')
}

/** Opens the screen a tapped notification's `data.url` names. */
export function PushNotificationNavigation() {
  const response = Notifications.useLastNotificationResponse()

  useEffect(() => {
    const url = response?.notification.request.content.data?.url
    if (typeof url === 'string' && isSafeInternalPath(url)) go(url)
  }, [response])

  return null
}
