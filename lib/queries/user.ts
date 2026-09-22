import type { SupabaseClient } from '@supabase/supabase-js'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, follows } from '@/db/schema'
import {
    emailSchema, passwordSchema, usernameSchema, bioSchema,
    selectedTitleSchema, favoriteGameIdsSchema, privacyTypeSchema, parseOrError,
} from '@/lib/schemas'

// Unchanged — supabase.auth.getUser() is an Auth call, not a DB read.
// Also called directly from UserContext.tsx ('use client').
export async function getViewer(supabase: SupabaseClient) {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function getProfileSummaryByUsername(username: string) {
    try {
        const rows = await db
            .select({ id: users.id, username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl })
            .from(users)
            .where(eq(users.username, username))
            .limit(1)

        return rows[0] ?? null
    } catch {
        return null
    }
}

// Unchanged — called directly from UserContext.tsx ('use client'), stays on supabase-js.
export async function getProfileSummaryById(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single()

    return data
}

export async function getFullProfile(username: string) {
    try {
        const rows = await db
            .select({
                id: users.id, username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl,
                created_at: users.createdAt, selected_title: users.selectedTitle, favorite_game_ids: users.favoriteGameIds,
                user_bio: users.userBio, default_list_public: users.defaultListPublic, library_public: users.libraryPublic,
                loadout_public: users.loadoutPublic, profile_loadout_bio: users.profileLoadoutBio,
            })
            .from(users)
            .where(eq(users.username, username))
            .limit(1)

        return rows[0] ?? null
    } catch {
        return null
    }
}

export async function getUserIdFromUsername(username: string) {
    try {
        const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
        return rows[0] ?? null
    } catch {
        return null
    }
}

export async function getAccountSettings(userId: string) {
    try {
        const rows = await db
            .select({
                id: users.id, username: users.username, avatar_url: users.avatarUrl, selected_title: users.selectedTitle,
                created_at: users.createdAt, default_list_public: users.defaultListPublic,
                library_public: users.libraryPublic, loadout_public: users.loadoutPublic,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)

        return rows[0] ?? null
    } catch {
        return null
    }
}

export async function updateBio(userId: string, bio: string) {
    const parsed = parseOrError(bioSchema, bio)
    if (!parsed.success) return { error: parsed.error }

    try {
        await db.update(users).set({ userBio: parsed.data }).where(eq(users.id, userId))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateUsername(userId: string, username: string) {
    const parsed = parseOrError(usernameSchema, username)
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db.update(users).set({ username: parsed.data }).where(eq(users.id, userId)).returning({ username: users.username })
        return { data: rows[0], error: null }
    } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateSelectedTitle(userId: string, title: string) {
    const parsed = parseOrError(selectedTitleSchema, title)
    if (!parsed.success) return { title: null, error: parsed.error }

    try {
        const rows = await db.update(users).set({ selectedTitle: parsed.data }).where(eq(users.id, userId)).returning({ selected_title: users.selectedTitle })
        return { title: rows[0]?.selected_title, error: null }
    } catch (error) {
        return { title: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateFavoriteGames(userId: string, gameIds: string[]) {
    const parsed = parseOrError(favoriteGameIdsSchema, gameIds)
    if (!parsed.success) return { error: parsed.error }

    try {
        await db.update(users).set({ favoriteGameIds: parsed.data }).where(eq(users.id, userId)).returning({ favorite_game_ids: users.favoriteGameIds })
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

// Unchanged — Supabase Storage, not a Postgres query.
export async function uploadAvatarImage(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
    const filePath = `${userId}/avatar.${file.name.split('.').pop()}`

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

    return publicUrl
}

export async function updateAvatarUrl(userId: string, url: string) {
    try {
        await db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId))
        return null
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}

// Unchanged — Supabase Auth calls, not Postgres queries.
export async function signInWithPassword(supabase: SupabaseClient, email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
}

export async function signUpWithPassword(
    supabase: SupabaseClient,
    { email, password, username }: { email: string, password: string, username: string },
    emailRedirectTo?: string,
) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo }
    })
    return { data, error }
}

export async function signOut(supabase: SupabaseClient) {
    await supabase.auth.signOut()
}

export async function updateEmail(supabase: SupabaseClient, email: string) {
    const parsed = parseOrError(emailSchema, email)
    if (!parsed.success) return parsed.error

    const { error } = await supabase.auth.updateUser({ email: parsed.data })
    return error?.message ?? null
}

export async function updatePassword(supabase: SupabaseClient, password: string) {
    const parsed = parseOrError(passwordSchema, password)
    if (!parsed.success) return parsed.error

    const { error } = await supabase.auth.updateUser({ password: parsed.data })
    return error?.message ?? null
}
// (End of unchanged Auth/Storage block.)

const PRIVACY_COLUMN = {
    'Default List': 'defaultListPublic',
    'Library': 'libraryPublic',
    'Loadout': 'loadoutPublic',
} as const

export async function updatePrivacy(privacy: boolean, type: string, userId: string) {
    const parsed = parseOrError(privacyTypeSchema, type)
    if (!parsed.success) return parsed.error

    try {
        const column = PRIVACY_COLUMN[parsed.data]
        await db.update(users).set({ [column]: privacy }).where(eq(users.id, userId))
        return null
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}

export async function getFollowers(userId: string) {
    try {
        return await db.select({ follower_id: follows.followerId }).from(follows).where(eq(follows.followingId, userId))
    } catch {
        return []
    }
}

export async function getFollowing(userId: string) {
    try {
        return await db.select({ following_id: follows.followingId }).from(follows).where(eq(follows.followerId, userId))
    } catch {
        return []
    }
}

export async function followUser(followerId: string, followingId: string) {
    try {
        await db.insert(follows).values({ followerId, followingId })
    } catch {
        // Original supabase-js version never checked/surfaced this error either — fire and forget.
    }
}

export async function unfollowUser(followerId: string, followingId: string) {
    try {
        await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
    } catch {
        // Original supabase-js version never checked/surfaced this error either — fire and forget.
    }
}

// Unchanged — Supabase Auth admin API, not a Postgres query. public.users cleanup
// happens automatically via the ON DELETE CASCADE FK from auth.users.
export async function deleteUserAccount(adminClient: SupabaseClient, userId: string) {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    return error
}

export async function getCurrentLoadoutIdentity(userId: string) {
    try {
        const rows = await db
            .select({ loadout_identity: users.loadoutIdentity, loadout_identity_at: users.loadoutIdentityAt })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)

        return rows[0] ?? null
    } catch {
        return null
    }
}
