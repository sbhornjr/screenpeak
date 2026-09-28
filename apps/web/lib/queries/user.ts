import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, follows } from '@/db/schema'
import {
    usernameSchema, bioSchema,
    selectedTitleSchema, favoriteGameIdsSchema, privacyTypeSchema, parseOrError,
} from '@screenpeak/shared/schemas'

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

export async function updateLoadoutBio(userId: string, bio: string) {
    const parsed = parseOrError(bioSchema, bio)
    if (!parsed.success) return { error: parsed.error }

    try {
        await db.update(users).set({ profileLoadoutBio: parsed.data }).where(eq(users.id, userId))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function clearLoadoutIdentity(userId: string) {
    try {
        // profileLoadoutBio is nulled too — it's a saved copy of this same AI-generated
        // text shown on the profile page (user.ts:136), so leaving it would mean
        // "clearing" the Read-out doesn't actually remove the AI-generated content.
        await db.update(users)
            .set({ loadoutIdentity: null, loadoutIdentityAt: null, profileLoadoutBio: null })
            .where(eq(users.id, userId))
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

export async function updateAvatarUrl(userId: string, url: string) {
    try {
        await db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId))
        return null
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}

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

// The landing page's sample Loadout. `db` bypasses RLS, so the loadout_public
// check lives here: a private or never-generated Loadout returns null and the
// section hides itself.
export async function getFeaturedLoadout(username: string) {
    try {
        const rows = await db
            .select({ username: users.username, avatar_url: users.avatarUrl, loadout_identity: users.loadoutIdentity })
            .from(users)
            .where(and(eq(users.username, username), eq(users.loadoutPublic, true)))
            .limit(1)

        const row = rows[0]
        return row?.loadout_identity ? { ...row, loadout_identity: row.loadout_identity } : null
    } catch {
        return null
    }
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
