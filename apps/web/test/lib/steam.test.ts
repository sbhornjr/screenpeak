import { describe, it, expect, vi } from 'vitest'
import { getOwnedGames, getPlayerAchievementCompletion, getFullyCompletedAppids } from '@/lib/steam'

// Seam: the three exported Steam Web API helpers. `fetch` is the HTTP boundary
// and is the only thing mocked. Error logging is verified through console.

function jsonResponse(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        ...init,
    })
}

describe('getOwnedGames', () => {
    it('returns the game_count and games from a public profile', async () => {
        vi.stubGlobal('fetch', vi.fn(async () =>
            jsonResponse({ response: { game_count: 2, games: [{ appid: 1 }, { appid: 2 }] } }),
        ))

        await expect(getOwnedGames('765')).resolves.toEqual({
            game_count: 2,
            games: [{ appid: 1 }, { appid: 2 }],
        })
        const init = vi.mocked(fetch).mock.calls[0]?.[1]
        expect(init).toMatchObject({ signal: expect.any(AbortSignal) })
    })

    it('yields undefined fields (not zero games) when the profile hides game details', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ response: {} })))

        await expect(getOwnedGames('765')).resolves.toEqual({ game_count: undefined, games: undefined })
    })

    it('throws and logs on a non-ok Steam response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { status: 500 })))
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(getOwnedGames('765')).rejects.toThrow(/status 500/)
        expect(errSpy).toHaveBeenCalled()
    })
})

describe('getPlayerAchievementCompletion', () => {
    it('is true only when every achievement is unlocked', async () => {
        vi.stubGlobal('fetch', vi.fn(async () =>
            jsonResponse({ playerstats: { success: true, achievements: [{ achieved: 1 }, { achieved: 1 }] } }),
        ))

        await expect(getPlayerAchievementCompletion('765', 400)).resolves.toBe(true)
    })

    it('is false when any achievement is still locked', async () => {
        vi.stubGlobal('fetch', vi.fn(async () =>
            jsonResponse({ playerstats: { success: true, achievements: [{ achieved: 1 }, { achieved: 0 }] } }),
        ))

        await expect(getPlayerAchievementCompletion('765', 400)).resolves.toBe(false)
    })

    it('is false when the game reports no achievements', async () => {
        vi.stubGlobal('fetch', vi.fn(async () =>
            jsonResponse({ playerstats: { success: true, achievements: [] } }),
        ))

        await expect(getPlayerAchievementCompletion('765', 400)).resolves.toBe(false)
    })

    it('is false when stats are private (success: false)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ playerstats: { success: false } })))

        await expect(getPlayerAchievementCompletion('765', 400)).resolves.toBe(false)
    })

    it('is false (not a throw) on a non-ok response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { status: 403 })))

        await expect(getPlayerAchievementCompletion('765', 400)).resolves.toBe(false)
    })

    it('swallows network errors and returns false', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('network down')
        }))
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        await expect(getPlayerAchievementCompletion('765', 400)).resolves.toBe(false)
    })
})

describe('getFullyCompletedAppids', () => {
    it('returns the set of appids the player has 100%-ed', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
            const fullyDone = String(url).includes('appid=20')
            return jsonResponse({
                playerstats: { success: true, achievements: [{ achieved: fullyDone ? 1 : 0 }] },
            })
        }))

        const completed = await getFullyCompletedAppids('765', [10, 20, 30])

        expect(completed).toEqual(new Set([20]))
    })

    it('returns an empty set for an empty appid list', async () => {
        vi.stubGlobal('fetch', vi.fn())

        await expect(getFullyCompletedAppids('765', [])).resolves.toEqual(new Set())
    })
})
