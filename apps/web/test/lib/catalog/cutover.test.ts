import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { assertDisposableDatabase } from '@/lib/catalog/database-url'
import { manifestChecksum } from '@/lib/catalog/manifest'
import { negativeCacheStatus } from '@/lib/catalog/match-cache'
import { selectTopRatedGames } from '@/lib/catalog/rank'
import { detachSharedSteamAppIds } from '@/lib/catalog/steam-ids'
import type { CatalogGame } from '@/lib/catalog/types'

const exec = promisify(execFile)
const game = (igdbId: number, steamAppIds: number[]): CatalogGame => ({
    igdbId, name: 'Example', providerSlug: 'example', gameType: 0, released: null, description: null,
    coverImageUrl: null, artworkImageUrl: null, screenshots: [], esrbRating: null, redditUrl: null,
    providerUpdatedAt: null, genres: [], platforms: [], developers: [], publishers: [], steamAppIds,
})

describe('disposable database gate', () => {
    it('accepts a local rehearsal database and refuses a hosted URL', () => {
        expect(() => assertDisposableDatabase('postgresql://screenpeak@127.0.0.1:5432/screenpeak_igdb_test')).not.toThrow()
        expect(() => assertDisposableDatabase('postgresql://screenpeak@localhost/cutover_copy')).not.toThrow()
        expect(() => assertDisposableDatabase('postgresql://u:p@db.example.supabase.co:5432/postgres')).toThrow(/non-local/)
        expect(() => assertDisposableDatabase('postgresql://screenpeak@127.0.0.1:5432/postgres')).toThrow(/_test or _copy/)
    })
    it('refuses a remote URL before opening a connection', async () => {
        await expect(exec('npx', ['tsx', 'scripts/establish-migration-journal.ts', '--database-env', 'REMOTE_URL', '--stamp-baseline'], {
            env: { ...process.env, REMOTE_URL: 'postgresql://u:p@db.example.supabase.co:5432/postgres' },
        })).rejects.toThrow(/non-local/)
    })
})

describe('top-game ranking', () => {
    it('orders by rating count, then rating, then id', () => {
        expect(selectTopRatedGames([
            { id: 2, rating: 99, ratingCount: 4 },
            { id: 1, rating: 10, ratingCount: 5 },
            { id: 3, rating: 50, ratingCount: 5 },
            { id: 3, rating: 1, ratingCount: 1 },
        ], 2).map(row => row.id)).toEqual([3, 1])
    })
})

describe('shared Steam ids', () => {
    it('removes an app id claimed by two IGDB games and keeps a private one', () => {
        const result = detachSharedSteamAppIds([game(1, [10, 11]), game(2, [10]), game(3, [12, 12])])
        expect(result.shared).toEqual([{ appId: 10, igdbIds: [1, 2] }])
        expect(result.games.map(entry => entry.steamAppIds)).toEqual([[11], [], [12, 12]])
    })
})

describe('negative cache', () => {
    it('never treats 401 or 429 as a no-match', () => {
        expect(negativeCacheStatus(401, 0)).toBeNull()
        expect(negativeCacheStatus(429, 0)).toBeNull()
        expect(negativeCacheStatus(500, 0)).toBeNull()
        expect(negativeCacheStatus(200, 0)).toBe('unmatched')
        expect(negativeCacheStatus(200, 2)).toBe('ambiguous')
        expect(negativeCacheStatus(200, 1)).toBeNull()
    })
})

describe('reset manifest checksum', () => {
    it('ignores game order and steam-id order', () => {
        const first = manifestChecksum('fp', [game(2, [2, 1]), game(1, [3])])
        const second = manifestChecksum('fp', [game(1, [3]), game(2, [1, 2])])
        expect(first).toBe(second)
        expect(manifestChecksum('other', [game(1, [3])])).not.toBe(first)
    })
})
