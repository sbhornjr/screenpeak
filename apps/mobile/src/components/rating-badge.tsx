import { StyleSheet, Text } from 'react-native';

import { face, tierColor, typeScale } from '@/theme';

/** A score value in its tier colour. Text rows use this; covers use Seal. */
export function RatingBadge({ score, scale = 10 }: { score: number; scale?: 10 | 100 }) {
  return (
    <Text
      accessibilityLabel={`${score} out of ${scale}`}
      style={[styles.score, { color: tierColor(score, scale) }]}
    >
      {score}
    </Text>
  );
}

const styles = StyleSheet.create({
  score: {
    fontFamily: face.mono[600],
    fontSize: typeScale.xl.size,
    lineHeight: typeScale.xl.line,
    fontVariant: ['tabular-nums'],
  },
});
