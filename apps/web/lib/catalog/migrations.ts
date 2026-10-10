import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertAuthStubSafe } from './database-url'

export const BASELINE_TAGS = [
    '0000_illegal_kinsey_walden',
    '0001_functions_and_triggers',
    '0002_fix_get_feed_library_privacy',
] as const

export type MigrationFile = { tag: string; when: number; hash: string; statements: string[] }
export type MigrationSql = {
    unsafe: (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
    begin: <T>(callback: (tx: MigrationSql) => Promise<T>) => Promise<T>
}

export function migrationHash(sqlText: string): string {
    return createHash('sha256').update(sqlText).digest('hex')
}

export function readMigrations(folder = join(process.cwd(), 'db/migrations')): MigrationFile[] {
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

export async function ensureLocalAuthStubs(sql: MigrationSql): Promise<void> {
    await assertAuthStubSafe(sql)
    await sql.unsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$`)
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS auth')
    // 0001's handle_new_user trigger reads email and raw_user_meta_data.
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text,
        raw_user_meta_data jsonb
    )`)
    await sql.unsafe('ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text')
    await sql.unsafe('ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb')
    await sql.unsafe(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$`)
}

async function journalExists(sql: MigrationSql): Promise<boolean> {
    const [row] = await sql.unsafe(`select exists(
        select 1 from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations') as present`)
    return Boolean(row?.present)
}

export async function readApplied(sql: MigrationSql): Promise<{ hash: string; createdAt: number }[]> {
    if (!await journalExists(sql)) return []
    const rows = await sql.unsafe('select hash, created_at from drizzle.__drizzle_migrations order by created_at, id')
    return rows.map(row => ({ hash: String(row.hash), createdAt: Number(row.created_at) }))
}

const REQUIRED_TABLES = ['genres', 'platforms', 'developers', 'publishers', 'ratings_reviews', 'library_entries', 'lists', 'steam_accounts', 'users', 'game_genres', 'game_platforms', 'game_developers', 'game_publishers', 'list_likes', 'follows', 'list_games']

export async function classifyBaseline(sql: MigrationSql): Promise<{ kind: 'empty' | 'ready' | 'reject'; reasons: string[] }> {
    const [games] = await sql.unsafe(`select to_regclass('public.games') as games`)
    if (!games?.games) {
        const [any] = await sql.unsafe(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`)
        if (Number(any?.n ?? 0) === 0) return { kind: 'empty', reasons: [] }
        return { kind: 'reject', reasons: ['public tables exist but public.games does not'] }
    }
    const reasons: string[] = []
    const columns = await sql.unsafe(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'games'`)
    const names = new Set(columns.map(column => String(column.column_name)))
    for (const required of ['rawg_id', 'metacritic_score', 'steam_appid', 'slug', 'name']) {
        if (!names.has(required)) reasons.push(`games.${required} is missing`)
    }
    if (names.has('igdb_id')) reasons.push('games.igdb_id already exists; do not stamp over an unjournaled 0004')
    const [schema] = await sql.unsafe(`select exists(select 1 from pg_namespace where nspname = 'igdb_private') as present`)
    if (schema?.present) reasons.push('igdb_private already exists; do not stamp over an unjournaled 0003')
    const feeds = await sql.unsafe(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'get_feed'`)
    if (!feeds.length) reasons.push('public.get_feed is missing')
    else if (!feeds.some(feed => String(feed.prosrc).includes('library_public'))) reasons.push('get_feed is missing the 0002 library_public check')
    const found = await sql.unsafe(`select table_name from information_schema.tables where table_schema = 'public'`)
    const have = new Set(found.map(row => String(row.table_name)))
    for (const table of REQUIRED_TABLES) if (!have.has(table)) reasons.push(`public.${table} is missing`)
    return { kind: reasons.length ? 'reject' : 'ready', reasons }
}

export type MigrationInspection = {
    applied: { hash: string; createdAt: number }[]
    pending: string[]
    baseline: 'empty' | 'ready' | 'reject' | 'recorded'
    reasons: string[]
}

export async function inspectMigrations(sql: MigrationSql, files = readMigrations()): Promise<MigrationInspection> {
    const applied = await readApplied(sql)
    const last = applied.reduce((max, row) => Math.max(max, row.createdAt), -1)
    const baseline = await classifyBaseline(sql)
    const pending = files.filter(file => file.when > last).map(file => file.tag)
    const recorded = new Set(applied.map(row => row.hash))
    const baselineRecorded = baselineFiles(files).every(file => recorded.has(file.hash))
    // classifyBaseline still requires the pre-0004 columns. After the journal exists that check is historical.
    if (baselineRecorded) {
        const note = '0000–0002 are already recorded. The pre-stamp column check fails once igdb_id exists or 0007 drops rawg_id, metacritic_score, and steam_appid. That is expected. stampBaseline on a matching journal returns an empty list and does not rewrite it.'
        return {
            applied,
            baseline: 'recorded',
            reasons: baseline.kind === 'reject' ? [note, ...baseline.reasons] : baseline.reasons,
            pending,
        }
    }
    return { applied, baseline: baseline.kind, reasons: baseline.reasons, pending }
}

async function ensureJournal(sql: MigrationSql): Promise<void> {
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle')
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
    )`)
}

function baselineFiles(files: MigrationFile[]): MigrationFile[] {
    const wanted = new Set<string>(BASELINE_TAGS)
    const found = files.filter(file => wanted.has(file.tag))
    if (found.length !== BASELINE_TAGS.length) throw new Error('Journal is missing a 0000–0002 migration file.')
    return BASELINE_TAGS.map(tag => found.find(file => file.tag === tag)!)
}

export async function stampBaseline(sql: MigrationSql, files = readMigrations()): Promise<string[]> {
    const baseline = baselineFiles(files)
    const applied = await readApplied(sql)
    if (applied.length) {
        const matches = baseline.every(file => applied.some(row => row.hash === file.hash && row.createdAt === file.when))
        if (!matches) throw new Error('Migration journal does not match the 0000–0002 files. Refusing to overwrite it.')
        return []
    }
    const state = await classifyBaseline(sql)
    if (state.kind === 'empty') throw new Error('This database has no catalogue tables. Apply the migration chain instead of stamping a baseline.')
    if (state.kind === 'reject') throw new Error('Baseline does not match 0000–0002: ' + state.reasons.join('; '))
    await sql.begin(async tx => {
        await ensureJournal(tx)
        for (const file of baseline) await tx.unsafe('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [file.hash, file.when])
    })
    return baseline.map(file => file.tag)
}

export async function applyPending(sql: MigrationSql, files = readMigrations(), options: { through?: string } = {}): Promise<string[]> {
    const applied = await readApplied(sql)
    const state = await classifyBaseline(sql)
    const recorded = new Set(applied.map(row => row.hash))
    const baselineRecorded = baselineFiles(files).every(file => recorded.has(file.hash))
    if (state.kind !== 'empty' && !baselineRecorded)
        throw new Error('Refusing to apply migrations. Record the 0000–0002 baseline on this copy before applying 0003 or later. Do not replay 0000.')
    const last = applied.reduce((max, row) => Math.max(max, row.createdAt), -1)
    let pending = files.filter(file => file.when > last)
    if (options.through) {
        const limit = files.find(file => file.tag === options.through)
        if (!limit) throw new Error(`Unknown migration ${options.through}.`)
        pending = pending.filter(file => file.when <= limit.when)
    }
    if (state.kind !== 'empty' && pending.some(file => (BASELINE_TAGS as readonly string[]).includes(file.tag)))
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
