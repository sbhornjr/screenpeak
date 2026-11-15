import { Ban } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { useAction } from '@/lib/use-action'
import { useOnOpen } from '@/lib/use-on-open'
import { colors, hitTarget, text } from '@/theme'

import { ActionError } from './action-error'
import { Button } from './button'
import { Sheet } from './sheet'

/**
 * The profile's block control, the website BlockButton as an icon. Blocking
 * asks first in a sheet (it also drops any follow between the two of you, both
 * ways); unblocking is reversible and doesn't. Each handler resolves to null,
 * or the sentence to show: a block failure shows in the sheet, and the caller
 * shows an unblock failure (the header has no room for it).
 */
export function BlockButton({ username, blocked, onBlock, onUnblock }: {
  username: string
  blocked: boolean
  onBlock: () => Promise<string | null>
  onUnblock: () => Promise<string | null>
}) {
  const [confirming, setConfirming] = useState(false)
  const block = useAction()
  const unblock = useAction()
  useOnOpen(confirming, block.clear)
  const close = () => setConfirming(false)

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={blocked ? `Unblock ${username}` : `Block ${username}`}
        accessibilityState={{ selected: blocked, disabled: unblock.busy }}
        disabled={unblock.busy}
        hitSlop={{ top: 13, right: 13, bottom: 13, left: 13 }}
        onPress={() => {
          if (blocked) void unblock.run(onUnblock)
          else setConfirming(true)
        }}
        style={styles.trigger}
      >
        <Ban size={18} color={blocked ? colors.bad : colors.muted} />
      </Pressable>
      <Sheet visible={confirming} title={`Block ${username}?`} onClose={close}>
        <Text style={text.body}>
          You&apos;ll stop following each other, and neither of you can follow the other while the block is on. You can unblock them any time from Settings.
        </Text>
        <ActionError error={block.error} onRetry={block.canRetry ? block.retry : undefined} />
        <Button label="Cancel" variant="secondary" onPress={close} />
        <Button
          label={block.busy ? 'Blocking…' : 'Block'}
          accessibilityLabel={`Block ${username}`}
          variant="danger"
          disabled={block.busy}
          onPress={() => { void block.run(onBlock, close) }}
        />
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: { alignItems: 'center', justifyContent: 'center', minWidth: hitTarget / 2, minHeight: hitTarget / 2 },
})
