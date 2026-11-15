'use server'

import { requireUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { updateAvatarUrl, updateFavoriteGames, updatePrivacy, updateUsername, updateSelectedTitle, updateBio, updateLoadoutBio, clearLoadoutIdentity, followUser, unfollowUser, blockUser, unblockUser } from '@/lib/queries/user'
import { avatarUploadErrorMessage } from '@/lib/avatar-upload'
import { createPresignedAvatarUploadUrl } from '@/lib/r2'

export async function createAvatarUploadUrl(contentType: string, contentLength: number) {
    const user = await requireUser()
    const result = await createPresignedAvatarUploadUrl(user.id, contentType, contentLength)
    if ('error' in result) {
        return { error: avatarUploadErrorMessage(result.error) }
    }
    return result
}

export async function saveAvatarUrl(url: string) {
    const user = await requireUser()
    return updateAvatarUrl(user.id, url)
}

export async function saveFavoriteGames(gameIds: string[]) {
    const user = await requireUser()
    return updateFavoriteGames(user.id, gameIds)
}

export async function togglePrivacyAction(currentPrivacy: boolean, type: string) {
    const user = await requireUser()
    return updatePrivacy(!currentPrivacy, type, user.id)
}

export async function saveUsername(username: string) {
    const user = await requireUser()
    return updateUsername(user.id, username)
}

export async function saveBio(bio: string) {
    const user = await requireUser()
    return updateBio(user.id, bio)
}

export async function saveSelectedTitle(title: string) {
    const user = await requireUser()
    return updateSelectedTitle(user.id, title)
}

export async function saveLoadoutBio(bio: string) {
    const user = await requireUser()
    return updateLoadoutBio(user.id, bio)
}

export async function clearLoadout() {
    const user = await requireUser()
    return clearLoadoutIdentity(user.id)
}

export async function toggleFollow(targetUserId: string, isFollowing: boolean) {
    const user = await requireUser()
    return isFollowing ? unfollowUser(user.id, targetUserId) : followUser(user.id, targetUserId)
}

// Unlike toggleFollow above, this web action path has no /api/v1 route or
// shared withAuth wrapper enforcing a rate limit for it, so it must consume
// the write budget itself before mutating. See
// test/app/moderation-actions-rate-limit.test.ts.
export async function toggleBlock(targetUserId: string, isBlocked: boolean) {
    const user = await requireUser()
    await consumeWriteRateLimit(user.id)
    return isBlocked ? unblockUser(user.id, targetUserId) : blockUser(user.id, targetUserId)
}
