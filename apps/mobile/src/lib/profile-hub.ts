import type { ProfilePageData } from '@screenpeak/shared/api/profile'

import { listsHref, loadoutHref, userLibraryHref } from './routes'

// Visibility matches the website profile nav (apps/web/app/user/[username]/page.tsx).
// Library: owner, or library_public. Loadout: owner, or loadout_public.
// Lists have no profile-wide privacy flag, so the link always shows. Private
// lists are omitted by GET /api/v1/user/[username]/lists unless the viewer is
// the owner. This read uses only that profile payload — it does not call the
// library, loadout, or lists routes.

export type ProfileHubModel = {
  username: string
  bio: string | null
  followerCount: number
  followingCount: number
  loadoutHref: string | null
  listsHref: string
  library: { href: string, totalGames: number | null, completed: number | null } | null
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
  return {
    username,
    bio: data.profile.user_bio,
    followerCount: data.profile.follower_count,
    followingCount: data.profile.following_count,
    loadoutHref: showLoadout ? loadoutHref(username) : null,
    listsHref: listsHref(username),
    library: showLibrary
      ? {
          href: isOwner ? '/library' : userLibraryHref(username),
          totalGames: data.library_stats?.total_games ?? null,
          completed: data.library_stats?.completed ?? null,
        }
      : null,
  }
}

export async function loadProfileHub(source: ProfileHubSource, username: string): Promise<ProfileHubModel> {
  const data = await source.users.get(username)
  return profileHubModel(data)
}
