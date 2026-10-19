import type { ComponentType } from 'react'
import * as Sentry from '@sentry/react-native'
import { sentryBeforeBreadcrumb, sentryBeforeSend } from '@screenpeak/shared/sentry'

let started = false

/**
 * No-op when the DSN is unset, so dev, tests, and Expo web keep running.
 * An omitted argument reads EXPO_PUBLIC_SENTRY_DSN. An explicit `undefined`
 * stays unset even when that variable is set.
 */
export function startMobileSentry(...args: [] | [string | null | undefined]): boolean {
  const dsn = args.length === 0 ? process.env.EXPO_PUBLIC_SENTRY_DSN : args[0]
  const value = dsn?.trim()
  if (!value) return false
  if (started) return true
  Sentry.init({
    dsn: value,
    sendDefaultPii: false,
    beforeSend: sentryBeforeSend,
    beforeBreadcrumb: sentryBeforeBreadcrumb,
  })
  started = true
  return true
}

export function reportAppError(error: unknown, componentStack?: string | null): void {
  if (!started) return
  if (componentStack) {
    Sentry.captureException(error, { contexts: { react: { componentStack } } })
    return
  }
  Sentry.captureException(error)
}

export function wrapRoot(component: ComponentType): ComponentType {
  if (!started) return component
  return Sentry.wrap(component as ComponentType<Record<string, unknown>>)
}
