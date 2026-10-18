// Port of apps/web/app/components/util/SectionHead.tsx
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, face, seam, space, tracking, trackingPx, typeScale } from '@/theme';

/** A phosphor seam, a tracked label, then a rule. */
export function SectionHead({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <View role="heading" style={styles.row}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.seam} />
      <Text style={styles.label}>{children}</Text>
      {count != null ? <Text style={styles.count}>{`· ${count}`}</Text> : null}
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2.5],
    marginTop: space[4],
  },
  seam: { width: seam.width, height: 15, backgroundColor: seam.color },
  label: {
    fontFamily: face.mono[600],
    fontSize: typeScale.eyebrow.size,
    lineHeight: typeScale.eyebrow.line,
    letterSpacing: trackingPx(tracking.label, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.text,
  },
  count: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    lineHeight: typeScale.eyebrow.line,
    letterSpacing: trackingPx(tracking.label, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
});
