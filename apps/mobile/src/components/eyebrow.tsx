// Port of apps/web/app/components/util/Eyebrow.tsx
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, face, seam, space, tracking, trackingPx } from '@/theme';

const SIZE = 11; // web: text-[0.6875rem]

/** Tracked-uppercase mono label above a page title, marked with the seam. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.seam} />
      <Text style={styles.label}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[1] },
  seam: { width: seam.width, height: 13, backgroundColor: seam.color }, // web: h-[0.8rem]
  label: {
    fontFamily: face.mono[400],
    fontSize: SIZE,
    letterSpacing: trackingPx(tracking.label, SIZE),
    textTransform: 'uppercase',
    color: colors.muted,
  },
});
