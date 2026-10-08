import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { config } from 'dotenv'
import postgres from 'postgres'

class InventoryError extends Error {}
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const inside = (root: string, path: string) => {
    const rel = relative(root, path)
    return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

async function main() {
    const { values } = parseArgs({ options: {
        'output-dir': { type: 'string' }, help: { type: 'boolean', short: 'h' },
    }, strict: true, allowPositionals: false })
    if (values.help) {
        console.log('Catalogue baseline: read-only repeatable-read export.\nRun from repo root: node --import tsx apps/web/scripts/inventory-igdb-baseline.ts --output-dir /absolute/new/directory\nParent must exist; output must be outside the repository. Never overwrites. Uses DATABASE_POOL_URL. Exports private public-schema rows, schema metadata and migration history; Auth is counted only. This is not a full disaster-recovery backup or a reset command.')
        return
    }
    if (!values['output-dir']) throw new InventoryError('Specify --output-dir outside the repository.')
    const root = await realpath(resolve(__dirname, '../../..'))
    const requested = resolve(process.env.INIT_CWD ?? process.cwd(), values['output-dir'])
    if (inside(root, requested)) throw new InventoryError('Private exports must be outside the repository.')
    const output = resolve(await realpath(dirname(requested)), basename(requested))
    if (inside(root, output)) throw new InventoryError('Private exports must be outside the repository, including symlink targets.')
    config({ path: resolve(__dirname, '../.env.local'), quiet: true })
    if (!process.env.DATABASE_POOL_URL) throw new InventoryError('Set DATABASE_POOL_URL in apps/web/.env.local or the environment.')
    const connection = new URL(process.env.DATABASE_POOL_URL)
    const journalText = await readFile(resolve(__dirname, '../db/migrations/meta/_journal.json'), 'utf8')
    const journal = JSON.parse(journalText) as { entries: { tag: string; when: number }[] }
    const localMigrations = await Promise.all(journal.entries.map(async entry => ({
        ...entry, sha256: hash(await readFile(resolve(__dirname, '../db/migrations', entry.tag + '.sql'), 'utf8')),
    })))
    // Exclusive directory creation prevents accidentally overwriting an earlier snapshot.
    await mkdir(output, { mode: 0o700 })
    const sql = postgres(connection.toString(), { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} })
    try {
        const snapshot = await sql.begin('isolation level repeatable read read only', async tx => {
            await tx`set local statement_timeout = '30s'`
            await tx`set local lock_timeout = '5s'`
            const [identity] = await tx`select current_database() as database, current_user as role,
                current_setting('transaction_read_only') as read_only,
                current_setting('transaction_isolation') as isolation, version() as version,
                transaction_timestamp() as captured_at`
            if (identity.read_only !== 'on') throw new InventoryError('Read-only transaction was not established.')
            const tables = await tx<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' order by tablename`
            const rows: Record<string, Record<string, unknown>[]> = {}
            for (const table of tables) {
                // row_to_json preserves timestamp/numeric representations instead of driver Date coercion.
                const result = await tx`select row_to_json(t) as row from ${tx('public.' + table.tablename)} t`
                rows[table.tablename] = result.map(item => item.row)
            }
            const migrations: Record<string, readonly unknown[]> = {}
            for (const [schema, table] of [['drizzle', '__drizzle_migrations'], ['supabase_migrations', 'schema_migrations']]) {
                const [exists] = await tx`select to_regclass(${schema + '.' + table}) as name`
                if (exists.name) migrations[schema + '.' + table] = await tx`select * from ${tx(schema + '.' + table)}`
            }
            const [auth] = await tx`select count(*)::int as users from auth.users`
            return {
                identity: { ...identity, host: connection.hostname, port: connection.port, connectionRole: decodeURIComponent(connection.username) },
                rows, authCounts: auth, migrations, localMigrations,
                columns: await tx`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`,
                constraints: await tx`select n.nspname as schema, c.relname as table_name, k.conname as name, k.contype as type,
                    k.confrelid::regclass::text as referenced_table, pg_get_constraintdef(k.oid) as definition
                    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' or k.confrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
                    order by 1,2,3`,
                indexes: await tx`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1,2`,
                policies: await tx`select * from pg_policies where schemaname = 'public' order by tablename, policyname`,
                triggers: await tx`select c.relname as table_name, t.tgname as name, pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal order by 1,2`,
            }
        })
        const content = JSON.stringify(snapshot, null, 2) + '\n'
        const manifest = {
            version: 1, capturedAt: new Date().toISOString(), snapshotSha256: hash(content),
            counts: Object.fromEntries(Object.entries(snapshot.rows).map(([table, rows]) => [table, rows.length])),
            authCounts: snapshot.authCounts, databaseMigrationTables: Object.keys(snapshot.migrations),
            localMigrations, scope: 'Public-schema data and schema metadata; auth count only. Not a full restorable database dump.',
        }
        await writeFile(resolve(output, 'snapshot.json'), content, { mode: 0o600, flag: 'wx' })
        await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
        console.log(JSON.stringify(manifest, null, 2))
    } finally { await sql.end({ timeout: 2 }) }
}
main().catch(error => {
    // Postgres/URL errors can contain credentials, SQL or private values.
    console.error(error instanceof InventoryError ? error.message : 'Inventory failed. Check credentials, connectivity and a new output directory with an existing parent. A failed export may leave a partial directory; absence of manifest.json means incomplete.')
    process.exitCode = 1
})
