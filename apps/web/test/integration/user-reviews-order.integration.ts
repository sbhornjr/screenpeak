import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postgres from 'postgres'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Ratings tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const databaseName = 'reviews_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + databaseName
const client = postgres(parsed.toString(), { max: 4, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')

const PLAYER = randomUUID()
const OTHER = randomUUID()
// Most rows share one rating and one instant, as a Steam import or a quick
// run of ratings would.
const AT = '2026-10-01 12:00:00+00'
const LATER = '2026-10-02 12:00:00+00'
const REVIEWS_FN = 'public.get_user_ratings_reviews(uuid,text,text,text,integer,integer)'

type Row = { game_id: string, game_name: string, rating: number, review: string | null, updated_at: Date }

async function page(filter: string, sort: string, order: string, limit: number, offset: number): Promise<Row[]> {
    return await client<Row[]>`
        select game_id, game_name, rating, review, updated_at
        from get_user_ratings_reviews(p_user_id => ${PLAYER}, p_filter => ${filter}, p_sort => ${sort},
            p_order => ${order}, p_limit => ${limit}, p_offset => ${offset})
    `
}

async function definition() {
    const [row] = await client.unsafe(`
        select p.prosecdef, p.proconfig, p.proacl::text as acl, pg_get_userbyid(p.proowner) as owner
        from pg_proc p where p.oid = '${REVIEWS_FN}'::regprocedure
    `)
    return row
}

let before: Awaited<ReturnType<typeof definition>>

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
    before = await definition()
    await client.begin(async tx => { await tx.unsafe(await migration('0012_user_reviews_total_order')) })

    await client`insert into auth.users (id, email, raw_user_meta_data) values
        (${PLAYER}, 'player@example.com', ${JSON.stringify({ username: 'player' })}::jsonb),
        (${OTHER}, 'other@example.com', ${JSON.stringify({ username: 'other' })}::jsonb)`
    // Names repeat on purpose (Doom and its remake), so only the game id breaks the last tie.
    const games = await client<{ id: string }[]>`
        insert into games (igdb_id, name, slug)
        select 930000 + n, case when n <= 2 then 'Doom' else 'Tie ' || n end, 'rr-tie-' || n
        from generate_series(1, 9) n
        returning id`
    for (const [index, game] of games.entries()) {
        const rating = index === 8 ? 9 : 8
        const review = index % 3 === 0 ? 'Written.' : ''
        const at = index === 7 ? LATER : AT
        await client`insert into ratings_reviews (user_id, game_id, rating, review, created_at, updated_at)
            values (${PLAYER}, ${game.id}, ${rating}, ${review}, ${at}, ${at})`
    }
    await client`insert into ratings_reviews (user_id, game_id, rating, review, created_at, updated_at)
        values (${OTHER}, ${games[0].id}, 3, '', ${AT}, ${AT})`
})

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await admin.end()
})

const byText = (a: string, b: string) => a === b ? 0 : a < b ? -1 : 1

it('breaks rating ties by newest, then name, then game', async () => {
    const all = await page('all', 'rating', 'desc', 100, 0)
    expect(all).toHaveLength(9)
    const expected = [...all].sort((a, b) =>
        b.rating - a.rating
        || b.updated_at.getTime() - a.updated_at.getTime()
        || byText(a.game_name, b.game_name)
        || byText(a.game_id, b.game_id))
    expect(all.map(row => row.game_id)).toEqual(expected.map(row => row.game_id))
})

it('breaks date ties by name, then game', async () => {
    const all = await page('all', 'date', 'asc', 100, 0)
    const expected = [...all].sort((a, b) =>
        a.updated_at.getTime() - b.updated_at.getTime()
        || byText(a.game_name, b.game_name)
        || byText(a.game_id, b.game_id))
    expect(all.map(row => row.game_id)).toEqual(expected.map(row => row.game_id))
})

it('returns every row exactly once across offset pages for each filter and sort', async () => {
    for (const filter of ['all', 'reviews', 'ratings'])
        for (const sort of ['date', 'rating'])
            for (const order of ['asc', 'desc']) {
                const all = (await page(filter, sort, order, 100, 0)).map(row => row.game_id)
                for (const size of [2, 3, 4]) {
                    const paged: string[] = []
                    for (let offset = 0; offset < all.length; offset += size)
                        paged.push(...(await page(filter, sort, order, size, offset)).map(row => row.game_id))
                    expect({ filter, sort, order, size, paged }).toEqual({ filter, sort, order, size, paged: all })
                }
            }
})

it('keeps the owner, grants, and SECURITY DEFINER, and pins search_path', async () => {
    const after = await definition()
    expect(after.prosecdef).toBe(true)
    expect(after.owner).toBe(before.owner)
    expect(after.acl).toBe(before.acl)
    expect(after.proconfig).toEqual(['search_path=public, pg_temp'])
})
