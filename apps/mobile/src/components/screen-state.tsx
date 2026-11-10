import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { loadFailure } from '@/lib/failure'
import { colors, face, space, text, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'

export type Gate = { title: string, body: string, retry: boolean }

export const API_MISSING = {
  title: 'API URL missing',
  body: 'Set EXPO_PUBLIC_API_URL to the ScreenPeak server.',
} as const

const LOADING: Gate = { title: 'Loading', body: '', retry: false }

export function screenGate(input: {
  ready: boolean
  configured: boolean
  loading: boolean
  error: unknown
}): Gate | null {
  if (!input.configured) return { ...API_MISSING, retry: false }
  if (!input.ready || input.loading) return LOADING
  if (input.error) return { ...loadFailure(input.error), retry: true }
  return null
}

export function ScreenMessage({ title, body, onRetry }: { title: string, body?: string, onRetry?: () => void }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={text.muted}>{body}</Text> : null}
      {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
    </View>
  )
}

/** A `useRemote` screen that is not ready yet: missing config, loading, or a failed load. */
export function RemoteGate({ gate, onRetry }: { gate: Gate | null, onRetry: () => void }) {
  const shown = gate ?? LOADING
  return <ScreenMessage title={shown.title} body={shown.body} onRetry={shown.retry ? onRetry : undefined} />
}

/** A full detail screen with only a message: the header (and Back) stay. */
export function ScreenNotice({ title, body, onRetry, onBack }: {
  title: string
  body: string
  onRetry?: () => void
  onBack?: () => void
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={onBack} />
      <ScreenMessage title={title} body={body} onRetry={onRetry} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  notice: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: space[6], gap: space[3] },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
})
