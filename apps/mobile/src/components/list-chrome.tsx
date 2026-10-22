import { Heart, Lock } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { gamesLabel, likeActionLabel, likesCountLabel, updatedDay } from '@/lib/lists-page'
import { colors, face, hitTarget, space, typeScale } from '@/theme'

const HEART_INSIDE = 32
const HEART_BESIDE = 16

/**
 * Count drawn on a filled accent heart uses the same ink as an accent button
 * (`colors.bg`). There is no white token, and `colors.text` fails contrast on
 * the accent.
 */
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
  const inside = count < 100
  const size = inside ? HEART_INSIDE : HEART_BESIDE
  const slop = Math.ceil((hitTarget - size) / 2)
  const visual = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={inside ? styles.stack : styles.beside}
    >
      <Heart
        size={size}
        color={colors.accent}
        fill={liked ? colors.accent : 'transparent'}
        strokeWidth={inside ? 1.75 : 2}
      />
      <Text
        numberOfLines={1}
        style={inside
          ? [styles.countIn, { color: liked ? colors.bg : colors.accent }]
          : styles.countBeside}
      >
        {count}
      </Text>
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
  const day = updatedDay(updatedAt)
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
  stack: {
    width: HEART_INSIDE,
    height: HEART_INSIDE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countIn: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: face.mono[600],
    fontSize: typeScale.eyebrow.size,
    lineHeight: 14,
  },
  beside: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  countBeside: {
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
