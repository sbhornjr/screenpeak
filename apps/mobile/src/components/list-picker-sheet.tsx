import type { ListWrite } from '@screenpeak/shared/api/writes'
import { useState } from 'react'
import { Text } from 'react-native'

import { useAction } from '@/lib/use-action'
import { useOnOpen } from '@/lib/use-on-open'
import { text } from '@/theme'

import { ActionError } from './action-error'
import { Button } from './button'
import { ListFields, parseListForm, type ListFormValues } from './list-form-sheet'
import { Sheet } from './sheet'

type ListOption = { id: string, name: string }

/** The game page's Add to list sheet. New list swaps the sheet to the create form. */
export function ListPickerSheet({
  visible,
  lists,
  listIdsGameIsIn,
  defaultPublic,
  onClose,
  onAdd,
  onRemove,
  onCreate,
}: {
  visible: boolean
  lists: ListOption[]
  listIdsGameIsIn: string[]
  defaultPublic: boolean
  onClose: () => void
  onAdd?: (listId: string) => Promise<string | null>
  onRemove?: (listId: string) => Promise<string | null>
  onCreate?: (input: Pick<ListWrite, 'name' | 'description' | 'isPublic' | 'isPinned'>) => Promise<string | null>
}) {
  const blank: ListFormValues = { name: '', description: '', isPublic: defaultPublic, isPinned: false }
  const [making, setMaking] = useState(false)
  const [values, setValues] = useState(blank)
  const action = useAction()

  useOnOpen(visible, () => {
    setMaking(false)
    setValues(blank)
    action.clear()
  })

  function create() {
    const parsed = parseListForm(values)
    if (!parsed.ok) {
      action.fail(parsed.message)
      return
    }
    if (!onCreate) return
    void action.run(() => onCreate(parsed.values), () => {
      setValues(current => ({ ...current, name: '', description: '' }))
      setMaking(false)
    })
  }

  const errorRow = <ActionError error={action.error} onRetry={action.canRetry ? action.retry : undefined} />

  return (
    <Sheet visible={visible} title={making ? 'New list' : 'Add to list'} onClose={onClose}>
      {making ? (
        <>
          <ListFields values={values} onChange={setValues} nameLabel="New list name" descriptionLabel="List description" />
          {errorRow}
          <Button label={action.busy ? 'Saving…' : 'Create list'} disabled={action.busy} onPress={create} />
          <Button label="Back to lists" variant="ghost" onPress={() => setMaking(false)} />
        </>
      ) : (
        <>
          {lists.length === 0 ? <Text style={text.body}>{"You don't have a list yet."}</Text> : null}
          {lists.map(list => {
            const listed = listIdsGameIsIn.includes(list.id)
            const write = listed ? onRemove : onAdd
            return (
              <Button
                key={list.id}
                label={listed ? `${list.name} · In this list` : list.name}
                accessibilityLabel={listed ? `Remove from ${list.name}` : `Add to ${list.name}`}
                selected={listed}
                variant="secondary"
                disabled={action.busy}
                onPress={() => { if (write) void action.run(() => write(list.id)) }}
              />
            )
          })}
          {errorRow}
          <Button label="New list" variant="primary" onPress={() => { action.clear(); setMaking(true) }} />
        </>
      )}
    </Sheet>
  )
}
