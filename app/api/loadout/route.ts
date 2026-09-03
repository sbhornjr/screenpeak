import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildLoadoutInput, generateLoadoutIdentity } from '@/lib/loadout'
import { logger } from '@/lib/logger'

// Generates the AI "Read-out" paragraph for the logged-in user, on demand only.
// Never called during page render — see app/user/[username]/loadout/page.tsx.
// Takes no body: the caller is identified by their session, and the stats are
// recomputed here from that user's own rows so they can't be spoofed.
export async function POST() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data: current } = await supabase
        .from('users')
        .select('username, loadout_identity_at')
        .eq('id', user.id)
        .single()

    if (!current?.username) {
        return NextResponse.json({ error: 'no profile' }, { status: 400 })
    }

    // One generation per minute, per user.
    if (current.loadout_identity_at &&
        Date.now() - new Date(current.loadout_identity_at).getTime() < 60_000) {
        return NextResponse.json({ error: 'slow down' }, { status: 429 })
    }

    const input = await buildLoadoutInput(supabase, user.id, current.username)
    if (input.totalRatings < 5) {
        return NextResponse.json({ error: 'not eligible' }, { status: 400 })
    }

    const text = await generateLoadoutIdentity(input)
    if (!text) {
        logger.error('loadout-identity', 'Generation returned empty', { userId: user.id })
        return NextResponse.json({ error: 'generation failed' }, { status: 502 })
    }

    const { error } = await supabase
        .from('users')
        .update({ loadout_identity: text, loadout_identity_at: new Date().toISOString() })
        .eq('id', user.id)

    if (error) {
        logger.error('loadout-identity', 'Failed to save identity', {
            userId: user.id, error: error.message,
        })
        return NextResponse.json({ error: 'save failed' }, { status: 500 })
    }

    return NextResponse.json({ text })
}
