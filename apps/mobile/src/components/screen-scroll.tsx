import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { colors, face, radius, space } from '@/theme'

import { Eyebrow } from './eyebrow'

export function ScreenScroll({
  title,
  onBack,
  children,
}: {
  title: string
  onBack?: () => void
  children: ReactNode
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>ScreenPeak</Eyebrow>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}>
            <Text style={styles.back}>Back</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

export function SignupButtons({ onOpen }: { onOpen: (href: string) => void }) {
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign up" onPress={() => onOpen('/sign-up')} style={styles.primary}>
        <Text style={styles.primaryText}>Sign up</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => onOpen('/sign-in')} style={styles.secondary}>
        <Text style={styles.secondaryText}>Log in</Text>
      </Pressable>
    </>
  )
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>
}

export const screenStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    color: colors.text,
    fontFamily: face.body[400],
    fontSize: 16,
  },
  rowButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  rowText: { fontFamily: face.body[500], fontSize: 16, color: colors.text },
  detail: { fontFamily: face.body[400], fontSize: 14, color: colors.muted },
  body: { fontFamily: face.body[400], fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { fontFamily: face.body[400], fontSize: 16, lineHeight: 24, color: colors.muted },
})

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[10], gap: space[3] },
  title: { fontFamily: face.display[600], fontSize: 32, color: colors.text },
  back: { fontFamily: face.body[600], fontSize: 16, color: colors.accent },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: space[3],
    alignItems: 'center',
  },
  primaryText: { fontFamily: face.body[600], fontSize: 16, color: colors.bg },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingVertical: space[3],
    alignItems: 'center',
  },
  secondaryText: { fontFamily: face.body[600], fontSize: 16, color: colors.text },
  section: {
    fontFamily: face.display[600],
    fontSize: 20,
    color: colors.text,
    marginTop: space[4],
  },
})
