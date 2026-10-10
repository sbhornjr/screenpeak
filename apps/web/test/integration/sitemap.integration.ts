import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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

import { loadSitemap, loadSitemapShard } from '@/lib/queries/sitemap'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Catalogue tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const database = 'sitemap_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + database
const client = postgres(parsed.toString(), { max: 1, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')

const USERS = [1, 2, 3, 4, 5].map(n => `10000000-0000-0000-0000-00000000000${n}`)
const NEWER = '00000000-0000-0000-0000-0000000000b1'
const TIE_A = '00000000-0000-0000-0000-0000000000c1'
const TIE_B = '00000000-0000-0000-0000-0000000000c2'
const MID = '00000000-0000-0000-0000-0000000000d1'
const OLDER = '00000000-0000-0000-0000-0000000000a1'
const LISTS = [1, 2, 3, 4, 5].map(n => `20000000-0000-0000-0000-00000000000${n}`)
const SECRET = '20000000-0000-0000-0000-000000000009'
const BASE = 'https://screenpeak.example'

beforeAll(async () => {
    await admin.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$`)
    await admin.unsafe(`CREATE DATABASE "${database}"`)
    await client.unsafe(`CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;`)
    for (const name of ['0000_illegal_kinsey_walden', '0001_functions_and_triggers', '0002_fix_get_feed_library_privacy', '0003_igdb_request_budget', '0004_igdb_catalog_preparation'])
        await client.unsafe(await migration(name))
    state.db = drizzle(client) as DB
    await client`
        insert into games (id, name, slug, metacritic_score, updated_at) values
            (${OLDER}, 'Older', 'older', 99, '2026-01-01 00:00:00+00'),
            (${NEWER}, 'Newer', 'newer', 1, '2026-04-01 00:00:00+00'),
            (${TIE_B}, 'Tie B', 'tie-b', 50, '2026-03-01 00:00:00+00'),
            (${TIE_A}, 'Tie A', 'tie-a', 50, '2026-03-01 00:00:00+00'),
            (${MID}, 'Mid', 'mid', 10, '2026-02-01 00:00:00+00')
    `
    for (const [index, id] of USERS.entries()) {
        await client`
            insert into auth.users (id, email, raw_user_meta_data) values
                (${id}, ${`fan${index + 1}@example.com`}, ${JSON.stringify({ username: `fan${index + 1}` })}::jsonb)
        `
    }
    await client`delete from lists`
    for (const [index, id] of LISTS.entries()) {
        await client`
            insert into lists (id, user_id, name, is_public) values
                (${id}, ${USERS[0]}, ${`Shelf ${index + 1}`}, true)
        `
    }
    await client`
        insert into lists (id, user_id, name, is_public) values (${SECRET}, ${USERS[0]}, 'Secret Shelf', false)
    `
})

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await admin.end()
})

describe('sitemap against disposable Postgres', () => {
    it('orders games by updated_at then id across a page boundary, and a higher Metacritic score does not win', async () => {
        const column = await client`select 1 as present from information_schema.columns
            where table_schema = 'public' and table_name = 'games' and column_name = 'metacritic_score'`
        expect(column).toHaveLength(1)
        const entries = await loadSitemap(BASE, { pageSize: 2 })
        const urls = entries.map(entry => entry.url)
        expect(urls.filter(item => item.includes('/games/') && item !== `${BASE}/games`)).toEqual([
            `${BASE}/games/newer`,
            `${BASE}/games/tie-a`,
            `${BASE}/games/tie-b`,
            `${BASE}/games/mid`,
            `${BASE}/games/older`,
        ])
        const newer = entries.find(entry => entry.url.endsWith('/games/newer'))
        expect(newer?.lastModified?.toISOString()).toBe('2026-04-01T00:00:00.000Z')
        const again = await loadSitemap(BASE, { pageSize: 2 })
        expect(again.map(entry => entry.url)).toEqual(urls)
    })

    it('pages users and public lists across a full page and omits a private list', async () => {
        const entries = await loadSitemap(BASE, { pageSize: 2 })
        expect(entries.filter(entry => entry.url.includes('/user/') && !entry.url.includes('/lists/')).map(entry => entry.url)).toEqual(
            USERS.map((_, index) => `${BASE}/user/fan${index + 1}`),
        )
        expect(entries.filter(entry => entry.url.includes('/lists/')).map(entry => entry.url)).toEqual(
            LISTS.map(id => `${BASE}/user/fan1/lists/${id}`),
        )
        expect(entries.some(entry => entry.url.endsWith('/lists/' + SECRET))).toBe(false)
    })

    it('splits the same rows into documents that stay within the requested url cap', async () => {
        const full = await loadSitemap(BASE, { pageSize: 2 })
        const shards = []
        for (let id = 0; ; id += 1) {
            const shard = await loadSitemapShard(BASE, id, { pageSize: 2, urlLimit: 4 })
            if (shard.length === 0) break
            expect(shard.length).toBeLessThanOrEqual(4)
            shards.push(shard)
            expect(id).toBeLessThan(10)
        }
        expect(shards.length).toBeGreaterThan(1)
        expect(shards.flat().map(entry => entry.url)).toEqual(full.map(entry => entry.url))
    })

    it('rejects when the games query fails instead of publishing an empty game section', async () => {
        await client`alter table games rename column updated_at to updated_at_gone`
        try {
            await expect(loadSitemap(BASE, { pageSize: 2 })).rejects.toThrow()
        } finally {
            await client`alter table games rename column updated_at_gone to updated_at`
        }
    })
})
