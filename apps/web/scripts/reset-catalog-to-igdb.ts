import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import postgres from 'postgres'
import { assertDisposableDatabase, assertLocalCopy } from '../lib/catalog/database-url'
import type { MigrationSql } from '../lib/catalog/migrations'

const help = `Stage or apply a fresh IGDB catalogue reset on a disposable local database.

  --database-env NAME       Required. Localhost URL whose database name ends in _test or _copy.
  --manifest FILE           Staged manifest JSON ({ runId, fingerprint, counts, games }).
  --write-manifest FILE     Read the database fingerprint and write a manifest. Requires --staged.
  --staged FILE             JSON array of CatalogGame values for --write-manifest.
  --apply                   Apply the manifest. Without this flag the command is a dry-run.
  --confirm-before-task-6  Required with --apply. Do not reset the database the app uses
                            until Task 6 replaces the rest of the Steam import.
  --allow-empty             Permit a manifest with zero games when the catalogue is not empty.
  --allow-small             Permit a manifest that replaces a large catalogue with very few games.
  --confirm-local-copy      Required when the database has Supabase dump markers.

Dry-run writes nothing and reports current counts plus how many games would be written.
Apply takes a new reset_backup schema first and refuses to drop an earlier one.
Apply refuses a stale fingerprint, a count mismatch, an empty or implausibly small
manifest, and a committed manifest. Do not point this at the hosted database or at
the database the running app uses before Task 6. See docs/igdb-migration-runbook.md.`

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
    const apply = process.argv.includes('--apply')
    const manifestPath = argument('--manifest')
    const writePath = argument('--write-manifest')
    const stagedPath = argument('--staged')
    if (apply && !manifestPath) throw new Error('--apply requires --manifest.')
    if (apply && !process.argv.includes('--confirm-before-task-6'))
        throw new Error('Refusing to reset a catalogue the app can still serve. Task 6 has not replaced the rest of the Steam import. Pass --confirm-before-task-6 only on a disposable copy, never on the app database.')
    if (writePath && !stagedPath) throw new Error('--write-manifest requires --staged.')
    if (!manifestPath && !writePath) throw new Error('Pass --manifest or --write-manifest.')

    const sql = postgres(url, { max: 1, onnotice: () => {} })
    try {
        await assertLocalCopy(sql as unknown as MigrationSql, process.argv.includes('--confirm-local-copy'))
        process.env.DATABASE_POOL_URL = url
        const { db } = await import('../lib/db')
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
            if (!apply) console.log(JSON.stringify({ dryRun: true, ...(await planCatalogReset(db, manifest)) }, null, 2))
            else {
                const backup = await backupResetState(sql as unknown as MigrationSql)
                console.log(JSON.stringify({ backup, applied: await applyCatalogReset(db, manifest, options) }, null, 2))
            }
        }
    } finally {
        await sql.end()
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
