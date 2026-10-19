// Port of apps/web/app/components/game/Seal.tsx
import { StyleSheet, Text, View } from 'react-native';

import { colors, face, overlays, radius, space, tierColor, tracking, trackingPx } from '@/theme';

/** HUD-style score tag riding on a cover: near-opaque fill, tier-coloured bottom hairline. */
export function Seal({ label, score, side, scale = 10 }: {
  label?: string;
  score: number;
  side: 'left' | 'right';
  scale?: 10 | 100;
}) {
  const color = tierColor(score, scale);
  return (
    <View style={[styles.box, side === 'right' ? styles.right : styles.left, { borderBottomColor: color }]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Text style={[styles.score, label ? styles.scoreUnderLabel : styles.scoreAlone, { color }]}>
        {score}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: space[2],
    alignItems: 'center',
    minWidth: 42, // web: min-w-[2.6rem] — fixed footprint so 8 / 8.5 / 10 don't reflow
    paddingHorizontal: space[2],
    paddingTop: space[1.5],
    paddingBottom: space[1],
    borderRadius: radius.seal,
    backgroundColor: overlays.sealFill,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderBottomWidth: 2,
    boxShadow: overlays.sealShadow,
  },
  left: { left: space[2] },
  right: { right: space[2] },
  label: {
    fontFamily: face.mono[600],
    fontSize: 7,
    lineHeight: 7,
    letterSpacing: trackingPx(tracking.seal, 7),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  score: { fontFamily: face.mono[600], fontVariant: ['tabular-nums'] },
  scoreUnderLabel: { fontSize: 14, lineHeight: 14, marginTop: space[1] },
  scoreAlone: { fontSize: 16, lineHeight: 16 },
});
