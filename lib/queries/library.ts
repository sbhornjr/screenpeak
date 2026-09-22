import { eq, and, desc, asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { libraryEntries } from '@/db/schema'
import { LibraryData, EsrbRatingsData } from '@/types'
import { SteamLinkEntry } from '@/types'

const LIBRARY_ENTRY_COLUMNS = {
    id: libraryEntries.id,
    status: libraryEntries.status,
    completed_all_achievements: libraryEntries.completedAllAchievements,
    hours_played: libraryEntries.hoursPlayed,
    play_count: libraryEntries.playCount,
}

export async function getLibraryEntry(userId: string, gameId: string | number) {
    try {
        const rows = await db
            .select(LIBRARY_ENTRY_COLUMNS)
            .from(libraryEntries)
            .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, String(gameId))))
            .limit(1)

        return rows[0] ?? null
    } catch {
        return null
    }
}

type LibraryEntryFields = {
    status: string
    is100: boolean
    hours: number | null
    playedCount: number
}

export async function createLibraryEntry(userId: string, gameId: number, fields: LibraryEntryFields) {
    try {
        const rows = await db
            .insert(libraryEntries)
            .values({
                userId,
                gameId: String(gameId),
                status: fields.status,
                completedAllAchievements: fields.is100,
                hoursPlayed: fields.hours != null ? String(fields.hours) : null,
                playCount: fields.playedCount,
            })
            .returning(LIBRARY_ENTRY_COLUMNS)

        return rows[0] ?? null
    } catch {
        return null
    }
}

export async function updateLibraryEntry(userId: string, gameId: number, fields: LibraryEntryFields) {
    try {
        const rows = await db
            .update(libraryEntries)
            .set({
                status: fields.status,
                completedAllAchievements: fields.is100,
                hoursPlayed: fields.hours != null ? String(fields.hours) : null,
                playCount: fields.playedCount,
            })
            .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, String(gameId))))
            .returning(LIBRARY_ENTRY_COLUMNS)

        return rows[0] ?? null
    } catch {
        return null
    }
}

export async function upsertLibraryEntries(userId: string, entries: SteamLinkEntry[]) {
    const toUpsert = entries.map(sle => ({
        userId,
        gameId: String(sle.gameId),
        status: sle.status,
        hoursPlayed: sle.playtimeSelected != null ? String(sle.playtimeSelected) : null,
        playCount: sle.timesPlayed ?? 0,
        completedAllAchievements: sle.completedAllAchievements,
    }))

    try {
        return await db
            .insert(libraryEntries)
            .values(toUpsert)
            .onConflictDoUpdate({
                target: [libraryEntries.userId, libraryEntries.gameId],
                set: {
                    status: sql`excluded.status`,
                    hoursPlayed: sql`excluded.hours_played`,
                    playCount: sql`excluded.play_count`,
                    completedAllAchievements: sql`excluded.completed_all_achievements`,
                },
            })
            .returning(LIBRARY_ENTRY_COLUMNS)
    } catch (error) {
        console.error("Failed to import library entries from Steam:", error)
        throw error
    }
}

export async function deleteLibraryEntry(entryId: string, userId: string) {
    try {
        await db.delete(libraryEntries).where(and(eq(libraryEntries.id, entryId), eq(libraryEntries.userId, userId)))
    } catch {
        // Original supabase-js version never checked/surfaced delete errors either — fire and forget.
    }
}

type LibraryEntriesFilter = {
    status?: string
    is100?: boolean
    sort?: string
    order?: string
}

export async function getLibraryEntries(userId: string, filter: LibraryEntriesFilter) {
    const conditions = [eq(libraryEntries.userId, userId)]
    if (filter.status) conditions.push(eq(libraryEntries.status, filter.status))
    if (filter.is100) conditions.push(eq(libraryEntries.completedAllAchievements, true))

    let query = db
        .select({
            game_id: libraryEntries.gameId,
            status: libraryEntries.status,
            created_at: libraryEntries.createdAt,
            completed_all_achievements: libraryEntries.completedAllAchievements,
            hours_played: libraryEntries.hoursPlayed,
            play_count: libraryEntries.playCount,
        })
        .from(libraryEntries)
        .where(and(...conditions))
        .$dynamic()

    if (filter.sort === 'date_added') {
        query = query.orderBy(filter.order === 'asc' ? asc(libraryEntries.createdAt) : desc(libraryEntries.createdAt))
    }

    try {
        return await query
    } catch {
        return []
    }
}

export async function getLibraryFacets(userId: string) {
    const [genresRows, platformsRows, developersRows, publishersRows, esrbRows] = await Promise.all([
        db.execute(sql`select * from get_library_genres(p_user_id => ${userId})`).catch(() => []),
        db.execute(sql`select * from get_library_platforms(p_user_id => ${userId})`).catch(() => []),
        db.execute(sql`select * from get_library_developers(p_user_id => ${userId})`).catch(() => []),
        db.execute(sql`select * from get_library_publishers(p_user_id => ${userId})`).catch(() => []),
        db.execute(sql`select * from get_library_esrb_ratings(p_user_id => ${userId})`).catch(() => []),
    ])

    return {
        genres: genresRows as unknown as LibraryData[],
        platforms: platformsRows as unknown as LibraryData[],
        developers: developersRows as unknown as LibraryData[],
        publishers: publishersRows as unknown as LibraryData[],
        esrbRatings: (esrbRows as unknown as EsrbRatingsData[]).map(r => r.esrb_rating),
    }
}

export async function getLibraryStatusBreakdown(userId: string) {
    try {
        const rows = await db
            .select({ status: libraryEntries.status })
            .from(libraryEntries)
            .where(eq(libraryEntries.userId, userId))

        return { entries: rows, totalCount: rows.length }
    } catch {
        return { entries: [], totalCount: 0 }
    }
}
