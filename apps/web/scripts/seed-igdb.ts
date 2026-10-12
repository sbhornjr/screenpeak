import { resolve } from 'node:path'
import postgres from 'postgres'
import { clearIgdbBudget } from '../lib/catalog/budget-admin'
import { assertDatabaseTarget, assertLocalCopy, databaseTargetFromArgv } from '../lib/catalog/database-url'
import { loadEnvFile } from '../lib/catalog/env-file'
import type { MigrationSql } from '../lib/catalog/migrations'

const help = `Seed IGDB main games through the shared rate limiter and catalogue writer.

  --database-env NAME   Required. Never falls back to DATABASE_POOL_URL.
                        The database must already have the IGDB request budget (0003) and catalogue preparation.
  --ids 1,2,3           Explicit IGDB ids. Non-main games are rejected and nothing is written.
  --top [N]             Top main games by rating_count, then rating, then id. N defaults to 2000 and must be 1–5000.
  --resume              Skip IGDB ids already stored. The top-N list is computed again first.
                        Writes are upserts either way. A short list is still a failure.
  --clear-budget        Delete IGDB rate-limit leases, reset the spacing clock, and terminate
                        idle-in-transaction sessions that have held an igdb_private lock for
                        more than 15 seconds. Run this only while no seed, audit, or app
                        process is calling IGDB. It may be combined with --top or --ids.
  --confirm-local-copy  Local copy only. Required when that database has Supabase dump markers.
  --target-hosted       Hosted database. Requires --confirm-host and --confirm-database.
                        Refuses a local host. Do not combine with --confirm-local-copy.
  --confirm-host HOST   Type the URL hostname. Must match exactly.
  --confirm-database NAME
                        Type the URL database name. Must match exactly.

The script only upserts games, in batches of 50. It does not clear library entries, reviews, lists, or accounts.
Steam app ids are written only for the games in this run. Shared ids among those games are dropped.
A failed batch leaves earlier batches committed and prints the remaining ids. Re-run with --resume.
Progress is printed to stderr. The final JSON summary is printed to stdout.
If IGDB returns fewer rated main games than --top asked for, the command writes those games and exits non-zero.
Twitch credentials (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET) are read from the environment or apps/web/.env.local.
Existing environment variables win. KEY = value spacing is accepted.
See docs/igdb-cutover-checklist.md.`

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(name)
    return index === -1 ? undefined : process.argv[index + 1]
}

let pool: { end: (options?: { timeout?: number }) => Promise<void> } | undefined

function shutdown(signal: string): void {
    console.error(`seed:igdb received ${signal}. Closing the database connection. Re-run the same command with --resume.`)
    const force = setTimeout(() => process.exit(1), 5_000)
    force.unref()
    void pool?.end({ timeout: 2 }).catch(() => undefined).finally(() => process.exit(1))
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
    const target = databaseTargetFromArgv(process.argv)
    assertDatabaseTarget(url, target)
    const idsArg = argument('--ids')
    const top = process.argv.includes('--top')
    const clear = process.argv.includes('--clear-budget')
    if (idsArg && top) throw new Error('Pass either --ids or --top.')
    if (!idsArg && !top && !clear) throw new Error('Pass --ids, --top, or --clear-budget.')
    let limit = 2000
    if (top) {
        const next = process.argv[process.argv.indexOf('--top') + 1]
        if (next && !next.startsWith('--')) limit = Number(next)
        if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('--top must be an integer from 1 to 5000.')
    }
    const explicit = idsArg?.split(',').map(part => Number(part.trim())) ?? []
    if (idsArg && explicit.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('--ids must be positive integers.')

    const sql = postgres(url, { max: 1, onnotice: () => {}, connection: { idle_in_transaction_session_timeout: '15s' } })
    pool = sql
    process.once('SIGINT', () => shutdown('SIGINT'))
    process.once('SIGTERM', () => shutdown('SIGTERM'))
    try {
        if (!target.targetHosted) await assertLocalCopy(sql as unknown as MigrationSql, target.confirmLocalCopy)
        if (clear) {
            const line = JSON.stringify({ cleared: await clearIgdbBudget(sql) })
            if (!idsArg && !top) console.log(line)
            else console.error(line)
        }
    } finally {
        await sql.end()
    }
    if (!idsArg && !top) return
    process.env.DATABASE_POOL_URL = url
    const { db, pg } = await import('../lib/db')
    pool = pg
    try {
        const { igdbProvider } = await import('../lib/igdb/provider')
        const { seedCatalogGames, seedOutcome, storedIgdbIds } = await import('../lib/catalog/seed')
        const ranked = explicit.length ? explicit : await igdbProvider.listTopMainGameIds(limit, {
            onProgress: progress => console.error(`igdb seed: ranking page ${progress.pages}, ${progress.collected} candidates toward ${progress.target}`),
        })
        const stored = process.argv.includes('--resume') ? await storedIgdbIds(db, ranked) : []
        const outcome = seedOutcome(explicit.length ? explicit.length : limit, ranked, stored, process.argv.includes('--resume'))
        if (outcome.shortfall) console.error(`igdb seed: ${outcome.shortfall}`)
        const games: Awaited<ReturnType<typeof igdbProvider.getGamesByIds>> = []
        for (let offset = 0; offset < outcome.ids.length; offset += 50) {
            const slice = outcome.ids.slice(offset, offset + 50)
            console.error(`igdb seed: fetching games ${offset + 1}-${offset + slice.length} of ${outcome.ids.length}`)
            try {
                games.push(...await igdbProvider.getGamesByIds(slice, { mainOnly: true }))
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                throw new Error(`Stopped while fetching IGDB games (${games.length} fetched, none of this run written yet). Re-run with --resume. ${message}`)
            }
        }
        const result = await seedCatalogGames(db, games, {
            onBatch: progress => console.error(`igdb seed: committed ${progress.written} of ${progress.total}`),
        })
        console.log(JSON.stringify({
            target: outcome.target,
            ranked: outcome.ranked,
            skippedExisting: outcome.skippedExisting.length,
            shortfall: outcome.shortfall,
            ...result,
        }, null, 2))
        if (outcome.shortfall) process.exitCode = 1
    } finally {
        await pg.end()
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
