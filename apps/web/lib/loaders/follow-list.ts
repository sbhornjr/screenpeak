import { getFollowerProfiles, getFollowingProfiles, getUserIdFromUsername, isBlockedEitherWay } from '@/lib/queries/user'
import type { FollowListEntry } from '@screenpeak/shared/api/profile'

export type FollowListKind = 'followers' | 'following'

/** null means "not found or blocked" — both are reported identically to the caller. */
export async function loadFollowList(
    username: string,
    kind: FollowListKind,
    viewerId: string | null,
): Promise<FollowListEntry[] | null> {
    const target = await getUserIdFromUsername(username)
    if (!target) return null
    if (viewerId && await isBlockedEitherWay(viewerId, target.id)) return null
    return kind === 'followers'
        ? getFollowerProfiles(target.id, viewerId)
        : getFollowingProfiles(target.id, viewerId)
}
