import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { backOrHome } from '@/lib/go'
import { colors, face, space, typeScale } from '@/theme'

import { Button } from './button'
import { Wordmark } from './wordmark'

export function AuthScaffold({ title, children }: { title: string, children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Wordmark />
        <Button label="Back" variant="ghost" onPress={backOrHome} />
        <Text role="heading" accessibilityRole="header" accessibilityLevel={1} style={styles.title}>{title}</Text>
        {children}
      </View>
    </SafeAreaView>
  )
}

export const authText = StyleSheet.create({
  notice: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.text,
  },
  error: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.bad,
  },
})

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
