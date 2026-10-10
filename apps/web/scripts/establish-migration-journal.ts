import postgres from 'postgres'
import { assertDisposableDatabase } from '../lib/catalog/database-url'
import { applyPending, ensureLocalAuthStubs, inspectMigrations, stampBaseline, type MigrationSql } from '../lib/catalog/migrations'

const help = `Record or apply ScreenPeak SQL migrations on a disposable local database.

  --database-env NAME     Environment variable holding the URL. Required.
                         The URL must be localhost and the database name must end in _test or _copy.
                         This command never reads DATABASE_POOL_URL on its own.
  --stamp-baseline       Record 0000–0002 as already applied, without replaying them.
  --apply-pending        Apply journaled migrations that are not yet recorded.
                         Refuses while 0000–0002 are unrecorded on a database that already has tables.
  --local-auth-stubs     Create anon/authenticated roles and auth.uid() before --apply-pending.
                         Only for an empty local Postgres. Never use on a Supabase copy.

With neither --stamp-baseline nor --apply-pending, print a dry-run and write nothing.
Do not point this at the hosted development database. Restore a copy locally first.
See docs/igdb-migration-runbook.md.`

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
    const url = process.env[envName]
    if (!url) throw new Error(`Set ${envName}. This command does not fall back to DATABASE_POOL_URL.`)
    assertDisposableDatabase(url)
    const stamp = process.argv.includes('--stamp-baseline')
    const apply = process.argv.includes('--apply-pending')
    if (stamp && apply) throw new Error('Choose one of --stamp-baseline or --apply-pending.')
    if (process.argv.includes('--local-auth-stubs') && !apply)
        throw new Error('--local-auth-stubs is only for applying the chain to an empty local database.')

    const sql = postgres(url, { max: 1, onnotice: () => {} })
    try {
        const client = sql as unknown as MigrationSql
        if (process.argv.includes('--local-auth-stubs')) await ensureLocalAuthStubs(client)
        if (!stamp && !apply) console.log(JSON.stringify({ dryRun: true, ...(await inspectMigrations(client)) }, null, 2))
        else if (stamp) console.log(JSON.stringify({ stamped: await stampBaseline(client) }, null, 2))
        else console.log(JSON.stringify({ applied: await applyPending(client) }, null, 2))
    } finally {
        await sql.end()
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
