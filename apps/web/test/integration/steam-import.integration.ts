import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { DB } from '@/lib/db'
import type { CatalogGame } from '@/lib/catalog/types'
import { IgdbError } from '@/lib/igdb/http'

const state = vi.hoisted(() => ({ db: null as DB | null, pg: null as postgres.Sql | null }))
vi.mock('@/lib/db', () => ({
    db: new Proxy({}, {
        get(_target, property) {
            const database = state.db as unknown as Record<PropertyKey, unknown> | null
            if (!database) throw new Error('Test database is not ready')
            const value = database[property]
            return typeof value === 'function' ? value.bind(database) : value
        },
    }),
    pg: new Proxy({}, {
        get(_target, property) {
            const database = state.pg as unknown as Record<PropertyKey, unknown> | null
            if (!database) throw new Error('Test database is not ready')
            const value = database[property]
            return typeof value === 'function' ? value.bind(database) : value
        },
    }),
}))

import { confirmSteamLibraryEntries, createDbSteamImportStore, resolveSteamBatch, withSteamImportTurn } from '@/lib/catalog/steam-import'
import { upsertLibraryEntries } from '@/lib/queries/library'
import type { SteamLinkEntry } from '@screenpeak/shared/types'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Catalogue tests require a local database ending in _test.')
const admin = postgres(url, { max: 1, onnotice: () => {} })
const databaseName = 'steam_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + databaseName
const client = postgres(parsed.toString(), { max: 4, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')
const NOW = new Date('2026-10-10T00:00:00.000Z')

function catalog(igdbId: number, steamAppIds: number[], patch: Partial<CatalogGame> = {}): CatalogGame {
    return {
        igdbId, name: patch.name ?? 'Game ' + igdbId, providerSlug: 'game-' + igdbId, gameType: patch.gameType ?? 0,
        released: '2020-01-01', description: null, coverImageUrl: null, artworkImageUrl: null,
        screenshots: [], esrbRating: null, redditUrl: null, providerUpdatedAt: '2026-10-10T00:00:00.000Z',
        genres: [], platforms: [], developers: [], publishers: [], steamAppIds, ...patch,
    }
}

const entry = (gameId: string, hours: number): SteamLinkEntry => ({
    gameId, playtimeSelected: hours, status: 'playing', selected: true, coverImageUrl: null,
    gameName: 'Game', gameDeveloper: '', gameReleased: null, timesPlayed: 1, completedAllAchievements: false,
})

beforeAll(async () => {
    await admin.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$`)
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`)
    await client.unsafe(`CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;`)
    for (const name of ['0000_illegal_kinsey_walden', '0001_functions_and_triggers', '0002_fix_get_feed_library_privacy', '0003_igdb_request_budget'])
        await client.unsafe(await migration(name))
    await client.unsafe('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated')
    await client.begin(async tx => { await tx.unsafe(await migration('0004_igdb_catalog_preparation')) })
    await client.begin(async tx => { await tx.unsafe(await migration('0005_taxonomy_slug_unique')) })
    await client.begin(async tx => { await tx.unsafe(await migration('0006_two_score_rpcs')) })
    state.db = drizzle(client) as unknown as DB
    state.pg = client
})

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await admin.end()
})

it('keeps metacritic_score and writes one game for two Steam apps', async () => {
    expect(await client`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'metacritic_score'`)
        .toEqual([{ column_name: 'metacritic_score' }])
    const lookup = vi.fn(async (ids: number[]) => ids.map(appid => ({ appid, candidates: [100] })))
    const hydrate = vi.fn(async () => [catalog(100, [11, 12], { name: 'Hades' })])
    const provider = { lookupSteamApps: lookup, getGamesByIds: hydrate }
    const first = await resolveSteamBatch(
        [{ appid: 11, name: 'Hades' }, { appid: 12, name: 'Hades' }],
        { provider, now: NOW },
    )
    expect(first.matched.map(row => row.appid)).toEqual([11, 12])
    expect(new Set(first.matched.map(row => row.gameId)).size).toBe(1)
    expect(await client`select external_id from game_external_ids where provider = 'steam' and external_id in ('11', '12') order by external_id`)
        .toEqual([{ external_id: '11' }, { external_id: '12' }])
    lookup.mockClear()
    const second = await resolveSteamBatch(
        [{ appid: 11, name: 'Hades' }, { appid: 12, name: 'Hades' }],
        { provider, now: NOW },
    )
    expect(lookup).not.toHaveBeenCalled()
    expect(second.matched).toEqual(first.matched)
})

it('caches a miss and an ambiguous result only after HTTP 200', async () => {
    const provider = {
        lookupSteamApps: vi.fn(async (ids: number[]) => ids.map(appid => ({
            appid, candidates: appid === 30 ? [1, 2] : [],
        }))),
        getGamesByIds: vi.fn(async () => []),
    }
    const result = await resolveSteamBatch(
        [{ appid: 40, name: 'Hitman: Sniper Challenge' }, { appid: 30, name: 'Ambiguous' }],
        { provider, now: NOW },
    )
    expect(result.unmatched).toEqual([40])
    expect(result.ambiguous).toEqual([30])
    const rows = await client`select steam_app_id, status, retry_after from igdb_private.steam_match_cache where steam_app_id in (30, 40) order by steam_app_id`
    expect(rows.map(row => row.status)).toEqual(['ambiguous', 'unmatched'])
    expect(new Date(rows[0].retry_after).toISOString()).toBe('2026-10-17T00:00:00.000Z')
    const store = createDbSteamImportStore()
    expect(await store.remember(1, 401, 0, NOW)).toBe(false)
    expect(await store.remember(2, 429, 0, NOW)).toBe(false)
    expect(await store.remember(3, 503, 0, NOW)).toBe(false)
    expect(await client`select steam_app_id from igdb_private.steam_match_cache where steam_app_id in (1, 2, 3)`).toEqual([])
})

it('does not cache provider failures or import a demo as the full game', async () => {
    const failing = {
        lookupSteamApps: vi.fn(async () => { throw new IgdbError('external_games HTTP 401.') }),
        getGamesByIds: vi.fn(async () => []),
    }
    for (const message of ['external_games HTTP 401.', 'external_games HTTP 429.', 'external_games HTTP 500.', 'request failed or timed out.']) {
        failing.lookupSteamApps.mockImplementation(async () => { throw new IgdbError(message) })
        const result = await resolveSteamBatch([{ appid: 70, name: 'Offline' }], { provider: failing, now: NOW })
        expect(result.retryable).toEqual([70])
        expect(result.unmatched).toEqual([])
    }
    expect(await client`select steam_app_id from igdb_private.steam_match_cache where steam_app_id = 70`).toEqual([])

    const demo = {
        lookupSteamApps: vi.fn(async (ids: number[]) => ids.map(appid => ({ appid, candidates: appid === 378648 ? [13166] : [3035] }))),
        getGamesByIds: vi.fn(async (ids: number[]) => ids.map(id => catalog(id, id === 3035 ? [221910, 247750, 555001] : [378648], {
            name: id === 3035 ? 'The Stanley Parable' : 'Blood and Wine', gameType: id === 3035 ? 0 : 2,
        }))),
    }
    const imported = await resolveSteamBatch([
        { appid: 247750, name: 'The Stanley Parable Demo' },
        { appid: 221910, name: 'The Stanley Parable' },
        { appid: 378648, name: 'The Witcher 3: Wild Hunt - Blood and Wine' },
    ], { provider: demo, now: NOW })
    expect(imported.matched.map(row => row.appid).sort((a, b) => a - b)).toEqual([221910, 378648])
    expect(imported.unmatched).toContain(247750)
    expect(await client`select external_id from game_external_ids where external_id = '247750'`).toEqual([])
    expect(await client`select g.igdb_id, g.game_type from game_external_ids e join games g on g.id = e.game_id where e.external_id = '378648'`)
        .toEqual([{ igdb_id: 13166, game_type: 2 }])
    expect(await client`select external_id from game_external_ids where external_id in ('221910', '247750', '555001') order by external_id`)
        .toEqual([{ external_id: '221910' }])
})

it('drops a shared id, keeps a private one, and does not match a remake by name', async () => {
    const provider = {
        lookupSteamApps: vi.fn(async (ids: number[]) => ids.map(appid => {
            if (appid === 80) return { appid, candidates: [] as number[] }
            if (appid === 83) return { appid, candidates: [501] }
            return { appid, candidates: [500] }
        })),
        getGamesByIds: vi.fn(async (ids: number[]) => ids.map(id => catalog(id, id === 500 ? [82, 99] : [83, 99], { name: 'Resident Evil 2' }))),
    }
    const result = await resolveSteamBatch([
        { appid: 82, name: 'Resident Evil 2' },
        { appid: 83, name: 'Resident Evil 2' },
        { appid: 99, name: 'Resident Evil 2' },
        { appid: 80, name: 'Resident Evil 2' },
    ], { provider, now: NOW })
    expect(result.unmatched).toContain(80)
    expect(result.ambiguous).toContain(99)
    expect(result.matched.map(row => row.appid).sort((a, b) => a - b)).toEqual([82, 83])
    expect(await client`select external_id from game_external_ids where external_id in ('80', '99', '82', '83') order by external_id`)
        .toEqual([{ external_id: '82' }, { external_id: '83' }])
    const named = await client`select count(*)::int as n from games where name = 'Resident Evil 2' and id in (select game_id from game_external_ids where external_id = '80')`
    expect(named).toEqual([{ n: 0 }])
})

it('does not let one foreign Steam id block the next game or inflate hours', async () => {
    const seed = {
        lookupSteamApps: vi.fn(async () => [{ appid: 90, candidates: [700] }]),
        getGamesByIds: vi.fn(async () => [catalog(700, [90], { name: 'Already' })]),
    }
    await resolveSteamBatch([{ appid: 90, name: 'Already' }], { provider: seed, now: NOW })
    const provider = {
        lookupSteamApps: vi.fn(async (ids: number[]) => ids.map(appid => ({ appid, candidates: [appid === 91 ? 701 : 702] }))),
        getGamesByIds: vi.fn(async (ids: number[]) => ids.map(id => catalog(id, id === 701 ? [90, 91] : [92]))),
    }
    const result = await resolveSteamBatch(
        [{ appid: 91, name: 'New' }, { appid: 92, name: 'Next' }],
        { provider, now: NOW },
    )
    expect(result.matched.map(row => row.appid).sort((a, b) => a - b)).toEqual([91, 92])
    expect(await client`select g.igdb_id from game_external_ids e join games g on g.id = e.game_id where e.external_id = '90'`)
        .toEqual([{ igdb_id: 700 }])
    const userId = randomUUID()
    await client`insert into auth.users (id, email, raw_user_meta_data) values (${userId}, 'ada@example.com', ${JSON.stringify({ username: 'adasteam' })}::jsonb)`
    const [game] = await client`select id from games where igdb_id = 700`
    await upsertLibraryEntries(userId, [entry(game.id, 5), entry(game.id, 9)])
    await Promise.all([
        upsertLibraryEntries(userId, [entry(game.id, 3)]),
        upsertLibraryEntries(userId, [entry(game.id, 4)]),
    ])
    const rows = await client`select hours_played from library_entries where user_id = ${userId}`
    expect(rows).toHaveLength(1)
    expect([3, 4]).toContain(Number(rows[0].hours_played))
    await upsertLibraryEntries(userId, [entry(game.id, 5)])
    const again = await client`select hours_played from library_entries where user_id = ${userId}`
    expect(Number(again[0].hours_played)).toBe(5)
})

it('keeps an existing library row when confirm is handed the automatic Steam hours', async () => {
    const userId = randomUUID()
    await client`insert into auth.users (id, email, raw_user_meta_data) values (${userId}, 'ada2@example.com', ${JSON.stringify({ username: 'adasteam2' })}::jsonb)`
    const [game] = await client`select id from games where igdb_id = 700`
    await client`insert into library_entries (user_id, game_id, status, hours_played, play_count, completed_all_achievements, steam_playtime_minutes)
        values (${userId}, ${game.id}, 'completed', 12, 4, true, 90)`
    const owned = [{ appid: 90, name: 'Already', playtimeMinutes: 180 }]
    const saved = await confirmSteamLibraryEntries(userId, [entry(game.id, 3)], owned)
    expect(saved[0]).toMatchObject({ playtimeSelected: 12, status: 'completed', timesPlayed: 4, completedAllAchievements: true, steamPlaytimeMinutes: 180 })
    const [row] = await client`select hours_played, status, play_count, completed_all_achievements, steam_playtime_minutes
        from library_entries where user_id = ${userId} and game_id = ${game.id}`
    expect(Number(row.hours_played)).toBe(12)
    expect(row.status).toBe('completed')
    expect(row.play_count).toBe(4)
    expect(row.completed_all_achievements).toBe(true)
    expect(row.steam_playtime_minutes).toBe(180)
})

it('does not delete other Steam rows when import writes a filtered id list', async () => {
    const store = createDbSteamImportStore()
    const saved = await store.saveGame(catalog(100, [11], { name: 'Hades' }), [11])
    expect(saved.attached).toEqual([11])
    expect(await client`select external_id from game_external_ids e join games g on g.id = e.game_id
        where g.igdb_id = 100 and e.external_id in ('11', '12') order by external_id`)
        .toEqual([{ external_id: '11' }, { external_id: '12' }])
    expect(await client`select steam_app_id from igdb_private.steam_match_cache where steam_app_id in (11, 12)`).toEqual([])
})

it('serializes two import turns for one user and lets the next user proceed', async () => {
    const userId = randomUUID()
    const otherId = randomUUID()
    let release: () => void = () => {}
    let entered: () => void = () => {}
    const hold = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    const first = withSteamImportTurn(userId, async () => { entered(); await hold; return 'first' as const })
    await started
    expect(await withSteamImportTurn(userId, async () => 'second' as const)).toEqual({ busy: true })
    expect(await withSteamImportTurn(otherId, async () => 'other' as const)).toBe('other')
    release()
    expect(await first).toBe('first')
})
