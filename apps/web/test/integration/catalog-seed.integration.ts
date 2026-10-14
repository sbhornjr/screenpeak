import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { DB } from '@/lib/db'
import type { CatalogGame } from '@/lib/catalog/types'
import { applyPending, type MigrationSql } from '@/lib/catalog/migrations'
import { SeedInterrupted, idsToSeed, seedCatalogGames, storedIgdbIds } from '@/lib/catalog/seed'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Catalogue tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const names: string[] = []

function databaseUrl(name: string) {
    const next = new URL(url!)
    next.pathname = '/' + name
    return next.toString()
}

async function createDatabase(prefix: string) {
    const name = prefix + randomUUID().replaceAll('-', '') + '_test'
    names.push(name)
    await admin.unsafe(`CREATE DATABASE "${name}"`)
    return postgres(databaseUrl(name), { max: 4, prepare: false, onnotice: () => {} })
}

async function localAuthStubs(sql: postgres.Sql) {
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS auth')
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text,
        raw_user_meta_data jsonb
    )`)
    await sql.unsafe(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$`)
}

const staged = (id: number, steamAppIds: number[]): CatalogGame => ({
    igdbId: id, name: 'Staged ' + id, providerSlug: 'staged-' + id, gameType: 0,
    released: null, description: null, coverImageUrl: null, artworkImageUrl: null,
    screenshots: [], esrbRating: null, redditUrl: null, providerUpdatedAt: '2026-10-10T00:00:00.000Z',
    genres: [], platforms: [], developers: [], publishers: [], steamAppIds,
})

let client: postgres.Sql
let database: DB
let keptId: string
let userA: string

beforeAll(async () => {
    await admin.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$`)
    client = await createDatabase('seed_')
    await localAuthStubs(client)
    await applyPending(client as unknown as MigrationSql)
    database = drizzle(client) as unknown as DB
}, 60_000)

afterAll(async () => {
    await client?.end()
    for (const name of names) await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.end()
})

it('seeds an IGDB game without clearing retained library rows', async () => {
    const [kept] = await client`insert into games (igdb_id, name, slug) values (1, 'Kept', 'kept') returning id`
    keptId = kept.id
    userA = randomUUID()
    const userB = randomUUID()
    await client`insert into auth.users (id, email, raw_user_meta_data) values
        (${userA}, 'ada@example.com', ${JSON.stringify({ username: 'ada' })}::jsonb),
        (${userB}, 'bea@example.com', ${JSON.stringify({ username: 'bea' })}::jsonb)`
    await client`update users set user_bio = 'bio', profile_loadout_bio = 'authored', selected_title = 'Champion', loadout_identity = 'generated' where id = ${userA}`
    await client`update users set favorite_game_ids = array[${keptId}::uuid] where id = ${userA}`
    const listId = randomUUID()
    await client`insert into lists (id, user_id, name, description, is_public) values (${listId}, ${userA}, 'Kept', 'still here', true)`
    await client`insert into follows (follower_id, following_id) values (${userA}, ${userB})`
    await client`insert into list_likes (user_id, list_id) values (${userB}, ${listId})`
    await client`insert into steam_accounts (user_id, steam_id) values (${userA}, '76561198000000000')`
    await client`insert into library_entries (user_id, game_id) values (${userA}, ${keptId})`
    await client`insert into ratings_reviews (user_id, game_id, rating, review) values (${userA}, ${keptId}, 8, 'kept review')`
    await client`insert into list_games (list_id, game_id) values (${listId}, ${keptId})`
    const seeded = await seedCatalogGames(database, [staged(10, [4242]), staged(11, [4242, 4243])])
    expect(seeded.shared).toEqual([{ appId: 4242, igdbIds: [10, 11] }])
    expect(await client`select count(*)::int as n from library_entries`).toEqual([{ n: 1 }])
    expect(await client`select count(*)::int as n from ratings_reviews`).toEqual([{ n: 1 }])
    expect(await client`select slug from games where id = ${keptId}`).toEqual([{ slug: 'kept' }])
    expect(await client`select external_id from game_external_ids where external_id in ('4242', '4243') order by external_id`).toEqual([{ external_id: '4243' }])
    const foreign = await seedCatalogGames(database, [staged(12, [4243])])
    expect(foreign.omittedForeign).toEqual([{ igdbId: 12, appIds: [4243] }])
    expect(await client`select g.igdb_id from game_external_ids e join games g on g.id = e.game_id where e.external_id = '4243'`).toEqual([{ igdb_id: 11 }])
    expect(await client`select loadout_identity from users where id = ${userA}`).toEqual([{ loadout_identity: 'generated' }])
})

it('commits a seed batch and names the games left when the next batch fails', async () => {
    const good = Array.from({ length: 50 }, (_, index) => staged(300 + index, [9000 + index]))
    const bad = { ...staged(350, [9050]), igdbId: -1 }
    try {
        await seedCatalogGames(database, [...good, bad])
        expect.unreachable()
    } catch (error) {
        expect(error).toBeInstanceOf(SeedInterrupted)
        const interrupted = error as SeedInterrupted
        expect(interrupted.committed).toBe(50)
        expect(interrupted.remainingIgdbIds).toEqual([-1])
        expect(interrupted.message).toMatch(/--resume/)
    }
    const stored = await storedIgdbIds(database, good.map(row => row.igdbId))
    expect(stored.sort((left, right) => left - right)).toEqual(good.map(row => row.igdbId))
}, 60_000)

it('upserts a batch of taxonomy, slugs, and steam ids without a query per row', async () => {
    const row = (id: number, steam: number[]): CatalogGame => ({
        ...staged(id, steam),
        providerSlug: 'Same Title',
        genres: [
            { igdbId: 600, name: 'Action', slug: 'action', providerUpdatedAt: '2026-10-10T00:00:00.000Z' },
            { igdbId: 601, name: 'Action 2', slug: 'action', providerUpdatedAt: '2026-10-10T00:00:00.000Z' },
        ],
        platforms: [{ igdbId: 700, name: 'PC', slug: 'pc', providerUpdatedAt: '2026-10-10T00:00:00.000Z' }],
        developers: [{ igdbId: 800 + id, name: 'Co ' + id, slug: 'co', providerUpdatedAt: '2026-10-10T00:00:00.000Z' }],
        publishers: [],
    })
    let statements = 0
    const seeded = await seedCatalogGames(database, [row(910, [9100]), row(911, [9110])], {
        onPhase: event => { if (event.phase === 'committed') statements = event.statements ?? 0 },
    })
    expect(seeded.written).toBe(2)
    expect(statements).toBeGreaterThan(0)
    expect(statements).toBeLessThan(40)
    const slugs = await client`select igdb_id, slug from games where igdb_id in (910, 911) order by igdb_id`
    expect(slugs[0]).toMatchObject({ igdb_id: 910, slug: 'same-title' })
    expect(slugs[1].slug).toMatch(/^same-title-/)
    expect(await client`select igdb_id, slug from genres where igdb_id in (600, 601) order by igdb_id`).toEqual([
        { igdb_id: 600, slug: 'action' }, { igdb_id: 601, slug: 'igdb-601' },
    ])
    expect(await client`select igdb_id, slug from developers where igdb_id in (1710, 1711) order by igdb_id`).toEqual([
        { igdb_id: 1710, slug: 'co' }, { igdb_id: 1711, slug: 'igdb-1711' },
    ])
    expect(await client`select count(*)::int as n from game_genres j join games g on g.id = j.game_id where g.igdb_id in (910, 911)`).toEqual([{ n: 4 }])
    expect(await client`select count(*)::int as n from game_platforms j join games g on g.id = j.game_id where g.igdb_id in (910, 911)`).toEqual([{ n: 2 }])
    expect(await client`select external_id from game_external_ids where external_id in ('9100', '9110') order by external_id`).toEqual([
        { external_id: '9100' }, { external_id: '9110' },
    ])
    const renamed = row(910, [9100])
    renamed.name = 'Renamed Game'
    renamed.providerUpdatedAt = '2026-11-01T00:00:00.000Z'
    renamed.genres = [
        { igdbId: 600, name: 'Action Renamed', slug: 'action', providerUpdatedAt: '2026-11-01T00:00:00.000Z' },
        { igdbId: 601, name: 'Action 2', slug: 'action', providerUpdatedAt: '2026-10-10T00:00:00.000Z' },
    ]
    const older = row(911, [9110])
    older.name = 'Should Not Stick'
    older.providerUpdatedAt = '2020-01-01T00:00:00.000Z'
    await seedCatalogGames(database, [renamed, older])
    expect(await client`select name, slug from games where igdb_id = 910`).toEqual([{ name: 'Renamed Game', slug: 'same-title' }])
    expect(await client`select name from games where igdb_id = 911`).toEqual([{ name: 'Staged 911' }])
    expect(await client`select name from genres where igdb_id = 600`).toEqual([{ name: 'Action Renamed' }])
    expect(await client`select slug from genres where igdb_id = 601`).toEqual([{ slug: 'igdb-601' }])
}, 60_000)

it('hands a taxonomy slug to the other row in the same batch', async () => {
    const game = (stamp: string, first: string, second: string): CatalogGame => ({
        ...staged(920, []),
        providerUpdatedAt: stamp,
        genres: [
            { igdbId: 9201, name: 'Alpha', slug: first, providerUpdatedAt: stamp },
            { igdbId: 9202, name: 'Beta', slug: second, providerUpdatedAt: stamp },
        ],
    })
    await seedCatalogGames(database, [game('2026-10-01T00:00:00.000Z', 'alpha', 'beta')])
    await seedCatalogGames(database, [game('2026-11-01T00:00:00.000Z', 'beta', 'alpha')])
    expect(await client`select igdb_id, slug from genres where igdb_id in (9201, 9202) order by igdb_id`).toEqual([
        { igdb_id: 9201, slug: 'igdb-9201' },
        { igdb_id: 9202, slug: 'alpha' },
    ])
}, 60_000)

it('moves a Steam id released by one game in the batch onto the game that claims it', async () => {
    await seedCatalogGames(database, [staged(930, [9300]), staged(931, [])])
    await seedCatalogGames(database, [staged(930, []), staged(931, [9300])])
    expect(await client`select g.igdb_id, e.external_id
        from game_external_ids e
        join games g on g.id = e.game_id
        where e.provider = 'steam' and g.igdb_id in (930, 931)
        order by g.igdb_id`).toEqual([{ igdb_id: 931, external_id: '9300' }])
}, 60_000)

it('resumes after the first 200 games are already stored', async () => {
    const fresh = await createDatabase('resume_')
    try {
        await localAuthStubs(fresh)
        await applyPending(fresh as unknown as MigrationSql)
        const resumeDb = drizzle(fresh) as unknown as DB
        const ranked = Array.from({ length: 250 }, (_, index) => index + 1)
        await seedCatalogGames(resumeDb, ranked.slice(0, 200).map(id => staged(id, [])))
        const stored = await storedIgdbIds(resumeDb, ranked)
        const plan = idsToSeed(ranked, stored, true)
        expect(plan.skippedExisting).toEqual(ranked.slice(0, 200))
        expect(plan.ids).toEqual(ranked.slice(200))
        expect((await seedCatalogGames(resumeDb, plan.ids.map(id => staged(id, [])))).written).toBe(50)
        expect(await fresh`select count(*)::int as n from games`).toEqual([{ n: 250 }])
        expect(await storedIgdbIds(resumeDb, ranked)).toHaveLength(250)
    } finally {
        await fresh.end()
    }
}, 60_000)
