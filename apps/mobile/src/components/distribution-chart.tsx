// Port of apps/web/app/components/util/DistributionChart.tsx: one bar per
// score, in its tier colour, with the count and share beside it.
import { StyleSheet, Text, View } from 'react-native'

import { colors, face, radius, space, tierColor, tracking, trackingPx, typeScale } from '@/theme'

function ratingsWord(count: number): string {
  return count === 1 ? '1 rating' : `${count} ratings`
}

export function DistributionChart({ rows }: { rows: { rating: number, count: number }[] }) {
  const maxCount = Math.max(...rows.map(row => row.count), 1)
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return (
    <View style={styles.chart}>
      {rows.map(({ rating, count }) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        const label = count > 0 ? `${rating} out of 10: ${ratingsWord(count)}, ${pct}%` : `${rating} out of 10: 0 ratings`
        return (
          <View key={rating} accessible accessibilityLabel={label} style={styles.row}>
            <Text style={styles.score}>{rating}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, {
                width: `${(count / maxCount) * 100}%`,
                minWidth: count > 0 ? 3 : 0,
                backgroundColor: tierColor(rating),
              }]} />
            </View>
            <Text style={styles.count}>{count > 0 ? `${count} · ${pct}%` : '0'}</Text>
          </View>
        )
      })}
      <Text style={styles.total}>{ratingsWord(total)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chart: { gap: space[1.5] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  score: { width: 20, textAlign: 'right', fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  track: { flex: 1, height: 14, backgroundColor: colors.surfaceLight, borderRadius: radius.bar, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.bar },
  count: { width: 64, fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  total: {
    paddingLeft: 32,
    marginTop: space[1],
    fontFamily: face.mono[400],
    fontSize: 10,
    letterSpacing: trackingPx(tracking.wide, 10),
    textTransform: 'uppercase',
    color: colors.muted,
  },
})
