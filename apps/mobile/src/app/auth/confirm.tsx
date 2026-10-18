import * as Linking from 'expo-linking'
import { router, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Text } from 'react-native'

import { AuthScaffold, authText } from '@/components/auth-scaffold'
import { useAuth } from '@/lib/auth'
import { RESET_LINK_HINT } from '@/lib/password-reset'

export default function ConfirmResetScreen() {
  const linked = Linking.useLinkingURL()
  const { openRecoveryLink, configured } = useAuth()
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const href = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : linked
  const error = !href ? RESET_LINK_HINT : exchangeError

  useEffect(() => {
    if (!configured || !href) return
    let live = true
    openRecoveryLink(href).then((destination) => {
      if (live) router.replace(destination as Href)
    }).catch((err: unknown) => {
      if (live) setExchangeError(err instanceof Error ? err.message : RESET_LINK_HINT)
    })
    return () => { live = false }
  }, [configured, href, openRecoveryLink])

  return (
    <AuthScaffold title="Reset link">
      {configured ? null : <Text style={authText.error}>Sign-in is not configured.</Text>}
      {error ? <Text style={authText.notice}>{error}</Text> : <Text style={authText.notice}>Checking your link…</Text>}
    </AuthScaffold>
  )
}
