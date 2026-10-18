// Port of apps/web/app/components/util/Wordmark.tsx
import { StyleSheet, Text, View } from 'react-native';

import { colors, face, tracking, trackingPx, typeScale } from '@/theme';

/** "Screen" and "Peak" divided by the phosphor seam. The accessible name stays ScreenPeak. */
export function Wordmark({ size = typeScale['3xl'].size }: { size?: number }) {
  const seamWidth = Math.max(2, Math.round(size * 0.09));
  return (
    <View accessibilityLabel="ScreenPeak" style={styles.row}>
      <Text style={[styles.word, { fontSize: size, lineHeight: Math.round(size * 1.05), color: colors.text }]}>Screen</Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.seam, { width: seamWidth, marginHorizontal: Math.round(size * 0.18) }]}
      />
      <Text style={[styles.word, { fontSize: size, lineHeight: Math.round(size * 1.05), color: colors.accent }]}>Peak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  word: {
    fontFamily: face.display[700],
    letterSpacing: trackingPx(tracking.tight, typeScale['3xl'].size),
  },
  seam: { alignSelf: 'stretch', marginVertical: 2, backgroundColor: colors.accent },
});
