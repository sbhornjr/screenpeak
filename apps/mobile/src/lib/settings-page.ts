import type { SettingsData } from '@screenpeak/shared/api/me'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import type { MePatch } from '@screenpeak/shared/api/writes'
import { parseDbTimestamp } from '@screenpeak/shared/dates'
import { bioSchema, emailSchema, parseOrError, usernameSchema } from '@screenpeak/shared/schemas'
import { getTitles } from '@screenpeak/shared/titles'

import { newPasswordProblem } from './password-reset'

export type PrivacyType = NonNullable<MePatch['privacy']>['type']

/** The website's privacy rows, in its order. */
export const PRIVACY_ROWS: { type: PrivacyType, key: 'default_list_public' | 'library_public' | 'loadout_public', label: string }[] = [
  { type: 'Default List', key: 'default_list_public', label: 'Default list' },
  { type: 'Library', key: 'library_public', label: 'Library' },
  { type: 'Loadout', key: 'loadout_public', label: 'Loadout' },
]

/** What the profile shows when no title is picked. */
export const DEFAULT_TITLE = 'Title-less Noob'

export function shownTitle(selected: string | null): string {
  return selected || DEFAULT_TITLE
}

/** Month/day/year, as the website's settings page writes it. */
export function memberSinceLine(createdAt: string | null): string | null {
  if (!createdAt) return null
  const day = parseDbTimestamp(createdAt)
  if (Number.isNaN(day.getTime())) return null
  return `Member since ${day.getMonth() + 1}/${day.getDate()}/${day.getFullYear()}`
}

/** The website's title picker: genre titles, then one per favorite game and top developer. */
export function titleChoices(profile: ProfilePageData | undefined): string[] {
  return getTitles({
    topGames: profile?.favorites.map(game => game.name) ?? [],
    topDevelopers: profile?.viewer?.top_developer_names ?? [],
  })
}

export function usernameProblem(next: string, current: string): string | null {
  const parsed = parseOrError(usernameSchema, next)
  if (!parsed.success) return parsed.error
  if (parsed.data === current) return "That's already your username."
  return null
}

export function emailProblem(next: string, current: string | null): string | null {
  const parsed = parseOrError(emailSchema, next)
  if (!parsed.success) return parsed.error
  if (current && parsed.data.toLowerCase() === current.toLowerCase()) return "That's already your email."
  return null
}

export function bioProblem(next: string): string | null {
  const parsed = parseOrError(bioSchema, next)
  return parsed.success ? null : parsed.error
}

export function passwordChangeProblem(current: string, next: string, again: string): string | null {
  if (!current) return 'Enter your current password.'
  const problem = newPasswordProblem(next, again)
  if (problem) return problem
  if (next === current) return 'Pick a password you are not using now.'
  return null
}

export function withPrivacy(settings: SettingsData, type: PrivacyType, value: boolean): SettingsData {
  const row = PRIVACY_ROWS.find(item => item.type === type)
  return row ? { ...settings, [row.key]: value } : settings
}
