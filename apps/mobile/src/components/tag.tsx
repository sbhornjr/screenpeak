import { X } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { colors, face, hitTarget, radius, space, typeScale } from '@/theme'

const VISUAL_HEIGHT = 30
const SLOP = Math.ceil((hitTarget - VISUAL_HEIGHT) / 2)

/**
 * A fact about the game — a genre, a credit, an active filter — never an
 * action. Lighter than Button on purpose, so it doesn't read with the same
 * stakes as Rate / Save / Add to list. Pass `onPress` to navigate (a genre,
 * ESRB rating, or credit) or `onRemove` to clear a filter chip; omit both
 * for a plain label.
 */
export function Tag({
  label,
  onPress,
  onRemove,
  accessibilityLabel,
  style,
}: {
  label: string
  onPress?: () => void
  onRemove?: () => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}) {
  const visual = (
    <View style={[styles.base, style]}>
      <Text numberOfLines={1} style={styles.label}>{label}</Text>
      {onRemove ? <X size={14} color={colors.muted} /> : null}
    </View>
  )
  const action = onRemove ?? onPress
  if (!action) return visual
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (onRemove ? `Remove ${label}` : label)}
      hitSlop={{ top: SLOP, right: SLOP, bottom: SLOP, left: SLOP }}
      onPress={action}
    >
      {visual}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1.5],
    maxWidth: '100%',
    height: VISUAL_HEIGHT,
    paddingHorizontal: space[3],
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    flexShrink: 1,
    fontFamily: face.display[500],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.text,
  },
})
