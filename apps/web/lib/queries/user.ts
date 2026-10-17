import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, follows } from '@/db/schema'
import {
    usernameSchema, bioSchema,
    selectedTitleSchema, favoriteGameIdsSchema, privacyTypeSchema, parseOrError,
} from '@screenpeak/shared/schemas'
import { isOwnAvatarUrl } from '@/lib/avatar-upload'
import { writeErrorText } from '@/lib/write-http'

export async function getProfileSummaryByUsername(username: string) {
    // A database error must reject. Returning null makes an outage look like an unknown player.
    const rows = await db
        .select({ id: users.id, username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl })
        .from(users)
        .where(eq(users.username, username))
        .limit(1)

    return rows[0] ?? null
}

export async function getFullProfile(username: string) {
    // A database error must reject. Returning null makes an outage look like an unknown player.
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
}

export async function getProfileById(userId: string) {
    const rows = await db
        .select({
            id: users.id,
            username: users.username,
            display_name: users.displayName,
            avatar_url: users.avatarUrl,
            selected_title: users.selectedTitle,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return rows[0] ?? null
}

export async function getUserIdFromUsername(username: string) {
    // A database error must reject. Returning null makes an outage look like an unknown player.
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
    return rows[0] ?? null
}

export async function getAccountSettings(userId: string) {
    // A database error must reject. Returning null makes a public library or loadout look private.
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
}

// Just the one setting the game page needs (whether a list created there starts
// public), so a game page view doesn't select the whole settings row.
export async function getDefaultListPublic(userId: string): Promise<boolean | null> {
    // A database error must reject. Null is "no row", which the game page treats as public.
    const rows = await db
        .select({ default_list_public: users.defaultListPublic })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return rows[0]?.default_list_public ?? null
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
    // Checked here, not only in the route, so the website action cannot store
    // a URL next/image will refuse for everyone who sees this player.
    if (!isOwnAvatarUrl(url, userId)) return 'That image URL is not your avatar.'
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

type AccountPatch = {
    username?: string
    bio?: string
    selectedTitle?: string
    loadoutBio?: string
    favoriteGames?: string[]
    privacy?: { type: string; public: boolean }
}

/** One transaction so a multi-field PATCH cannot leave a half-applied account. */
export async function patchAccount(userId: string, fields: AccountPatch) {
    const set: {
        username?: string
        userBio?: string
        selectedTitle?: string
        profileLoadoutBio?: string
        favoriteGameIds?: string[]
        defaultListPublic?: boolean
        libraryPublic?: boolean
        loadoutPublic?: boolean
    } = {}

    if (fields.username !== undefined) {
        const parsed = parseOrError(usernameSchema, fields.username)
        if (!parsed.success) return { error: parsed.error }
        set.username = parsed.data
    }
    if (fields.bio !== undefined) {
        const parsed = parseOrError(bioSchema, fields.bio)
        if (!parsed.success) return { error: parsed.error }
        set.userBio = parsed.data
    }
    if (fields.selectedTitle !== undefined) {
        const parsed = parseOrError(selectedTitleSchema, fields.selectedTitle)
        if (!parsed.success) return { error: parsed.error }
        set.selectedTitle = parsed.data
    }
    if (fields.loadoutBio !== undefined) {
        const parsed = parseOrError(bioSchema, fields.loadoutBio)
        if (!parsed.success) return { error: parsed.error }
        set.profileLoadoutBio = parsed.data
    }
    if (fields.favoriteGames !== undefined) {
        const parsed = parseOrError(favoriteGameIdsSchema, fields.favoriteGames)
        if (!parsed.success) return { error: parsed.error }
        set.favoriteGameIds = parsed.data
    }
    if (fields.privacy !== undefined) {
        const parsed = parseOrError(privacyTypeSchema, fields.privacy.type)
        if (!parsed.success) return { error: parsed.error }
        set[PRIVACY_COLUMN[parsed.data]] = fields.privacy.public
    }
    if (Object.keys(set).length === 0) return { error: 'Nothing to update.' }

    try {
        await db.transaction(async (tx) => {
            await tx.update(users).set(set).where(eq(users.id, userId))
        })
        return { error: null }
    } catch (error) {
        return { error: writeErrorText(error) }
    }
}

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

/** Counts and one existence check. A database error rejects. Follower ids are not returned. */
export async function getProfileFollowStats(userId: string, viewerId: string | null) {
    const isFollowing = viewerId
        ? sql`exists (select 1 from follows where following_id = ${userId} and follower_id = ${viewerId})`
        : sql`false`
    const rows = await db.execute(sql`
        select
            (select count(*) from follows where following_id = ${userId}) as follower_count,
            (select count(*) from follows where follower_id = ${userId}) as following_count,
            ${isFollowing} as is_following
    `) as unknown as { follower_count: number; following_count: number; is_following: boolean }[]
    const row = rows[0]
    return {
        follower_count: row?.follower_count ?? 0,
        following_count: row?.following_count ?? 0,
        is_following: row?.is_following === true,
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

export async function userExists(userId: string): Promise<boolean> {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
    return Boolean(rows[0])
}

/** Idempotent. A database error rejects. The caller rejects a self-follow before this. */
export async function followUser(followerId: string, followingId: string) {
    await db.insert(follows).values({ followerId, followingId }).onConflictDoNothing()
}

/** Idempotent. A database error rejects. */
export async function unfollowUser(followerId: string, followingId: string) {
    await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
}

// The landing page's sample Loadout. `db` bypasses RLS, so the loadout_public
// check lives here: a private or never-generated Loadout returns null and the
// section hides itself.
export async function getFeaturedLoadout(username: string) {
    // A database error must reject. Null is "no public Read-out", not an outage.
    const rows = await db
        .select({ username: users.username, avatar_url: users.avatarUrl, loadout_identity: users.loadoutIdentity })
        .from(users)
        .where(and(eq(users.username, username), eq(users.loadoutPublic, true)))
        .limit(1)

    const row = rows[0]
    return row?.loadout_identity ? { ...row, loadout_identity: row.loadout_identity } : null
}

export async function getCurrentLoadoutIdentity(userId: string) {
    // A database error must reject. Null is a player who has not generated a Read-out.
    const rows = await db
        .select({ loadout_identity: users.loadoutIdentity, loadout_identity_at: users.loadoutIdentityAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return rows[0] ?? null
}
