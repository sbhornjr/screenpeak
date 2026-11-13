import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pushTokens } from '@/db/schema'
import { logger } from '@/lib/logger'
import type { PushTokenPlatform } from '@screenpeak/shared/api/push'

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send'

/** Idempotent. A re-login on the same device moves the token to the new user. */
export async function registerPushToken(userId: string, token: string, platform: PushTokenPlatform): Promise<void> {
    await db.insert(pushTokens)
        .values({ userId, expoPushToken: token, platform })
        .onConflictDoUpdate({
            target: pushTokens.expoPushToken,
            set: { userId, platform, lastSeenAt: new Date().toISOString() },
        })
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
