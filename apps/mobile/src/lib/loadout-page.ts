import type { LoadoutPageData } from '@screenpeak/shared/api/loadout'

/** Ratings a player needs before a Read-out, as the server checks. */
export const READOUT_MIN_RATINGS = 5

export type ReadoutState =
  | { kind: 'written', identity: string, owner: boolean }
  | { kind: 'locked', owner: boolean, rated: number, needed: number }
  | { kind: 'ready', owner: boolean }

/** Which of the website's three Read-out panels to show. */
export function readoutState(data: LoadoutPageData): ReadoutState {
  const owner = data.viewer?.is_owner ?? false
  const identity = data.identity.trim()
  if (identity) return { kind: 'written', identity, owner }
  if (!data.can_generate) {
    const rated = Math.min(data.rating_count, READOUT_MIN_RATINGS)
    return { kind: 'locked', owner, rated, needed: READOUT_MIN_RATINGS - rated }
  }
  return { kind: 'ready', owner }
}

/** The cached page after a generate (the new text) or a clear (''). */
export function withReadout(data: LoadoutPageData, identity: string): LoadoutPageData {
  return { ...data, identity }
}
