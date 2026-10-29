// Port of apps/web/app/components/util/Wordmark.tsx
import { StyleSheet, Text, View } from 'react-native'

import { colors, face, tracking, trackingPx, typeScale } from '@/theme'

/** "Screen" and "Peak" divided by the phosphor seam. The accessible name stays ScreenPeak. */
export function Wordmark({ size = typeScale['3xl'].size }: { size?: number }) {
  const seamWidth = Math.max(2, Math.round(size * 0.09))
  const type = {
    fontSize: size,
    lineHeight: Math.round(size * (typeScale['3xl'].line / typeScale['3xl'].size)),
    letterSpacing: trackingPx(tracking.tight, size),
  }
  return (
    <View accessibilityRole="image" accessibilityLabel="ScreenPeak" role="img" style={styles.row}>
      <Text
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.word, type, { color: colors.text }]}
      >
        Screen
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.seam, { width: seamWidth, marginHorizontal: Math.round(size * 0.18) }]}
      />
      <Text
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.word, type, { color: colors.accent }]}
      >
        Peak
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  word: { fontFamily: face.display[700] },
  seam: { alignSelf: 'stretch', marginVertical: 2, backgroundColor: colors.accent },
})
