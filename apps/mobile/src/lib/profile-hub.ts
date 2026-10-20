import type { ProfilePageData } from '@screenpeak/shared/api/profile'

import { parseDbTimestamp } from './game-page'
import { listsHref, loadoutHref, ratingsHref, settingsHref, userLibraryHref } from './routes'

// Visibility matches the website profile nav (apps/web/app/user/[username]/page.tsx).
// Library: owner, or library_public. Loadout: owner, or loadout_public.
// Lists have no profile-wide privacy flag, so the link always shows. Private
// lists are omitted by GET /api/v1/user/[username]/lists unless the viewer is
// the owner. This read uses only that profile payload — it does not call the
// library, loadout, or lists routes.

export type ProfileHubModel = {
  userId: string
  username: string
  displayName: string
  title: string
  memberSince: string | null
  bio: string | null
  loadoutQuote: string | null
  followerCount: number
  followingCount: number
  avatarUrl: string | null
  isOwner: boolean
  /** Null when signed out or looking at your own profile. Otherwise whether you follow them. */
  following: boolean | null
  loadoutHref: string | null
  listsHref: string
  library: { href: string, totalGames: number | null, completed: number | null } | null
  ratedCount: number
  avgRating: number | null
  favorites: ProfilePageData['favorites']
  reviews: ProfilePageData['recent_reviews']
  reviewsHref: string
  settingsHref: string | null
}

function localDate(value: string | null): Date | null {
  if (!value) return null
  const date = parseDbTimestamp(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/** Local month/day/year, matching the website's member-since line. */
export function calendarLabel(value: string | null): string | null {
  const date = localDate(value)
  if (!date) return null
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
}

/** Short local date for a review, matching the website review card. */
export function reviewDateLabel(value: string | null): string | null {
  const date = localDate(value)
  if (!date) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function memberSinceLabel(value: string | null): string | null {
  const day = calendarLabel(value)
  return day ? `Member since ${day}` : null
}

/** Truncate to two decimals, matching the website profile. A dash when there is no score. */
export function averageText(count: number, avg: number | null): string {
  if (count <= 0 || avg == null) return '—'
  return `${Math.trunc(avg * 100) / 100} / 10`
}

/** The follow button's optimistic row. Owners and signed-out profiles stay as they are. */
export function withFollowing(model: ProfileHubModel, following: boolean): ProfileHubModel {
  if (model.following == null || model.following === following) return model
  return {
    ...model,
    following,
    followerCount: Math.max(0, model.followerCount + (following ? 1 : -1)),
  }
}

export type ProfileHubSource = {
  users: {
    get: (username: string) => Promise<ProfilePageData>
  }
}

export function profileHubModel(data: ProfilePageData): ProfileHubModel {
  const username = data.profile.username
  const isOwner = data.viewer?.is_owner ?? false
  const showLibrary = isOwner || data.profile.library_public
  const showLoadout = isOwner || data.profile.loadout_public
  const quote = data.profile.profile_loadout_bio?.trim() ? data.profile.profile_loadout_bio : null
  const bio = data.profile.user_bio?.trim() ? data.profile.user_bio.trim() : null
  return {
    userId: data.profile.id,
    username,
    displayName: data.profile.display_name?.trim() || username,
    title: data.profile.selected_title?.trim() || 'Title-less Noob',
    memberSince: memberSinceLabel(data.profile.created_at),
    bio,
    loadoutQuote: showLoadout ? quote : null,
    avatarUrl: data.profile.avatar_url,
    followerCount: data.profile.follower_count,
    followingCount: data.profile.following_count,
    isOwner,
    following: data.viewer && !isOwner ? data.viewer.is_following : null,
    loadoutHref: showLoadout ? loadoutHref(username) : null,
    listsHref: listsHref(username),
    library: showLibrary
      ? {
          href: isOwner ? '/library' : userLibraryHref(username),
          totalGames: data.library_stats?.total_games ?? null,
          completed: data.library_stats?.completed ?? null,
        }
      : null,
    ratedCount: data.rating_count,
    avgRating: data.avg_rating,
    favorites: data.favorites,
    reviews: data.recent_reviews,
    reviewsHref: ratingsHref(username),
    settingsHref: isOwner ? settingsHref() : null,
  }
}

export async function loadProfileHub(source: ProfileHubSource, username: string): Promise<ProfileHubModel> {
  const data = await source.users.get(username)
  return profileHubModel(data)
}
