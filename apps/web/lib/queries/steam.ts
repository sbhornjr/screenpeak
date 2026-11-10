import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { steamAccounts } from '@/db/schema'
import { logger } from '@/lib/logger'

export async function getSteamAccount(userId: string) {
    // A database error must reject. Null is "Steam is not linked", not an outage.
    const rows = await db
        .select({
            steam_id: steamAccounts.steamId,
            linked_at: steamAccounts.linkedAt,
            last_synced_at: steamAccounts.lastSyncedAt,
            profile_public: steamAccounts.profilePublic,
        })
        .from(steamAccounts)
        .where(eq(steamAccounts.userId, userId))
        .limit(1)

    return rows[0] ?? null
}

export async function upsertSteamAccount(userId: string, steamId64: string) {
    try {
        const rows = await db
            .insert(steamAccounts)
            .values({ userId, steamId: steamId64, linkedAt: new Date().toISOString() })
            .onConflictDoUpdate({
                target: steamAccounts.userId,
                set: { steamId: steamId64, linkedAt: new Date().toISOString() },
            })
            .returning({ steam_id: steamAccounts.steamId, linked_at: steamAccounts.linkedAt })

        return { data: rows[0] ?? null, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function unlinkSteamAccount(userId: string) {
    try {
        await db.delete(steamAccounts).where(eq(steamAccounts.userId, userId))
    } catch (error) {
        logger.error('queries:steam', 'Failed to unlink Steam account', { userId, error: error instanceof Error ? error.message : String(error) })
        throw error
    }
}
