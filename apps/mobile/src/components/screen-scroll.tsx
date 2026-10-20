import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { colors, face, hitTarget, space, typeScale } from '@/theme'

import { AppHeader } from './app-header'
import { Button } from './button'
import { Panel } from './panel'

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
      <AppHeader onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.title}>{title}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

export function SignupButtons({ onOpen }: { onOpen: (href: string) => void }) {
  return (
    <>
      <Button label="Sign up" onPress={() => onOpen('/sign-up')} />
      <Button label="Log in" variant="secondary" onPress={() => onOpen('/sign-in')} />
    </>
  )
}

/** A tappable panel. The accessible name is the label; the children are what it shows. */
export function PanelRow({
  children,
  onPress,
  accessibilityRole,
  accessibilityLabel,
}: {
  children: ReactNode
  onPress: () => void
  accessibilityRole: 'link' | 'button'
  accessibilityLabel: string
}) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.hit}
    >
      <Panel style={styles.row}>{children}</Panel>
    </Pressable>
  )
}

export const screenStyles = StyleSheet.create({
  body: {
    fontFamily: face.body[400],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.text,
  },
  muted: {
    fontFamily: face.body[400],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.muted,
  },
  detail: {
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
})

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[10], gap: space[3] },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
  hit: { minHeight: hitTarget },
  row: { minHeight: hitTarget, justifyContent: 'center', paddingHorizontal: space[3], paddingVertical: space[3], gap: space[1] },
})
