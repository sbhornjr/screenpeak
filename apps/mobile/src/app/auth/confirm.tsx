import * as Linking from 'expo-linking'
import { router, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Eyebrow } from '@/components/eyebrow'
import { useAuth } from '@/lib/auth'
import { backOrHome } from '@/lib/go'
import { RESET_LINK_HINT } from '@/lib/password-reset'
import { colors, face, space } from '@/theme'

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
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Eyebrow>ScreenPeak</Eyebrow>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={backOrHome}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Reset link</Text>
        {configured ? null : <Text style={styles.error}>Sign-in is not configured.</Text>}
        {error ? <Text style={styles.body}>{error}</Text> : <Text style={styles.body}>Checking your link…</Text>}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[8], gap: space[3] },
  title: { fontFamily: face.display[600], fontSize: 32, color: colors.text },
  body: { fontFamily: face.body[400], fontSize: 16, lineHeight: 22, color: colors.text },
  error: { fontFamily: face.body[400], fontSize: 14, color: colors.bad },
  link: { fontFamily: face.body[500], fontSize: 14, color: colors.accent },
})
