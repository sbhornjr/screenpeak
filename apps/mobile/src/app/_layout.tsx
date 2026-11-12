import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { DarkTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'

import { AppErrorBoundary, RouteErrorBoundary } from '@/components/app-error-boundary'
import { ClearListsOnSignOut } from '@/components/clear-lists-on-sign-out'
import { Plus1Layer } from '@/components/plus1-layer'
import { AuthProvider } from '@/lib/auth'
import { startMobileSentry, wrapRoot } from '@/lib/sentry'
import { colors, fontFiles } from '@/theme'

startMobileSentry()

SplashScreen.preventAutoHideAsync()

// ScreenPeak is dark-only (graphite ground, cyan accent), so navigation gets one
// theme built from the tokens rather than a light/dark pair. This colours the
// navigator's own chrome — screen backgrounds, and stack headers once they exist.
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.bad,
  },
}

function RootLayout() {
  // Chakra Petch + IBM Plex, loaded at runtime (works in Expo Go). The splash
  // stays up until they're ready so text never flashes in the system font; on
  // a load error, render anyway — a system-font fallback beats a stuck splash.
  const [fontsLoaded, fontError] = useFonts(fontFiles)
  const ready = fontsLoaded || !!fontError
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }))

  useEffect(() => {
    if (ready) SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ClearListsOnSignOut />
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
              }}
            />
            <Plus1Layer />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}

export function ErrorBoundary({ error, retry }: { error: Error, retry: () => void }) {
  return <RouteErrorBoundary error={error} retry={retry} />
}

export default wrapRoot(RootLayout)
