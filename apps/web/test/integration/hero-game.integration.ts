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

import { socialBackdrop } from '@/lib/catalog/images'
import { getHeroGame } from '@/lib/queries/game'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Catalogue tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const database = 'hero_' + randomUUID().replaceAll('-', '') + '_test'
parsed.pathname = '/' + database
const client = postgres(parsed.toString(), { max: 1, prepare: false, onnotice: () => {} })
const migration = async (name: string) => readFile('db/migrations/' + name + '.sql', 'utf8')

const HERO = '00000000-0000-0000-0000-0000000000a1'
const THIN = '00000000-0000-0000-0000-0000000000b1'
const USERS = [1, 2, 3].map(n => `10000000-0000-0000-0000-00000000000${n}`)
const SHOT = 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc-hero.jpg'

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
        insert into games (id, name, slug, cover_image_url, artwork_image_url, screenshots) values
            (${HERO}, 'Hero Game', 'hero-game', 'https://images.igdb.com/igdb/image/upload/t_cover_big/co-hero.jpg', null, ${[SHOT]}),
            (${THIN}, 'Thin Game', 'thin-game', null, null, null)
    `
    for (const [index, id] of USERS.entries()) {
        await client`
            insert into auth.users (id, email, raw_user_meta_data) values
                (${id}, ${`hero${index + 1}@example.com`}, ${JSON.stringify({ username: `hero${index + 1}` })}::jsonb)
        `
        await client`insert into ratings_reviews (user_id, game_id, rating) values (${id}, ${HERO}, 8)`
    }
    await client`insert into ratings_reviews (user_id, game_id, rating) values (${USERS[0]}, ${THIN}, 10)`
})

afterAll(async () => {
    await client.end()
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await admin.end()
})

describe('getHeroGame against disposable Postgres', () => {
    it('returns the game with enough ratings and keeps screenshot urls as an array', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const hero = await getHeroGame()
        expect(hero?.slug).toBe('hero-game')
        expect(hero?.artwork_image_url).toBeNull()
        expect(hero?.screenshots).toEqual([SHOT])
        expect(socialBackdrop(hero!)?.url).toBe(SHOT)
        expect(error).not.toHaveBeenCalled()
        error.mockRestore()
    })

    it('logs a database error and returns null, which is distinct from no eligible game', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        await client`alter table games rename column artwork_image_url to artwork_image_url_gone`
        try {
            await expect(getHeroGame()).resolves.toBeNull()
            expect(String(error.mock.calls[0]?.[0])).toContain('hero game query failed')
        } finally {
            await client`alter table games rename column artwork_image_url_gone to artwork_image_url`
            error.mockRestore()
        }
    })
})
