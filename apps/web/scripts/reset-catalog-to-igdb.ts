import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import postgres from 'postgres'
import { assertDatabaseTarget, assertLocalCopy, databaseTargetFromArgv } from '../lib/catalog/database-url'
import type { MigrationSql } from '../lib/catalog/migrations'

const help = `Stage or apply a fresh IGDB catalogue reset.

  --database-env NAME       Required. Never falls back to DATABASE_POOL_URL.
  --manifest FILE           Staged manifest JSON ({ runId, fingerprint, counts, games }).
  --write-manifest FILE     Read the database fingerprint and write a manifest. Requires --staged.
  --staged FILE             JSON array of CatalogGame values for --write-manifest.
  --apply                   Apply the manifest. Without this flag the command is a dry-run.
  --confirm-before-task-6  Ignored. Task 6 replaced Steam import, so the acknowledgement
                            is no longer required.
  --allow-empty             Permit a manifest with zero games. Enough on its own when the
                            catalogue has 25 or more games. Does not permit a non-empty
                            manifest under the small-catalogue floor.
  --allow-small             Permit a non-empty manifest that replaces 25 or more games with
                            fewer than 25 and fewer than 10% of the current count.
  --confirm-local-copy      Local copy only. Required when that database has Supabase dump markers.
  --target-hosted           Hosted database. Requires --confirm-host and --confirm-database.
                            Refuses a local host. Do not combine with --confirm-local-copy.
  --confirm-host HOST       Type the URL hostname. Must match exactly.
  --confirm-database NAME   Type the URL database name. Must match exactly.

Dry-run writes nothing. It reports current counts and the block for the flags you passed.
A size refusal throws before any reset_backup schema is created.
Apply takes a new reset_backup schema first and refuses to drop an earlier one.
Apply still refuses a stale fingerprint, a count mismatch, and a committed manifest;
those checks run after the backup schema exists, and a failed transaction leaves that schema.
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
    const apply = process.argv.includes('--apply')
    const manifestPath = argument('--manifest')
    const writePath = argument('--write-manifest')
    const stagedPath = argument('--staged')
    if (apply && !manifestPath) throw new Error('--apply requires --manifest.')
    if (writePath && !stagedPath) throw new Error('--write-manifest requires --staged.')
    if (!manifestPath && !writePath) throw new Error('Pass --manifest or --write-manifest.')
    if (manifestPath && !existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`)
    if (stagedPath && !existsSync(stagedPath)) throw new Error(`Staged catalogue not found: ${stagedPath}`)

    const sql = postgres(url, { max: 1, onnotice: () => {} })
    let pool: { end: (options?: { timeout?: number }) => Promise<void> } | undefined
    try {
        if (!target.targetHosted) await assertLocalCopy(sql as unknown as MigrationSql, target.confirmLocalCopy)
        process.env.DATABASE_POOL_URL = url
        const { db, pg } = await import('../lib/db')
        pool = pg
        const { backupResetState, buildManifest, planCatalogReset, applyCatalogReset } = await import('../lib/catalog/reset')
        if (writePath && stagedPath) {
            const games = JSON.parse(readFileSync(stagedPath, 'utf8'))
            const manifest = await buildManifest(db, games, randomUUID())
            writeFileSync(writePath, JSON.stringify(manifest, null, 2))
            console.log(JSON.stringify({ wrote: writePath, writing: manifest.games.length, counts: manifest.counts }, null, 2))
        }
        if (manifestPath) {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
            const options = { allowEmpty: process.argv.includes('--allow-empty'), allowSmall: process.argv.includes('--allow-small') }
            const plan = await planCatalogReset(db, manifest, options)
            if (!apply) console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2))
            else {
                if (plan.blocked) throw new Error(plan.blocked)
                const backup = await backupResetState(sql as unknown as MigrationSql)
                console.log(JSON.stringify({ backup, applied: await applyCatalogReset(db, manifest, options) }, null, 2))
            }
        }
    } finally {
        await sql.end()
        await pool?.end()
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
