import 'server-only'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pushTokens } from '@/db/schema'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api'
import { consumeApiRateLimit } from '@/lib/rate-limit'
import type { PushTokenPlatform } from '@screenpeak/shared/api/push'

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send'

// A shared device (or a stale sign-out) can leave a token pointed at a user
// who no longer owns it, so reassignment is intentional. But reassigning it
// out from under a user who was just active would misdirect their
// notifications, so only steal a token that's gone quiet.
const REASSIGN_AFTER_IDLE = sql`interval '24 hours'`
const MAX_TOKENS_PER_USER = 10

/** Idempotent. Moves the token to a new user only once the previous owner's
 *  session has gone idle for a day — a live session keeps its token. */
export async function registerPushToken(userId: string, token: string, platform: PushTokenPlatform): Promise<void> {
    await db.insert(pushTokens)
        .values({ userId, expoPushToken: token, platform })
        .onConflictDoUpdate({
            target: pushTokens.expoPushToken,
            set: { userId, platform, lastSeenAt: new Date().toISOString() },
            setWhere: sql`${pushTokens.userId} = ${userId} or ${pushTokens.lastSeenAt} < now() - ${REASSIGN_AFTER_IDLE}`,
        })
    await pruneExcessTokens(userId)
}

/** Keeps a single account from accumulating unbounded device rows (old
 *  phones, reinstalls, a buggy client that never unregisters). */
async function pruneExcessTokens(userId: string): Promise<void> {
    const excess = await db.select({ id: pushTokens.id })
        .from(pushTokens)
        .where(eq(pushTokens.userId, userId))
        .orderBy(desc(pushTokens.lastSeenAt))
        .offset(MAX_TOKENS_PER_USER)
    if (excess.length === 0) return
    await db.delete(pushTokens).where(inArray(pushTokens.id, excess.map(row => row.id)))
}

const NOTIFY_WINDOW_SECONDS = 60 * 60

/**
 * Throttles a notification SEND, not the write it follows from — a
 * follow/unfollow or like/unlike cycle still succeeds every time, it just
 * doesn't page the other user's phone more than once per window. Never
 * throws: a bucket over budget just means "don't send this one."
 */
export async function notifyOncePerWindow(bucket: string): Promise<boolean> {
    try {
        await consumeApiRateLimit(`notify:${bucket}`, 1, NOTIFY_WINDOW_SECONDS)
        return true
    } catch (error) {
        if (error instanceof ApiError) return false
        throw error
    }
}

/** Idempotent. Only removes the token if it still belongs to this user. */
export async function unregisterPushToken(userId: string, token: string): Promise<void> {
    await db.delete(pushTokens).where(and(eq(pushTokens.expoPushToken, token), eq(pushTokens.userId, userId)))
}

type ExpoPushTicket = { status: 'ok' | 'error', message?: string, details?: { error?: string } }

/**
 * Never throws — await it inline (a bare un-awaited promise can be cut off
 * once a serverless function's response is sent). A follow or a list like
 * must still succeed even when the push send fails outright, the user has
 * no device registered, or Expo's service is down.
 */
export async function sendPushNotification(
    userId: string,
    message: { title: string, body: string, data?: Record<string, unknown> },
): Promise<void> {
    try {
        const rows = await db.select({ token: pushTokens.expoPushToken }).from(pushTokens).where(eq(pushTokens.userId, userId))
        if (rows.length === 0) return
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(rows.map(row => ({
                to: row.token,
                title: message.title,
                body: message.body,
                data: message.data,
            }))),
        })
        if (!response.ok) {
            logger.error('push', 'Expo push send failed', { status: response.status })
            return
        }
        const result = await response.json() as { data?: ExpoPushTicket[] }
        const tickets = result.data ?? []
        const deadTokens = rows
            .filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered')
            .map(row => row.token)
        if (deadTokens.length > 0) {
            await db.delete(pushTokens).where(inArray(pushTokens.expoPushToken, deadTokens))
        }
    } catch (error) {
        logger.error('push', 'Failed to send push notification', {
            error: error instanceof Error ? error.message : String(error),
        })
    }
}
