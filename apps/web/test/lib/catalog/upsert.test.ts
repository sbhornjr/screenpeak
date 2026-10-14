import { describe, expect, it, vi } from 'vitest'
const transaction = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { transaction } }))
import { upsertCatalogGame, catalogGameSchema, catalogSlug } from '@/lib/catalog/upsert'
import type { CatalogGame } from '@/lib/catalog/types'
const game: CatalogGame = {
    igdbId: 1, name: 'Example', providerSlug: 'example', gameType: 0,
    released: null, description: null, coverImageUrl: null, artworkImageUrl: null,
    screenshots: [], esrbRating: null, redditUrl: null, providerUpdatedAt: null,
    genres: [], platforms: [], developers: [], publishers: [], steamAppIds: [],
}
describe('catalogue writer boundary', () => {
    it('rejects incomplete snapshots before opening a transaction', async () => {
        await expect(upsertCatalogGame({ ...game, genres: undefined } as unknown as CatalogGame)).rejects.toThrow()
        expect(transaction).not.toHaveBeenCalled()
    })
    it('rejects invalid IDs, duplicate conflicting taxonomy and malformed dates', () => {
        for (const patch of [{ igdbId: 0 }, { steamAppIds: [-1] }, { released: '2026-02-30' },
            { providerUpdatedAt: 'not-a-date' }, { coverImageUrl: 'javascript:alert(1)' },
            { genres: [{ igdbId: 1, name: 'A', slug: 'a' }, { igdbId: 1, name: 'B', slug: 'b' }] }])
            expect(catalogGameSchema.safeParse({ ...game, ...patch }).success).toBe(false)
    })
    it('distinguishes intentionally absent metadata from a missing field', () => {
        expect(catalogGameSchema.parse(game)).toEqual(game)
        expect(catalogGameSchema.safeParse({ ...game, screenshots: undefined }).success).toBe(false)
    })
    it('uses the provider slug with no igdb suffix', () => {
        expect(catalogSlug('example')).toBe('example')
        expect(catalogSlug('Example Game')).toBe('example-game')
        expect(catalogSlug('遊戲')).toBe('game')
    })
})
