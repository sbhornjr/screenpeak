import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TrendingGame, TrendingList, RecommendedGame, RecommendedList, RecommendedUser } from '@screenpeak/shared/types'

export async function getTrendingGames(viewerId: string | null | undefined, days: number): Promise<TrendingGame[]> {
    try {
        const rows = await db.execute(sql`
            select * from get_trending_games(p_days => ${days}, p_limit => 10, p_user_id => ${viewerId ?? null})
        `)
        return rows as unknown as TrendingGame[]
    } catch {
        return []
    }
}

export async function getTrendingLists(viewerId: string | null | undefined, days: number): Promise<TrendingList[]> {
    try {
        const rows = await db.execute(sql`
            select * from get_trending_lists(p_days => ${days}, p_limit => 10, p_user_id => ${viewerId ?? null})
        `)
        return rows as unknown as TrendingList[]
    } catch {
        return []
    }
}

export async function getExploreRecommendations(viewerId: string | null | undefined) {
    const [gameRows, listRows, userRows] = await Promise.all([
        db.execute(sql`select * from get_follow_recommendations(p_user_id => ${viewerId ?? null}, p_limit => 10)`).catch(() => []),
        db.execute(sql`select * from get_recommended_lists(p_user_id => ${viewerId ?? null}, p_limit => 5)`).catch(() => []),
        db.execute(sql`select * from get_who_to_follow(p_user_id => ${viewerId ?? null}, p_limit => 5)`).catch(() => []),
    ])

    return {
        games: gameRows as unknown as RecommendedGame[],
        lists: listRows as unknown as RecommendedList[],
        users: userRows as unknown as RecommendedUser[],
    }
}
