import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

import { igdbImageUri } from '@/lib/catalog-image'
import { colors, radius, space } from '@/theme'

/** Up to five covers in a row, shrinking to fit. Decorative: the card's link names what it opens. */
export function CoverStrip({ covers }: { covers: (string | null)[] }) {
  if (covers.length === 0) return null
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.covers}>
      {covers.slice(0, 5).map((cover, index) => {
        const uri = igdbImageUri(cover)
        return uri
          ? <Image key={index} source={uri} style={styles.cover} contentFit="cover" />
          : <View key={index} style={styles.cover} />
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  covers: { flexDirection: 'row', gap: space[2] },
  cover: {
    flex: 1,
    maxWidth: space[12],
    height: space[16],
    borderRadius: radius.base,
    backgroundColor: colors.surfaceLight,
  },
})
