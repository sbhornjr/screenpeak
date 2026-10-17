import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
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
import { POST as intentPOST } from '@/app/api/v1/me/steam/link-intent/route'
import { consumeSteamLinkIntent, peekSteamLinkIntent, readSteamLinkIntent } from '@/lib/steam-link-intent'

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

function post(path: string, body: unknown) {
    return new NextRequest('http://127.0.0.1' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

it('issues one live intent, stores no signature, and will not link a second time or another user', async () => {
    const first = await invoke(intentPOST, post('/api/v1/me/steam/link-intent', {}))
    expect(first.status).toBe(200)
    const minted = await first.json() as { state: string, expiresAt: string, path: string }
    expect(minted.path.startsWith('/api/steam/link?')).toBe(true)
    expect(minted.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const signature = minted.state.split('.').at(-1) ?? ''
    const stored = await client`select id::text, user_id::text, expires_at::text, consumed_at::text from steam_link_intents`
    expect(JSON.stringify(stored)).not.toContain(signature)
    expect(await peekSteamLinkIntent(minted.state)).toEqual({ userId: USER })

    const second = await invoke(intentPOST, post('/api/v1/me/steam/link-intent', {}))
    const latest = await second.json() as { state: string, path: string }
    expect(await peekSteamLinkIntent(minted.state)).toBeNull()
    expect(await peekSteamLinkIntent(latest.state)).toEqual({ userId: USER })

    authState.cookieCalls = 0
    const opened = await invoke(linkGET, new NextRequest('http://127.0.0.1' + latest.path, { headers: { cookie: 'sb=website' } }))
    expect(opened.status).toBe(307)
    expect(opened.headers.get('location')).toBe('https://steamcommunity.com/openid/login')
    expect(authState.cookieCalls).toBe(0)
    expect(await peekSteamLinkIntent(latest.state)).toEqual({ userId: USER })

    const params = new URLSearchParams({ state: latest.state, 'openid.mode': 'id_res' })
    const linked = await invoke(callbackGET, new NextRequest(`http://127.0.0.1/api/steam/callback?${params}`, {
        headers: { cookie: 'sb=website' },
    }))
    expect(linked.headers.get('location')).toBe('screenpeak://steamlink?ok=1')
    expect(authState.cookieCalls).toBe(0)
    expect(await client`select user_id::text as user_id, steam_id from steam_accounts`).toEqual([
        { user_id: USER, steam_id: '76561198000000021' },
    ])

    openid.steamId = '76561198000000099'
    const replay = await invoke(callbackGET, new NextRequest(`http://127.0.0.1/api/steam/callback?${params}`, {
        headers: { cookie: 'sb=website' },
    }))
    expect(replay.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
    expect(await client`select steam_id from steam_accounts where user_id = ${USER}`).toEqual([{ steam_id: '76561198000000021' }])
    expect(await client`select count(*)::int as n from steam_accounts where user_id = ${OTHER}`).toEqual([{ n: 0 }])

    await client`update steam_link_intents set expires_at = created_at + interval '1 millisecond', consumed_at = null where user_id = ${USER}`
    const parsed = readSteamLinkIntent(latest.state)
    expect(parsed).not.toBeNull()
    expect(await peekSteamLinkIntent(latest.state)).toBeNull()
    expect(await consumeSteamLinkIntent(latest.state, '76561198000000099')).toBeNull()

    await expect(client.begin(async tx => {
        await tx.unsafe('set local role anon')
        await tx.unsafe('select 1 from steam_link_intents')
    })).rejects.toThrow(/permission denied/)
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
    await client`insert into igdb_private.steam_import_runs (user_id, owner_token, heartbeat_at, started_at)
        values (${USER}, ${holder}, clock_timestamp(), clock_timestamp())`
    const busy = await invoke(importPOST, post('/api/v1/me/steam/import', {}))
    expect(busy.status).toBe(200)
    expect(await busy.json()).toMatchObject({
        notice: 'Matching is already running for your library.',
        retryAfterMs: 5000,
    })
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
