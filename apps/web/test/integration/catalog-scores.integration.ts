import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postgres from 'postgres'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Catalogue tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const database = 'scores_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + database
const client = postgres(parsed.toString(), { max: 4, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')

const VIEWER = '10000000-0000-0000-0000-000000000001'
const PUBLIC_USER = '10000000-0000-0000-0000-000000000002'
const PRIVATE_USER = '10000000-0000-0000-0000-000000000003'
const EXTRA = '10000000-0000-0000-0000-000000000004'

const ALPHA = '00000000-0000-0000-0000-000000000001'
const BETA = '00000000-0000-0000-0000-000000000002'
const GAMMA = '00000000-0000-0000-0000-000000000003'
const DELTA = '00000000-0000-0000-0000-000000000004'
const SAME_A = '00000000-0000-0000-0000-000000000005'
const SAME_B = '00000000-0000-0000-0000-000000000006'
const RATED = '00000000-0000-0000-0000-000000000007'
const PUBLIC_HIT = '20000000-0000-0000-0000-000000000001'
const PRIVATE_HIT = '20000000-0000-0000-0000-000000000002'
const PRIVATE_LIBRARY = '20000000-0000-0000-0000-000000000003'
const PRIVATE_RATING = '20000000-0000-0000-0000-000000000004'
const PUBLIC_LIBRARY = '20000000-0000-0000-0000-000000000005'
const APPLE = '00000000-0000-0000-0000-000000000008'
const ZEBRA = '00000000-0000-0000-0000-000000000009'
const BATCH_A = '20000000-0000-0000-0000-000000000006'
const BATCH_B = '20000000-0000-0000-0000-000000000007'
const SECRET_A = '20000000-0000-0000-0000-000000000008'
const SECRET_B = '20000000-0000-0000-0000-000000000009'
const MIXED = '20000000-0000-0000-0000-00000000000a'
const SORT_IDS = [ALPHA, BETA, GAMMA, DELTA, SAME_A, SAME_B, RATED]
const QUERY_GAMES = 'public.query_games(text,text,text,text,text,text,text,text,integer,integer,uuid,uuid[])'
const sortIdList = SORT_IDS.map(id => `'${id}'`).join(', ')

async function names(sort: string, order: string, userId?: string) {
    const user = userId ? `'${userId}'::uuid` : 'null'
    const rows = await client.unsafe(`
        select name from query_games(
            p_sort => '${sort}',
            p_order => '${order}',
            p_limit => 20,
            p_user_id => ${user},
            p_game_ids => array[${sortIdList}]::uuid[]
        )
    `)
    return rows.map(row => row.name)
}

beforeAll(async () => {
    await admin.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$`)
    await admin.unsafe(`CREATE DATABASE "${database}"`)
    await client.unsafe(`CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;`)
    for (const name of ['0000_illegal_kinsey_walden', '0001_functions_and_triggers', '0002_fix_get_feed_library_privacy', '0003_igdb_request_budget', '0004_igdb_catalog_preparation', '0005_taxonomy_slug_unique'])
        await client.unsafe(await migration(name))
    await client.unsafe(`REVOKE ALL ON FUNCTION ${QUERY_GAMES} FROM PUBLIC`)
    await client.unsafe(`GRANT EXECUTE ON FUNCTION ${QUERY_GAMES} TO anon`)
    await admin.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'score_extra') THEN CREATE ROLE score_extra; END IF;
    END $$`)
    await client.unsafe('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO score_extra')
    await client.unsafe(await migration('0006_two_score_rpcs'))
    await client`
        insert into games (id, name, slug, metacritic_score) values
            (${ALPHA}, 'Alpha', 'alpha', 99),
            (${BETA}, 'Beta', 'beta', 10),
            (${GAMMA}, 'Gamma', 'gamma', null),
            (${DELTA}, 'Delta', 'delta', 80),
            (${SAME_A}, 'Same', 'same-a', 1),
            (${SAME_B}, 'Same', 'same-b', 100),
            (${RATED}, 'Rated', 'rated', 40),
            (${PUBLIC_HIT}, 'Public Hit', 'public-hit', null),
            (${PRIVATE_HIT}, 'Private Hit', 'private-hit', null),
            (${PRIVATE_LIBRARY}, 'Private Shelf', 'private-shelf', null),
            (${PRIVATE_RATING}, 'Private Score', 'private-score', null),
            (${PUBLIC_LIBRARY}, 'Public Shelf', 'public-shelf', null),
            (${APPLE}, 'Apple', 'apple', null),
            (${ZEBRA}, 'Zebra', 'zebra', null),
            (${BATCH_A}, 'Batch One', 'batch-one', null),
            (${BATCH_B}, 'Batch Two', 'batch-two', null),
            (${SECRET_A}, 'Secret One', 'secret-one', null),
            (${SECRET_B}, 'Secret Two', 'secret-two', null),
            (${MIXED}, 'Mixed Signal', 'mixed-signal', null)
    `
    await client`
        insert into auth.users (id, email, raw_user_meta_data) values
            (${VIEWER}, 'viewerone@example.com', '{"username":"viewerone"}'),
            (${PUBLIC_USER}, 'publicone@example.com', '{"username":"publicone"}'),
            (${PRIVATE_USER}, 'privateone@example.com', '{"username":"privateone"}'),
            (${EXTRA}, 'extraone@example.com', '{"username":"extraone"}')
    `
    await client`update users set library_public = false where id = ${PRIVATE_USER}`
    await client`
        insert into ratings_reviews (user_id, game_id, rating) values
            (${PUBLIC_USER}, ${BETA}, 9),
            (${PRIVATE_USER}, ${BETA}, 9),
            (${EXTRA}, ${GAMMA}, 9),
            (${VIEWER}, ${GAMMA}, 8),
            (${PUBLIC_USER}, ${DELTA}, 7),
            (${PRIVATE_USER}, ${DELTA}, 7),
            (${EXTRA}, ${DELTA}, 7),
            (${VIEWER}, ${RATED}, 4),
            (${PUBLIC_USER}, ${PUBLIC_HIT}, 9),
            (${PRIVATE_USER}, ${PRIVATE_HIT}, 9),
            (${PRIVATE_USER}, ${PRIVATE_RATING}, 8),
            (${VIEWER}, ${APPLE}, 8),
            (${PUBLIC_USER}, ${APPLE}, 8),
            (${PRIVATE_USER}, ${APPLE}, 8),
            (${EXTRA}, ${APPLE}, 8),
            (${EXTRA}, ${ZEBRA}, 8),
            (${PUBLIC_USER}, ${MIXED}, 8)
    `
    await client`
        insert into follows (follower_id, following_id) values
            (${VIEWER}, ${PUBLIC_USER}),
            (${VIEWER}, ${PRIVATE_USER})
    `
    await client`
        insert into library_entries (user_id, game_id, status, created_at) values
            (${PUBLIC_USER}, ${PUBLIC_HIT}, 'completed', now() - interval '3 hours'),
            (${PRIVATE_USER}, ${PRIVATE_HIT}, 'completed', now() - interval '3 hours'),
            (${PRIVATE_USER}, ${PRIVATE_LIBRARY}, 'completed', now()),
            (${PUBLIC_USER}, ${PUBLIC_LIBRARY}, 'backlog', now()),
            (${PUBLIC_USER}, ${BATCH_A}, 'backlog', now() - interval '6 hours'),
            (${PUBLIC_USER}, ${BATCH_B}, 'playing', now() - interval '6 hours'),
            (${PRIVATE_USER}, ${SECRET_A}, 'backlog', now() - interval '5 hours'),
            (${PRIVATE_USER}, ${SECRET_B}, 'playing', now() - interval '5 hours'),
            (${PRIVATE_USER}, ${MIXED}, 'playing', now())
    `
    const lists = await client`
        insert into lists (user_id, name, is_public, is_default) values
            (${PUBLIC_USER}, 'Open List', true, false),
            (${PUBLIC_USER}, 'Shut List', false, false),
            (${PRIVATE_USER}, 'Quiet List', false, false),
            (${PRIVATE_USER}, 'Posted List', true, false)
        returning id, name
    `
    const listId = (name: string) => lists.find(list => list.name === name)!.id
    await client`
        insert into list_likes (user_id, list_id) values
            (${PRIVATE_USER}, ${listId('Open List')}),
            (${PRIVATE_USER}, ${listId('Shut List')})
    `
}, 60_000)

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}"`)
    await admin.unsafe('DROP ROLE IF EXISTS score_extra')
    await admin.end()
})

it('keeps metacritic_score and rewrites only the score RPC outputs', async () => {
    const [column] = await client`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'metacritic_score'`
    expect(column.column_name).toBe('metacritic_score')

    const leaked = await client`
        select p.proname from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('get_feed', 'get_follow_recommendations', 'get_loadout_rating_highlights', 'get_trending_games', 'query_games')
          and p.prosrc ~* 'metacritic'
    `
    expect(leaked).toEqual([])

    const definitions = await client`
        select p.proname, p.prosecdef, pg_get_function_result(p.oid) as result,
               pg_get_userbyid(p.proowner) = current_user as owned_here
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('get_feed', 'get_follow_recommendations', 'get_loadout_rating_highlights', 'get_trending_games', 'query_games')
    `
    expect(definitions).toHaveLength(5)
    for (const row of definitions) {
        expect(row.prosecdef).toBe(true)
        expect(row.owned_here).toBe(true)
        expect(String(row.result)).not.toMatch(/metacritic/i)
    }
    const feed = definitions.find(row => row.proname === 'get_feed')
    const [feedBody] = await client`select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_feed'`
    expect(String(feedBody.prosrc)).toMatch(/library_public/)
    expect(feed?.proname).toBe('get_feed')

    const [anonExecute] = await client.unsafe(`select has_function_privilege('anon', '${QUERY_GAMES}', 'EXECUTE') as ok`)
    const [publicExecute] = await client.unsafe(`select has_function_privilege('public', '${QUERY_GAMES}', 'EXECUTE') as ok`)
    expect(anonExecute.ok).toBe(true)
    expect(publicExecute.ok).toBe(false)

    const paths = await client`
        select p.proname, opt.option_value as search_path
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral pg_options_to_table(p.proconfig) opt
        where n.nspname = 'public'
          and p.proname in ('get_feed', 'get_follow_recommendations', 'get_loadout_rating_highlights', 'get_trending_games', 'query_games')
          and opt.option_name = 'search_path'
        order by p.proname
    `
    expect(paths).toHaveLength(5)
    for (const row of paths) expect(row.search_path).toBe('public, pg_temp')

    const grants = await client`
        select p.proname,
               case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(p.proacl) x
        where n.nspname = 'public'
          and p.proname in ('get_feed', 'get_follow_recommendations', 'get_loadout_rating_highlights', 'get_trending_games', 'query_games')
    `
    expect(grants.map(row => row.grantee)).not.toContain('score_extra')
    const queryGrantees = grants.filter(row => row.proname === 'query_games').map(row => row.grantee)
    expect(queryGrantees).toContain('anon')
    expect(queryGrantees).not.toContain('public')
    const [extraOnQuery] = await client.unsafe(`select has_function_privilege('score_extra', '${QUERY_GAMES}', 'EXECUTE') as ok`)
    expect(extraOnQuery.ok).toBe(false)
    const [feedPublic] = await client.unsafe(`select has_function_privilege('public', 'public.get_feed(uuid,integer,integer)', 'EXECUTE') as ok`)
    expect(feedPublic.ok).toBe(true)
})

it('orders the catalogue with a total order and ignores a Metacritic sort key', async () => {
    expect(await names('name', 'asc')).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma', 'Rated', 'Same', 'Same'])
    expect(await names('metacritic_score', 'desc')).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma', 'Rated', 'Same', 'Same'])
    expect(await names('ngplus_rating', 'desc')).toEqual(['Beta', 'Gamma', 'Delta', 'Rated', 'Alpha', 'Same', 'Same'])
    expect(await names('your_rating', 'desc', VIEWER)).toEqual(['Gamma', 'Rated', 'Alpha', 'Beta', 'Delta', 'Same', 'Same'])

    const tied = await client.unsafe(`
        select id::text as id from query_games(
            p_sort => 'name',
            p_order => 'desc',
            p_limit => 2,
            p_game_ids => array['${SAME_A}', '${SAME_B}']::uuid[]
        )
    `)
    expect(tied.map(row => row.id)).toEqual([SAME_A, SAME_B])

    const page = await client.unsafe(`
        select name from query_games(
            p_sort => 'name',
            p_order => 'asc',
            p_limit => 1,
            p_offset => 1,
            p_game_ids => array[${sortIdList}]::uuid[]
        )
    `)
    expect(page.map(row => row.name)).toEqual(['Beta'])

    const tiedAverage = await client.unsafe(`
        select name from query_games(
            p_sort => 'ngplus_rating',
            p_order => 'desc',
            p_game_ids => array['${APPLE}', '${ZEBRA}']::uuid[]
        )
    `)
    expect(tiedAverage.map(row => row.name)).toEqual(['Apple', 'Zebra'])
    const tiedAverageAsc = await client.unsafe(`
        select name from query_games(
            p_sort => 'ngplus_rating',
            p_order => 'asc',
            p_game_ids => array['${APPLE}', '${ZEBRA}']::uuid[]
        )
    `)
    expect(tiedAverageAsc.map(row => row.name)).toEqual(['Zebra', 'Apple'])
})

it('hides a private library from recommendations, trending, and the feed', async () => {
    const recommendations = await client`
        select game_name from get_follow_recommendations(${VIEWER}::uuid, 10) order by game_name
    `
    expect(recommendations.map(row => row.game_name)).toEqual(['Public Hit'])

    const trending = await client`
        select game_name, activity_count from get_trending_games(7, 50, null) order by game_name
    `
    const trendingNames = trending.map(row => row.game_name)
    expect(trendingNames).toContain('Public Shelf')
    expect(trendingNames).toContain('Private Score')
    expect(trendingNames).not.toContain('Private Shelf')
    expect(trendingNames).not.toContain('Secret One')
    const mixed = trending.find(row => row.game_name === 'Mixed Signal')
    expect(Number(mixed?.activity_count)).toBe(1)

    const feed = await client`
        select activity_type, game_name, list_name, library_game_names
        from get_feed(${VIEWER}::uuid, 50, 0)
    `
    const namesFor = (type: string) => feed.filter(row => row.activity_type === type).map(row => row.game_name ?? row.list_name).sort()
    expect(namesFor('library_add')).toEqual(['Public Hit', 'Public Shelf'])
    const batches = feed.filter(row => row.activity_type === 'library_add_batch').flatMap(row => row.library_game_names ?? [])
    expect([...batches].sort()).toEqual(['Batch One', 'Batch Two'])
    expect(namesFor('list_created')).toEqual(['Open List', 'Posted List'])
    expect(namesFor('list_liked')).toEqual(['Open List'])
    expect(feed.some(row => row.activity_type === 'rating' && row.game_name === 'Private Score')).toBe(true)
    expect(feed.some(row => ['Shut List', 'Quiet List', 'Wishlist'].includes(row.list_name))).toBe(false)
})
