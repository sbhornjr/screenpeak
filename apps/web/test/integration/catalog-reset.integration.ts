import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { DB } from '@/lib/db'
import type { CatalogGame } from '@/lib/catalog/types'
import { applyPending, ensureLocalAuthStubs, inspectMigrations, stampBaseline, type MigrationSql } from '@/lib/catalog/migrations'
import { applyCatalogReset, backupResetState, buildManifest, planCatalogReset, resetFromProvider, restoreResetState } from '@/lib/catalog/reset'
import { SeedInterrupted, idsToSeed, seedCatalogGames, storedIgdbIds } from '@/lib/catalog/seed'

const exec = promisify(execFile)
const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Catalogue tests require a local database ending in _test.')
const admin = postgres(url, { max: 1, onnotice: () => {} })
const names: string[] = []
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')
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
const staged = (id: number, steamAppIds: number[]): CatalogGame => ({
    igdbId: id, name: 'Staged ' + id, providerSlug: 'staged-' + id, gameType: 0,
    released: null, description: null, coverImageUrl: null, artworkImageUrl: null,
    screenshots: [], esrbRating: null, redditUrl: null, providerUpdatedAt: '2026-10-10T00:00:00.000Z',
    genres: [], platforms: [], developers: [], publishers: [], steamAppIds,
})

let client: postgres.Sql
let database: DB
let legacyId: string
let userA: string
let manifest: Awaited<ReturnType<typeof buildManifest>>

beforeAll(async () => {
    client = await createDatabase('journal_')
    const sql = client as unknown as MigrationSql
    await ensureLocalAuthStubs(sql)
    await client.unsafe(await migration('0000_illegal_kinsey_walden'))
    await client.unsafe(await migration('0001_functions_and_triggers'))
    database = drizzle(client) as unknown as DB
}, 60_000)
afterAll(async () => {
    await client?.end()
    for (const name of names) await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.end()
})

it('does not record a journal while inspecting, and refuses to stamp or migrate early', async () => {
    const sql = client as unknown as MigrationSql
    const report = await inspectMigrations(sql)
    expect(report.baseline).toBe('reject')
    expect(report.reasons.join(' ')).toMatch(/library_public/)
    expect(await client`select to_regclass('drizzle.__drizzle_migrations') as journal`).toEqual([{ journal: null }])
    await expect(stampBaseline(sql)).rejects.toThrow(/library_public/)
    await expect(applyPending(sql)).rejects.toThrow(/0000/)
})

it('stamps 0000–0002 without replay, then applies only the pending migrations', async () => {
    const sql = client as unknown as MigrationSql
    await client.unsafe(await migration('0002_fix_get_feed_library_privacy'))
    const [legacy] = await client`insert into games (rawg_id, name, slug) values (900, 'Legacy', 'legacy') returning id`
    legacyId = legacy.id
    expect(await stampBaseline(sql)).toEqual([
        '0000_illegal_kinsey_walden', '0001_functions_and_triggers', '0002_fix_get_feed_library_privacy',
    ])
    expect(await stampBaseline(sql)).toEqual([])
    const applied = await applyPending(sql, undefined, { through: '0006_two_score_rpcs' })
    expect(applied).toEqual(['0003_igdb_request_budget', '0004_igdb_catalog_preparation', '0005_taxonomy_slug_unique', '0006_two_score_rpcs'])
    const [row] = await client`select rawg_id, igdb_id, slug from games where id = ${legacyId}`
    expect(row).toEqual({ rawg_id: 900, igdb_id: null, slug: 'legacy' })
    await expect(applyPending(sql)).rejects.toThrow(/IGDB cleanup refused/)
    expect(await client`select rawg_id, igdb_id, slug from games where id = ${legacyId}`).toEqual([{ rawg_id: 900, igdb_id: null, slug: 'legacy' }])
    const pending = await inspectMigrations(sql)
    expect(pending.pending).toEqual(['0007_igdb_catalog_cleanup'])
})

it('aborts the taxonomy uniqueness migration when slugs collide and keeps the rows', async () => {
    await client`alter table genres drop constraint genres_slug_key`
    await client`insert into genres (name, slug, igdb_id) values ('A', 'dup-slug', 1), ('B', 'dup-slug', 2)`
    await expect(client.begin(async tx => { await tx.unsafe(await migration('0005_taxonomy_slug_unique')) })).rejects.toThrow(/genres slug/)
    expect(await client`select count(*)::int as n from genres where slug = 'dup-slug'`).toEqual([{ n: 2 }])
    await client`delete from genres where slug = 'dup-slug'`
    await client`alter table genres add constraint genres_slug_key unique (slug)`
})

it('seeds an IGDB game without clearing retained library rows', async () => {
    userA = randomUUID()
    const userB = randomUUID()
    // 0001's signup trigger creates the profile and a default Wishlist from auth.users.
    await client`insert into auth.users (id, email, raw_user_meta_data) values
        (${userA}, 'ada@example.com', ${JSON.stringify({ username: 'ada' })}::jsonb),
        (${userB}, 'bea@example.com', ${JSON.stringify({ username: 'bea' })}::jsonb)`
    await client`update users set user_bio = 'bio', profile_loadout_bio = 'authored', selected_title = 'Champion', loadout_identity = 'generated' where id = ${userA}`
    await client`update users set favorite_game_ids = array[${legacyId}::uuid] where id = ${userA}`
    const listId = randomUUID()
    await client`insert into lists (id, user_id, name, description, is_public) values (${listId}, ${userA}, 'Kept', 'still here', true)`
    await client`insert into follows (follower_id, following_id) values (${userA}, ${userB})`
    await client`insert into list_likes (user_id, list_id) values (${userB}, ${listId})`
    await client`insert into steam_accounts (user_id, steam_id) values (${userA}, '76561198000000000')`
    await client`insert into library_entries (user_id, game_id) values (${userA}, ${legacyId})`
    await client`insert into ratings_reviews (user_id, game_id, rating, review) values (${userA}, ${legacyId}, 8, 'kept review')`
    await client`insert into list_games (list_id, game_id) values (${listId}, ${legacyId})`
    const seeded = await seedCatalogGames(database, [staged(10, [4242]), staged(11, [4242, 4243])])
    expect(seeded.shared).toEqual([{ appId: 4242, igdbIds: [10, 11] }])
    expect(await client`select count(*)::int as n from library_entries`).toEqual([{ n: 1 }])
    expect(await client`select external_id from game_external_ids where external_id in ('4242', '4243') order by external_id`).toEqual([{ external_id: '4243' }])
    const foreign = await seedCatalogGames(database, [staged(12, [4243])])
    expect(foreign.omittedForeign).toEqual([{ igdbId: 12, appIds: [4243] }])
    expect(await client`select g.igdb_id from game_external_ids e join games g on g.id = e.game_id where e.external_id = '4243'`).toEqual([{ igdb_id: 11 }])
})

it('dry-run and a provider failure write nothing', async () => {
    manifest = await buildManifest(database, [staged(100, [100]), staged(101, [100, 101])], randomUUID())
    const plan = await planCatalogReset(database, manifest)
    expect(plan.fingerprintMatches).toBe(true)
    expect(plan.library).toBe(1)
    expect(plan.favourites).toBe(1)
    expect(await client`select loadout_identity from users where id = ${userA}`).toEqual([{ loadout_identity: 'generated' }])
    await expect(resetFromProvider(database, () => Promise.reject(new Error('provider down')), randomUUID())).rejects.toThrow(/provider down/)
    expect(await client`select count(*)::int as n from library_entries`).toEqual([{ n: 1 }])
    expect(await client`select count(*)::int as n from igdb_private.catalog_reset_runs`).toEqual([{ n: 0 }])
})

it('refuses apply when a library row appears after the manifest is staged', async () => {
    const [userB] = await client`select id from users where username = 'bea'`
    await client`insert into library_entries (user_id, game_id) values (${userB.id}, ${legacyId})`
    await expect(applyCatalogReset(database, manifest)).rejects.toThrow(/Stale reset manifest/)
    await client`delete from library_entries where user_id = ${userB.id}`
    expect(await client`select count(*)::int as n from library_entries`).toEqual([{ n: 1 }])
    expect(await client`select count(*)::int as n from games where slug = 'legacy'`).toEqual([{ n: 1 }])
})

it('refuses an empty manifest that would wipe the catalogue', async () => {
    const empty = await buildManifest(database, [], randomUUID())
    const plan = await planCatalogReset(database, empty)
    expect(plan.writing).toBe(0)
    expect(plan.games).toBeGreaterThan(0)
    expect(plan.blocked).toMatch(/empty/)
    const before = await client`select count(*)::int as n from games`
    await expect(applyCatalogReset(database, empty)).rejects.toThrow(/empty/)
    expect(await client`select count(*)::int as n from games`).toEqual(before)
    expect(await client`select count(*)::int as n from library_entries`).toEqual([{ n: 1 }])
})

it('rolls back a failure after the clear and rejects a stale manifest', async () => {
    await expect(applyCatalogReset(database, manifest, { afterClear: async () => { throw new Error('disk full') } })).rejects.toThrow(/disk full/)
    expect(await client`select count(*)::int as n from library_entries`).toEqual([{ n: 1 }])
    expect(await client`select slug from games where id = ${legacyId}`).toEqual([{ slug: 'legacy' }])
    await client`update users set username = 'ada2' where id = ${userA}`
    await expect(applyCatalogReset(database, manifest)).rejects.toThrow(/Stale reset manifest/)
    expect(await client`select count(*)::int as n from ratings_reviews`).toEqual([{ n: 1 }])
    await client`update users set username = 'ada' where id = ${userA}`
})

it('resets game-linked rows, keeps accounts, refuses replay, and restores the backup', async () => {
    manifest = await buildManifest(database, [staged(100, [100]), staged(101, [100, 101])], manifest.runId)
    const firstBackup = await backupResetState(client as unknown as MigrationSql)
    const secondBackup = await backupResetState(client as unknown as MigrationSql)
    expect(firstBackup).toBe('reset_backup')
    expect(secondBackup).toBe('reset_backup_2')
    const backups = await client`select nspname from pg_namespace where nspname like 'reset_backup%' order by nspname`
    expect(backups).toEqual([{ nspname: 'reset_backup' }, { nspname: 'reset_backup_2' }])
    const [copied] = await client`select (select count(*)::int from reset_backup.games) as first, (select count(*)::int from reset_backup_2.games) as second`
    expect(copied.first).toBeGreaterThan(0)
    expect(copied.second).toBe(copied.first)
    const applied = await applyCatalogReset(database, manifest)
    expect(applied.shared).toEqual([{ appId: 100, igdbIds: [100, 101] }])
    expect(applied.written).toBe(2)
    expect(await client`select username, user_bio, profile_loadout_bio, selected_title, loadout_identity, favorite_game_ids from users where id = ${userA}`)
        .toEqual([{ username: 'ada', user_bio: 'bio', profile_loadout_bio: 'authored', selected_title: 'Champion', loadout_identity: null, favorite_game_ids: [] }])
    expect(await client`select name, description from lists where name = 'Kept'`).toEqual([{ name: 'Kept', description: 'still here' }])
    expect(await client`select count(*)::int as n from lists`).toEqual([{ n: 3 }])
    expect(await client`select count(*)::int as n from follows`).toEqual([{ n: 1 }])
    expect(await client`select count(*)::int as n from list_likes`).toEqual([{ n: 1 }])
    expect(await client`select steam_id from steam_accounts`).toEqual([{ steam_id: '76561198000000000' }])
    expect(await client`select count(*)::int as n from library_entries`).toEqual([{ n: 0 }])
    expect(await client`select count(*)::int as n from ratings_reviews`).toEqual([{ n: 0 }])
    expect(await client`select count(*)::int as n from list_games`).toEqual([{ n: 0 }])
    expect(await client`select count(*)::int as n from games where rawg_id = 900`).toEqual([{ n: 0 }])
    const games = await client`select igdb_id from games order by igdb_id`
    expect(games.map(row => row.igdb_id)).toEqual([100, 101])
    expect(await client`select external_id from game_external_ids order by external_id`).toEqual([{ external_id: '101' }])
    await expect(applyCatalogReset(database, manifest)).rejects.toThrow(/already committed/)
    expect(await client`select count(*)::int as n from games`).toEqual([{ n: 2 }])
    await restoreResetState(client as unknown as MigrationSql)
    expect(await client`select slug from games where rawg_id = 900`).toEqual([{ slug: 'legacy' }])
    expect(await client`select loadout_identity, favorite_game_ids from users where id = ${userA}`)
        .toEqual([{ loadout_identity: 'generated', favorite_game_ids: [legacyId] }])
    expect(await client`select count(*)::int as n from library_entries`).toEqual([{ n: 1 }])
    expect(await client`select count(*)::int as n from igdb_private.catalog_reset_runs`).toEqual([{ n: 0 }])
    expect(await client`select nspname from pg_namespace where nspname like 'reset_backup%' order by nspname`)
        .toEqual([{ nspname: 'reset_backup' }, { nspname: 'reset_backup_2' }])
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

it('allows an empty reset at 25 games and skips reset_backup when that apply is refused', async () => {
    const fresh = await createDatabase('floor_')
    const dir = await mkdtemp(join(tmpdir(), 'screenpeak-reset-'))
    const manifestPath = join(dir, 'manifest.json')
    try {
        const sql = fresh as unknown as MigrationSql
        await ensureLocalAuthStubs(sql)
        await fresh.unsafe(await migration('0000_illegal_kinsey_walden'))
        await fresh.unsafe(await migration('0001_functions_and_triggers'))
        await fresh.unsafe(await migration('0002_fix_get_feed_library_privacy'))
        await stampBaseline(sql)
        await applyPending(sql, undefined, { through: '0006_two_score_rpcs' })
        await fresh`insert into games (rawg_id, name, slug) select i, 'Game ' || i, 'game-' || i from generate_series(1, 25) as i`
        const floorDb = drizzle(fresh) as unknown as DB
        const empty = await buildManifest(floorDb, [], randomUUID())
        expect((await planCatalogReset(floorDb, empty)).blocked).toMatch(/empty/)
        expect((await planCatalogReset(floorDb, empty, { allowEmpty: true })).blocked).toBeNull()
        await writeFile(manifestPath, JSON.stringify(empty))
        const [named] = await fresh`select current_database() as name`
        const target = databaseUrl(String(named.name))
        const run = (args: string[]) => exec(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/reset-catalog-to-igdb.ts', '--database-env', 'TEST_DATABASE_URL', '--manifest', manifestPath, ...args], {
            env: { ...process.env, TEST_DATABASE_URL: target },
        })
        const refused = await run(['--apply']).then(() => '', reason => String(reason))
        expect(refused).toMatch(/empty/)
        expect(refused).not.toMatch(/allow-small/)
        expect(await fresh`select nspname from pg_namespace where nspname like 'reset_backup%'`).toEqual([])
        expect(await fresh`select count(*)::int as n from games`).toEqual([{ n: 25 }])
        const dry = JSON.parse((await run(['--allow-empty'])).stdout)
        expect(dry.dryRun).toBe(true)
        expect(dry.blocked).toBeNull()
        expect(dry.games).toBe(25)
        await run(['--apply', '--allow-empty'])
        expect(await fresh`select count(*)::int as n from games`).toEqual([{ n: 0 }])
        expect(await fresh`select nspname from pg_namespace where nspname = 'reset_backup'`).toEqual([{ nspname: 'reset_backup' }])
    } finally {
        await rm(dir, { recursive: true, force: true })
        await fresh.end()
    }
}, 60_000)

it('rolls back 0003–0006 when 0007 is in the same pending batch as a legacy row', async () => {
    const fresh = await createDatabase('dirty_')
    try {
        const sql = fresh as unknown as MigrationSql
        await ensureLocalAuthStubs(sql)
        await fresh.unsafe(await migration('0000_illegal_kinsey_walden'))
        await fresh.unsafe(await migration('0001_functions_and_triggers'))
        await fresh.unsafe(await migration('0002_fix_get_feed_library_privacy'))
        await fresh`insert into games (rawg_id, name, slug) values (901, 'Legacy', 'legacy-dirty')`
        expect(await stampBaseline(sql)).toEqual([
            '0000_illegal_kinsey_walden', '0001_functions_and_triggers', '0002_fix_get_feed_library_privacy',
        ])
        await expect(applyPending(sql)).rejects.toThrow(/IGDB cleanup refused/)
        expect(await fresh`select to_regclass('igdb_private.steam_match_cache') as cache`).toEqual([{ cache: null }])
        expect(await fresh`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'rawg_id'`)
            .toEqual([{ column_name: 'rawg_id' }])
        expect(await fresh`select count(*)::int as n from drizzle.__drizzle_migrations`).toEqual([{ n: 3 }])
    } finally {
        await fresh.end()
    }
}, 60_000)

it('applies the whole chain on an empty database and records every file', async () => {
    const fresh = await createDatabase('empty_')
    try {
        const sql = fresh as unknown as MigrationSql
        await ensureLocalAuthStubs(sql)
        const applied = await applyPending(sql)
        expect(applied[0]).toBe('0000_illegal_kinsey_walden')
        expect(applied.at(-1)).toBe('0007_igdb_catalog_cleanup')
        expect(await applyPending(sql)).toEqual([])
        const recorded = await inspectMigrations(sql)
        expect(recorded.baseline).toBe('recorded')
        expect(recorded.pending).toEqual([])
        expect(recorded.reasons.join(' ')).toMatch(/already recorded/)
        expect(await stampBaseline(sql)).toEqual([])
        const [column] = await fresh`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'igdb_id'`
        expect(column.is_nullable).toBe('NO')
        const dropped = await fresh`select column_name from information_schema.columns where table_schema = 'public' and column_name in ('rawg_id', 'metacritic_score', 'steam_appid')`
        expect(dropped).toEqual([])
        const [count] = await fresh`select count(*)::int as n from drizzle.__drizzle_migrations`
        expect(count.n).toBe(8)
    } finally {
        await fresh.end()
    }
}, 60_000)

it('resumes after the first 200 games are already stored', async () => {
    const fresh = await createDatabase('resume_')
    try {
        const sql = fresh as unknown as MigrationSql
        await ensureLocalAuthStubs(sql)
        await applyPending(sql)
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

it('fingerprints a reset when pgcrypto is in the extensions schema', async () => {
    const fresh = await createDatabase('digest_')
    try {
        const sql = fresh as unknown as MigrationSql
        await ensureLocalAuthStubs(sql)
        await applyPending(sql)
        await fresh`create schema if not exists extensions`
        await fresh`alter extension pgcrypto set schema extensions`
        const digestDb = drizzle(fresh) as unknown as DB
        const manifest = await buildManifest(digestDb, [], randomUUID())
        expect(manifest.fingerprint).toMatch(/^[0-9a-f]{64}$/)
        const again = await buildManifest(digestDb, [], randomUUID())
        expect(again.fingerprint).toBe(manifest.fingerprint)
    } finally {
        await fresh.end()
    }
}, 60_000)
