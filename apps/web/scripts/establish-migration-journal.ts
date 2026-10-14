import { resolve } from 'node:path'
import postgres from 'postgres'
import { assertDisposableDatabase, refuseRetiredFlags } from '../lib/catalog/database-url'
import { loadEnvFile } from '../lib/catalog/env-file'
import { applyPending, inspectMigrations, type MigrationSql } from '../lib/catalog/migrations'

const help = `Apply ScreenPeak SQL migrations on a local disposable database.

  --database-env NAME   Required. Environment variable holding the URL.
                        Never reads DATABASE_POOL_URL. The host must be local
                        and the database name must end in _test or _copy.
  --apply-pending       Apply journaled migrations that are not yet recorded.
                        An empty database runs the whole chain in one transaction.
                        A database that already has public.games, but no recorded
                        0000–0002 hashes, is refused. This command does not replay
                        those files.

With no --apply-pending, print a dry-run and write nothing.
The script does not create the anon and authenticated roles or auth.uid().
An empty local Postgres needs those before 0000. Hosted schema changes are
applied by the owner as SQL. See docs/igdb.md.`

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(name)
    return index === -1 ? undefined : process.argv[index + 1]
}

async function main(): Promise<void> {
    const envName = argument('--database-env')
    if (!envName || process.argv.includes('--help')) {
        console.log(help)
        process.exit(process.argv.includes('--help') ? 0 : 1)
    }
    loadEnvFile(resolve(__dirname, '../.env.local'))
    const url = process.env[envName]
    if (!url) throw new Error(`Set ${envName}. This command does not fall back to DATABASE_POOL_URL.`)
    refuseRetiredFlags(process.argv)
    assertDisposableDatabase(url)
    const apply = process.argv.includes('--apply-pending')

    const sql = postgres(url, { max: 1, onnotice: () => {} })
    try {
        const client = sql as unknown as MigrationSql
        if (!apply) console.log(JSON.stringify({ dryRun: true, ...(await inspectMigrations(client)) }, null, 2))
        else console.log(JSON.stringify({ applied: await applyPending(client) }, null, 2))
    } finally {
        await sql.end()
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
