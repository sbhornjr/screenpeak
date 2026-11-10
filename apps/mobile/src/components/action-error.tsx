import { Text } from 'react-native'

import { text } from '@/theme'

import { Button } from './button'

/** A sheet's failure sentence, and Retry when the failed request can run again. */
export function ActionError({ error, onRetry }: { error: string | null, onRetry?: () => void }) {
  return (
    <>
      {error ? <Text accessibilityLiveRegion="polite" style={text.error}>{error}</Text> : null}
      {error && onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
    </>
  )
}
