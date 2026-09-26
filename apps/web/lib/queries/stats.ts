import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { GenreStatType, DeveloperStatType, StatusStatType, HighlightType } from '@/types'

export async function getLoadoutGenreStats(userId: string): Promise<GenreStatType[]> {
    try {
        const rows = await db.execute(sql`select * from get_loadout_genre_stats(p_user_id => ${userId})`)
        return rows as unknown as GenreStatType[]
    } catch {
        return []
    }
}

export async function getLoadoutDeveloperStats(userId: string): Promise<DeveloperStatType[]> {
    try {
        const rows = await db.execute(sql`select * from get_loadout_developer_stats(p_user_id => ${userId})`)
        return rows as unknown as DeveloperStatType[]
    } catch {
        return []
    }
}

export async function getLoadoutStatusBreakdown(userId: string): Promise<StatusStatType[]> {
    try {
        const rows = await db.execute(sql`select * from get_loadout_status_breakdown(p_user_id => ${userId})`)
        return rows as unknown as StatusStatType[]
    } catch {
        return []
    }
}

export async function getLoadoutRatingHighlights(userId: string): Promise<HighlightType[]> {
    try {
        const rows = await db.execute(sql`select * from get_loadout_rating_highlights(p_user_id => ${userId})`)
        return rows as unknown as HighlightType[]
    } catch {
        return []
    }
}
