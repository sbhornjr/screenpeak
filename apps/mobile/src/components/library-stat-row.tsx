import type { ViewerLibraryEntry } from '@screenpeak/shared/api/games'
import { libraryStats } from '@screenpeak/shared/library-copy'
import { Clock, Repeat, Trophy } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'

import { colors, face, space, typeScale } from '@/theme'

const STAT_ICON = { hours: Clock, plays: Repeat, complete: Trophy }

/** Hours, times played, and 100%. The label lives on the row, because the icon is hidden. */
export function LibraryStatRow({
  entry,
  rowGap = space[3],
  itemGap = space[1],
}: {
  entry: Pick<ViewerLibraryEntry, 'hours_played' | 'play_count' | 'completed_all_achievements'>
  rowGap?: number
  itemGap?: number
}) {
  return (
    <View style={[styles.row, { gap: rowGap }]}>
      {libraryStats(entry).map(stat => {
        const Icon = STAT_ICON[stat.key]
        return (
          <View key={stat.key} accessible accessibilityLabel={stat.label} style={[styles.item, { gap: itemGap }]}>
            <Icon size={16} color={colors.muted} />
            <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.value}>{stat.value}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center' },
  value: { fontFamily: face.mono[400], fontSize: typeScale.sm.size, color: colors.text },
})
