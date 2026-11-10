import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postgres from 'postgres'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Feed tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const databaseName = 'feed_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + databaseName
const client = postgres(parsed.toString(), { max: 4, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')

const VIEWER = randomUUID()
const ADA = randomUUID()
const BO = randomUUID()
// Every activity below is written at this instant, as one transaction would.
const AT = '2026-10-01 12:00:00+00'
const FEED_FN = 'public.get_feed(uuid,integer,integer)'

type Row = { activity_type: string, created_at: Date, actor_id: string, game_id: string | null, list_id: string | null }

const keyOf = (row: Row) => [row.activity_type, row.actor_id, row.game_id, row.list_id].join('|')

async function page(limit: number, offset: number): Promise<Row[]> {
    return await client<Row[]>`
        select activity_type, created_at, actor_id, game_id, list_id
        from get_feed(p_user_id => ${VIEWER}, p_limit => ${limit}, p_offset => ${offset})
    `
}

async function feedDefinition() {
    const [row] = await client.unsafe(`
        select p.prosecdef, p.proconfig, p.proacl::text as acl, pg_get_userbyid(p.proowner) as owner
        from pg_proc p where p.oid = '${FEED_FN}'::regprocedure
    `)
    return row
}

let before: Awaited<ReturnType<typeof feedDefinition>>

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
    for (const name of ['0004_igdb_catalog_preparation', '0005_taxonomy_slug_unique', '0006_two_score_rpcs', '0007_igdb_catalog_cleanup'])
        await client.begin(async tx => { await tx.unsafe(await migration(name)) })
    before = await feedDefinition()
    await client.begin(async tx => { await tx.unsafe(await migration('0011_feed_total_order')) })

    await client`insert into auth.users (id, email, raw_user_meta_data) values
        (${VIEWER}, 'viewer@example.com', ${JSON.stringify({ username: 'viewer' })}::jsonb),
        (${ADA}, 'ada@example.com', ${JSON.stringify({ username: 'ada' })}::jsonb),
        (${BO}, 'bobby@example.com', ${JSON.stringify({ username: 'bobby' })}::jsonb)`
    await client`update users set library_public = true where id in (${ADA}, ${BO})`
    await client`insert into follows (follower_id, following_id) values (${VIEWER}, ${ADA}), (${VIEWER}, ${BO})`

    const games = await client<{ id: string }[]>`
        insert into games (igdb_id, name, slug)
        select 920000 + n, 'Tie ' || n, 'tie-' || n from generate_series(1, 6) n
        returning id`
    // Ada adds a game and rates that same game at the same instant: they differ only in activity type.
    await client`insert into library_entries (user_id, game_id, status, created_at) values (${ADA}, ${games[0].id}, 'playing', ${AT})`
    for (const [user, game] of [[ADA, games[0]], [ADA, games[1]], [ADA, games[2]], [BO, games[3]], [BO, games[4]], [BO, games[5]]] as const)
        await client`insert into ratings_reviews (user_id, game_id, rating, created_at) values (${user}, ${game.id}, 7, ${AT})`
    const lists = await client<{ id: string }[]>`
        insert into lists (user_id, name, description, is_public, is_default, is_pinned, created_at) values
            (${ADA}, 'Ada One', '', true, false, false, ${AT}),
            (${ADA}, 'Ada Two', '', true, false, false, ${AT}),
            (${BO}, 'Bo One', '', true, false, false, ${AT})
        returning id`
    await client`insert into list_likes (user_id, list_id, created_at) values
        (${ADA}, ${lists[2].id}, ${AT}),
        (${BO}, ${lists[0].id}, ${AT}),
        (${BO}, ${lists[1].id}, ${AT})`
})

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await admin.end()
})

it('sorts tied activity by actor, activity type, game, and list', async () => {
    const all = await page(100, 0)
    expect(all).toHaveLength(13)
    expect(new Set(all.map(row => row.created_at.toISOString()))).toEqual(new Set(['2026-10-01T12:00:00.000Z']))

    const nullsLast = (a: string | null, b: string | null) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1
    const expected = [...all].sort((a, b) =>
        nullsLast(a.actor_id, b.actor_id)
        || nullsLast(a.activity_type, b.activity_type)
        || nullsLast(a.game_id, b.game_id)
        || nullsLast(a.list_id, b.list_id))
    expect(all.map(keyOf)).toEqual(expected.map(keyOf))
})

it('returns every tied row exactly once across offset pages', async () => {
    const all = (await page(100, 0)).map(keyOf)
    for (const size of [2, 3, 5]) {
        const paged: string[] = []
        for (let offset = 0; offset < all.length; offset += size)
            paged.push(...(await page(size, offset)).map(keyOf))
        expect(paged).toEqual(all)
    }
})

it('keeps the owner, grants, SECURITY DEFINER, and search_path', async () => {
    const after = await feedDefinition()
    expect(after).toEqual(before)
    expect(after.prosecdef).toBe(true)
    expect(after.proconfig).toEqual(['search_path=public, pg_temp'])
})
