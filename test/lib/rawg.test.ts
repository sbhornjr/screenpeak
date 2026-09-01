import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importGameFromSteam } from '@/lib/rawg'

// Seam: importGameFromSteam(supabase, gameName, steamAppId).
// Observable behaviour = "which RAWG candidate (if any) gets seeded" for a
// given Steam game name. RAWG is reached over `fetch` (HTTP boundary, mocked);
// Supabase is a DB boundary, faked with a minimal chainable stub.

type Candidate = { id: number; slug: string; name: string }

function fakeSupabase() {
    const chain: Record<string, unknown> = {}
    Object.assign(chain, {
        upsert: vi.fn(() => chain),
        select: vi.fn(() => chain),
        single: vi.fn(async () => ({ data: { id: 'game-uuid' }, error: null })),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    })
    return { from: vi.fn(() => chain), chain }
}

function stubRawg(candidates: Candidate[]) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string | URL) => {
            const u = String(url)
            // detail lookup: /api/games/<slug>?...  — list lookup: /api/games?...
            const body = u.includes('/api/games/') ? {} : { results: candidates }
            return new Response(JSON.stringify(body), {
                headers: { 'content-type': 'application/json' },
            })
        }),
    )
}

describe('importGameFromSteam', () => {
    let db: ReturnType<typeof fakeSupabase>

    beforeEach(() => {
        db = fakeSupabase()
    })

    it('seeds the exact-name match and tags it with the Steam appid', async () => {
        stubRawg([{ id: 1, slug: 'hades', name: 'Hades' }])

        const result = await importGameFromSteam(db as never, 'Hades', 1145360)

        expect(result).toEqual({ id: 'game-uuid' })
        expect(db.chain.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ rawg_id: 1, name: 'Hades', slug: 'hades', steam_appid: 1145360 }),
            expect.anything(),
        )
    })

    it('matches roman-numeral sequels against arabic ones ("Blasphemous 2" ~ "Blasphemous II")', async () => {
        stubRawg([{ id: 2, slug: 'blasphemous-ii', name: 'Blasphemous II' }])

        const result = await importGameFromSteam(db as never, 'Blasphemous 2', 1)

        expect(result).toEqual({ id: 'game-uuid' })
    })

    it('matches across diacritics ("ABZU" ~ "ABZÛ")', async () => {
        stubRawg([{ id: 3, slug: 'abzu', name: 'ABZÛ' }])

        const result = await importGameFromSteam(db as never, 'ABZU', 1)

        expect(result).toEqual({ id: 'game-uuid' })
    })

    it('matches when RAWG carries a "(YYYY)" disambiguator that Steam omits', async () => {
        stubRawg([{ id: 4, slug: 'dead-space-2008', name: 'Dead Space (2008)' }])

        const result = await importGameFromSteam(db as never, 'Dead Space', 1)

        expect(result).toEqual({ id: 'game-uuid' })
    })

    it('matches when Steam carries a "(YYYY)" suffix that RAWG omits', async () => {
        stubRawg([{ id: 5, slug: 'system-shock-2', name: 'System Shock 2' }])

        const result = await importGameFromSteam(db as never, 'System Shock 2 (1999)', 1)

        expect(result).toEqual({ id: 'game-uuid' })
    })

    it('returns null and seeds nothing when no candidate is a confident match', async () => {
        stubRawg([{ id: 9, slug: 'other', name: 'A Totally Different Title' }])
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await importGameFromSteam(db as never, 'Some Fake Game', 999)

        expect(result).toBeNull()
        expect(db.chain.upsert).not.toHaveBeenCalled()
        expect(errSpy).toHaveBeenCalled()
    })
})
