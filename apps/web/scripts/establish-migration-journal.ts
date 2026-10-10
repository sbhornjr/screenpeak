import postgres from 'postgres'
import { assertDatabaseTarget, assertLocalCopy, databaseTargetFromArgv } from '../lib/catalog/database-url'
import { applyPending, ensureLocalAuthStubs, inspectMigrations, stampBaseline, type MigrationSql } from '../lib/catalog/migrations'

const help = `Record or apply ScreenPeak SQL migrations.

  --database-env NAME     Environment variable holding the URL. Required.
                         This command never reads DATABASE_POOL_URL on its own.
  --stamp-baseline       Record 0000–0002 as already applied, without replaying them.
                         A second run on a matching journal returns an empty list.
  --apply-pending        Apply journaled migrations that are not yet recorded.
                         Refuses while 0000–0002 are unrecorded on a database that already has tables.
                         Every pending file runs in one transaction. 0007 aborts when a
                         catalogue row has no positive igdb_id, and that abort rolls
                         0003–0006 back with it. Stop at 0006 first on a legacy copy.
  --through TAG          With --apply-pending, stop after this journal tag.
                         Use 0006_two_score_rpcs before the catalogue reset.
                         A later --apply-pending with no --through applies 0007.
  --local-auth-stubs     Create anon/authenticated roles and auth.uid() before --apply-pending.
                         Only for an empty local Postgres. Refuses a Supabase auth schema
                         and refuses --target-hosted.
  --confirm-local-copy   Local copy only. Required when that database has Supabase dump markers.
                         A localhost URL can be a tunnel. This flag does not bypass that refusal
                         for --local-auth-stubs.
  --target-hosted        Hosted database. Requires --confirm-host and --confirm-database.
                         Refuses a local host. Do not combine with --confirm-local-copy.
  --confirm-host HOST    Type the URL hostname. Must match exactly.
  --confirm-database NAME
                         Type the URL database name. Must match exactly.

With neither --stamp-baseline nor --apply-pending, print a dry-run and write nothing.
A dry-run before the stamp lists pending from 0000. After 0007, baseline is recorded:
the pre-stamp column check no longer applies. Rehearse on a local _copy first.
See docs/igdb-cutover-checklist.md.`

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
    const target = databaseTargetFromArgv(process.argv)
    assertDatabaseTarget(url, target)
    const stamp = process.argv.includes('--stamp-baseline')
    const apply = process.argv.includes('--apply-pending')
    const through = argument('--through')
    if (process.argv.includes('--through') && (!through || through.startsWith('--')))
        throw new Error('--through requires a migration tag, such as 0006_two_score_rpcs.')
    if (stamp && apply) throw new Error('Choose one of --stamp-baseline or --apply-pending.')
    if (through && !apply) throw new Error('--through is only valid with --apply-pending.')
    if (process.argv.includes('--local-auth-stubs') && !apply)
        throw new Error('--local-auth-stubs is only for applying the chain to an empty local database.')
    if (process.argv.includes('--local-auth-stubs') && target.targetHosted)
        throw new Error('--local-auth-stubs refuses --target-hosted. Use it only on empty local Postgres.')

    const sql = postgres(url, { max: 1, onnotice: () => {} })
    try {
        const client = sql as unknown as MigrationSql
        if (!target.targetHosted) await assertLocalCopy(client, target.confirmLocalCopy)
        if (process.argv.includes('--local-auth-stubs')) await ensureLocalAuthStubs(client)
        if (!stamp && !apply) console.log(JSON.stringify({ dryRun: true, ...(await inspectMigrations(client)) }, null, 2))
        else if (stamp) console.log(JSON.stringify({ stamped: await stampBaseline(client) }, null, 2))
        else console.log(JSON.stringify({ applied: await applyPending(client, undefined, through ? { through } : {}) }, null, 2))
    } finally {
        await sql.end()
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
