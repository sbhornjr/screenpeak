import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { DB } from '@/lib/db'

const authState = vi.hoisted(() => ({ user: null as { id: string, email: string | null } | null }))
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

vi.mock('@/lib/auth', async () => {
    const { UnauthenticatedError } = await import('@/lib/api')
    return {
        requireBearerUser: async () => {
            if (!authState.user) throw new UnauthenticatedError()
            return authState.user
        },
    }
})

import { createListWithGame, likeList, syncListGames } from '@/lib/queries/list'
import { upsertLibraryEntry } from '@/lib/queries/library'
import { saveRatingReview } from '@/lib/queries/review'
import { DELETE as deleteListRoute, PATCH as patchListRoute } from '@/app/api/v1/lists/[listId]/route'
import { DELETE as deleteLibraryRoute } from '@/app/api/v1/me/library/[gameId]/route'
import { PUT as putReviewRoute } from '@/app/api/v1/games/[slug]/review/route'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Write tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const databaseName = 'writes_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + databaseName
const client = postgres(parsed.toString(), { max: 4, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')

const A = randomUUID()
const B = randomUUID()
let gameId = ''
let secretListId = ''

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
    await client.begin(async tx => { await tx.unsafe(await migration('0007_igdb_catalog_cleanup')) })
    for (const statement of (await migration('0008_steam_import_lease')).split('--> statement-breakpoint')) {
        const text = statement.trim()
        if (text) await client.unsafe(text)
    }
    state.db = drizzle(client) as unknown as DB

    await client`insert into auth.users (id, email, raw_user_meta_data) values
        (${A}, 'a@example.com', ${JSON.stringify({ username: 'writerA' })}::jsonb),
        (${B}, 'b@example.com', ${JSON.stringify({ username: 'writerB' })}::jsonb)`
    const [game] = await client`insert into games (igdb_id, name, slug) values (910001, 'Write Probe', 'write-probe') returning id`
    gameId = game.id
    await client`insert into library_entries (user_id, game_id, status, hours_played, play_count, completed_all_achievements)
        values (${B}, ${gameId}::uuid, 'playing', 12.5, 4, true)`
    await client`insert into ratings_reviews (user_id, game_id, rating, review) values (${B}, ${gameId}::uuid, 8, 'keep me')`
    const [list] = await client`insert into lists (user_id, name, description, is_public, is_default, is_pinned)
        values (${B}, 'Secret', '', false, false, false) returning id`
    secretListId = list.id
    authState.user = { id: A, email: 'a@example.com' }
})

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await admin.end()
})

function jsonRequest(method: string, url: string, body?: unknown) {
    return new NextRequest(url, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
}

it('returns 404 for another player\'s list and library row and leaves them unchanged', async () => {
    const patched = await patchListRoute(
        jsonRequest('PATCH', `http://localhost/api/v1/lists/${secretListId}`, { isPinned: true }),
        { params: Promise.resolve({ listId: secretListId }) },
    )
    const removed = await deleteListRoute(
        jsonRequest('DELETE', `http://localhost/api/v1/lists/${secretListId}`),
        { params: Promise.resolve({ listId: secretListId }) },
    )
    const library = await deleteLibraryRoute(
        jsonRequest('DELETE', `http://localhost/api/v1/me/library/${gameId}`),
        { params: Promise.resolve({ gameId }) },
    )

    expect(patched.status).toBe(404)
    expect(removed.status).toBe(404)
    expect(library.status).toBe(404)
    const [list] = await client`select name, is_pinned from lists where id = ${secretListId}`
    const [entry] = await client`select status, hours_played::text as hours, play_count, completed_all_achievements from library_entries where user_id = ${B}`
    expect(list).toEqual({ name: 'Secret', is_pinned: false })
    expect(entry).toMatchObject({ status: 'playing', hours: '12.5', play_count: 4, completed_all_achievements: true })
})

it('does not change another player\'s review when A rates the same game', async () => {
    // The review route is the bearer user's row for that game. It cannot address B's review id, so it cannot 404 for it.
    const res = await putReviewRoute(
        jsonRequest('PUT', `http://localhost/api/v1/games/${gameId}/review`, { rating: 6, review: 'mine' }),
        { params: Promise.resolve({ slug: gameId }) },
    )
    expect(res.status).toBe(201)
    const [bRow] = await client`select rating, review from ratings_reviews where user_id = ${B} and game_id = ${gameId}`
    const [aCount] = await client`select count(*)::int as n from ratings_reviews where user_id = ${A} and game_id = ${gameId}`
    expect(bRow).toEqual({ rating: 8, review: 'keep me' })
    expect(aCount.n).toBe(1)
})

it('keeps hours, play count, and the 100% flag on a status-only save', async () => {
    const row = await upsertLibraryEntry(B, gameId, { status: 'completed' })
    expect(row?.status).toBe('completed')
    expect(Number(row?.hours_played)).toBe(12.5)
    expect(row?.play_count).toBe(4)
    expect(row?.completed_all_achievements).toBe(true)
})

it('likes nobody else\'s private list and writes no list_likes row', async () => {
    const result = await likeList(secretListId, A)
    expect(result).toEqual({ error: 'List not found' })
    const [likes] = await client`select count(*)::int as n from list_likes where list_id = ${secretListId}`
    expect(likes.n).toBe(0)
})

it('syncs the same game twice as one row', async () => {
    const [list] = await client`insert into lists (user_id, name, is_public, is_default) values (${A}, 'Shelf', true, false) returning id`
    const first = await syncListGames(list.id, { toAdd: [{ id: gameId }, { id: gameId }], toRemove: [] }, A)
    const second = await syncListGames(list.id, { toAdd: [{ id: gameId }], toRemove: [] }, A)
    expect(first).toEqual({ error: null })
    expect(second).toEqual({ error: null })
    const [count] = await client`select count(*)::int as n from list_games where list_id = ${list.id}`
    expect(count.n).toBe(1)
})

it('rolls back a list when adding the game fails the foreign key', async () => {
    const [before] = await client`select count(*)::int as n from lists where user_id = ${A}`
    const missing = randomUUID()
    const result = await createListWithGame(A, missing, { name: 'Ghost', description: '', isPublic: true, isPinned: false })
    expect(result.error ?? '').toMatch(/foreign key/i)
    expect(result.data).toBeNull()
    const [after] = await client`select count(*)::int as n from lists where user_id = ${A}`
    expect(after.n).toBe(before.n)
})

it('keeps one row when two first writes race', async () => {
    const [game] = await client`insert into games (igdb_id, name, slug) values (910002, 'Race Probe', 'race-probe') returning id`
    const [ratingA, ratingB] = await Promise.all([
        saveRatingReview(A, game.id, 7, 'one', false),
        saveRatingReview(A, game.id, 9, 'two', false),
    ])
    expect(ratingA.error).toBeNull()
    expect(ratingB.error).toBeNull()
    const [ratings] = await client`select count(*)::int as n from ratings_reviews where user_id = ${A} and game_id = ${game.id}`
    expect(ratings.n).toBe(1)

    const [libraryA, libraryB] = await Promise.all([
        upsertLibraryEntry(A, game.id, { status: 'playing' }),
        upsertLibraryEntry(A, game.id, { status: 'completed', hours: 3, playedCount: 2, is100: true }),
    ])
    expect(libraryA).not.toBeNull()
    expect(libraryB).not.toBeNull()
    const rows = await client`select count(*)::int as n from library_entries where user_id = ${A} and game_id = ${game.id}`
    expect(rows[0].n).toBe(1)
})
