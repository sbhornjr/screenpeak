import { listFieldsSchema } from '@screenpeak/shared/schemas'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { colors, face, hitTarget, radius, space, typeScale } from '@/theme'

import { Button } from './button'
import { Sheet } from './sheet'
import { TextField } from './text-field'

export type ListFormValues = {
  name: string
  description: string
  isPublic: boolean
  isPinned: boolean
}

/** Create or edit a list. Delete is a second step in the same sheet. */
export function ListFormSheet({
  visible,
  title,
  submitLabel,
  initial,
  canDelete,
  error,
  busy,
  onClose,
  onSubmit,
  onDelete,
}: {
  visible: boolean
  title: string
  submitLabel: string
  initial: ListFormValues
  canDelete: boolean
  error: string | null
  busy: boolean
  onClose: () => void
  onSubmit: (values: ListFormValues) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [isPublic, setPublic] = useState(initial.isPublic)
  const [isPinned, setPinned] = useState(initial.isPinned)
  const [confirming, setConfirming] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const open = useRef(false)

  useEffect(() => {
    if (visible && !open.current) {
      setName(initial.name)
      setDescription(initial.description)
      setPublic(initial.isPublic)
      setPinned(initial.isPinned)
      setConfirming(false)
      setLocalError(null)
    }
    open.current = visible
  }, [visible, initial.name, initial.description, initial.isPublic, initial.isPinned])

  function submit() {
    const parsed = listFieldsSchema.safeParse({ name, description, isPublic, isPinned })
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Give the list a name')
      return
    }
    setLocalError(null)
    onSubmit(parsed.data)
  }

  const shown = localError ?? error

  return (
    <Sheet visible={visible} title={confirming ? 'Delete this list?' : title} onClose={onClose}>
      {confirming ? (
        <>
          <Text style={styles.body}>This cannot be undone.</Text>
          {shown ? <Text accessibilityLiveRegion="polite" style={styles.error}>{shown}</Text> : null}
          <Button label={busy ? 'Deleting…' : 'Delete list'} variant="secondary" disabled={busy} onPress={() => onDelete?.()} />
          <Button label="Keep list" variant="ghost" onPress={() => setConfirming(false)} />
        </>
      ) : (
        <>
          <TextField label="List name" value={name} onChangeText={setName} />
          <TextField label="Description" value={description} onChangeText={setDescription} multiline />
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Public list"
            accessibilityState={{ checked: isPublic }}
            onPress={() => setPublic(value => !value)}
            style={[styles.switchRow, isPublic && styles.switchOn]}
          >
            <Text style={styles.body}>Public</Text>
            <Text style={styles.meta}>{isPublic ? 'On' : 'Off'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Pinned list"
            accessibilityState={{ checked: isPinned }}
            onPress={() => setPinned(value => !value)}
            style={[styles.switchRow, isPinned && styles.switchOn]}
          >
            <Text style={styles.body}>Pinned</Text>
            <Text style={styles.meta}>{isPinned ? 'On' : 'Off'}</Text>
          </Pressable>
          {shown ? <Text accessibilityLiveRegion="polite" style={styles.error}>{shown}</Text> : null}
          <Button label={busy ? 'Saving…' : submitLabel} disabled={busy} onPress={submit} />
          {canDelete ? (
            <Button label="Delete list" variant="ghost" onPress={() => { setLocalError(null); setConfirming(true) }} />
          ) : null}
        </>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    fontFamily: face.body[400],
    fontSize: typeScale.base.size,
    lineHeight: typeScale.base.line,
    color: colors.text,
  },
  meta: {
    fontFamily: face.mono[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
  },
  switchRow: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
    backgroundColor: colors.surface,
  },
  switchOn: { borderColor: colors.accent },
  error: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.bad,
  },
})
