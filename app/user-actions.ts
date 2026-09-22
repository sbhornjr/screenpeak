'use server'

import { requireUser } from '@/lib/auth'
import { updateAvatarUrl, updateFavoriteGames, updatePrivacy, updateUsername, updateSelectedTitle, updateBio, followUser, unfollowUser } from '@/lib/queries/user'

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

export async function toggleFollow(targetUserId: string, isFollowing: boolean) {
    const user = await requireUser()
    return isFollowing ? unfollowUser(user.id, targetUserId) : followUser(user.id, targetUserId)
}
