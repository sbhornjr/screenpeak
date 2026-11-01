import 'server-only'
import { eq } from 'drizzle-orm'
import { users } from '@/db/schema'
import { db } from '@/lib/db'
import { parseDbTimestamp } from '@screenpeak/shared/dates'
import { buildLoadoutInput, generateLoadoutIdentity } from '@/lib/loadout'
import { logger } from '@/lib/logger'

/** One generation per minute, per user. */
export const READOUT_COOLDOWN_MS = 60_000
/** Ratings a player needs before a Read-out. */
export const READOUT_MIN_RATINGS = 5

export type ReadoutOutcome =
    | { ok: true, identity: string }
    | { ok: false, reason: 'no_profile' | 'not_eligible' | 'generation_failed' | 'save_failed' }
    | { ok: false, reason: 'too_soon', retryAfter: number }

// Generates and saves the AI Read-out paragraph for one user, on demand only.
// The stats are recomputed here from that user's own rows so a caller cannot
// spoof them. The website's POST /api/loadout and the phone's
// POST /api/v1/me/loadout both call this and shape their own responses.
export async function generateReadout(userId: string): Promise<ReadoutOutcome> {
    const rows = await db
        .select({ username: users.username, loadoutIdentityAt: users.loadoutIdentityAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    const current = rows[0]
    if (!current?.username) return { ok: false, reason: 'no_profile' }

    if (current.loadoutIdentityAt) {
        const waited = Date.now() - parseDbTimestamp(current.loadoutIdentityAt).getTime()
        if (waited < READOUT_COOLDOWN_MS) {
            return { ok: false, reason: 'too_soon', retryAfter: Math.max(1, Math.ceil((READOUT_COOLDOWN_MS - waited) / 1000)) }
        }
    }

    const input = await buildLoadoutInput(userId, current.username)
    if (input.totalRatings < READOUT_MIN_RATINGS) return { ok: false, reason: 'not_eligible' }

    const identity = await generateLoadoutIdentity(input)
    if (!identity) {
        logger.error('loadout-identity', 'Generation returned empty', { userId })
        return { ok: false, reason: 'generation_failed' }
    }

    try {
        await db
            .update(users)
            .set({ loadoutIdentity: identity, loadoutIdentityAt: new Date().toISOString() })
            .where(eq(users.id, userId))
    } catch (error) {
        logger.error('loadout-identity', 'Failed to save identity', {
            userId, error: error instanceof Error ? error.message : String(error),
        })
        return { ok: false, reason: 'save_failed' }
    }
    return { ok: true, identity }
}
