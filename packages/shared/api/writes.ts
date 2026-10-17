// Write contracts for /api/v1. Field names on library rows match ViewerLibraryEntry.
// List field names match the website's list form (isPublic, isPinned).
import type { ViewerLibraryEntry } from './games'

export type RatingWrite = {
    rating: number
    review: string
}

export type RatingWriteResult = {
    rating: number
    review: string | null
    user_id: string
    created_at: string | null
    updated_at: string | null
}

export type LibraryStatus = 'playing' | 'completed' | 'backlog' | 'abandoned'

export type LibraryWrite = {
    status: LibraryStatus
    completed_all_achievements?: boolean
    hours_played?: number | null
    play_count?: number
}

export type LibraryWriteResult = ViewerLibraryEntry

export type ListWrite = {
    name: string
    description: string
    isPublic: boolean
    isPinned: boolean
    /** When set, POST /api/v1/lists creates the list and adds this game. */
    gameId?: string
}

export type ListCreated = { id: string }

export type ListPinWrite = { isPinned: boolean }

export type ListGameSync = {
    toAdd: { id: string }[]
    toRemove: { id: string }[]
}

export type ListLikeResult = { liked: boolean }

export type OkResult = { ok: true }

export type MePatch = {
    username?: string
    bio?: string
    selectedTitle?: string
    loadoutBio?: string
    favoriteGames?: string[]
    privacy?: { type: 'Default List' | 'Library' | 'Loadout'; public: boolean }
}

export type AvatarUploadRequest = {
    contentType: string
    contentLength: number
}

export type AvatarUploadResult = {
    uploadUrl: string
    publicUrl: string
}

export type AvatarSave = { url: string }

export type FollowResult = { following: boolean }

export type SteamLibraryImportEntry = {
    gameId: string
    playtimeSelected: number
    status: LibraryStatus
    selected: boolean
    coverImageUrl: string | null
    gameName: string
    gameDeveloper: string
    gameReleased: string | null
    timesPlayed?: number
    completedAllAchievements: boolean
    steamPlaytimeMinutes?: number | null
}
