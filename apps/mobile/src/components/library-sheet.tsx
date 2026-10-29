import type { ViewerLibraryEntry } from '@screenpeak/shared/api/games'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { LIBRARY_CHOICES, libraryForm, libraryWrite, type LibraryForm } from '@/lib/game-page'
import { useAction } from '@/lib/use-action'
import { useOnOpen } from '@/lib/use-on-open'
import { colors, face, radius, space, text, typeScale } from '@/theme'

import { ActionError } from './action-error'
import { Button } from './button'
import { Sheet } from './sheet'
import { TextField } from './text-field'

/** The game page's library sheet: status, and hours, times played, and 100% when they change. */
export function LibrarySheet({
  visible,
  entry,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean
  entry: ViewerLibraryEntry | null
  onClose: () => void
  onSave?: (write: LibraryWrite) => Promise<string | null>
  onRemove?: () => Promise<string | null>
}) {
  const [form, setForm] = useState<LibraryForm>(() => libraryForm(entry))
  const [details, setDetails] = useState(false)
  const action = useAction()

  useOnOpen(visible, () => {
    setForm(libraryForm(entry))
    setDetails(false)
    action.clear()
  })

  function submit() {
    const result = libraryWrite(entry, form)
    if (!result.ok) {
      action.fail(result.message)
      return
    }
    if (!result.write) {
      action.fail('Nothing to update.')
      return
    }
    const write = result.write
    if (onSave) void action.run(() => onSave(write), onClose)
  }

  return (
    <Sheet visible={visible} title={entry ? 'Manage game' : 'Add to library'} onClose={onClose}>
      {LIBRARY_CHOICES.map(choice => {
        const selected = form.status === choice.status
        return (
          <Pressable
            key={choice.status}
            accessibilityRole="button"
            accessibilityLabel={`Log as ${choice.status}`}
            accessibilityState={{ selected }}
            onPress={() => setForm(current => ({ ...current, status: choice.status }))}
            style={[styles.statusRow, selected && styles.statusSelected]}
          >
            <Text style={styles.statusTitle}>{choice.label}</Text>
            <Text style={text.caption}>{choice.description}</Text>
          </Pressable>
        )
      })}
      <Button
        label={details ? 'Hide library details' : 'Show library details'}
        variant="ghost"
        onPress={() => setDetails(openDetails => !openDetails)}
      />
      {details ? (
        <View style={styles.stack}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="100% achievements completed"
            accessibilityState={{ checked: form.completed }}
            onPress={() => setForm(current => ({ ...current, completed: !current.completed }))}
            style={[styles.statusRow, form.completed && styles.statusSelected]}
          >
            <Text style={text.body}>100% achievements completed</Text>
            <Text style={text.caption}>{form.completed ? 'On' : 'Off'}</Text>
          </Pressable>
          <TextField
            label="Hours played"
            value={form.hours}
            onChangeText={value => setForm(current => ({ ...current, hours: value }))}
            keyboardType="decimal-pad"
          />
          <Text style={styles.metaLabel}>Times played</Text>
          <View style={styles.actions}>
            <Button
              label="−"
              accessibilityLabel="Fewer times played"
              variant="secondary"
              onPress={() => setForm(current => ({ ...current, playCount: Math.max(1, current.playCount - 1) }))}
            />
            <Text style={styles.playCount}>{form.playCount}</Text>
            <Button
              label="+"
              accessibilityLabel="More times played"
              variant="secondary"
              onPress={() => setForm(current => ({ ...current, playCount: Math.min(32767, current.playCount + 1) }))}
            />
          </View>
        </View>
      ) : null}
      <ActionError error={action.error} onRetry={action.canRetry ? action.retry : undefined} />
      <Button
        label={action.busy ? 'Saving…' : (entry ? 'Update library entry' : 'Save game')}
        disabled={action.busy}
        onPress={submit}
      />
      {entry && onRemove ? (
        <Button
          label="Remove from library"
          variant="secondary"
          disabled={action.busy}
          onPress={() => { void action.run(onRemove, onClose) }}
        />
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space[2] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  statusRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
    backgroundColor: colors.surface,
  },
  statusSelected: { borderColor: colors.accent },
  statusTitle: { fontFamily: face.display[600], fontSize: typeScale.base.size, color: colors.text },
  metaLabel: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    color: colors.muted,
  },
  playCount: {
    minWidth: 32,
    fontFamily: face.mono[600],
    fontSize: typeScale.lg.size,
    color: colors.text,
    textAlign: 'center',
  },
})
