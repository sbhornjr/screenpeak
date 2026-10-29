import { listFieldsSchema } from '@screenpeak/shared/schemas'
import { useState } from 'react'
import { Text } from 'react-native'

import { useOnOpen } from '@/lib/use-on-open'
import { text } from '@/theme'

import { ActionError } from './action-error'
import { Button } from './button'
import { Sheet } from './sheet'
import { SwitchRow } from './switch-row'
import { TextField } from './text-field'

export type ListFormValues = {
  name: string
  description: string
  isPublic: boolean
  isPinned: boolean
}

/** Check the fields. The first problem is the sentence to show. */
export function parseListForm(values: ListFormValues): { ok: true, values: ListFormValues } | { ok: false, message: string } {
  const parsed = listFieldsSchema.safeParse(values)
  if (parsed.success) return { ok: true, values: parsed.data }
  return { ok: false, message: parsed.error.issues[0]?.message ?? 'Give the list a name' }
}

/** Name, description, and the public and pinned switches. */
export function ListFields({ values, onChange, nameLabel = 'List name', descriptionLabel = 'Description' }: {
  values: ListFormValues
  onChange: (next: ListFormValues) => void
  nameLabel?: string
  descriptionLabel?: string
}) {
  return (
    <>
      <TextField label={nameLabel} value={values.name} onChangeText={name => onChange({ ...values, name })} />
      <TextField
        label={descriptionLabel}
        value={values.description}
        onChangeText={description => onChange({ ...values, description })}
        multiline
      />
      <SwitchRow
        label="Public"
        accessibilityLabel="Public list"
        value={values.isPublic}
        onChange={isPublic => onChange({ ...values, isPublic })}
      />
      <SwitchRow
        label="Pinned"
        accessibilityLabel="Pinned list"
        value={values.isPinned}
        onChange={isPinned => onChange({ ...values, isPinned })}
      />
    </>
  )
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
  const [values, setValues] = useState(initial)
  const [confirming, setConfirming] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useOnOpen(visible, () => {
    setValues(initial)
    setConfirming(false)
    setLocalError(null)
  })

  function submit() {
    const parsed = parseListForm(values)
    if (!parsed.ok) {
      setLocalError(parsed.message)
      return
    }
    setLocalError(null)
    onSubmit(parsed.values)
  }

  const shown = localError ?? error

  return (
    <Sheet visible={visible} title={confirming ? 'Delete this list?' : title} onClose={onClose}>
      {confirming ? (
        <>
          <Text style={text.body}>This cannot be undone.</Text>
          <ActionError error={shown} />
          <Button label={busy ? 'Deleting…' : 'Delete list'} variant="secondary" disabled={busy} onPress={() => onDelete?.()} />
          <Button label="Keep list" variant="ghost" onPress={() => setConfirming(false)} />
        </>
      ) : (
        <>
          <ListFields values={values} onChange={setValues} />
          <ActionError error={shown} />
          <Button label={busy ? 'Saving…' : submitLabel} disabled={busy} onPress={submit} />
          {canDelete ? (
            <Button label="Delete list" variant="ghost" onPress={() => { setLocalError(null); setConfirming(true) }} />
          ) : null}
        </>
      )}
    </Sheet>
  )
}
