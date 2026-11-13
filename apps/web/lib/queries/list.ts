import 'server-only'
import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { uuidArrayParam } from '@/lib/sql-helpers'
import { db } from '@/lib/db'
import { lists, listGames, listLikes, games, users } from '@/db/schema'
import { GameCover, ListDetail, ListGameEntry } from '@screenpeak/shared/types'
import { listFieldsSchema, parseOrError } from '@screenpeak/shared/schemas'
import { sendPushNotification } from '@/lib/queries/push'
import { WRITE_REFUSED, writeErrorText } from '@/lib/write-http'

export async function getUserLists(userId: string | null | undefined, includePrivate: boolean) {
    // A database error must reject. Returning [] makes an outage look like
    // a player who has no lists.
    return await db.execute(sql`select * from get_user_lists(p_user_id => ${userId ?? null}, p_include_private => ${includePrivate})`)
}

export async function getLikedLists(userId: string) {
    // A database error must reject. Returning [] makes an outage look like no liked lists.
    return await db.execute(sql`select * from get_liked_lists(p_user_id => ${userId})`)
}

export async function getListById(listId: string): Promise<ListDetail | null> {
    // A database error must reject. Returning null makes an outage look like a missing list.
    const rows = await db
        .select({
            id: lists.id,
            user_id: lists.userId,
            name: lists.name,
            description: lists.description,
            is_public: lists.isPublic,
            is_pinned: lists.isPinned,
            is_default: lists.isDefault,
            created_at: lists.createdAt,
            updated_at: lists.updatedAt,
        })
        .from(lists)
        .where(eq(lists.id, listId))
        .limit(1)

    return (rows[0] as unknown as ListDetail) ?? null
}

export async function getListGames(listId: string): Promise<ListGameEntry[]> {
    // A database error must reject. Returning [] makes an outage look like an empty list.
    const rows = await db
        .select({
            games: {
                id: games.id, name: games.name, slug: games.slug,
                cover_image_url: games.coverImageUrl, released: games.released,
            },
        })
        .from(listGames)
        .innerJoin(games, eq(listGames.gameId, games.id))
        .where(eq(listGames.listId, listId))
        .orderBy(listGames.position)

    return rows as unknown as ListGameEntry[]
}

export async function getListCoverMap(listIds: (string | number)[]): Promise<Map<string, GameCover[]>> {
    // A database error must reject. An empty map would look like lists with no covers.
    const rows = await db
        .select({
            list_id: listGames.listId,
            position: listGames.position,
            games: { cover_image_url: games.coverImageUrl, slug: games.slug },
        })
        .from(listGames)
        .innerJoin(games, eq(listGames.gameId, games.id))
        .where(inArray(listGames.listId, listIds.map(String)))
        .orderBy(listGames.position)

    const coversByList = new Map<string, GameCover[]>()

    for (const entry of rows) {
        const existing = coversByList.get(entry.list_id) ?? []
        if (existing.length < 5) {
            existing.push({
                coverImageUrl: entry.games?.cover_image_url ?? null,
                slug: entry.games?.slug ?? null,
            })
            coversByList.set(entry.list_id, existing)
        }
    }

    return coversByList
}

export type ListLikeStat = { like_count: number; viewer_has_liked: boolean }

/** Counts only. A database error rejects. An id with no likes is absent from the map. */
export async function getListLikeStats(listIds: string[], viewerId: string | null): Promise<Map<string, ListLikeStat>> {
    const stats = new Map<string, ListLikeStat>()
    if (listIds.length === 0) return stats

    const liked = viewerId
        ? sql`coalesce(bool_or(user_id = ${viewerId}), false)`
        : sql`false`
    const rows = await db.execute(sql`
        select list_id::text as list_id,
               count(*) as like_count,
               ${liked} as viewer_has_liked
        from list_likes
        where list_id = any(${uuidArrayParam(listIds)})
        group by list_id
    `) as unknown as { list_id: string; like_count: number; viewer_has_liked: boolean }[]

    for (const row of rows) {
        stats.set(String(row.list_id), {
            like_count: row.like_count,
            viewer_has_liked: row.viewer_has_liked === true,
        })
    }
    return stats
}

export async function getListLikes(listIds: (string | number)[]) {
    try {
        return await db
            .select({ list_id: listLikes.listId, user_id: listLikes.userId })
            .from(listLikes)
            .where(inArray(listLikes.listId, listIds.map(String)))
    } catch {
        return []
    }
}

export async function getGameListMembership(gameId: string, listIds: (string | number)[]): Promise<Set<string>> {
    if (listIds.length === 0) return new Set()
    // A database error must reject. An empty set would look like "in no lists".
    const rows = await db
        .select({ list_id: listGames.listId })
        .from(listGames)
        .where(and(eq(listGames.gameId, gameId), inArray(listGames.listId, listIds.map(String))))

    return new Set(rows.map(g => g.list_id))
}

export async function addGameToList(listId: string, gameId: string, userId: string) {
    try {
        const owner = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, listId), eq(lists.userId, userId))).limit(1)
        if (owner.length === 0) return { error: WRITE_REFUSED.listNotFound }

        const maxPosRows = await db
            .select({ position: listGames.position })
            .from(listGames)
            .where(eq(listGames.listId, listId))
            .orderBy(desc(listGames.position))
            .limit(1)

        await db.insert(listGames).values({ listId, gameId, position: (maxPosRows[0]?.position ?? -1) + 1 }).onConflictDoNothing()
        return { error: null }
    } catch (error) {
        return { error: writeErrorText(error) }
    }
}

export async function removeGameFromList(listId: string, gameId: string, userId: string) {
    try {
        const owner = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, listId), eq(lists.userId, userId))).limit(1)
        if (owner.length === 0) return { error: WRITE_REFUSED.listNotFound }

        await db.delete(listGames).where(and(eq(listGames.listId, listId), eq(listGames.gameId, gameId)))
        return { error: null }
    } catch (error) {
        return { error: writeErrorText(error) }
    }
}

type ListFields = {
    name: string
    description: string
    isPublic: boolean
    isPinned: boolean
}

export async function createList(userId: string, fields: ListFields) {
    const parsed = parseOrError(listFieldsSchema, fields)
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db
            .insert(lists)
            .values({ userId, name: parsed.data.name, description: parsed.data.description, isPublic: parsed.data.isPublic, isPinned: parsed.data.isPinned })
            .returning({ id: lists.id })

        return { data: rows[0], error: null }
    } catch (error) {
        return { data: null, error: writeErrorText(error) }
    }
}

/** Creates a list and puts one game on it. Both writes commit together or not at all. */
export async function createListWithGame(userId: string, gameId: string, fields: ListFields) {
    const parsed = parseOrError(listFieldsSchema, fields)
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const list = await db.transaction(async (tx) => {
            const rows = await tx
                .insert(lists)
                .values({
                    userId,
                    name: parsed.data.name,
                    description: parsed.data.description,
                    isPublic: parsed.data.isPublic,
                    isPinned: parsed.data.isPinned,
                })
                .returning({ id: lists.id })
            const created = rows[0]
            if (!created) throw new Error('Could not create the list.')
            await tx.insert(listGames).values({ listId: created.id, gameId, position: 0 })
            return created
        })
        return { data: list, error: null }
    } catch (error) {
        return { data: null, error: writeErrorText(error) }
    }
}

export async function updateList(listId: string, fields: ListFields, userId: string) {
    const parsed = parseOrError(listFieldsSchema, fields)
    if (!parsed.success) return { error: parsed.error }

    try {
        const rows = await db
            .update(lists)
            .set({ name: parsed.data.name, description: parsed.data.description, isPublic: parsed.data.isPublic, isPinned: parsed.data.isPinned })
            .where(and(eq(lists.id, listId), eq(lists.userId, userId)))
            .returning({ id: lists.id })
        if (rows.length === 0) return { error: WRITE_REFUSED.listNotFound }
        return { error: null }
    } catch (error) {
        return { error: writeErrorText(error) }
    }
}

// Transactional — the original supabase-js version ran the remove and the add as two
// independent Promise.all() calls with no atomicity; a failure partway through could
// leave a list half-updated. This wraps both writes in one db.transaction().
export async function syncListGames(listId: string, { toAdd, toRemove }: { toAdd: { id: string }[], toRemove: { id: string }[] }, userId: string) {
    try {
        await db.transaction(async (tx) => {
            const owner = await tx.select({ id: lists.id }).from(lists).where(and(eq(lists.id, listId), eq(lists.userId, userId))).limit(1)
            if (owner.length === 0) throw new Error(WRITE_REFUSED.listNotFound)

            const maxPosRows = await tx
                .select({ position: listGames.position })
                .from(listGames)
                .where(eq(listGames.listId, listId))
                .orderBy(desc(listGames.position))
                .limit(1)

            const startPosition = (maxPosRows[0]?.position ?? -1) + 1

            if (toRemove.length > 0) {
                await tx.delete(listGames).where(and(inArray(listGames.gameId, toRemove.map(g => g.id)), eq(listGames.listId, listId)))
            }
            const additions = [...new Map(toAdd.map(game => [game.id, game])).values()]
            if (additions.length > 0) {
                await tx.insert(listGames).values(additions.map((game, index) => ({
                    listId,
                    gameId: game.id,
                    position: startPosition + index,
                }))).onConflictDoNothing()
            }
        })

        return { error: null }
    } catch (error) {
        return { error: writeErrorText(error) }
    }
}

export async function likeList(listId: string, userId: string) {
    try {
        const list = await db
            .select({ id: lists.id, name: lists.name, isPublic: lists.isPublic, userId: lists.userId })
            .from(lists)
            .where(eq(lists.id, listId))
            .limit(1)
        const row = list[0]
        // Someone else's private list is the same answer as a missing list, and no like row is written.
        if (!row || (!row.isPublic && row.userId !== userId)) return { error: WRITE_REFUSED.listNotFound }
        if (row.userId === userId) return { error: WRITE_REFUSED.ownList }
        // A retry must stay liked. The primary key makes a second insert a no-op,
        // so only a genuinely new like notifies the list's owner.
        const inserted = await db.insert(listLikes).values({ listId, userId })
            .onConflictDoNothing()
            .returning({ userId: listLikes.userId })
        if (inserted.length > 0) {
            const [liker] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1)
            const [owner] = await db.select({ username: users.username }).from(users).where(eq(users.id, row.userId)).limit(1)
            if (liker && owner) {
                await sendPushNotification(row.userId, {
                    title: 'List liked',
                    body: `${liker.username} liked your list "${row.name}"`,
                    data: { url: `/user/${owner.username}/lists/${listId}` },
                })
            }
        }
        return { error: null }
    } catch (error) {
        return { error: writeErrorText(error) }
    }
}

export async function unlikeList(listId: string, userId: string) {
    try {
        await db.delete(listLikes).where(and(eq(listLikes.listId, listId), eq(listLikes.userId, userId)))
        return { error: null }
    } catch (error) {
        return { error: writeErrorText(error) }
    }
}

/** Deletes the caller's non-default list. A miss, another owner, or a default list is 'List not found'. */
export async function deleteList(listId: string, userId: string) {
    try {
        const rows = await db
            .delete(lists)
            .where(and(eq(lists.id, listId), eq(lists.userId, userId), eq(lists.isDefault, false)))
            .returning({ id: lists.id })
        if (rows.length === 0) return { error: WRITE_REFUSED.listNotFound }
        return { error: null }
    } catch (error) {
        return { error: writeErrorText(error) }
    }
}

export async function setListPinned(listId: string | number, pinned: boolean, userId: string) {
    try {
        const rows = await db
            .update(lists)
            .set({ isPinned: pinned })
            .where(and(eq(lists.id, String(listId)), eq(lists.userId, userId)))
            .returning({ is_pinned: lists.isPinned })

        if (rows.length === 0) return { isPinned: undefined, error: WRITE_REFUSED.listNotFound }
        return { isPinned: rows[0]?.is_pinned, error: null }
    } catch (error) {
        return { isPinned: undefined, error: writeErrorText(error) }
    }
}
