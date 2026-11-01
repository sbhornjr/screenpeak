import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { DB } from '@/lib/db'

const state = vi.hoisted(() => ({ db: null as DB | null }))
// The model call is the paid step the cooldown protects, so the test controls
// when it finishes and counts how often it runs.
const model = vi.hoisted(() => ({
    calls: 0,
    pending: [] as ((identity: string) => void)[],
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
}))

vi.mock('@/lib/loadout', () => ({
    buildLoadoutInput: async () => ({ totalRatings: 5 }),
    generateLoadoutIdentity: () => {
        model.calls += 1
        return new Promise<string>((resolve) => { model.pending.push(resolve) })
    },
}))

import { generateReadout } from '@/lib/loadout-readout'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Read-out tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const databaseName = 'readout_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + databaseName
const client = postgres(parsed.toString(), { max: 4, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')

const PLAYER = randomUUID()

async function stored() {
    const [row] = await client<{ identity: string | null, at: string | null }[]>`
        select loadout_identity as identity, loadout_identity_at::text as at from users where id = ${PLAYER}`
    return row
}

async function settle() {
    // Let both requests reach the model call (or give up before it).
    for (let i = 0; i < 20 && model.pending.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 25))
    await new Promise((resolve) => setTimeout(resolve, 100))
}

beforeAll(async () => {
    await admin.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$`)
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`)
    await client.unsafe(`CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;`)
    for (const name of ['0000_illegal_kinsey_walden', '0001_functions_and_triggers'])
        await client.unsafe(await migration(name))
    await client`insert into auth.users (id, email, raw_user_meta_data)
        values (${PLAYER}, 'player@example.com', ${JSON.stringify({ username: 'player' })}::jsonb)`
    state.db = drizzle(client) as unknown as DB
})

beforeEach(async () => {
    model.calls = 0
    model.pending = []
    await client`update users set loadout_identity = null, loadout_identity_at = null where id = ${PLAYER}`
})

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await admin.end()
})

it('runs the model once when two requests arrive together', async () => {
    const first = generateReadout(PLAYER)
    const second = generateReadout(PLAYER)
    await settle()
    expect(model.calls).toBe(1)
    for (const resolve of model.pending) resolve('A patient reader of hard games.')
    const outcomes = await Promise.all([first, second])
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({ ok: false, reason: 'too_soon' })
    expect((await stored()).identity).toBe('A patient reader of hard games.')
})

it('blocks a second request while the first is still generating', async () => {
    const first = generateReadout(PLAYER)
    await settle()
    expect(await generateReadout(PLAYER)).toMatchObject({ ok: false, reason: 'too_soon' })
    expect(model.calls).toBe(1)
    model.pending[0]('Done.')
    expect(await first).toEqual({ ok: true, identity: 'Done.' })
})

it('gives the slot back when the model returns nothing, so a retry can run', async () => {
    await client`update users set loadout_identity = 'Old.', loadout_identity_at = now() - interval '5 minutes' where id = ${PLAYER}`
    const before = await stored()
    const failed = generateReadout(PLAYER)
    await settle()
    model.pending[0]('')
    expect(await failed).toEqual({ ok: false, reason: 'generation_failed' })
    expect(await stored()).toEqual(before)

    const retry = generateReadout(PLAYER)
    await settle()
    expect(model.calls).toBe(2)
    model.pending[1]('New.')
    expect(await retry).toEqual({ ok: true, identity: 'New.' })
})

it('still waits out the minute after a saved Read-out', async () => {
    await client`update users set loadout_identity = 'Fresh.', loadout_identity_at = now() - interval '10 seconds' where id = ${PLAYER}`
    const outcome = await generateReadout(PLAYER)
    expect(outcome).toMatchObject({ ok: false, reason: 'too_soon' })
    if (!outcome.ok && outcome.reason === 'too_soon') expect(outcome.retryAfter).toBeGreaterThanOrEqual(49)
    expect(model.calls).toBe(0)
})
