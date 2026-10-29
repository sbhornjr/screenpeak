import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { back } from '@/lib/go'
import { colors, face, space, typeScale } from '@/theme'

import { AppHeader } from './app-header'

export function AuthScaffold({ title, children }: { title: string, children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader onBack={back} />
      <View style={styles.content}>
        <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.title}>{title}</Text>
        {children}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[6], paddingTop: space[8], gap: space[3] },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale['3xl'].size,
    lineHeight: typeScale['3xl'].line,
    color: colors.text,
  },
})
