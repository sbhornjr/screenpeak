import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { lists, listGames, listLikes, games } from '@/db/schema'
import { GameCover, ListDetail, ListGameEntry } from '@screenpeak/shared/types'
import { listFieldsSchema, parseOrError } from '@screenpeak/shared/schemas'

export async function getUserLists(userId: string | null | undefined, includePrivate: boolean) {
    // A database error must reject. Returning [] makes an outage look like
    // a player who has no lists.
    return await db.execute(sql`select * from get_user_lists(p_user_id => ${userId ?? null}, p_include_private => ${includePrivate})`)
}

export async function getLikedLists(userId: string) {
    try {
        return await db.execute(sql`select * from get_liked_lists(p_user_id => ${userId})`)
    } catch {
        return []
    }
}

export async function getListById(listId: string): Promise<ListDetail | null> {
    try {
        const rows = await db
            .select({
                id: lists.id,
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
    } catch {
        return null
    }
}

export async function getListGames(listId: string): Promise<ListGameEntry[]> {
    try {
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
    } catch {
        return []
    }
}

export async function getListCoverMap(listIds: (string | number)[]): Promise<Map<string, GameCover[]>> {
    try {
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
    } catch {
        return new Map()
    }
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
    try {
        const rows = await db
            .select({ list_id: listGames.listId })
            .from(listGames)
            .where(and(eq(listGames.gameId, gameId), inArray(listGames.listId, listIds.map(String))))

        return new Set(rows.map(g => g.list_id))
    } catch {
        return new Set()
    }
}

export async function addGameToList(listId: string, gameId: string, userId: string) {
    try {
        const owner = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, listId), eq(lists.userId, userId))).limit(1)
        if (owner.length === 0) return { error: 'List not found' }

        const maxPosRows = await db
            .select({ position: listGames.position })
            .from(listGames)
            .where(eq(listGames.listId, listId))
            .orderBy(desc(listGames.position))
            .limit(1)

        await db.insert(listGames).values({ listId, gameId, position: (maxPosRows[0]?.position ?? -1) + 1 })
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function removeGameFromList(listId: string, gameId: string, userId: string) {
    try {
        const owner = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, listId), eq(lists.userId, userId))).limit(1)
        if (owner.length === 0) return { error: 'List not found' }

        await db.delete(listGames).where(and(eq(listGames.listId, listId), eq(listGames.gameId, gameId)))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
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
        return { data: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateList(listId: string, fields: ListFields, userId: string) {
    const parsed = parseOrError(listFieldsSchema, fields)
    if (!parsed.success) return { error: parsed.error }

    try {
        await db
            .update(lists)
            .set({ name: parsed.data.name, description: parsed.data.description, isPublic: parsed.data.isPublic, isPinned: parsed.data.isPinned })
            .where(and(eq(lists.id, listId), eq(lists.userId, userId)))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

// Transactional — the original supabase-js version ran the remove and the add as two
// independent Promise.all() calls with no atomicity; a failure partway through could
// leave a list half-updated. This wraps both writes in one db.transaction().
export async function syncListGames(listId: string, { toAdd, toRemove }: { toAdd: { id: string }[], toRemove: { id: string }[] }, userId: string) {
    try {
        await db.transaction(async (tx) => {
            const owner = await tx.select({ id: lists.id }).from(lists).where(and(eq(lists.id, listId), eq(lists.userId, userId))).limit(1)
            if (owner.length === 0) throw new Error('List not found')

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
            if (toAdd.length > 0) {
                await tx.insert(listGames).values(toAdd.map((game, index) => ({
                    listId,
                    gameId: game.id,
                    position: startPosition + index,
                })))
            }
        })

        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function likeList(listId: string, userId: string) {
    try {
        await db.insert(listLikes).values({ listId, userId })
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function unlikeList(listId: string, userId: string) {
    try {
        await db.delete(listLikes).where(and(eq(listLikes.listId, listId), eq(listLikes.userId, userId)))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function setListPinned(listId: string | number, pinned: boolean, userId: string) {
    try {
        const rows = await db
            .update(lists)
            .set({ isPinned: pinned })
            .where(and(eq(lists.id, String(listId)), eq(lists.userId, userId)))
            .returning({ is_pinned: lists.isPinned })

        return { isPinned: rows[0]?.is_pinned, error: null }
    } catch (error) {
        return { isPinned: undefined, error: error instanceof Error ? error.message : String(error) }
    }
}
