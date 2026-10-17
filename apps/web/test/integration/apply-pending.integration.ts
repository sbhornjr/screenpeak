import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, expect, it } from 'vitest'
import postgres from 'postgres'
import { applyPending, inspectMigrations, type MigrationSql } from '@/lib/catalog/migrations'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable local database.')
const parsed = new URL(url)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test'))
    throw new Error('Catalogue tests require a local database ending in _test.')

const admin = postgres(url, { max: 1, onnotice: () => {} })
const names: string[] = []

function databaseUrl(name: string) {
    const next = new URL(url!)
    next.pathname = '/' + name
    return next.toString()
}

async function createDatabase(prefix: string) {
    const name = prefix + randomUUID().replaceAll('-', '') + '_test'
    names.push(name)
    await admin.unsafe(`CREATE DATABASE "${name}"`)
    return postgres(databaseUrl(name), { max: 4, prepare: false, onnotice: () => {} })
}

const authStubs = () => readFile('db/local/auth-stubs.sql', 'utf8')

afterAll(async () => {
    for (const name of names) await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await admin.end()
})

it('applies the whole chain on an empty database and records every file', async () => {
    const fresh = await createDatabase('empty_')
    try {
        const sql = fresh as unknown as MigrationSql
        await fresh.unsafe(await authStubs())
        const before = await inspectMigrations(sql)
        expect(before.baseline).toBe('empty')
        expect(before.pending[0]).toBe('0000_illegal_kinsey_walden')
        expect(before.pending.at(-1)).toBe('0010_steam_link_intents')
        expect(await fresh`select to_regclass('drizzle.__drizzle_migrations') as journal`).toEqual([{ journal: null }])
        const applied = await applyPending(sql)
        expect(applied[0]).toBe('0000_illegal_kinsey_walden')
        expect(applied.at(-1)).toBe('0010_steam_link_intents')
        expect(await applyPending(sql)).toEqual([])
        const recorded = await inspectMigrations(sql)
        expect(recorded.baseline).toBe('recorded')
        expect(recorded.pending).toEqual([])
        const [column] = await fresh`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'igdb_id'`
        expect(column.is_nullable).toBe('NO')
        const dropped = await fresh`select column_name from information_schema.columns where table_schema = 'public' and column_name in ('rawg_id', 'metacritic_score', 'steam_appid')`
        expect(dropped).toEqual([])
        const [count] = await fresh`select count(*)::int as n from drizzle.__drizzle_migrations`
        expect(count.n).toBe(11)
        const [limits] = await fresh`select to_regclass('public.api_rate_limits') as name`
        expect(limits.name).toBe('api_rate_limits')
        const [intents] = await fresh`select to_regclass('public.steam_link_intents') as name`
        expect(intents.name).toBe('steam_link_intents')
    } finally {
        await fresh.end()
    }
}, 60_000)

it('refuses to replay 0000 when games already exist and the journal does not', async () => {
    const fresh = await createDatabase('legacy_')
    try {
        const sql = fresh as unknown as MigrationSql
        await fresh.unsafe(await authStubs())
        await fresh.unsafe(await readFile('db/migrations/0000_illegal_kinsey_walden.sql', 'utf8'))
        await fresh`insert into games (rawg_id, name, slug) values (1, 'Legacy', 'legacy')`
        const report = await inspectMigrations(sql)
        expect(report.baseline).toBe('refuse')
        expect(report.reasons.join(' ')).toMatch(/not recorded/)
        await expect(applyPending(sql)).rejects.toThrow(/not recorded/)
        expect(await fresh`select to_regclass('drizzle.__drizzle_migrations') as journal`).toEqual([{ journal: null }])
        expect(await fresh`select slug from games`).toEqual([{ slug: 'legacy' }])
    } finally {
        await fresh.end()
    }
}, 60_000)
