import type { GamePageData, ViewerLibraryEntry } from '@screenpeak/shared/api/games'
import type { GameRatingsStats } from '@screenpeak/shared/types'
import type { LibraryWrite } from '@screenpeak/shared/api/writes'
import { libraryEntryWriteSchema } from '@screenpeak/shared/schemas'

import { ApiClientError } from './api/client'

export const LIBRARY_STATUSES = ['backlog', 'playing', 'completed', 'abandoned'] as const

export type LibraryStatus = (typeof LIBRARY_STATUSES)[number]

export const LIBRARY_CHOICES: { status: LibraryStatus, label: string, description: string }[] = [
  { status: 'backlog', label: 'Backlog', description: "I'll get to it..." },
  { status: 'playing', label: 'Playing', description: 'Currently playing it' },
  { status: 'completed', label: 'Completed', description: 'Done and satisfied' },
  { status: 'abandoned', label: 'Abandoned', description: "Couldn't get into it" },
]

const RATING_LABELS: Record<number, string> = {
  1: "Might be the worst game I've ever played.",
  2: 'It was really really bad.',
  3: "I didn't really like it.",
  4: "I couldn't get into it.",
  5: 'Meh. It was fine.',
  6: 'It was alright.',
  7: 'Pretty solid game.',
  8: 'This game was really good.',
  9: 'Incredible game.',
  10: "Might be the best game I've ever played.",
}

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

export function ratingLabel(score: number): string {
  return RATING_LABELS[score] ?? ''
}

export function asStatus(value: string | null | undefined): LibraryStatus | null {
  return LIBRARY_STATUSES.find(status => status === value) ?? null
}

export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function communityScore(stats: GameRatingsStats): number | null {
  if (stats.total_ratings <= 0 || stats.avg_rating == null || stats.avg_rating <= 0) return null
  return stats.avg_rating
}

export function yearOf(released: string | null): number | null {
  if (!released) return null
  const year = Number(released.slice(0, 4))
  return Number.isInteger(year) ? year : null
}

/** Postgres timestamptz text uses a space and a short offset. Safari rejects that. */
export function parseDbTimestamp(value: string): Date {
  const isoLike = value.includes('T') ? value : value.replace(' ', 'T')
  const withColonOffset = /[+-]\d{2}$/.test(isoLike) ? `${isoLike}:00` : isoLike
  return new Date(withColonOffset)
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

export function actionFailure(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 429) {
    const wait = error.retryAfter
    if (wait != null && wait > 0) {
      return `Too many requests. Try again in ${wait} ${wait === 1 ? 'second' : 'seconds'}.`
    }
    return 'Too many requests. Try again soon.'
  }
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong.'
}

function hoursValue(raw: string): { ok: true, value: number | null } | { ok: false, message: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  const value = Number(trimmed)
  const parsed = libraryEntryWriteSchema.safeParse({ status: 'playing', hours_played: value })
  if (!parsed.success) {
    const issue = parsed.error.issues.find(item => item.path[0] === 'hours_played') ?? parsed.error.issues[0]
    return { ok: false, message: issue?.message ?? 'Hours must be a finite number' }
  }
  return { ok: true, value }
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
  const plays = libraryEntryWriteSchema.safeParse({ status: form.status, play_count: form.playCount })
  if (!plays.success) {
    const issue = plays.error.issues.find(item => item.path[0] === 'play_count') ?? plays.error.issues[0]
    return { ok: false, message: issue?.message ?? 'Play count must be a whole number' }
  }

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
      libraryEntry: {
        id: entry.id,
        status: write.status,
        completed_all_achievements: write.completed_all_achievements ?? entry.completed_all_achievements,
        hours_played: 'hours_played' in write ? (write.hours_played ?? null) : entry.hours_played,
        play_count: write.play_count ?? entry.play_count,
      },
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
