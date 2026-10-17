import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogGame } from '@/lib/catalog/types'
import type { SteamImportStore, SteamMatch } from '@/lib/catalog/steam-import'
import {
    resolveSteamBatch, buildSteamLinkEntries, steamOwnershipBlock, parseSteamImportRequest,
    confirmSteamLibraryEntries, steamEntriesToImport, cacheUntil, hoursFromSteamMinutes, hoursForSteamLibrary,
    mergeConfirmedSteamEntry, selectSteamImportQueue, steamImportContinuation, KNOWN_INELIGIBLE_STEAM_APPS,
    STEAM_LOOKUP_BATCH,
} from '@/lib/catalog/steam-import'
import { negativeCacheStatus } from '@/lib/catalog/match-cache'
import { LibraryReadError } from '@/lib/queries/library'
import { IgdbError } from '@/lib/igdb/http'
import { igdbProvider } from '@/lib/igdb/provider'

const NOW = new Date('2026-10-10T00:00:00.000Z')

function catalog(igdbId: number, steamAppIds: number[], patch: Partial<CatalogGame> = {}): CatalogGame {
    return {
        igdbId, name: 'Game ' + igdbId, providerSlug: 'game-' + igdbId, gameType: patch.gameType ?? 0,
        released: '2020-01-01', description: null, coverImageUrl: null, artworkImageUrl: null,
        screenshots: [], esrbRating: null, redditUrl: null, providerUpdatedAt: '2026-10-10T00:00:00.000Z',
        genres: [], platforms: [], developers: [], publishers: [], steamAppIds, ...patch,
    }
}

function memoryStore() {
    const maps = new Map<number, string>()
    const saved: CatalogGame[] = []
    const cache = new Map<number, { status: 'unmatched' | 'ambiguous'; retryAfter: number }>()
    const rememberCalls: { appId: number; httpStatus: number; candidateCount: number }[] = []
    const failSave = new Set<number>()
    let failMappings = false
    const store: SteamImportStore = {
        async mappings(appIds) {
            if (failMappings) throw new Error('database unavailable')
            return appIds.filter(id => maps.has(id)).map(id => ({ appid: id, gameId: maps.get(id)! }))
        },
        async freshCache(appIds, now) {
            return appIds.flatMap(id => {
                const row = cache.get(id)
                if (!row || row.retryAfter <= now.getTime()) return []
                return [{ appid: id, status: row.status }]
            })
        },
        async remember(appId, httpStatus, candidateCount, now) {
            rememberCalls.push({ appId, httpStatus, candidateCount })
            const status = negativeCacheStatus(httpStatus, candidateCount)
            if (!status) return false
            cache.set(appId, { status, retryAfter: cacheUntil(now).getTime() })
            return true
        },
        async saveGame(game, ownedAppIds) {
            if (failSave.has(game.igdbId)) throw new Error('database unavailable')
            const id = 'game-' + game.igdbId
            const attached: number[] = []
            const rejected: number[] = []
            const elsewhere: { appid: number; gameId: string }[] = []
            for (const appId of ownedAppIds) {
                if (!game.steamAppIds.includes(appId)) { rejected.push(appId); continue }
                const existing = maps.get(appId)
                if (existing && existing !== id) { elsewhere.push({ appid: appId, gameId: existing }); continue }
                maps.set(appId, id)
                attached.push(appId)
            }
            saved.push(game)
            return { id: attached.length ? id : null, attached, rejected, conflicted: [], elsewhere }
        },
    }
    return { store, maps, saved, rememberCalls, failSave, failMappings: () => { failMappings = true } }
}

function provider(lookup: (ids: number[]) => { appid: number; candidates: number[] }[], hydrate: (ids: number[]) => CatalogGame[] = () => []) {
    return {
        lookupSteamApps: vi.fn(async (ids: number[]) => lookup(ids)),
        getGamesByIds: vi.fn(async (ids: number[]) => hydrate(ids)),
        searchGames: vi.fn(async () => []),
    }
}

const entry = (gameId: string, hours: number) => ({
    gameId, playtimeSelected: hours, status: 'playing', selected: true, coverImageUrl: null,
    gameName: 'Game', gameDeveloper: '', gameReleased: null, timesPlayed: 1, completedAllAchievements: false,
})

describe('steam ownership', () => {
    it('rejects demos, playtests, launchers, and dedicated servers without dropping real games', () => {
        expect(KNOWN_INELIGIBLE_STEAM_APPS).toContainEqual({ appid: 247750, igdbId: 3035, kind: 'demo' })
        expect(steamOwnershipBlock({ appid: 247750, name: 'The Stanley Parable' })).toBe('demo')
        expect(steamOwnershipBlock({ appid: 1, name: 'The Stanley Parable Demo' })).toBe('demo')
        expect(steamOwnershipBlock({ appid: 2, name: 'Rockstar Games Launcher' })).toBe('launcher')
        expect(steamOwnershipBlock({ appid: 3, name: 'Example Dedicated Server' })).toBe('software')
        expect(steamOwnershipBlock({ appid: 4, name: "Demon's Souls" })).toBeNull()
        expect(steamOwnershipBlock({ appid: 5, name: 'Software Inc' })).toBeNull()
        expect(steamOwnershipBlock({ appid: 6, name: 'Example SDK' })).toBeNull()
        expect(steamOwnershipBlock({ appid: 7, name: 'Unigine Heaven Benchmark' })).toBeNull()
        expect(steamOwnershipBlock({ appid: 378648, name: 'The Witcher 3: Wild Hunt - Blood and Wine' })).toBeNull()
    })

    it('turns Steam minutes into hours once', () => {
        expect(hoursFromSteamMinutes(90 + 50)).toBe(2)
        expect(hoursFromSteamMinutes(59)).toBe(0)
    })
})

describe('resolveSteamBatch', () => {
    let mem: ReturnType<typeof memoryStore>
    beforeEach(() => { mem = memoryStore() })

    it('imports two Steam apps as one game and does not write again on the next sync', async () => {
        const igdb = provider(
            ids => ids.map(appid => ({ appid, candidates: [100] })),
            () => [catalog(100, [11, 12])],
        )
        const games = [{ appid: 11, name: 'Hades' }, { appid: 12, name: 'Hades' }]
        const first = await resolveSteamBatch(games, { provider: igdb, store: mem.store, now: NOW })
        expect(first.matched).toEqual([{ appid: 11, gameId: 'game-100' }, { appid: 12, gameId: 'game-100' }])
        expect(mem.saved).toHaveLength(1)
        const second = await resolveSteamBatch(games, { provider: igdb, store: mem.store, now: NOW })
        expect(second.matched.map(row => row.gameId)).toEqual(['game-100', 'game-100'])
        expect(igdb.lookupSteamApps).toHaveBeenCalledTimes(1)
        expect(mem.saved).toHaveLength(1)
        expect(igdb.searchGames).not.toHaveBeenCalled()
    })

    it('caches a genuine miss for seven days and lets retry bypass only that miss', async () => {
        const igdb = provider(ids => ids.map(appid => ({ appid, candidates: [] })))
        await resolveSteamBatch([{ appid: 5, name: 'Hitman: Sniper Challenge' }], { provider: igdb, store: mem.store, now: NOW })
        expect(mem.rememberCalls).toEqual([{ appId: 5, httpStatus: 200, candidateCount: 0 }])
        expect(cacheUntil(NOW).toISOString()).toBe('2026-10-17T00:00:00.000Z')
        await resolveSteamBatch([{ appid: 5, name: 'Hitman: Sniper Challenge' }], { provider: igdb, store: mem.store, now: NOW })
        expect(igdb.lookupSteamApps).toHaveBeenCalledTimes(1)
        await resolveSteamBatch([{ appid: 5, name: 'Hitman: Sniper Challenge' }], { provider: igdb, store: mem.store, now: NOW, retry: true })
        expect(igdb.lookupSteamApps).toHaveBeenCalledTimes(2)
        await resolveSteamBatch([{ appid: 5, name: 'Hitman: Sniper Challenge' }], {
            provider: igdb, store: mem.store, now: new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000),
        })
        expect(igdb.lookupSteamApps).toHaveBeenCalledTimes(3)
    })

    it('caches an ambiguous mapping and does not bypass it on retry', async () => {
        const igdb = provider(ids => ids.map(appid => ({ appid, candidates: [1, 2] })))
        const first = await resolveSteamBatch([{ appid: 8, name: 'Shared' }], { provider: igdb, store: mem.store, now: NOW })
        expect(first.ambiguous).toEqual([8])
        expect(first.matched).toEqual([])
        expect(mem.saved).toHaveLength(0)
        expect(mem.rememberCalls).toEqual([{ appId: 8, httpStatus: 200, candidateCount: 2 }])
        await resolveSteamBatch([{ appid: 8, name: 'Shared' }], { provider: igdb, store: mem.store, now: NOW, retry: true })
        expect(igdb.lookupSteamApps).toHaveBeenCalledTimes(1)
        expect(igdb.getGamesByIds).not.toHaveBeenCalled()
    })

    it.each([
        ['HTTP 401', new IgdbError('external_games HTTP 401.')],
        ['HTTP 429', new IgdbError('external_games HTTP 429.')],
        ['HTTP 503', new IgdbError('external_games HTTP 503.')],
        ['timeout', new IgdbError('request failed or timed out.', true)],
    ])('does not cache %s as a miss', async (_label, error) => {
        const igdb = provider(() => { throw error })
        const result = await resolveSteamBatch([{ appid: 9, name: 'Offline' }], { provider: igdb, store: mem.store, now: NOW })
        expect(result).toMatchObject({ matched: [], unmatched: [], ambiguous: [], retryable: [9] })
        expect(mem.rememberCalls).toEqual([])
        expect(mem.saved).toHaveLength(0)
    })

    it('keeps a metadata failure retryable after a successful lookup', async () => {
        const igdb = provider(
            ids => ids.map(appid => ({ appid, candidates: [4] })),
            () => { throw new IgdbError('games HTTP 500.') },
        )
        const result = await resolveSteamBatch([{ appid: 15, name: 'Partial' }], { provider: igdb, store: mem.store, now: NOW })
        expect(result.retryable).toEqual([15])
        expect(result.unmatched).toEqual([])
        expect(mem.rememberCalls).toEqual([])
    })

    it('propagates a database failure instead of reporting a miss', async () => {
        mem.failMappings()
        const igdb = provider(ids => ids.map(appid => ({ appid, candidates: [] })))
        await expect(resolveSteamBatch([{ appid: 1, name: 'Example' }], { provider: igdb, store: mem.store, now: NOW })).rejects.toThrow(/database unavailable/)
        expect(igdb.lookupSteamApps).not.toHaveBeenCalled()
        expect(mem.rememberCalls).toEqual([])
    })

    it('continues after one catalogue write fails', async () => {
        mem.failSave.add(1)
        const igdb = provider(
            ids => ids.map(appid => ({ appid, candidates: [appid === 21 ? 1 : 2] })),
            ids => ids.map(id => catalog(id, [id === 1 ? 21 : 22])),
        )
        const result = await resolveSteamBatch(
            [{ appid: 21, name: 'First' }, { appid: 22, name: 'Second' }],
            { provider: igdb, store: mem.store, now: NOW },
        )
        expect(result.retryable).toEqual([21])
        expect(result.matched).toEqual([{ appid: 22, gameId: 'game-2' }])
        expect(mem.saved.map(game => game.igdbId)).toEqual([2])
        expect(mem.rememberCalls).toEqual([])
    })

    it('does not match a remake by name when the Steam app has no external id', async () => {
        const igdb = provider(ids => ids.map(appid => ({ appid, candidates: [] })))
        const result = await resolveSteamBatch([{ appid: 77, name: 'Resident Evil 2' }], { provider: igdb, store: mem.store, now: NOW })
        expect(result.unmatched).toEqual([77])
        expect(igdb.getGamesByIds).not.toHaveBeenCalled()
        expect(igdb.searchGames).not.toHaveBeenCalled()
        expect(mem.saved).toHaveLength(0)
    })

    it('does not treat the Stanley Parable demo as ownership of IGDB 3035', async () => {
        const igdb = provider(
            () => { throw new Error('demo lookup should not run') },
            () => [catalog(3035, [247750], { name: 'The Stanley Parable', gameType: 0 })],
        )
        const blocked = await resolveSteamBatch([{ appid: 247750, name: 'The Stanley Parable' }], { provider: igdb, store: mem.store, now: NOW })
        expect(blocked.unmatched).toEqual([247750])
        expect(blocked.matched).toEqual([])
        expect(mem.saved).toHaveLength(0)
        expect(igdb.lookupSteamApps).not.toHaveBeenCalled()

        const real = provider(
            ids => ids.map(appid => ({ appid, candidates: [3035] })),
            () => [catalog(3035, [221910, 247750, 555001], { name: 'The Stanley Parable', gameType: 0 })],
        )
        const both = await resolveSteamBatch(
            [{ appid: 247750, name: 'The Stanley Parable Demo' }, { appid: 221910, name: 'The Stanley Parable' }],
            { provider: real, store: mem.store, now: NOW },
        )
        expect(real.lookupSteamApps).toHaveBeenCalledWith([221910])
        expect(both.matched).toEqual([{ appid: 221910, gameId: 'game-3035' }])
        expect(both.unmatched).toContain(247750)
        expect(mem.saved.at(-1)?.steamAppIds).toEqual([221910])
    })

    it('imports an expansion and does not require game_type 0', async () => {
        const igdb = provider(
            ids => ids.map(appid => ({ appid, candidates: [13166] })),
            () => [catalog(13166, [378648], { name: 'Blood and Wine', gameType: 2 })],
        )
        const result = await resolveSteamBatch(
            [{ appid: 378648, name: 'The Witcher 3: Wild Hunt - Blood and Wine' }],
            { provider: igdb, store: mem.store, now: NOW },
        )
        expect(result.matched).toEqual([{ appid: 378648, gameId: 'game-13166' }])
        expect(mem.saved[0].gameType).toBe(2)
    })

    it('drops a Steam id shared by two staged games and still writes the other ids', async () => {
        const igdb = provider(
            ids => ids.map(appid => ({ appid, candidates: [appid === 12 ? 2 : 1] })),
            ids => ids.map(id => catalog(id, id === 1 ? [11, 99] : [12, 99])),
        )
        const result = await resolveSteamBatch(
            [{ appid: 11, name: 'A' }, { appid: 12, name: 'B' }, { appid: 99, name: 'Shared' }],
            { provider: igdb, store: mem.store, now: NOW },
        )
        expect(result.ambiguous).toContain(99)
        expect(result.matched.map(row => row.appid)).toEqual([11, 12])
        expect(mem.saved.every(game => !game.steamAppIds.includes(99))).toBe(true)
        expect(mem.rememberCalls).toContainEqual({ appId: 99, httpStatus: 200, candidateCount: 2 })
    })

    it('omits a foreign Steam id without blocking the rest of the batch', async () => {
        mem.maps.set(50, 'other-game')
        const igdb = provider(
            ids => ids.map(appid => ({ appid, candidates: [appid === 60 ? 3 : 4] })),
            ids => ids.map(id => catalog(id, id === 3 ? [50, 60] : [61])),
        )
        const result = await resolveSteamBatch(
            [{ appid: 60, name: 'New' }, { appid: 61, name: 'Other' }],
            { provider: igdb, store: mem.store, now: NOW },
        )
        expect(result.matched.map(row => row.appid).sort((a, b) => a - b)).toEqual([60, 61])
        expect(mem.maps.get(50)).toBe('other-game')
        expect(mem.saved.map(game => game.igdbId).sort((a, b) => a - b)).toEqual([3, 4])
    })

    it('asks IGDB in batches of 100', async () => {
        const ids = Array.from({ length: STEAM_LOOKUP_BATCH + 1 }, (_, index) => index + 1)
        const igdb = provider(chunk => chunk.map(appid => ({ appid, candidates: [] })))
        await resolveSteamBatch(ids.map(appid => ({ appid, name: 'Game ' + appid })), { provider: igdb, store: mem.store, now: NOW })
        expect(igdb.lookupSteamApps.mock.calls.map(call => call[0].length)).toEqual([100, 1])
    })

    it('does not negative-cache apps that lose a unique-constraint race', async () => {
        const igdb = provider(
            ids => ids.map(appid => ({ appid, candidates: [1] })),
            () => [catalog(1, [11, 12])],
        )
        const result = await resolveSteamBatch(
            [{ appid: 11, name: 'A' }, { appid: 12, name: 'B' }],
            {
                provider: igdb, now: NOW,
                store: {
                    ...mem.store,
                    saveGame: async () => ({ id: null, attached: [], rejected: [], conflicted: [11], elsewhere: [{ appid: 12, gameId: 'other-game' }] }),
                },
            },
        )
        expect(result.matched).toEqual([{ appid: 12, gameId: 'other-game' }])
        expect(result.retryable).toEqual([11])
        expect(mem.rememberCalls).toEqual([])
    })

    it('does not negative-cache when two resolves claim one Steam id', async () => {
        let started = 0
        let release: () => void = () => {}
        const gate = new Promise<void>(resolve => { release = resolve })
        const providerFor = (igdbId: number, steamIds: number[]) => ({
            lookupSteamApps: vi.fn(async (ids: number[]) => {
                started += 1
                if (started === 1) await gate
                else release()
                return ids.map(appid => ({ appid, candidates: [igdbId] }))
            }),
            getGamesByIds: vi.fn(async () => [catalog(igdbId, steamIds)]),
            searchGames: vi.fn(async () => []),
        })
        const [first, second] = await Promise.all([
            resolveSteamBatch([{ appid: 11, name: 'A' }, { appid: 99, name: 'Shared' }], { provider: providerFor(1, [11, 99]), store: mem.store, now: NOW }),
            resolveSteamBatch([{ appid: 12, name: 'B' }, { appid: 99, name: 'Shared' }], { provider: providerFor(2, [12, 99]), store: mem.store, now: NOW }),
        ])
        expect(first.matched.map(row => row.appid)).toEqual(expect.arrayContaining([11, 99]))
        expect(second.matched.map(row => row.appid)).toEqual(expect.arrayContaining([12, 99]))
        expect(mem.maps.get(99)).toMatch(/^game-/)
        expect(mem.rememberCalls.filter(call => call.appId === 99)).toEqual([])
    })

    it('resolves through the shared provider so the rate-limit budget applies', async () => {
        const lookup = vi.spyOn(igdbProvider, 'lookupSteamApps').mockResolvedValue([{ appid: 1, candidates: [] }])
        await resolveSteamBatch([{ appid: 1, name: 'Example' }], { store: mem.store, now: NOW })
        expect(lookup).toHaveBeenCalledWith([1])
    })
})

describe('retry queue', () => {
    it('checks pending apps before cached misses and does not repeat a batch', () => {
        const pending = Array.from({ length: 20 }, (_, index) => index + 100)
        const misses = Array.from({ length: 60 }, (_, index) => index + 1)
        const first = selectSteamImportQueue({ retry: true, pendingAppIds: pending, cachedUnmatchedAppIds: misses, limit: 50 })
        expect(first.appIds).toEqual([...pending, ...misses.slice(0, 30)])
        expect(first.nextCursor).toEqual({ phase: 'miss', afterAppId: 30 })
        const second = selectSteamImportQueue({
            retry: true, cursor: first.nextCursor, pendingAppIds: pending, cachedUnmatchedAppIds: misses, limit: 50,
        })
        expect(second.appIds).toEqual(misses.slice(30))
        expect(second.nextCursor).toBeNull()
        expect(second.appIds.some(id => first.appIds.includes(id))).toBe(false)
    })

    it('leaves cached misses out of the ordinary queue', () => {
        const selected = selectSteamImportQueue({
            retry: false, pendingAppIds: [8, 4], cachedUnmatchedAppIds: [1, 2, 3], limit: 50,
        })
        expect(selected.appIds).toEqual([4, 8])
        expect(selected.nextCursor).toBeNull()
    })

    it('resumes a pending cursor without replaying earlier apps or cached misses', () => {
        const selected = selectSteamImportQueue({
            retry: false,
            cursor: { phase: 'pending', afterAppId: 20 },
            pendingAppIds: [10, 30, 40],
            cachedUnmatchedAppIds: [1, 2],
            limit: 50,
        })
        expect(selected.appIds).toEqual([30, 40])
        expect(selected.nextCursor).toBeNull()
    })

    it('keeps the cursor when a chunk is retryable and counts the apps left behind', () => {
        const pending = [10, 20, 30, 40]
        const selected = selectSteamImportQueue({ retry: false, pendingAppIds: pending, cachedUnmatchedAppIds: [], limit: 2 })
        expect(selected.appIds).toEqual([10, 20])
        const continued = steamImportContinuation({
            selectedAppIds: selected.appIds,
            queueCursor: selected.nextCursor,
            pendingAppIds: [10, 30, 40],
            cachedUnmatchedAppIds: [1],
            retry: false,
        })
        expect(continued.nextCursor).toEqual({ phase: 'pending', afterAppId: 20 })
        expect(continued.remaining).toBe(3)
        const tail = selectSteamImportQueue({
            retry: false, cursor: continued.nextCursor, pendingAppIds: [10, 30, 40], cachedUnmatchedAppIds: [1], limit: 50,
        })
        expect(tail.appIds).toEqual([30, 40])
    })
})

describe('library collapse', () => {
    it('sums distinct app playtime once, preserves saved hours, and completes if any app is finished', () => {
        const entries = buildSteamLinkEntries({
            owned: [
                { appid: 11, playtimeMinutes: 90 },
                { appid: 12, playtimeMinutes: 50 },
                { appid: 11, playtimeMinutes: 90 },
            ],
            matches: [{ appid: 11, gameId: 'g1' }, { appid: 12, gameId: 'g1' }, { appid: 30, gameId: 'g2' }],
            cards: [
                { id: 'g1', name: 'Hades', coverImageUrl: null, released: '2020-09-17', developer: 'Supergiant' },
                { id: 'g2', name: 'Kept', coverImageUrl: null, released: null, developer: '' },
            ],
            library: [{ gameId: 'g2', hoursPlayed: 10.5, status: 'completed', playCount: 3, completedAllAchievements: false, steamPlaytimeMinutes: null }],
            completedAppIds: [12],
        })
        expect(entries).toEqual([
            expect.objectContaining({ gameId: 'g1', playtimeSelected: 2, timesPlayed: 1, status: 'playing', completedAllAchievements: true, gameDeveloper: 'Supergiant' }),
            expect.objectContaining({ gameId: 'g2', playtimeSelected: 10.5, timesPlayed: 3, status: 'completed', completedAllAchievements: false }),
        ])
    })

    it('refreshes hours that are still the previous automatic Steam sum', () => {
        expect(hoursForSteamLibrary({ hoursPlayed: 2, steamPlaytimeMinutes: 140 }, 90 + 50 + 80)).toBe(3)
        expect(hoursForSteamLibrary({ hoursPlayed: 9, steamPlaytimeMinutes: 140 }, 90 + 50 + 80)).toBe(9)
        expect(hoursForSteamLibrary({ hoursPlayed: 9, steamPlaytimeMinutes: null }, 400)).toBe(9)
    })

    it('keeps stored hours when confirm is given the automatic Steam total', async () => {
        const gameId = '11111111-1111-4111-8111-111111111111'
        const stored = {
            gameId, hoursPlayed: 12, status: 'completed', playCount: 4, completedAllAchievements: true, steamPlaytimeMinutes: 90,
        }
        expect(mergeConfirmedSteamEntry(entry(gameId, 3), stored, 180)).toMatchObject({
            playtimeSelected: 12, status: 'completed', timesPlayed: 4, completedAllAchievements: true, steamPlaytimeMinutes: 180,
        })
        expect(mergeConfirmedSteamEntry(entry(gameId, 7), stored, 180).playtimeSelected).toBe(7)
        const automatic = { ...stored, hoursPlayed: 2, status: 'playing', playCount: 1, completedAllAchievements: false, steamPlaytimeMinutes: 140 }
        expect(mergeConfirmedSteamEntry(entry(gameId, 3), automatic, 220).playtimeSelected).toBe(3)
        const write = vi.fn(async () => [])
        const readLibrary = vi.fn(async () => { throw new LibraryReadError() })
        const store: SteamImportStore = {
            mappings: async () => [{ appid: 11, gameId }],
            freshCache: async () => [],
            remember: async () => false,
            saveGame: async () => ({ id: null, attached: [], rejected: [], conflicted: [], elsewhere: [] }),
        }
        await expect(confirmSteamLibraryEntries('user-a', [entry(gameId, 3)], [{ appid: 11, name: 'Hades', playtimeMinutes: 180 }], { store, write, readLibrary }))
            .rejects.toThrow(/could not be read/)
        expect(write).not.toHaveBeenCalled()
    })

    it('rejects a spoofed game and does not add hours twice for one game', async () => {
        const maps = new Map<number, string>([[11, '11111111-1111-4111-8111-111111111111']])
        const store: SteamImportStore = {
            mappings: async () => [{ appid: 11, gameId: '11111111-1111-4111-8111-111111111111' } satisfies SteamMatch],
            freshCache: async () => [],
            remember: async () => false,
            saveGame: async () => ({ id: null, attached: [], rejected: [], conflicted: [], elsewhere: [] }),
        }
        const write = vi.fn(async () => [])
        const readLibrary = vi.fn(async () => [])
        const owned = [{ appid: 11, name: 'Hades', playtimeMinutes: 60 }]
        await expect(confirmSteamLibraryEntries('user-a', [entry('22222222-2222-4222-8222-222222222222', 4)], owned, { store, write, readLibrary }))
            .rejects.toThrow(/Steam library/)
        expect(write).not.toHaveBeenCalled()
        const rows = [entry('11111111-1111-4111-8111-111111111111', 5), entry('11111111-1111-4111-8111-111111111111', 9)]
        await confirmSteamLibraryEntries('user-a', rows, owned, { store, write, readLibrary })
        expect(write).toHaveBeenCalledWith('user-a', [expect.objectContaining({ playtimeSelected: 5, steamPlaytimeMinutes: 60 })])
        expect(maps.get(11)).toBe('11111111-1111-4111-8111-111111111111')
    })

    it('does not write a game the player left unchecked', async () => {
        const gameId = '11111111-1111-4111-8111-111111111111'
        const other = '33333333-3333-4333-8333-333333333333'
        const store: SteamImportStore = {
            mappings: async () => [{ appid: 11, gameId }],
            freshCache: async () => [],
            remember: async () => false,
            saveGame: async () => ({ id: null, attached: [], rejected: [], conflicted: [], elsewhere: [] }),
        }
        const write = vi.fn(async (_userId: string, rows: { gameId: string, selected: boolean }[]) => rows)
        const readLibrary = vi.fn(async () => [])
        const owned = [{ appid: 11, name: 'Hades', playtimeMinutes: 60 }]
        const dropped = { ...entry(other, 9), selected: false }
        expect(steamEntriesToImport([entry(gameId, 5), dropped])).toEqual([entry(gameId, 5)])
        await confirmSteamLibraryEntries('user-a', [entry(gameId, 5), dropped], owned, { store, write, readLibrary })
        const written = write.mock.calls[0][1]
        expect(written.map(row => row.gameId)).toEqual([gameId])
        expect(written.some(row => row.selected === false)).toBe(false)
    })
})

describe('import request', () => {
    it('reads only the retry flag', () => {
        expect(parseSteamImportRequest(null)).toEqual({ retry: false, cursor: null })
        expect(parseSteamImportRequest({ cursor: { phase: 'pending', afterAppId: 4 } })).toEqual({ retry: false, cursor: { phase: 'pending', afterAppId: 4 } })
        expect(parseSteamImportRequest({ retry: true, userId: 'other', appids: [1, 2] })).toEqual({ retry: true, cursor: null })
        expect(parseSteamImportRequest({ retry: true, cursor: { phase: 'miss', afterAppId: 40 } })).toEqual({ retry: true, cursor: { phase: 'miss', afterAppId: 40 } })
        expect(() => parseSteamImportRequest({ retry: 'yes' })).toThrow(/Invalid import request/)
        expect(() => parseSteamImportRequest([])).toThrow(/Invalid import request/)
    })

    it('keeps catalogue writes out of the Steam page render', () => {
        const source = readFileSync(new URL('../../../app/steamlink/page.tsx', import.meta.url), 'utf8')
        expect(source).not.toContain('importGamesFromSteam')
        expect(source).not.toContain('lib/rawg')
        expect(source).toContain('loadSteamImportPreview')
        const importer = readFileSync(new URL('../../../lib/catalog/steam-import.ts', import.meta.url), 'utf8')
        const preview = importer.slice(importer.indexOf('export async function loadSteamImportPreview'), importer.indexOf('const busyBatch'))
        expect(preview).not.toContain('getFullyCompletedAppids')
    })
})
