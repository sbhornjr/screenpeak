export type Plus1Label = 'RATED' | 'SAVED' | 'COMPLETED' | 'NEW LIST' | 'LISTED' | 'FAVORITED'

export type Plus1Chip = { id: number, text: string }
type Plus1Listener = (chip: Plus1Chip) => void

let seq = 0
const listeners = new Set<Plus1Listener>()

/**
 * Fire the +1 tic — ScreenPeak's signature interaction, ported from the
 * website's `lib/plus1.ts`. `Plus1Layer` (mounted once in the root layout)
 * floats a "+1 LABEL" chip up the screen like XP gain.
 *
 * Fire it only when the user adds a NEW entry to their own save file — a
 * durable, first-time write. Stay silent on edits-in-place, removals, and
 * anything about other people (a list like or a follow is never this).
 */
export function plus1(label?: Plus1Label, n = 1): void {
  const id = ++seq
  const text = `+${n}${label ? ` ${label}` : ''}`
  for (const listener of listeners) listener({ id, text })
}

/** `Plus1Layer`'s own subscription. Nothing else should call this. */
export function subscribePlus1(listener: Plus1Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
