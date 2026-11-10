import { Heart, Lock } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { gamesLabel, likeActionLabel, likesCountLabel } from '@/lib/lists-page'
import { calendarLabel } from '@/lib/profile-hub'
import { colors, face, hitTarget, space, typeScale } from '@/theme'

const HEART = 16

export function ListLike({
  count,
  liked,
  interactive,
  onPress,
}: {
  count: number
  liked: boolean
  interactive: boolean
  onPress?: () => void
}) {
  const slop = Math.ceil((hitTarget - HEART) / 2)
  const visual = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.beside}
    >
      <Heart
        size={HEART}
        color={colors.accent}
        fill={liked ? colors.accent : 'transparent'}
      />
      <Text numberOfLines={1} style={styles.count}>{count}</Text>
    </View>
  )
  if (!interactive) {
    return (
      <View accessibilityLabel={likesCountLabel(count)} accessible style={styles.display}>
        {visual}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={likeActionLabel(liked, count)}
      onPress={onPress}
      hitSlop={{ top: slop, right: slop, bottom: slop, left: slop }}
      style={styles.hit}
    >
      {visual}
    </Pressable>
  )
}

/** Game count, a lock when the list is private, and the calendar day, on one line. */
export function ListMeta({
  gameCount,
  isPrivate,
  updatedAt,
}: {
  gameCount: number
  isPrivate: boolean
  updatedAt: string
}) {
  const day = calendarLabel(updatedAt)
  return (
    <View style={styles.metaRow}>
      <Text numberOfLines={1} style={styles.metaGames}>{gamesLabel(gameCount)}</Text>
      {isPrivate ? (
        <View accessibilityLabel="Private" accessible>
          <Lock size={14} color={colors.muted} />
        </View>
      ) : null}
      {day ? (
        <Text numberOfLines={1} accessibilityLabel={`Updated ${day}`} style={styles.metaDay}>{day}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  display: { alignSelf: 'flex-start' },
  hit: { alignSelf: 'flex-start' },
  beside: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  count: {
    fontFamily: face.mono[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.accent,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: space[2],
    minWidth: 0,
  },
  metaGames: {
    flexShrink: 1,
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
  metaDay: {
    flexShrink: 0,
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
})
