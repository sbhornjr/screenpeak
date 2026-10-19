import { StyleSheet, Text, View } from 'react-native'

import { ApiClientError } from '@/lib/api/client'
import { colors, face, space, typeScale } from '@/theme'

import { Button } from './button'

export function screenGate(input: {
  ready: boolean
  configured: boolean
  loading: boolean
  error: unknown
}): { title: string, body: string, retry: boolean } | null {
  if (!input.configured) {
    return {
      title: 'API URL missing',
      body: 'Set EXPO_PUBLIC_API_URL to the ScreenPeak server.',
      retry: false,
    }
  }
  if (!input.ready || input.loading) return { title: 'Loading', body: '', retry: false }
  if (input.error) {
    return { title: "Couldn't load this screen", body: messageOf(input.error), retry: true }
  }
  return null
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong.'
}

export function ScreenMessage({ title, body, onRetry }: { title: string, body?: string, onRetry?: () => void }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  notice: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: space[6], gap: space[3] },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  body: {
    fontFamily: face.body[400],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.muted,
  },
})
