import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { FeedItem } from '@screenpeak/shared/types'

export async function getFeed(
    userId: string | undefined,
    limit?: number,
    offset?: number,
): Promise<FeedItem[]> {
    try {
        const rows = await db.execute(sql`
            select * from get_feed(
                p_user_id => ${userId ?? null},
                p_limit => ${limit ?? 20},
                p_offset => ${offset ?? 0}
            )
        `)
        return rows as unknown as FeedItem[]
    } catch {
        return []
    }
}
