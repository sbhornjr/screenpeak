import { StyleSheet, View } from 'react-native'

import { hitTarget } from '@/theme'

import { Button } from './button'
import { Wordmark } from './wordmark'

/**
 * The top bar. Equal side columns keep Screen | Peak in the center,
 * including when Back sits in the leading column.
 */
export function AppHeader({ onBack }: { onBack?: () => void }) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onBack ? <Button label="Back" variant="ghost" onPress={onBack} /> : null}
      </View>
      <View style={styles.mark}>
        <Wordmark />
      </View>
      <View style={styles.side} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: hitTarget,
  },
  side: { flex: 1, minHeight: hitTarget, justifyContent: 'center', minWidth: 0 },
  mark: { alignItems: 'center' },
})
