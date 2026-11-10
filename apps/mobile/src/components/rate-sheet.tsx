import { ratingLabel } from '@screenpeak/shared/rating-copy'
import { ratingReviewSchema } from '@screenpeak/shared/schemas'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useAction } from '@/lib/use-action'
import { useOnOpen } from '@/lib/use-on-open'
import { colors, face, radius, space, text, tierColor, typeScale } from '@/theme'

import { ActionError } from './action-error'
import { Button } from './button'
import { Sheet } from './sheet'
import { TextField } from './text-field'

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * Score a game and leave an optional note. Delete review clears the note and
 * keeps the score: there is no rating-delete route.
 */
export function RateSheet({ visible, review, onClose, onRate }: {
  visible: boolean
  review: { rating: number, review: string } | null
  onClose: () => void
  onRate?: (rating: number, review: string) => Promise<string | null>
}) {
  const [score, setScore] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const action = useAction()

  useOnOpen(visible, () => {
    setScore(review?.rating ?? null)
    setNote(review?.review ?? '')
    setConfirmDelete(false)
    action.clear()
  })

  function submit() {
    if (score == null) {
      action.fail('Pick a score.')
      return
    }
    const parsed = ratingReviewSchema.safeParse({ rating: score, review: note })
    if (!parsed.success) {
      action.fail(parsed.error.issues[0]?.message ?? 'Check the rating.')
      return
    }
    if (onRate) void action.run(() => onRate(parsed.data.rating, parsed.data.review), onClose)
  }

  function deleteNote() {
    if (review && onRate) void action.run(() => onRate(review.rating, ''), onClose)
  }

  return (
    <Sheet visible={visible} title={review ? 'Update rating and review' : 'Rate and review'} onClose={onClose}>
      <View style={styles.keys}>
        {SCORES.map(value => {
          const selected = score === value
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Score ${value}`}
              accessibilityState={{ selected }}
              onPress={() => setScore(value)}
              style={[styles.key, { borderColor: tierColor(value) }, selected && { backgroundColor: tierColor(value) }]}
            >
              <Text style={[styles.keyText, { color: selected ? colors.bg : tierColor(value) }]}>{value}</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={text.body}>{score == null ? 'Pick a score.' : ratingLabel(score)}</Text>
      <TextField label="Review note" value={note} onChangeText={setNote} multiline />
      <ActionError error={action.error} onRetry={action.canRetry ? action.retry : undefined} />
      <Button label={action.busy ? 'Saving…' : 'Submit rating'} disabled={action.busy} onPress={submit} />
      {review?.review ? (
        confirmDelete ? (
          <View style={styles.stack}>
            <Text style={text.body}>Delete this review? Your score stays.</Text>
            <Button label="Delete the written review" variant="danger" disabled={action.busy} onPress={deleteNote} />
            <Button label="Keep review" variant="ghost" onPress={() => setConfirmDelete(false)} />
          </View>
        ) : (
          <Button label="Delete review" variant="ghost" onPress={() => setConfirmDelete(true)} />
        )
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  key: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: space[2],
    borderWidth: 1,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  keyText: { fontFamily: face.mono[600], fontSize: typeScale.base.size },
  stack: { gap: space[2] },
})
