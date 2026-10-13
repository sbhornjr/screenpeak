import { expect, it } from 'vitest'
import type { SQL } from 'drizzle-orm'
import type { DB } from '@/lib/db'
import { planGameWrites, planTaxonWrites, assertSteamOwners, type StoredGame } from '@/lib/catalog/batch-write'
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

it('rejects a Steam id that already belongs to another game', () => {
    expect(() => assertSteamOwners(
        [{ gameId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', appIds: [42] }],
        [{ externalId: '42', gameId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }],
    )).toThrow(/another catalogue game/)
    expect(assertSteamOwners(
        [{ gameId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', appIds: [42, 42] }],
        [{ externalId: '42', gameId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }],
    ).get('42')).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
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
