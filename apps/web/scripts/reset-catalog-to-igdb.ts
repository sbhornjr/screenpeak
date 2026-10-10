import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { assertDisposableDatabase } from '../lib/catalog/database-url'

const help = `Stage or apply a fresh IGDB catalogue reset on a disposable local database.

  --database-env NAME    Required. Localhost URL whose database name ends in _test or _copy.
  --manifest FILE        Staged manifest JSON ({ runId, fingerprint, games }).
  --write-manifest FILE  Read the database fingerprint and write a manifest. Requires --staged.
  --staged FILE          JSON array of CatalogGame values for --write-manifest.
  --apply                Apply the manifest. Without this flag the command is a dry-run.

Dry-run writes nothing. Apply refuses a stale fingerprint and a committed manifest.
Stop app servers and other writers before --apply. Take a pg_dump of any hosted database
yourself; this command will not connect to one. See docs/igdb-migration-runbook.md.`

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(name)
    return index === -1 ? undefined : process.argv[index + 1]
}

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
if (writePath && !stagedPath) throw new Error('--write-manifest requires --staged.')
if (!manifestPath && !writePath) throw new Error('Pass --manifest or --write-manifest.')

process.env.DATABASE_POOL_URL = url
const { db } = await import('../lib/db')
const { buildManifest, planCatalogReset, applyCatalogReset } = await import('../lib/catalog/reset')
if (writePath && stagedPath) {
    const games = JSON.parse(readFileSync(stagedPath, 'utf8'))
    const manifest = await buildManifest(db, games, randomUUID())
    writeFileSync(writePath, JSON.stringify(manifest, null, 2))
    console.log(JSON.stringify({ wrote: writePath, games: manifest.games.length }, null, 2))
}
if (manifestPath) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!apply) console.log(JSON.stringify({ dryRun: true, ...(await planCatalogReset(db, manifest)) }, null, 2))
    else console.log(JSON.stringify({ applied: await applyCatalogReset(db, manifest) }, null, 2))
}
