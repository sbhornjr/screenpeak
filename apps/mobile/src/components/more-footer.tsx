import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { colors, space, text } from '@/theme'

import { Button } from './button'

/** The end of a paged list: a spinner while the next page loads, or why it failed with Retry. */
export function MoreFooter({ loadingLabel, loadingMore, loadMoreError, onLoadMore }: {
  loadingLabel: string
  loadingMore: boolean
  loadMoreError: string | null
  onLoadMore?: () => void
}) {
  if (loadMoreError) {
    return (
      <View style={styles.stack}>
        <Text accessibilityLiveRegion="polite" style={text.error}>{loadMoreError}</Text>
        {onLoadMore ? <Button label="Retry" accessibilityLabel="Retry loading more" variant="secondary" onPress={onLoadMore} /> : null}
      </View>
    )
  }
  if (loadingMore) {
    return <ActivityIndicator accessibilityLabel={loadingLabel} color={colors.accent} style={styles.more} />
  }
  return null
}

const styles = StyleSheet.create({
  stack: { gap: space[2] },
  more: { paddingVertical: space[4] },
})
