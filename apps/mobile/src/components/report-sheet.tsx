import type { ReportInput } from '@screenpeak/shared/api/moderation'
import { REPORT_REASONS } from '@screenpeak/shared/constants'
import { Flag } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { api } from '@/lib/api'
import { actionFailure } from '@/lib/failure'
import { useAction } from '@/lib/use-action'
import { useOnOpen } from '@/lib/use-on-open'
import { colors, face, hitTarget, radius, space, text, typeScale } from '@/theme'

import { ActionError } from './action-error'
import { Button } from './button'
import { Sheet } from './sheet'
import { TextField } from './text-field'

type ReportTargetType = ReportInput['targetType']

const TITLES: Record<ReportTargetType, string> = {
  review: 'Report review',
  list: 'Report list',
  profile: 'Report profile',
}

/** reportSchema's cap on `details`. TextField has no maxLength, so typing is clipped here. */
const DETAILS_MAX = 2000

/**
 * The website ReportModal as a sheet. The reasons come from
 * REPORT_REASONS[targetType] (they end in "Other") as selectable rows, since
 * React Native has no select. Details are optional free text. On success the
 * form is replaced by a confirmation instead of closing.
 */
export function ReportSheet({ visible, targetType, targetId, onClose }: {
  visible: boolean
  targetType: ReportTargetType
  targetId: string
  onClose: () => void
}) {
  const reasons = REPORT_REASONS[targetType]
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [done, setDone] = useState(false)
  const action = useAction()

  useOnOpen(visible, () => {
    setReason(null)
    setDetails('')
    setDone(false)
    action.clear()
  })

  function submit() {
    if (!reason) {
      action.fail('Pick a reason.')
      return
    }
    const trimmed = details.trim()
    const body: ReportInput = { targetType, targetId, reason, ...(trimmed ? { details: trimmed } : {}) }
    void action.run(async () => {
      try {
        await api.reports.create(body)
        return null
      } catch (error) {
        return actionFailure(error)
      }
    }, () => setDone(true))
  }

  return (
    <Sheet visible={visible} title={done ? 'Reported' : TITLES[targetType]} onClose={onClose}>
      {done ? (
        <>
          <Text accessibilityLiveRegion="polite" style={text.body}>Thanks. We&apos;ll take a look.</Text>
          <Button label="Done" onPress={onClose} />
        </>
      ) : (
        <>
          <Text style={text.label}>Reason</Text>
          {reasons.map(option => {
            const selected = reason === option
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={option}
                accessibilityState={{ selected }}
                onPress={() => setReason(option)}
                style={[styles.reasonRow, selected && styles.reasonSelected]}
              >
                <Text style={styles.reasonTitle}>{option}</Text>
              </Pressable>
            )
          })}
          <TextField
            label="Details (optional)"
            placeholder="Anything that helps us understand the problem"
            value={details}
            onChangeText={value => setDetails(value.slice(0, DETAILS_MAX))}
            multiline
          />
          <ActionError error={action.error} onRetry={action.canRetry ? action.retry : undefined} />
          <Button
            label={action.busy ? 'Reporting…' : 'Report'}
            disabled={action.busy || !reason}
            onPress={submit}
          />
        </>
      )}
    </Sheet>
  )
}

/** The flag icon every report entry point uses; owns the sheet's open state. */
export function ReportButton({ targetType, targetId }: {
  targetType: ReportTargetType
  targetId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={TITLES[targetType]}
        hitSlop={{ top: 13, right: 13, bottom: 13, left: 13 }}
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <Flag size={18} color={colors.muted} />
      </Pressable>
      <ReportSheet visible={open} targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />
    </>
  )
}

const styles = StyleSheet.create({
  trigger: { alignItems: 'center', justifyContent: 'center', minWidth: hitTarget / 2, minHeight: hitTarget / 2 },
  reasonRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    backgroundColor: colors.surface,
  },
  reasonSelected: { borderColor: colors.accent },
  reasonTitle: { fontFamily: face.display[600], fontSize: typeScale.base.size, color: colors.text },
})
