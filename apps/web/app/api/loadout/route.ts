import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { generateReadout } from '@/lib/loadout-readout'

// Generates the AI "Read-out" paragraph for the logged-in user, on demand only.
// Never called during page render — see app/user/[username]/loadout/page.tsx.
// Takes no body: the caller is identified by their session. requireUser accepts
// a bearer or a website cookie. The phone calls POST /api/v1/me/loadout, which
// shares generateReadout and answers in the /api/v1 error shape.
const FAILURE = {
    no_profile: { error: 'no profile', status: 400 },
    too_soon: { error: 'slow down', status: 429 },
    not_eligible: { error: 'not eligible', status: 400 },
    generation_failed: { error: 'generation failed', status: 502 },
    save_failed: { error: 'save failed', status: 500 },
} as const

export const POST = withAuth(async () => {
    const user = await requireUser()
    const outcome = await generateReadout(user.id)
    if (outcome.ok) return NextResponse.json({ text: outcome.identity })
    const failure = FAILURE[outcome.reason]
    return NextResponse.json({ error: failure.error }, { status: failure.status })
})
