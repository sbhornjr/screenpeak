import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { DB } from '@/lib/db'

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

import { getTaxonomyNameBySlug, searchGamesByName, searchLibraryTaxonomy, searchTaxonomyTable } from '@/lib/queries/game'
import { consumeApiRateLimit, deleteStaleRateLimits } from '@/lib/rate-limit'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Search tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const databaseName = 'search_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + databaseName
const client = postgres(parsed.toString(), { max: 4, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')
const userA = randomUUID()
const userB = randomUUID()

beforeAll(async () => {
    await admin.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOINHERIT; END IF;
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
    await client.begin(async tx => { await tx.unsafe(await migration('0007_igdb_catalog_cleanup')) })
    for (const name of ['0008_steam_import_lease', '0009_api_rate_limits']) {
        for (const statement of (await migration(name)).split('--> statement-breakpoint')) {
            const text = statement.trim()
            if (text) await client.unsafe(text)
        }
    }
    state.db = drizzle(client) as unknown as DB

    await client`insert into auth.users (id, email, raw_user_meta_data) values
        (${userA}, 'search-a@example.com', ${JSON.stringify({ username: 'searchA' })}::jsonb),
        (${userB}, 'search-b@example.com', ${JSON.stringify({ username: 'searchB' })}::jsonb)`
    await client`insert into games (igdb_id, name, slug) values
        (920001, '100% Club', 'hundred-percent'),
        (920002, '1000 Club', 'thousand-club'),
        (920003, 'A_B Title', 'a-b-title'),
        (920004, 'AxB Title', 'axb-title')`
    const [percent] = await client`select id from games where slug = 'hundred-percent'`
    await client`insert into ratings_reviews (user_id, game_id, rating, review) values
        (${userA}, ${percent.id}, 8, ''),
        (${userB}, ${percent.id}, 10, '')`
    await client`insert into developers (igdb_id, name, slug) values (920001, 'FromSoftware', 'fromsoftware')`
    await client`insert into publishers (igdb_id, name, slug) values (920001, 'Bandai Namco', 'bandai-namco')`
}, 60_000)

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await admin.end()
})

it('matches literal percent and underscore, and returns the community average', async () => {
    const percent = await searchGamesByName('100%')
    expect(percent.map(row => row.name)).toEqual(['100% Club'])
    expect(percent[0].avg_rating).toBe(9)
    expect(percent[0].id).toMatch(/^[0-9a-f-]{36}$/i)

    const underscore = await searchGamesByName('A_B')
    expect(underscore.map(row => row.name)).toEqual(['A_B Title'])

    const clubs = await searchGamesByName('Club')
    expect(clubs.map(row => row.name)).toEqual(['100% Club', '1000 Club'])
})

it('searches a taxonomy table and resolves a slug to its name', async () => {
    const developers = await searchTaxonomyTable('developers', 'soft')
    expect(developers).toEqual([expect.objectContaining({ name: 'FromSoftware', slug: 'fromsoftware' })])
    expect(developers[0].id).toMatch(/^[0-9a-f-]{36}$/i)

    const limited = await searchTaxonomyTable('developers', 'soft', [developers[0].id])
    expect(limited).toHaveLength(1)
    const missed = await searchTaxonomyTable('developers', 'soft', [randomUUID()])
    expect(missed).toEqual([])

    expect(await getTaxonomyNameBySlug('publishers', 'bandai-namco')).toBe('Bandai Namco')
    expect(await getTaxonomyNameBySlug('publishers', 'missing')).toBe('')
})

it('counts concurrent hits once each and resets when the window has passed', async () => {
    await Promise.all(Array.from({ length: 8 }, () => consumeApiRateLimit('burst', 100, 60)))
    const [burst] = await client`select hits from api_rate_limits where bucket = 'burst'`
    expect(Number(burst.hits)).toBe(8)

    await consumeApiRateLimit('reset-bucket', 1, 60)
    await expect(consumeApiRateLimit('reset-bucket', 1, 60)).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
    await client`update api_rate_limits set window_start = clock_timestamp() - interval '2 minutes' where bucket = 'reset-bucket'`
    await expect(consumeApiRateLimit('reset-bucket', 1, 60)).resolves.toBeUndefined()
    const [reset] = await client`select hits from api_rate_limits where bucket = 'reset-bucket'`
    expect(Number(reset.hits)).toBe(1)
})

it('does not let the anon role read rate-limit rows', async () => {
    await expect(client.begin(async tx => {
        await tx.unsafe('set local role anon')
        await tx.unsafe('select 1 from api_rate_limits')
    })).rejects.toThrow(/permission denied/i)
})

it('revokes service_role when that role exists', async () => {
    await client.unsafe('GRANT SELECT ON api_rate_limits TO service_role')
    const revoke = (await migration('0009_api_rate_limits')).split('--> statement-breakpoint').at(-1)?.trim()
    if (!revoke) throw new Error('0009 is missing its service_role revoke')
    await client.unsafe(revoke)
    await expect(client.begin(async tx => {
        await tx.unsafe('set local role service_role')
        await tx.unsafe('select 1 from api_rate_limits')
    })).rejects.toThrow(/permission denied/i)
})

it('finds a developer on a 201-game library without sending those ids', async () => {
    await client.unsafe(`
        insert into developers (igdb_id, name, slug)
        select 930000 + n, 'Lib Dev ' || n, 'lib-dev-' || n
        from generate_series(1, 201) as n;
        insert into games (igdb_id, name, slug)
        select 940000 + n, 'Lib Game ' || n, 'lib-game-' || n
        from generate_series(1, 201) as n;
        insert into game_developers (game_id, developer_id)
        select g.id, d.id
        from games g
        join developers d on d.slug = 'lib-dev-' || substring(g.slug from 'lib-game-(.*)')
        where g.slug like 'lib-game-%';
        insert into library_entries (user_id, game_id, status, source)
        select '${userA}', g.id, 'playing', 'manual'
        from games g
        where g.slug like 'lib-game-%';
    `)
    const found = await searchLibraryTaxonomy(userA, 'developers', 'Lib Dev 201')
    expect(found.map(row => row.name)).toEqual(['Lib Dev 201'])

    const ids = Array.from({ length: 201 }, () => randomUUID())
    await expect(searchTaxonomyTable('developers', 'Lib', ids)).rejects.toThrow(/200/)
})

it('deletes rate-limit buckets older than a day and keeps the current window', async () => {
    await client`insert into api_rate_limits (bucket, window_start, hits) values
        ('old-bucket', clock_timestamp() - interval '2 days', 3),
        ('fresh-bucket', clock_timestamp(), 1)`
    await expect(deleteStaleRateLimits()).resolves.toBe(1)
    const rows = await client`select bucket from api_rate_limits where bucket in ('old-bucket', 'fresh-bucket') order by bucket`
    expect(rows.map(row => row.bucket)).toEqual(['fresh-bucket'])
})
