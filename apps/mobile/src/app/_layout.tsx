import { useFonts } from 'expo-font';
import { DarkTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import AppTabs from '@/components/app-tabs';
import { colors, fontFiles } from '@/theme';

SplashScreen.preventAutoHideAsync();

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
};

export default function RootLayout() {
  // Chakra Petch + IBM Plex, loaded at runtime (works in Expo Go). The splash
  // stays up until they're ready so text never flashes in the system font; on
  // a load error, render anyway — a system-font fallback beats a stuck splash.
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <AppTabs />
    </ThemeProvider>
  );
}
