import { ApiClientError } from '@screenpeak/shared/api/client'
import { STEAM_NOT_PUBLIC_MESSAGE, type SteamImportBatch, type SteamImportBatchRequest } from '@screenpeak/shared/api/steam'
import type { SteamLibraryImportEntry } from '@screenpeak/shared/api/writes'
import { LIBRARY_STATUSES, type LibraryStatus } from '@screenpeak/shared/constants'
import { LIBRARY_STATUS_COPY } from '@screenpeak/shared/library-copy'
import { hoursPlayedSchema, parseOrError } from '@screenpeak/shared/schemas'
import type { SteamImportCursor, SteamLinkEntry } from '@screenpeak/shared/types'

import { actionFailure } from './failure'

// The website's /steamlink (SteamLinkGamesSection and GameFromSteam) for the
// phone: the same batch loop, merge rule, sentences, and import body.

export type SteamEditField = 'hours' | 'status' | 'times' | 'achievements' | 'selected'
/** Per game, the fields you changed. A later batch never overwrites them. */
export type SteamEdits = Map<string, Set<SteamEditField>>

/** The website's steam_error=2 help. */
export const STEAM_PRIVATE_HELP =
  "Your Steam games library is private. To import Steam games, go to Steam Profile -> Edit Profile -> Privacy Settings -> set 'Game Details' to Public."

const MATCHING_UNAVAILABLE = 'Matching is unavailable. Your matched games are still listed.'
const NOTICE_WAIT_MS = 5000

export function mergeEntries(previous: SteamLinkEntry[], incoming: SteamLinkEntry[], edited: SteamEdits): SteamLinkEntry[] {
  const prior = new Map(previous.map(entry => [entry.gameId, entry]))
  return incoming.map(entry => {
    const saved = prior.get(entry.gameId)
    if (!saved) return entry
    const fields = edited.get(entry.gameId)
    return {
      ...entry,
      playtimeSelected: fields?.has('hours') ? saved.playtimeSelected : entry.playtimeSelected,
      status: fields?.has('status') ? saved.status : entry.status,
      timesPlayed: fields?.has('times') ? saved.timesPlayed : entry.timesPlayed,
      selected: fields?.has('selected') ? saved.selected : entry.selected,
      completedAllAchievements: fields?.has('achievements')
        ? saved.completedAllAchievements
        : saved.completedAllAchievements || entry.completedAllAchievements,
    }
  })
}

function games(count: number): string {
  return `${count} ${count === 1 ? 'game' : 'games'}`
}

function apps(count: number): string {
  return `${count} Steam ${count === 1 ? 'app' : 'apps'}`
}

export function matchingLine(state: {
  matching: boolean
  matchedGameCount: number
  remaining: number
  totalApps: number
  unmatched: number
  ambiguous: number
}): string {
  const head = state.matching
    ? `Matching your library… ${games(state.matchedGameCount)} ready, ${state.remaining} still to check.`
    : `${games(state.matchedGameCount)} ready from ${apps(state.totalApps)}.${state.remaining > 0 ? ` ${state.remaining} still to check.` : ''}`
  const unmatched = state.unmatched > 0 ? ` ${apps(state.unmatched)} could not be matched.` : ''
  const ambiguous = state.ambiguous > 0 ? ` ${apps(state.ambiguous)} matched more than one game and were skipped.` : ''
  return head + unmatched + ambiguous
}

function libraryStatus(value: string): LibraryStatus {
  return (LIBRARY_STATUSES as readonly string[]).includes(value) ? value as LibraryStatus : 'backlog'
}

/** POST /api/v1/me/library/import: the selected games only, as the website sends them. */
export function importEntries(entries: SteamLinkEntry[]): SteamLibraryImportEntry[] {
  return entries
    .filter(entry => entry.selected)
    .map(entry => ({ ...entry, status: libraryStatus(entry.status) }))
}

export function entrySummary(entry: SteamLinkEntry): string {
  const parts = [
    LIBRARY_STATUS_COPY[libraryStatus(entry.status)].label,
    `${entry.playtimeSelected} hrs`,
    `Played ${entry.timesPlayed ?? 1}×`,
  ]
  if (entry.completedAllAchievements) parts.push('100%')
  return parts.join(' · ')
}

export type SteamEditForm = { status: LibraryStatus, hours: string, timesPlayed: number, completed: boolean }

export function editForm(entry: SteamLinkEntry): SteamEditForm {
  return {
    status: libraryStatus(entry.status),
    hours: String(entry.playtimeSelected),
    timesPlayed: entry.timesPlayed ?? 1,
    completed: entry.completedAllAchievements,
  }
}

/** The edit sheet's Done. Blank hours are zero, as the website's empty number field is. */
export function applySteamEdit(entry: SteamLinkEntry, form: SteamEditForm):
  | { ok: true, entry: SteamLinkEntry, fields: SteamEditField[] }
  | { ok: false, message: string } {
  const raw = form.hours.trim()
  const hours = raw === '' ? 0 : Number(raw)
  if (!Number.isFinite(hours)) return { ok: false, message: 'Hours must be a number.' }
  const parsed = parseOrError(hoursPlayedSchema, hours)
  if (!parsed.success) return { ok: false, message: parsed.error }
  const fields: SteamEditField[] = []
  if (form.status !== entry.status) fields.push('status')
  if (parsed.data !== entry.playtimeSelected) fields.push('hours')
  if (form.timesPlayed !== (entry.timesPlayed ?? 1)) fields.push('times')
  if (form.completed !== entry.completedAllAchievements) fields.push('achievements')
  return {
    ok: true,
    entry: fields.length === 0 ? entry : {
      ...entry,
      status: form.status,
      playtimeSelected: parsed.data,
      timesPlayed: form.timesPlayed,
      completedAllAchievements: form.completed,
    },
    fields,
  }
}

function matchingFailure(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message === STEAM_NOT_PUBLIC_MESSAGE ? STEAM_PRIVATE_HELP : actionFailure(error)
  }
  return MATCHING_UNAVAILABLE
}

/**
 * The website's matching loop: follow `nextCursor`, walk once more from the
 * start while apps remain, and wait out another import's turn without
 * touching the list. `retry` is the "Try the remaining matches again" pass.
 */
export async function runMatching({
  retry,
  fetchBatch,
  onBatch,
  onNotice,
  sleep,
  cancelled,
}: {
  retry: boolean
  fetchBatch: (body: SteamImportBatchRequest) => Promise<SteamImportBatch>
  onBatch: (batch: SteamImportBatch) => void
  onNotice: (notice: string, retryableAppCount: number) => void
  sleep: (ms: number) => Promise<void>
  cancelled: () => boolean
}): Promise<{ ok: true } | { ok: false, message: string }> {
  let cursor: SteamImportCursor | null = null
  let revisited = false
  while (!cancelled()) {
    let result: SteamImportBatch
    try {
      result = await fetchBatch(cursor || retry ? { retry, cursor } : {})
    } catch (error) {
      return { ok: false, message: matchingFailure(error) }
    }
    if (cancelled()) break
    if (result.notice) {
      onNotice(result.notice, result.retryableAppCount)
      await sleep(result.retryAfterMs ?? NOTICE_WAIT_MS)
      continue
    }
    onBatch(result)
    if (result.nextCursor) {
      cursor = result.nextCursor
      continue
    }
    if (!revisited && result.remaining > 0) {
      revisited = true
      cursor = null
      continue
    }
    break
  }
  return { ok: true }
}
