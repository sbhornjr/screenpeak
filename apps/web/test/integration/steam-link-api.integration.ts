import { readFile } from 'node:fs/promises'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { DB } from '@/lib/db'

const authState = vi.hoisted(() => ({
    bearer: null as { id: string, email: string | null } | null,
    cookieCalls: 0,
}))
const state = vi.hoisted(() => ({ db: null as DB | null, pg: null as postgres.Sql | null }))
const openid = vi.hoisted(() => ({
    steamId: '76561198000000021',
    verifyCalls: 0,
}))

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

vi.mock('@/lib/auth', async () => {
    const { UnauthenticatedError } = await import('@/lib/api')
    return {
        requireBearerUser: async () => {
            if (!authState.bearer) throw new UnauthenticatedError()
            return authState.bearer
        },
        requireUser: async () => {
            authState.cookieCalls += 1
            return { id: 'cookie-user', email: 'cookie@example.com' }
        },
        getOptionalUser: async () => {
            authState.cookieCalls += 1
            return { id: 'cookie-user', email: 'cookie@example.com' }
        },
    }
})

vi.mock('@/lib/steam-openid', () => ({
    getSteamAuthUrl: async () => 'https://steamcommunity.com/openid/login',
    verifySteamCallback: async () => {
        openid.verifyCalls += 1
        return openid.steamId
    },
}))

vi.mock('@/lib/igdb/provider', () => ({
    igdbProvider: {
        lookupSteamApps: async (ids: number[]) => ids.map(appid => ({ appid, candidates: [] as number[] })),
        getGamesByIds: async () => [],
    },
}))

import { GET as callbackGET } from '@/app/api/steam/callback/route'
import { GET as linkGET } from '@/app/api/steam/link/route'
import { POST as importPOST } from '@/app/api/v1/me/steam/import/route'
import { POST as completePOST } from '@/app/api/v1/me/steam/link-complete/route'
import { POST as intentPOST } from '@/app/api/v1/me/steam/link-intent/route'
import { deleteSpentSteamLinkIntents, issueSteamLinkIntent, peekSteamLinkIntent } from '@/lib/steam-link-intent'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Steam link tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const databaseName = 'steamlink_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + databaseName
const client = postgres(parsed.toString(), { max: 4, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')

const USER = randomUUID()
const OTHER = randomUUID()
const SECRET = 'integration-steam-link-intent-secret'

beforeAll(async () => {
    process.env.STEAM_LINK_INTENT_SECRET = SECRET
    process.env.STEAM_API_KEY = 'test-key'
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
    await client.begin(async tx => { await tx.unsafe(await migration('0007_igdb_catalog_cleanup')) })
    for (const name of ['0008_steam_import_lease', '0009_api_rate_limits', '0010_steam_link_intents']) {
        for (const statement of (await migration(name)).split('--> statement-breakpoint')) {
            const text = statement.trim()
            if (text) await client.unsafe(text)
        }
    }
    state.db = drizzle(client) as unknown as DB
    state.pg = client
    await client`insert into auth.users (id, email, raw_user_meta_data) values
        (${USER}, 'owner@example.com', ${JSON.stringify({ username: 'owner' })}::jsonb),
        (${OTHER}, 'other@example.com', ${JSON.stringify({ username: 'other' })}::jsonb)`
    await client`insert into steam_accounts (user_id, steam_id) values (${USER}, '76561198000000021')`
    authState.bearer = { id: USER, email: 'owner@example.com' }
})

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await admin.end()
})

function invoke(handler: unknown, request: NextRequest) {
    return (handler as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>)(
        request,
        { params: Promise.resolve({}) },
    )
}

function pkce() {
    const verifier = randomBytes(32).toString('base64url')
    const codeChallenge = createHash('sha256').update(verifier).digest('base64url')
    return { verifier, codeChallenge }
}

function post(path: string, body: unknown) {
    return new NextRequest('http://127.0.0.1' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

it('stages a third-party Steam id and links it only for the matching bearer and verifier', async () => {
    await client`insert into steam_accounts (user_id, steam_id) values (${OTHER}, '76561198000000055')`
    const { codeChallenge } = pkce()
    const first = await invoke(intentPOST, post('/api/v1/me/steam/link-intent', { codeChallenge }))
    expect(first.status).toBe(200)
    const minted = await first.json() as { state: string, expiresAt: string, path: string }
    expect(minted.path.startsWith('/api/steam/link?')).toBe(true)
    const signature = minted.state.split('.').at(-1) ?? ''
    const stored = await client`select id::text, user_id::text, code_challenge, steam_id, completion_code_hash, consumed_at::text from steam_link_intents`
    expect(JSON.stringify(stored)).not.toContain(signature)
    expect(stored[0]?.code_challenge).toBe(codeChallenge)
    expect(await peekSteamLinkIntent(minted.state)).toEqual({ userId: USER })

    const replacement = pkce()
    const second = await invoke(intentPOST, post('/api/v1/me/steam/link-intent', { codeChallenge: replacement.codeChallenge }))
    const latest = await second.json() as { state: string, path: string }
    expect(await peekSteamLinkIntent(minted.state)).toBeNull()
    expect(await peekSteamLinkIntent(latest.state)).toEqual({ userId: USER })

    authState.cookieCalls = 0
    const opened = await invoke(linkGET, new NextRequest('http://127.0.0.1' + latest.path, { headers: { cookie: 'sb=website' } }))
    expect(opened.status).toBe(307)
    expect(opened.headers.get('location')).toBe('https://steamcommunity.com/openid/login')
    expect(opened.headers.get('cache-control')).toBe('no-store')
    expect(opened.headers.get('referrer-policy')).toBe('no-referrer')
    expect(authState.cookieCalls).toBe(0)

    openid.steamId = '76561198000000099'
    const params = new URLSearchParams({ state: latest.state, 'openid.mode': 'id_res' })
    const staged = await invoke(callbackGET, new NextRequest(`http://127.0.0.1/api/steam/callback?${params}`, {
        headers: { cookie: 'sb=website' },
    }))
    const stagedUrl = new URL(staged.headers.get('location') ?? '')
    const code = stagedUrl.searchParams.get('code')
    expect(stagedUrl.protocol).toBe('screenpeak:')
    expect(code).toBeTruthy()
    expect(authState.cookieCalls).toBe(0)
    expect(await client`select user_id::text as user_id, steam_id from steam_accounts order by steam_id`).toEqual([
        { user_id: USER, steam_id: '76561198000000021' },
        { user_id: OTHER, steam_id: '76561198000000055' },
    ])
    const stagedRow = await client`select steam_id, completion_code_hash, consumed_at from steam_link_intents where user_id = ${USER}`
    expect(stagedRow).toEqual([{ steam_id: '76561198000000099', completion_code_hash: expect.any(String), consumed_at: null }])
    expect(stagedRow[0]?.completion_code_hash).not.toBe(code)

    authState.bearer = { id: OTHER, email: 'other@example.com' }
    const wrongUser = await invoke(completePOST, post('/api/v1/me/steam/link-complete', { code, verifier: replacement.verifier }))
    expect(wrongUser.status).toBe(400)
    authState.bearer = { id: USER, email: 'owner@example.com' }
    const wrongVerifier = await invoke(completePOST, post('/api/v1/me/steam/link-complete', { code, verifier: 'b'.repeat(43) }))
    expect(wrongVerifier.status).toBe(400)
    expect(await client`select user_id::text as user_id, steam_id from steam_accounts order by steam_id`).toEqual([
        { user_id: USER, steam_id: '76561198000000021' },
        { user_id: OTHER, steam_id: '76561198000000055' },
    ])

    const completed = await invoke(completePOST, post('/api/v1/me/steam/link-complete', { code, verifier: replacement.verifier }))
    expect(completed.status).toBe(200)
    expect(await completed.json()).toEqual({ ok: true })
    expect(await client`select user_id::text as user_id, steam_id from steam_accounts order by steam_id`).toEqual([
        { user_id: OTHER, steam_id: '76561198000000055' },
        { user_id: USER, steam_id: '76561198000000099' },
    ])
    const replay = await invoke(completePOST, post('/api/v1/me/steam/link-complete', { code, verifier: replacement.verifier }))
    expect(replay.status).toBe(400)
    expect(await client`select steam_id from steam_accounts where user_id = ${USER}`).toEqual([{ steam_id: '76561198000000099' }])
})

it('ends a parallel issue with one live intent', async () => {
    await client`delete from steam_link_intents where user_id = ${USER}`
    const pair = [pkce(), pkce()]
    const settled = await Promise.all(pair.map(item => issueSteamLinkIntent(USER, item.codeChallenge)))
    expect(settled).toHaveLength(2)
    const live = await client`select count(*)::int as n from steam_link_intents where user_id = ${USER} and consumed_at is null`
    expect(live).toEqual([{ n: 1 }])
})

it('grants anon and still denies the table when the migration revoke is applied', async () => {
    await client.unsafe('GRANT SELECT ON steam_link_intents TO anon')
    const revoke = (await migration('0010_steam_link_intents')).split('--> statement-breakpoint')
        .map(statement => statement.trim())
        .find(statement => statement.startsWith('REVOKE ALL ON steam_link_intents FROM PUBLIC, anon, authenticated'))
    if (!revoke) throw new Error('0010 is missing the anon revoke')
    await client.unsafe(revoke)
    await expect(client.begin(async tx => {
        await tx.unsafe('set local role anon')
        await tx.unsafe('select 1 from steam_link_intents')
    })).rejects.toThrow(/permission denied/)
})

it('deletes expired and consumed intents and leaves a live one', async () => {
    await client`delete from steam_link_intents`
    const live = randomUUID()
    const expired = randomUUID()
    const spent = randomUUID()
    const challenge = 'a'.repeat(43)
    await client`insert into steam_link_intents (id, user_id, code_challenge, expires_at, consumed_at) values
        (${live}, ${USER}, ${challenge}, clock_timestamp() + interval '5 minutes', null),
        (${expired}, ${OTHER}, ${challenge}, clock_timestamp() + interval '5 minutes', null),
        (${spent}, ${USER}, ${challenge}, clock_timestamp() + interval '5 minutes', clock_timestamp())`
    await client`update steam_link_intents set created_at = clock_timestamp() - interval '1 hour', expires_at = clock_timestamp() - interval '1 minute' where id = ${expired}`
    expect(await deleteSpentSteamLinkIntents()).toBe(2)
    expect(await client`select id::text as id from steam_link_intents`).toEqual([{ id: live }])
})

it('walks the import cursor with Steam mocked and takes over a stale lease', async () => {
    const games = Array.from({ length: 60 }, (_, index) => ({
        appid: index + 1,
        name: `App ${index + 1}`,
        playtime_forever: 0,
    }))
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
        const target = String(input)
        if (target.includes('GetOwnedGames')) {
            return Response.json({ response: { game_count: games.length, games } })
        }
        if (target.includes('GetPlayerAchievements')) {
            return Response.json({ playerstats: { success: false } })
        }
        throw new Error('unexpected Steam call ' + target)
    }))

    const holder = randomUUID()
    const bucket = 'write:' + USER
    await client`insert into api_rate_limits (bucket, window_start, hits) values (${bucket}, clock_timestamp(), 59)
        on conflict (bucket) do update set hits = 59, window_start = clock_timestamp()`
    await client`insert into igdb_private.steam_import_runs (user_id, owner_token, heartbeat_at, started_at)
        values (${USER}, ${holder}, clock_timestamp(), clock_timestamp())`
    const busy = await invoke(importPOST, post('/api/v1/me/steam/import', {}))
    expect(busy.status).toBe(200)
    expect(await busy.json()).toMatchObject({
        notice: 'Matching is already running for your library.',
        retryAfterMs: 5000,
    })
    expect(await client`select hits from api_rate_limits where bucket = ${bucket}`).toEqual([{ hits: 59 }])
    await client`delete from api_rate_limits where bucket = ${bucket}`
    expect(await client`select owner_token::text as owner_token from igdb_private.steam_import_runs where user_id = ${USER}`)
        .toEqual([{ owner_token: holder }])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()

    await client`update igdb_private.steam_import_runs set heartbeat_at = clock_timestamp() - interval '31 seconds' where user_id = ${USER}`
    const first = await invoke(importPOST, post('/api/v1/me/steam/import', {}))
    expect(first.status).toBe(200)
    const page = await first.json() as { nextCursor: { phase: string, afterAppId: number } | null, notice?: string, totalApps: number }
    expect(page.notice).toBeUndefined()
    expect(page.totalApps).toBe(60)
    expect(page.nextCursor).toEqual({ phase: 'pending', afterAppId: 50 })
    expect(await client`select count(*)::int as n from igdb_private.steam_import_runs where user_id = ${USER}`).toEqual([{ n: 0 }])

    const second = await invoke(importPOST, post('/api/v1/me/steam/import', { retry: false, cursor: page.nextCursor }))
    expect(second.status).toBe(200)
    const rest = await second.json() as { nextCursor: unknown, remaining: number }
    expect(rest.nextCursor).toBeNull()
    expect(rest.remaining).toBe(0)
    const steamCalls = vi.mocked(fetch).mock.calls.map(call => String(call[0]))
    expect(steamCalls.some(target => target.includes('api.steampowered.com'))).toBe(true)
    expect(steamCalls.some(target => target.includes('igdb.com'))).toBe(false)
})
