import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { assertDisposableDatabase, assertAuthStubSafe, assertLocalCopy } from '@/lib/catalog/database-url'
import { resetSizeBlock } from '@/lib/catalog/reset'
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
    it('requires confirmation when a localhost database has Supabase markers', async () => {
        const marked = { unsafe: async () => [{ supabase: true }] }
        const plain = { unsafe: async () => [{ supabase: false }] }
        await expect(assertLocalCopy(marked, false)).rejects.toThrow(/Supabase/)
        await expect(assertLocalCopy(marked, true)).resolves.toBeUndefined()
        await expect(assertLocalCopy(plain, false)).resolves.toBeUndefined()
        await expect(assertAuthStubSafe(marked)).rejects.toThrow(/local-auth-stubs/)
        await expect(assertAuthStubSafe(plain)).resolves.toBeUndefined()
    })
    it('refuses reset apply until Task 6 is explicitly acknowledged', async () => {
        await expect(exec('npx', ['tsx', 'scripts/reset-catalog-to-igdb.ts', '--database-env', 'LOCAL_URL', '--manifest', 'missing.json', '--apply'], {
            env: { ...process.env, LOCAL_URL: 'postgresql://screenpeak@127.0.0.1:5432/screenpeak_igdb_test' },
        })).rejects.toThrow(/confirm-before-task-6/)
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

const counts = { library: 1, reviews: 0, memberships: 0, favourites: 0, users: 1, lists: 0, follows: 0, likes: 0, steam: 0, games: 2 }

describe('reset manifest checksum', () => {
    it('ignores game order and steam-id order', () => {
        const first = manifestChecksum('fp', [game(2, [2, 1]), game(1, [3])], counts)
        const second = manifestChecksum('fp', [game(1, [3]), game(2, [1, 2])], counts)
        expect(first).toBe(second)
        expect(manifestChecksum('other', [game(1, [3])], counts)).not.toBe(first)
        expect(manifestChecksum('fp', [game(1, [3])], { ...counts, library: 2 })).not.toBe(first)
    })
})

describe('reset size guard', () => {
    it('refuses an empty or tiny manifest unless overridden', () => {
        expect(resetSizeBlock(4, 0)).toMatch(/empty/)
        expect(resetSizeBlock(0, 0)).toBeNull()
        expect(resetSizeBlock(4, 0, { allowEmpty: true })).toBeNull()
        expect(resetSizeBlock(502, 2)).toMatch(/allow-small/)
        expect(resetSizeBlock(502, 2, { allowSmall: true })).toBeNull()
        expect(resetSizeBlock(4, 2)).toBeNull()
    })
})
