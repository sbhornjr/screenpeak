import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASELINE_TAGS = [
    '0000_illegal_kinsey_walden',
    '0001_functions_and_triggers',
    '0002_fix_get_feed_library_privacy',
] as const

type MigrationFile = { tag: string; when: number; hash: string; statements: string[] }
export type MigrationSql = {
    unsafe: (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
    begin: <T>(callback: (tx: MigrationSql) => Promise<T>) => Promise<T>
}

function migrationHash(sqlText: string): string {
    return createHash('sha256').update(sqlText).digest('hex')
}

function readMigrations(folder = join(process.cwd(), 'db/migrations')): MigrationFile[] {
    const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
        entries: { tag: string; when: number }[]
    }
    return journal.entries.map(entry => {
        const query = readFileSync(join(folder, `${entry.tag}.sql`), 'utf8')
        return {
            tag: entry.tag, when: entry.when, hash: migrationHash(query),
            statements: query.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean),
        }
    })
}

async function journalExists(sql: MigrationSql): Promise<boolean> {
    const [row] = await sql.unsafe(`select exists(
        select 1 from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations') as present`)
    return Boolean(row?.present)
}

async function readApplied(sql: MigrationSql): Promise<{ hash: string; createdAt: number }[]> {
    if (!await journalExists(sql)) return []
    const rows = await sql.unsafe('select hash, created_at from drizzle.__drizzle_migrations order by created_at, id')
    return rows.map(row => ({ hash: String(row.hash), createdAt: Number(row.created_at) }))
}

async function gamesExist(sql: MigrationSql): Promise<boolean> {
    const [games] = await sql.unsafe(`select to_regclass('public.games') as games`)
    return Boolean(games?.games)
}

async function publicTableCount(sql: MigrationSql): Promise<number> {
    const [any] = await sql.unsafe(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`)
    return Number(any?.n ?? 0)
}

function baselineFiles(files: MigrationFile[]): MigrationFile[] {
    const wanted = new Set<string>(BASELINE_TAGS)
    const found = files.filter(file => wanted.has(file.tag))
    if (found.length !== BASELINE_TAGS.length) throw new Error('Journal is missing a 0000–0002 migration file.')
    return BASELINE_TAGS.map(tag => found.find(file => file.tag === tag)!)
}

export type MigrationInspection = {
    applied: { hash: string; createdAt: number }[]
    pending: string[]
    baseline: 'empty' | 'recorded' | 'refuse'
    reasons: string[]
}

export async function inspectMigrations(sql: MigrationSql, files = readMigrations()): Promise<MigrationInspection> {
    const applied = await readApplied(sql)
    const recorded = new Set(applied.map(row => row.hash))
    const baselineRecorded = baselineFiles(files).every(file => recorded.has(file.hash))
    const last = applied.reduce((max, row) => Math.max(max, row.createdAt), -1)
    const pending = files.filter(file => file.when > last).map(file => file.tag)
    if (baselineRecorded) return { applied, pending, baseline: 'recorded', reasons: [] }
    if (await gamesExist(sql)) {
        return {
            applied, pending, baseline: 'refuse',
            reasons: ['public.games exists and 0000–0002 are not recorded. This command will not replay those files.'],
        }
    }
    if (await publicTableCount(sql) > 0) {
        return {
            applied, pending, baseline: 'refuse',
            reasons: ['public tables exist but public.games does not, and 0000–0002 are not recorded.'],
        }
    }
    return { applied, pending, baseline: 'empty', reasons: [] }
}

async function ensureJournal(sql: MigrationSql): Promise<void> {
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle')
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
    )`)
}

const REFUSE_EXISTING = 'Refusing to apply migrations. public.games exists and 0000–0002 are not recorded. This command will not replay those files.'

export async function applyPending(sql: MigrationSql, files = readMigrations()): Promise<string[]> {
    const applied = await readApplied(sql)
    const recorded = new Set(applied.map(row => row.hash))
    const baselineRecorded = baselineFiles(files).every(file => recorded.has(file.hash))
    const hasGames = await gamesExist(sql)
    if (hasGames && !baselineRecorded) throw new Error(REFUSE_EXISTING)
    if (!hasGames && !baselineRecorded && await publicTableCount(sql) > 0)
        throw new Error('Refusing to apply migrations. Public tables exist but public.games does not, and 0000–0002 are not recorded.')
    const last = applied.reduce((max, row) => Math.max(max, row.createdAt), -1)
    const pending = files.filter(file => file.when > last)
    if (hasGames && pending.some(file => (BASELINE_TAGS as readonly string[]).includes(file.tag)))
        throw new Error('Refusing to replay a baseline migration on a database that already has tables.')
    if (!pending.length) return []
    await sql.begin(async tx => {
        await ensureJournal(tx)
        for (const file of pending) {
            for (const statement of file.statements) await tx.unsafe(statement)
            await tx.unsafe('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [file.hash, file.when])
        }
    })
    return pending.map(file => file.tag)
}
