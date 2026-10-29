import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { users } from '@/db/schema'
import { withAuth } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { parseDbTimestamp } from '@screenpeak/shared/dates'
import { buildLoadoutInput, generateLoadoutIdentity } from '@/lib/loadout'
import { logger } from '@/lib/logger'

// Generates the AI "Read-out" paragraph for the logged-in user, on demand only.
// Never called during page render — see app/user/[username]/loadout/page.tsx.
// Takes no body: the caller is identified by their session, and the stats are
// recomputed here from that user's own rows so they can't be spoofed.
// requireUser accepts a bearer or a website cookie. The row update uses the
// same database client either way, so a phone token and a browser session
// both persist the paragraph.
export const POST = withAuth(async () => {
    const user = await requireUser()

    const rows = await db
        .select({ username: users.username, loadoutIdentityAt: users.loadoutIdentityAt })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1)
    const current = rows[0]

    if (!current?.username) {
        return NextResponse.json({ error: 'no profile' }, { status: 400 })
    }

    // One generation per minute, per user.
    if (current.loadoutIdentityAt &&
        Date.now() - parseDbTimestamp(current.loadoutIdentityAt).getTime() < 60_000) {
        return NextResponse.json({ error: 'slow down' }, { status: 429 })
    }

    const input = await buildLoadoutInput(user.id, current.username)
    if (input.totalRatings < 5) {
        return NextResponse.json({ error: 'not eligible' }, { status: 400 })
    }

    const text = await generateLoadoutIdentity(input)
    if (!text) {
        logger.error('loadout-identity', 'Generation returned empty', { userId: user.id })
        return NextResponse.json({ error: 'generation failed' }, { status: 502 })
    }

    try {
        await db
            .update(users)
            .set({ loadoutIdentity: text, loadoutIdentityAt: new Date().toISOString() })
            .where(eq(users.id, user.id))
    } catch (error) {
        logger.error('loadout-identity', 'Failed to save identity', {
            userId: user.id, error: error instanceof Error ? error.message : String(error),
        })
        return NextResponse.json({ error: 'save failed' }, { status: 500 })
    }

    return NextResponse.json({ text })
})
