import { expect, it } from 'vitest'
import type { SQL } from 'drizzle-orm'
import type { DB } from '@/lib/db'
import { planGameWrites, planTaxonWrites, planSteamOwnership, slugsToVacate, writeCatalogBatch, type StoredGame } from '@/lib/catalog/batch-write'
import { omitForeignSteamIdsBatch } from '@/lib/catalog/steam-ids'
import { seedCatalogGames } from '@/lib/catalog/seed'
import { formatSeedProgress } from '@/lib/catalog/seed-progress'
import type { CatalogGame, CatalogTaxon } from '@/lib/catalog/types'

function sqlText(query: SQL): string {
    const chunks = (query as unknown as { queryChunks?: { value?: unknown }[] }).queryChunks ?? []
    return chunks.map(chunk => {
        const value = chunk?.value
        return Array.isArray(value) && value.every(part => typeof part === 'string') ? value.join('') : ' '
    }).join('')
}

function taxon(igdbId: number, slug: string, name = slug, providerUpdatedAt?: string): CatalogTaxon {
    return { igdbId, name, slug, ...(providerUpdatedAt ? { providerUpdatedAt } : {}) }
}

function game(igdbId: number, patch: Partial<CatalogGame> = {}): CatalogGame {
    return {
        igdbId, name: `Game ${igdbId}`, providerSlug: `game-${igdbId}`, gameType: 0,
        released: null, description: null, coverImageUrl: null, artworkImageUrl: null,
        screenshots: [], esrbRating: null, redditUrl: null, providerUpdatedAt: '2026-10-10T00:00:00.000Z',
        genres: [taxon(100, 'action', 'Action', '2026-10-10T00:00:00.000Z')],
        platforms: [taxon(200, 'pc', 'PC', '2026-10-10T00:00:00.000Z')],
        developers: [taxon(3000 + igdbId, `studio-${igdbId}`, 'Studio', '2026-10-10T00:00:00.000Z')],
        publishers: [taxon(4000 + igdbId, `pub-${igdbId}`, 'Pub', '2026-10-10T00:00:00.000Z')],
        steamAppIds: [5000 + igdbId],
        ...patch,
    }
}

function stored(row: Pick<StoredGame, 'id' | 'igdbId' | 'slug'> & Partial<StoredGame>): StoredGame {
    return {
        name: 'Stored', providerSlug: 'stored', gameType: 0, released: null, description: null,
        coverImageUrl: null, artworkImageUrl: null, screenshots: [], esrbRating: null, redditUrl: null,
        providerUpdatedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
        ...row,
    }
}

it('keeps one catalogue slug and appends the local id for the rest of the batch', () => {
    const planned = planGameWrites([
        game(1, { providerSlug: 'Unique Title' }),
        game(2, { providerSlug: 'Unique Title' }),
    ], [], [])
    expect(planned[0]).toMatchObject({ slug: 'unique-title', isNew: true, skip: false })
    expect(planned[1].slug).toBe(`unique-title-${planned[1].id}`)
    expect(planned[1].slug).not.toContain('igdb')
})

it('skips a payload older than the stored game and keeps the published slug', () => {
    const planned = planGameWrites([
        game(4, { name: 'Replaced', providerUpdatedAt: null }),
        game(5, { providerSlug: 'renamed' }),
    ], [
        stored({ id: 'game-4', igdbId: 4, slug: 'kept', providerUpdatedAt: '2026-10-09T00:00:00.000Z' }),
        stored({ id: 'game-5', igdbId: 5, slug: 'published', providerUpdatedAt: '2026-01-01T00:00:00.000Z' }),
    ], ['published'])
    expect(planned[0]).toMatchObject({ skip: true, slug: 'kept', id: 'game-4' })
    expect(planned[1]).toMatchObject({ skip: false, isNew: false, slug: 'published' })
})

it('stores a colliding taxonomy slug as igdb-<id>, then as <slug>-igdb-<id>', () => {
    const collided = planTaxonWrites([
        { taxa: [taxon(600, 'action', 'Action')] },
        { taxa: [taxon(601, 'action', 'Action 2')] },
    ], [])
    expect(collided.effective.map(row => row[0].slug)).toEqual(['action', 'igdb-601'])
    expect(collided.writes).toHaveLength(2)
    const reserved = planTaxonWrites([
        { taxa: [taxon(802, 'held', 'Held 2', '2026-10-10T00:00:00.000Z')] },
    ], [
        { id: 'held-id', igdbId: 800, name: 'Held', slug: 'held', providerUpdatedAt: null },
        { id: 'reserved-id', igdbId: 801, name: 'Reserved', slug: 'igdb-802', providerUpdatedAt: null },
    ])
    expect(reserved.effective[0][0].slug).toBe('held-igdb-802')
})

it('keeps a taxonomy row when the incoming timestamp is missing or older', () => {
    const known = [{ id: 'genre-1', igdbId: 1, name: 'Old', slug: 'old', providerUpdatedAt: '2026-06-01T00:00:00.000Z' }]
    for (const incoming of [taxon(1, 'new', 'New'), taxon(1, 'new', 'New', '2026-01-01T00:00:00.000Z')]) {
        const planned = planTaxonWrites([{ taxa: [incoming] }], known)
        expect(planned.writes).toEqual([])
        expect(planned.effective[0][0]).toMatchObject({ id: 'genre-1', name: 'Old', slug: 'old' })
    }
    const created = planTaxonWrites([{ taxa: [taxon(2, 'fresh', 'Fresh')] }], [])
    expect(created.writes).toHaveLength(1)
    expect(created.effective[0][0].slug).toBe('fresh')
})

it('moves a released Steam id to the other game in the batch', () => {
    const released = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const claimed = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const foreign = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const handed = planSteamOwnership(
        [{ gameId: released, appIds: [] }, { gameId: claimed, appIds: [100] }],
        [{ externalId: '100', gameId: released }],
    )
    expect(handed.final.get('100')).toBe(claimed)
    expect(handed.transfers).toEqual([{ externalId: '100', fromGameId: released, gameId: claimed }])
    expect(handed.inserts).toEqual([])
    const reversed = planSteamOwnership(
        [{ gameId: claimed, appIds: [100] }, { gameId: released, appIds: [] }],
        [{ externalId: '100', gameId: released }],
    )
    expect(reversed.transfers).toEqual(handed.transfers)
    expect(planSteamOwnership(
        [{ gameId: released, appIds: [42, 42] }],
        [{ externalId: '42', gameId: released }],
    ).inserts).toEqual([{ externalId: '42', gameId: released }])
    expect(() => planSteamOwnership(
        [{ gameId: claimed, appIds: [42] }],
        [{ externalId: '42', gameId: foreign }],
    )).toThrow(/another catalogue game/)
    expect(() => planSteamOwnership(
        [{ gameId: released, appIds: [100] }, { gameId: claimed, appIds: [100] }],
        [{ externalId: '100', gameId: released }],
    )).toThrow(/another catalogue game/)
})

it('vacates a taxonomy slug before another row in the batch takes it', () => {
    const known = [
        { id: 'id-9201', igdbId: 9201, name: 'Alpha', slug: 'alpha', providerUpdatedAt: '2026-10-01T00:00:00.000Z' },
        { id: 'id-9202', igdbId: 9202, name: 'Beta', slug: 'beta', providerUpdatedAt: '2026-10-01T00:00:00.000Z' },
    ]
    const swapped = planTaxonWrites([{ taxa: [
        taxon(9201, 'beta', 'Alpha', '2026-11-01T00:00:00.000Z'),
        taxon(9202, 'alpha', 'Beta', '2026-11-01T00:00:00.000Z'),
    ] }], known)
    expect(swapped.effective[0].map(row => row.slug)).toEqual(['igdb-9201', 'alpha'])
    expect(slugsToVacate(swapped.writes, known).map(row => row.tempSlug).sort()).toEqual([
        'seed-tmp-id-9201', 'seed-tmp-id-9202',
    ])
    const renamed = planTaxonWrites([{ taxa: [
        taxon(9201, 'alpha', 'Alpha Renamed', '2026-11-01T00:00:00.000Z'),
    ] }], [known[0]])
    expect(renamed.writes[0]).toMatchObject({ slug: 'alpha', name: 'Alpha Renamed' })
    expect(slugsToVacate(renamed.writes, [known[0]])).toEqual([])
})

it('keeps a Steam id the batch owner is releasing', async () => {
    const owned = [{ external_id: '9300', igdb_id: 930 }]
    const handed = await omitForeignSteamIdsBatch(
        { async execute() { return owned } },
        [game(930, { steamAppIds: [] }), game(931, { steamAppIds: [9300] })],
    )
    expect(handed.omitted).toEqual([])
    expect(handed.games.map(row => row.steamAppIds)).toEqual([[], [9300]])
    const blocked = await omitForeignSteamIdsBatch(
        { async execute() { return [{ external_id: '9300', igdb_id: 999 }] } },
        [game(931, { steamAppIds: [9300] })],
    )
    expect(blocked.games[0].steamAppIds).toEqual([])
    expect(blocked.omitted).toEqual([{ igdbId: 931, appIds: [9300] }])
    const held = await omitForeignSteamIdsBatch(
        { async execute() { return owned } },
        [game(930, { steamAppIds: [9300] }), game(931, { steamAppIds: [9300] })],
    )
    expect(held.games.map(row => row.steamAppIds)).toEqual([[9300], []])
})

it('writes a Steam handoff before deleting the released id', async () => {
    const released = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const claimed = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const calls: string[] = []
    const tx = {
        async execute(query: SQL) {
            const text = sqlText(query)
            calls.push(text)
            if (text.includes('from public.games where igdb_id')) {
                return [released, claimed].map((id, index) => ({
                    id, igdbId: 930 + index, slug: `staged-${930 + index}`, name: 'Stored',
                    providerSlug: `staged-${930 + index}`, gameType: 0, released: null, description: null,
                    coverImageUrl: null, artworkImageUrl: null, screenshots: [], esrbRating: null,
                    redditUrl: null, providerUpdatedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
                }))
            }
            if (text.includes('from public.game_external_ids')) return [{ externalId: '9300', gameId: released }]
            return []
        },
    }
    await writeCatalogBatch(tx, [
        game(930, { steamAppIds: [], genres: [], platforms: [], developers: [], publishers: [] }),
        game(931, { steamAppIds: [9300], genres: [], platforms: [], developers: [], publishers: [] }),
    ])
    const updateAt = calls.findIndex(statement => statement.includes('update public.game_external_ids'))
    const deleteAt = calls.findIndex(statement => statement.includes('delete from public.game_external_ids'))
    expect(updateAt).toBeGreaterThanOrEqual(0)
    expect(deleteAt).toBeGreaterThan(updateAt)
})

it('writes a 50-game batch in one round trip per table', async () => {
    const calls: string[] = []
    const tx = {
        async execute(query: SQL) {
            calls.push(sqlText(query))
            return []
        },
    }
    const phases: { phase: string; statements?: number; written?: number }[] = []
    const games = Array.from({ length: 50 }, (_, index) => game(index + 1))
    const database = {
        async execute() { return [] },
        async transaction(run: (trx: typeof tx) => Promise<unknown>) { return run(tx) },
    }
    const result = await seedCatalogGames(database as unknown as DB, games, {
        onPhase: event => phases.push(event),
    })
    expect(result.written).toBe(50)
    expect(calls.filter(statement => statement.includes('insert into public.games'))).toHaveLength(1)
    expect(calls.filter(statement => statement.includes('pg_advisory_xact_lock(1936745319'))).toHaveLength(1)
    expect(calls.length).toBeLessThan(games.length)
    expect(calls.length).toBeLessThan(40)
    const committed = phases.find(event => event.phase === 'committed')
    expect(committed?.statements).toBe(calls.length)
    expect(committed?.written).toBe(50)
    expect(phases.map(event => event.phase)).toEqual(['detach', 'writing', 'committed'])
})

it('names a timed-out batch and leaves the failed games uncommitted', async () => {
    const database = {
        async execute() { return [] },
        async transaction() { throw new Error('canceling statement due to lock timeout') },
    }
    const phases: string[] = []
    await expect(seedCatalogGames(database as unknown as DB, [game(1), game(2)], {
        onPhase: event => phases.push(event.phase),
    })).rejects.toThrow(/--clear-budget --resume/)
    expect(phases).toEqual(['detach', 'writing'])
})

it('formats fetch and commit lines with counts and timings', () => {
    expect(formatSeedProgress({ phase: 'fetched', from: 1951, to: 2000, total: 2000, count: 50, ms: 800 }))
        .toBe('igdb seed: fetched 50 games (1951-2000 of 2000) in 800ms')
    expect(formatSeedProgress({ phase: 'writing', from: 1, to: 50, total: 2000 }))
        .toBe('igdb seed: writing games 1-50 of 2000')
    expect(formatSeedProgress({ phase: 'committed', written: 50, total: 2000, batches: 1, ms: 4200, statements: 21 }))
        .toBe('igdb seed: committed 50 of 2000 in 4200ms (21 statements)')
    expect(formatSeedProgress({ phase: 'pool-close-forced' })).toMatch(/did not close/)
})
