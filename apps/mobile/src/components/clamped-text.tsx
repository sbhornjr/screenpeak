// Port of apps/web/app/components/util/ExpandableText. React Native cannot
// measure lines before layout, so a length threshold decides whether the
// text gets Read more.
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { colors, face, hitTarget, typeScale } from '@/theme'

export function ClampedText({ text, lines, longerThan, style }: {
  text: string
  lines: number
  /** More characters than this gets Read more. */
  longerThan: number
  style?: StyleProp<TextStyle>
}) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > longerThan
  return (
    <View>
      <Text numberOfLines={long && !expanded ? lines : undefined} style={style}>{text}</Text>
      {long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less' : 'Read more'}
          onPress={() => setExpanded(value => !value)}
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>{expanded ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  toggle: { alignSelf: 'flex-start', minHeight: hitTarget, justifyContent: 'center' },
  toggleText: { fontFamily: face.body[600], fontSize: typeScale.sm.size, color: colors.accent },
})
