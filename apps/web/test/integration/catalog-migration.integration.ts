import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { parseDbTimestamp } from '@/lib/dates'
import type { DB } from '@/lib/db'
import type { CatalogGame } from '@/lib/catalog/types'
const state = vi.hoisted(() => ({ db: null as DB | null }))
vi.mock('@/lib/db', () => ({
    db: new Proxy({}, {
        get(_target, property) {
            const database = state.db as unknown as Record<PropertyKey, unknown> | null
            if (!database) throw new Error('Test database is not ready')
            const value = database[property]
            return typeof value === 'function' ? value.bind(database) : value
        },
    }),
}))
import { upsertCatalogGame } from '@/lib/catalog/upsert'
import { getGamesFromSteamIds } from '@/lib/queries/game'
import { detachSharedSteamAppIds } from '@/lib/catalog/steam-ids'
import { writeSteamMatchCache } from '@/lib/catalog/match-cache'
const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Catalogue tests require a local database ending in _test.')
const admin = postgres(url, { max: 1, onnotice: () => {} })
const database = 'catalog_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + database
const client = postgres(parsed.toString(), { max: 8, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')
const game = (id: number, patch: Partial<CatalogGame> = {}): CatalogGame => ({
    igdbId: id, name: 'Same Name', providerSlug: 'same-name', gameType: 0,
    released: '1960-01-01', description: 'Plain text', coverImageUrl: null, artworkImageUrl: null,
    screenshots: [], esrbRating: null, redditUrl: null, providerUpdatedAt: '2026-10-08T00:00:00.000Z',
    genres: [{ igdbId: 5, name: 'Adventure', slug: 'adventure' }], platforms: [],
    developers: [{ igdbId: 8, name: 'Studio', slug: 'studio' }],
    publishers: [{ igdbId: 8, name: 'Studio', slug: 'studio' }], steamAppIds: [id + 1000], ...patch,
})
beforeAll(async () => {
    // Roles are cluster-wide. A fresh local Postgres has neither; 0000 policies name them.
    await admin.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$`)
    await admin.unsafe(`CREATE DATABASE "${database}"`)
    await client.unsafe("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;")
    for (const name of ['0000_illegal_kinsey_walden', '0001_functions_and_triggers', '0002_fix_get_feed_library_privacy', '0003_igdb_request_budget'])
        await client.unsafe(await migration(name))
    await client.unsafe('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated')
    await client`insert into games(rawg_id,name,slug) values(900,'Legacy','legacy')`
    await client.begin(async tx => { await tx.unsafe(await migration('0004_igdb_catalog_preparation')) })
    await client.begin(async tx => { await tx.unsafe(await migration('0005_taxonomy_slug_unique')) })
    state.db = drizzle(client) as DB
})
afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}"`)
    await admin.end()
})
it('prepares legacy rows without relabelling IDs or deleting data', async () => {
    const [row] = await client`select rawg_id,igdb_id from games where slug='legacy'`
    expect(row).toEqual({ rawg_id: 900, igdb_id: null })
})
it('reimports one identity, replaces complete relations, and keeps content timestamps stable', async () => {
    const a = await upsertCatalogGame(game(1))
    const [first] = await client`select updated_at,metadata_synced_at from games where id=${a.id}`
    expect(await upsertCatalogGame(game(1))).toEqual(a)
    const [same] = await client`select updated_at,metadata_synced_at from games where id=${a.id}`
    expect(same.updated_at).toEqual(first.updated_at)
    expect(parseDbTimestamp(same.metadata_synced_at).getTime()).toBeGreaterThanOrEqual(parseDbTimestamp(first.metadata_synced_at).getTime())
    await upsertCatalogGame(game(1, { description: null, genres: [], developers: [], publishers: [], steamAppIds: [] }))
    expect((await client`select * from game_genres where game_id=${a.id}`)).toHaveLength(0)
    expect((await client`select * from game_external_ids where game_id=${a.id}`)).toHaveLength(0)
    const [changed] = await client`select description,updated_at from games where id=${a.id}`
    expect(changed.description).toBeNull()
    expect(parseDbTimestamp(changed.updated_at).getTime()).toBeGreaterThan(parseDbTimestamp(first.updated_at).getTime())
})
it('serializes simultaneous same-game upserts and resolves identical-name slugs deterministically', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => upsertCatalogGame(game(2))))
    expect(new Set(results.map(r => r.id)).size).toBe(1)
    const other = await upsertCatalogGame(game(3))
    expect(other.slug).not.toBe(results[0].slug)
    const [count] = await client`select count(*)::int as n from games where igdb_id=2`
    expect(count.n).toBe(1)
    const [roles] = await client`select (select count(*) from developers where igdb_id=8)::int as developers,(select count(*) from publishers where igdb_id=8)::int as publishers`
    expect(roles).toEqual({ developers: 1, publishers: 1 })
})
it('rolls back metadata and relation changes when an external ID belongs to another game', async () => {
    const a = await upsertCatalogGame(game(4))
    const b = await upsertCatalogGame(game(5))
    await expect(upsertCatalogGame(game(5, { name: 'Bad replacement', genres: [], steamAppIds: [1004] }))).rejects.toThrow()
    const [row] = await client`select name from games where id=${b.id}`
    expect(row.name).toBe('Same Name')
    expect((await client`select * from game_genres where game_id=${b.id}`)).toHaveLength(1)
    const [mapping] = await client`select game_id from game_external_ids where external_id='1004'`
    expect(mapping.game_id).toBe(a.id)
})
it('preserves a newer snapshot when delayed hydration finishes later', async () => {
    const a = await upsertCatalogGame(game(6, { name: 'Newer', providerUpdatedAt: '2026-10-09T00:00:00.000Z' }))
    await upsertCatalogGame(game(6, { name: 'Older' }))
    const [row] = await client`select name from games where id=${a.id}`
    expect(row.name).toBe('Newer')
})
it('denies browser catalogue writes and all mapping/cache/reset-state access', async () => {
    for (const role of ['anon', 'authenticated']) {
        for (const table of ['games', 'genres', 'platforms', 'developers', 'publishers', 'game_genres', 'game_platforms', 'game_developers', 'game_publishers', 'game_external_ids', 'igdb_private.steam_match_cache', 'igdb_private.catalog_reset_runs']) {
            const [p] = await client`select has_table_privilege(${role}, ${table}, 'INSERT') as ins,has_table_privilege(${role}, ${table}, 'UPDATE') as upd,has_table_privilege(${role}, ${table}, 'DELETE') as del`
            expect(p).toEqual({ ins: false, upd: false, del: false })
        }
        for (const table of ['game_external_ids', 'igdb_private.steam_match_cache', 'igdb_private.catalog_reset_runs']) {
            const [p] = await client`select has_table_privilege(${role}, ${table}, 'SELECT') as read`
            expect(p.read).toBe(false)
        }
        await expect(client.begin(async tx => { await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx`insert into game_external_ids(provider,external_id,game_id,match_method) values('steam','999',${randomUUID()},'igdb_external_id')` })).rejects.toThrow()
    }
})
it('keeps local slugs when provider names change and supports multiple Steam IDs', async () => {
    const first = await upsertCatalogGame(game(8, { steamAppIds: [1008, 2008, 1008] }))
    const renamed = await upsertCatalogGame(game(8, { providerSlug: 'renamed', steamAppIds: [1008, 2008] }))
    expect(renamed).toEqual(first)
    expect((await client`select * from game_external_ids where game_id=${first.id}`)).toHaveLength(2)
})
it('rolls back a first insert and taxonomy allocations on a mapping conflict', async () => {
    await expect(upsertCatalogGame(game(9, { genres: [{ igdbId: 999, name: 'New Taxon', slug: 'new' }], steamAppIds: [1008] }))).rejects.toThrow()
    expect((await client`select * from games where igdb_id=9`)).toHaveLength(0)
    expect((await client`select * from genres where igdb_id=999`)).toHaveLength(0)
})
it('concurrently imports different games with overlapping taxonomy in different input order', async () => {
    const taxa = [{ igdbId: 30, name: 'A', slug: 'a' }, { igdbId: 31, name: 'B', slug: 'b' }]
    const results = await Promise.all([upsertCatalogGame(game(10, { genres: taxa })), upsertCatalogGame(game(11, { genres: [...taxa].reverse() }))])
    expect(new Set(results.map(r => r.id)).size).toBe(2)
    const [count] = await client`select count(*)::int as n from genres where igdb_id in (30,31)`
    expect(count.n).toBe(2)
})
it('does not let another game regress shared taxonomy names or timestamps', async () => {
    const old = { igdbId: 55, name: 'Old Name', slug: 'old-name', providerUpdatedAt: '2026-01-01T00:00:00.000Z' }
    const fresh = { ...old, name: 'New Name', slug: 'new-name', providerUpdatedAt: '2026-02-01T00:00:00.000Z' }
    await upsertCatalogGame(game(12, { genres: [old] }))
    await upsertCatalogGame(game(13, { genres: [fresh] }))
    await upsertCatalogGame(game(12, { genres: [old] }))
    // A payload without a taxon timestamp must not overwrite a known snapshot.
    await upsertCatalogGame(game(14, { genres: [{ igdbId: 55, name: 'Unknown', slug: 'unknown' }] }))
    const [row] = await client`select name,slug from genres where igdb_id=55`
    expect(row).toEqual({ name: 'New Name', slug: 'new-name' })
})
it('matches a Steam app id from game_external_ids after a catalogue write', async () => {
    const saved = await upsertCatalogGame(game(40, {
        name: 'Steam Linked', providerSlug: 'steam-linked', steamAppIds: [4040], genres: [], developers: [], publishers: [],
    }))
    expect(await client`select steam_appid from games where id = ${saved.id}`).toEqual([{ steam_appid: null }])
    await client`insert into games (rawg_id, name, slug, steam_appid) values (901, 'Legacy Steam', 'legacy-steam', 5050)`
    try {
        const found = await getGamesFromSteamIds([4040, 5050, 4040])
        expect(found.map(row => row.steam_appid)).toEqual([4040])
        expect(found.find(row => row.steam_appid === 4040)?.id).toBe(saved.id)
    } finally {
        await client`delete from games where rawg_id = 901`
    }
})
it('cleanup supports an empty catalogue and refuses invalid IDs in any taxonomy table', async () => {
    const cleanup = await readFile('db/migrations/0007_igdb_catalog_cleanup.sql', 'utf8')
    const dependencies = await client`select p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc ~ '(rawg_id|metacritic_score|steam_appid)'`
    // Roll back this entire fixture, including schema changes and RPC removal.
    const rollback = new Error('fixture rollback')
    await expect(client.begin(async tx => {
        for (const table of ['games', 'genres', 'platforms', 'developers', 'publishers']) await tx.unsafe(`DELETE FROM public.${table}`)
        for (const { signature } of dependencies) await tx.unsafe(`DROP FUNCTION ${signature}`)
        await tx`alter table publishers drop constraint publishers_igdb_id_positive`
        await tx`insert into publishers(igdb_id,name,slug) values(-1,'Invalid','invalid')`
        await expect(tx.savepoint(s => s.unsafe(cleanup))).rejects.toThrow(/IGDB/)
        await tx`delete from publishers where igdb_id=-1`
        await tx`alter table publishers add constraint publishers_igdb_id_positive check(igdb_id>0)`
        await tx.unsafe(cleanup)
        const [count] = await tx`select count(*)::int as n from games`
        expect(count.n).toBe(0)
        const finalColumns = await tx`select column_name,is_nullable from information_schema.columns where table_schema='public' and table_name in ('games','genres','platforms','developers','publishers') and column_name='igdb_id'`
        expect(finalColumns).toHaveLength(5)
        expect(finalColumns.every(c => c.is_nullable === 'NO')).toBe(true)
        throw rollback
    })).rejects.toBe(rollback)
})
it('cleanup refuses unmapped rows, then refuses obsolete RPC bodies, and never deletes rows', async () => {
    const cleanup = await readFile('db/migrations/0007_igdb_catalog_cleanup.sql', 'utf8')
    await expect(client.begin(tx => tx.unsafe(cleanup))).rejects.toThrow(/IGDB/)
    const [legacy] = await client`select count(*)::int as n from games where rawg_id=900`
    expect(legacy.n).toBe(1)
    // Simulate the explicit Task 4 reset, only in this throwaway fixture database.
    await client`delete from games where rawg_id=900`
    await expect(client.begin(tx => tx.unsafe(cleanup))).rejects.toThrow(/RPC/)
    const dependencies = await client`select p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc ~ '(rawg_id|metacritic_score|steam_appid)'`
    for (const { signature } of dependencies) await client.unsafe(`DROP FUNCTION ${signature}`)
    await client.begin(tx => tx.unsafe(cleanup))
    const remaining = await client`select column_name from information_schema.columns where table_schema='public' and column_name in ('rawg_id','metacritic_score','steam_appid')`
    expect(remaining).toHaveLength(0)
    await expect(client`insert into genres(igdb_id,name,slug) values(0,'Bad','bad')`).rejects.toThrow()
    await expect(client`insert into games(name,slug) values('Null','null')`).rejects.toThrow()
    const inserted = await upsertCatalogGame(game(7))
    expect(inserted.slug).toBe(`same-name-${inserted.id}`)
    expect(inserted.slug).not.toContain('igdb')
})
it('uses an unsuffixed slug and appends the local id when that slug is taken', async () => {
    const first = await upsertCatalogGame(game(50, { providerSlug: 'Unique Title', name: 'Unique Title', steamAppIds: [5050], genres: [], developers: [], publishers: [] }))
    expect(first.slug).toBe('unique-title')
    const second = await upsertCatalogGame(game(51, { providerSlug: 'Unique Title', name: 'Unique Title', steamAppIds: [5051], genres: [], developers: [], publishers: [] }))
    expect(second.slug).toBe(`unique-title-${second.id}`)
    expect(second.slug).not.toContain('igdb')
})
it('stores a colliding genre or company slug as igdb-<id>', async () => {
    await upsertCatalogGame(game(60, { genres: [{ igdbId: 600, name: 'Action', slug: 'action' }], developers: [], publishers: [], steamAppIds: [6060] }))
    await upsertCatalogGame(game(61, { genres: [{ igdbId: 601, name: 'Action 2', slug: 'action' }], developers: [{ igdbId: 610, name: 'Co', slug: 'co' }], publishers: [], steamAppIds: [6061] }))
    await upsertCatalogGame(game(62, { genres: [], developers: [{ igdbId: 611, name: 'Co 2', slug: 'co' }], publishers: [], steamAppIds: [6062] }))
    expect(await client`select igdb_id, slug from genres where igdb_id in (600, 601) order by igdb_id`).toEqual([{ igdb_id: 600, slug: 'action' }, { igdb_id: 601, slug: 'igdb-601' }])
    expect(await client`select igdb_id, slug from developers where igdb_id in (610, 611) order by igdb_id`).toEqual([{ igdb_id: 610, slug: 'co' }, { igdb_id: 611, slug: 'igdb-611' }])
})
it('appends -igdb-<id> to a taxonomy slug only after igdb-<id> is also taken', async () => {
    await upsertCatalogGame(game(80, { genres: [{ igdbId: 800, name: 'Held', slug: 'held' }], developers: [], publishers: [], steamAppIds: [8080] }))
    await client`insert into genres (igdb_id, name, slug) values (801, 'Reserved', 'igdb-802')`
    await upsertCatalogGame(game(82, { genres: [{ igdbId: 802, name: 'Held 2', slug: 'held' }], developers: [], publishers: [], steamAppIds: [8082] }))
    expect(await client`select slug from genres where igdb_id = 802`).toEqual([{ slug: 'held-igdb-802' }])
})
it('keeps one preferred slug when two games claim it concurrently', async () => {
    await Promise.all([
        upsertCatalogGame(game(70, { genres: [{ igdbId: 700, name: 'Shooter', slug: 'shooter' }], developers: [], publishers: [], steamAppIds: [7070] })),
        upsertCatalogGame(game(71, { genres: [{ igdbId: 701, name: 'Shooter 2', slug: 'shooter' }], developers: [], publishers: [], steamAppIds: [7071] })),
    ])
    const slugs = (await client`select slug from genres where igdb_id in (700, 701)`).map(row => row.slug)
    expect(slugs.filter(slug => slug === 'shooter')).toHaveLength(1)
    expect(slugs.filter(slug => slug === 'igdb-700' || slug === 'igdb-701')).toHaveLength(1)
})
it('keeps stored game content when a later payload has no provider timestamp', async () => {
    const saved = await upsertCatalogGame(game(20, { name: 'Kept', description: 'Original', providerUpdatedAt: '2026-10-09T00:00:00.000Z' }))
    expect(await upsertCatalogGame(game(20, { name: 'Replaced', description: 'Nope', providerUpdatedAt: null }))).toEqual(saved)
    expect(await client`select name, description from games where id=${saved.id}`).toEqual([{ name: 'Kept', description: 'Original' }])
})
it('imports both games when a shared Steam id is removed before write', async () => {
    const detached = detachSharedSteamAppIds([
        game(30, { steamAppIds: [9001, 9002], genres: [], developers: [], publishers: [] }),
        game(31, { steamAppIds: [9001], genres: [], developers: [], publishers: [] }),
    ])
    expect(detached.shared).toEqual([{ appId: 9001, igdbIds: [30, 31] }])
    const first = await upsertCatalogGame(detached.games[0])
    await upsertCatalogGame(detached.games[1])
    expect(await client`select external_id from game_external_ids where external_id = '9001'`).toHaveLength(0)
    expect(await client`select external_id from game_external_ids where game_id = ${first.id}`).toEqual([{ external_id: '9002' }])
})
it('does not cache a no-match after HTTP 401 or 429', async () => {
    await state.db!.transaction(async tx => {
        expect(await writeSteamMatchCache(tx, { steamAppId: 1, matcherVersion: 'v1', httpStatus: 401, candidateCount: 0, checkedAt: '2026-10-10T00:00:00.000Z', retryAfter: '2026-10-17T00:00:00.000Z' })).toBe(false)
        expect(await writeSteamMatchCache(tx, { steamAppId: 1, matcherVersion: 'v1', httpStatus: 429, candidateCount: 0, checkedAt: '2026-10-10T00:00:00.000Z', retryAfter: '2026-10-17T00:00:00.000Z' })).toBe(false)
        expect(await writeSteamMatchCache(tx, { steamAppId: 2, matcherVersion: 'v1', httpStatus: 200, candidateCount: 0, checkedAt: '2026-10-10T00:00:00.000Z', retryAfter: '2026-10-17T00:00:00.000Z' })).toBe(true)
    })
    expect(await client`select steam_app_id, status from igdb_private.steam_match_cache order by steam_app_id`).toEqual([{ steam_app_id: 2, status: 'unmatched' }])
})
