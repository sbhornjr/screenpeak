import type { GamePageData, ViewerLibraryEntry } from '@screenpeak/shared/api/games'
import type { GameRatingsStats } from '@screenpeak/shared/types'
import { parseDbTimestamp } from '@screenpeak/shared/dates'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'
import { LIBRARY_STATUSES, type LibraryStatus } from '@screenpeak/shared/constants'
import { LIBRARY_STATUS_COPY } from '@screenpeak/shared/library-copy'
import { hoursPlayedSchema, parseOrError, playCountSchema } from '@screenpeak/shared/schemas'

import { mergeLibraryWrite } from './library-page'

export const LIBRARY_CHOICES = LIBRARY_STATUSES.map(status => ({ status, ...LIBRARY_STATUS_COPY[status] }))

export type LibraryForm = {
  status: LibraryStatus | null
  completed: boolean
  hours: string
  playCount: number
}

export type ReviewListQuery = {
  page: number
  sort: 'date' | 'rating'
  order: 'asc' | 'desc'
}

export function asStatus(value: string | null | undefined): LibraryStatus | null {
  return LIBRARY_STATUSES.find(status => status === value) ?? null
}

export function statusLabel(status: string): string {
  const known = asStatus(status)
  return known ? LIBRARY_STATUS_COPY[known].label : status
}

export function communityScore(stats: GameRatingsStats): number | null {
  if (stats.total_ratings <= 0 || stats.avg_rating == null || stats.avg_rating <= 0) return null
  return stats.avg_rating
}

export function relTime(value: string | null, now = Date.now()): string {
  if (!value) return ''
  const time = parseDbTimestamp(value).getTime()
  if (!Number.isFinite(time)) return ''
  const days = Math.floor((now - time) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 7) return `${days}d ago`
  if (days < 60) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function scoreGap(input: {
  you: number | null
  community: number | null
  communityCount: number
  signedIn: boolean
}): string | null {
  const you = input.you != null && input.you > 0 ? input.you : null
  const community = input.community != null && input.community > 0 ? input.community : null
  if (you != null && community != null && input.communityCount > 1) {
    const delta = you - community
    if (Math.abs(delta) < 0.25) return "You're level with the community"
    const magnitude = Math.abs(delta).toFixed(1)
    return delta > 0 ? `You're ${magnitude} above the community` : `You're ${magnitude} below the community`
  }
  if (input.communityCount === 1 && you != null) return "You've scored it — first on the board"
  if (you != null) return null
  if (community != null) return input.signedIn ? 'Add your rating' : 'Sign in to add your rating'
  return 'Be the first to rate it'
}

/** A blank field clears the hours. */
function hoursValue(raw: string): { ok: true, value: number | null } | { ok: false, message: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  const parsed = parseOrError(hoursPlayedSchema, Number(trimmed))
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: parsed.error }
}

/**
 * Status is always sent. Hours, play count, and the 100% flag are sent only
 * when they differ from the saved row (or from a blank new save).
 */
export function libraryWrite(
  original: ViewerLibraryEntry | null,
  form: LibraryForm,
): { ok: true, write: LibraryWrite | null } | { ok: false, message: string } {
  if (!form.status) return { ok: false, message: 'Pick a status.' }
  const hours = hoursValue(form.hours)
  if (!hours.ok) return hours
  const plays = parseOrError(playCountSchema, form.playCount)
  if (!plays.success) return { ok: false, message: plays.error }

  const base = {
    status: original?.status ?? null,
    completed: original?.completed_all_achievements ?? false,
    hours: original?.hours_played ?? null,
    playCount: original?.play_count ?? 1,
  }
  const write: LibraryWrite = { status: form.status }
  if (form.completed !== base.completed) write.completed_all_achievements = form.completed
  if (hours.value !== base.hours) write.hours_played = hours.value
  if (form.playCount !== base.playCount) write.play_count = form.playCount
  const changed = form.status !== base.status
    || write.completed_all_achievements !== undefined
    || write.hours_played !== undefined
    || write.play_count !== undefined
  return { ok: true, write: changed ? write : null }
}

export function libraryForm(entry: ViewerLibraryEntry | null): LibraryForm {
  return {
    status: asStatus(entry?.status),
    completed: entry?.completed_all_achievements ?? false,
    hours: entry?.hours_played == null ? '' : String(entry.hours_played),
    playCount: entry?.play_count ?? 1,
  }
}

export function withViewerReview(data: GamePageData, rating: number, review: string, userId: string): GamePageData {
  if (!data.viewer) return data
  const prev = data.viewer.review
  return {
    ...data,
    viewer: {
      ...data.viewer,
      review: {
        user_id: prev?.user_id ?? userId,
        rating,
        review,
        created_at: prev?.created_at ?? new Date().toISOString(),
        updated_at: prev?.updated_at ?? new Date().toISOString(),
        users: prev?.users ?? { username: '', display_name: '', avatar_url: '' },
      },
    },
  }
}

export function withLibraryWrite(data: GamePageData, write: LibraryWrite): GamePageData {
  if (!data.viewer?.libraryEntry) return data
  const entry = data.viewer.libraryEntry
  return {
    ...data,
    viewer: {
      ...data.viewer,
      libraryEntry: { id: entry.id, ...mergeLibraryWrite(entry, write) },
    },
  }
}

export function withListMembership(data: GamePageData, listId: string, listed: boolean): GamePageData {
  if (!data.viewer) return data
  const ids = data.viewer.listIdsGameIsIn.filter(id => id !== listId)
  if (listed) ids.push(listId)
  return { ...data, viewer: { ...data.viewer, listIdsGameIsIn: ids } }
}

/** A list created from this game is on the sheet before the page reloads. */
export function withCreatedList(data: GamePageData, created: { id: string, name: string }): GamePageData {
  if (!data.viewer) return data
  const lists = data.viewer.lists.some(list => list.id === created.id)
    ? data.viewer.lists
    : [...data.viewer.lists, { id: created.id, name: created.name, game_count: 1 }]
  const listIdsGameIsIn = data.viewer.listIdsGameIsIn.includes(created.id)
    ? data.viewer.listIdsGameIsIn
    : [...data.viewer.listIdsGameIsIn, created.id]
  return { ...data, viewer: { ...data.viewer, lists, listIdsGameIsIn } }
}

export function withoutLibraryEntry(data: GamePageData): GamePageData {
  if (!data.viewer) return data
  return { ...data, viewer: { ...data.viewer, libraryEntry: null } }
}
