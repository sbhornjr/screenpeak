import { Component, useEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { reportAppError } from '@/lib/sentry'
import { colors, face, space, typeScale } from '@/theme'

import { Button } from './button'

export function AppErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>An unexpected error occurred.</Text>
      <Button label="Try again" onPress={onRetry} />
    </View>
  )
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    reportAppError(error)
  }

  render() {
    if (this.state.error) {
      return <AppErrorFallback onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}

/** Expo Router renders this for a screen that throws. It reports only when Sentry started. */
export function RouteErrorBoundary({ error, retry }: { error: Error, retry: () => void }) {
  useEffect(() => {
    reportAppError(error)
  }, [error])
  return <AppErrorFallback onRetry={retry} />
}

const styles = StyleSheet.create({
  notice: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: space[6],
    gap: space[3],
  },
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
