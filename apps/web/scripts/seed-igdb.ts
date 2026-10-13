import { resolve } from 'node:path'
import postgres from 'postgres'
import { clearIgdbBudget } from '../lib/catalog/budget-admin'
import { closeDatabasePool, endDatabaseClient } from '../lib/catalog/close-pool'
import { assertDatabaseTarget, assertLocalCopy, databaseTargetFromArgv } from '../lib/catalog/database-url'
import { loadEnvFile } from '../lib/catalog/env-file'
import { formatSeedProgress } from '../lib/catalog/seed-progress'
import { applySeedPoolTimeouts, poolConnectionTimeouts } from '../lib/db-timeouts'
import type { MigrationSql } from '../lib/catalog/migrations'

const help = `Seed IGDB main games through the shared rate limiter and catalogue writer.

  --database-env NAME   Required. Never falls back to DATABASE_POOL_URL.
                        The database must already have the IGDB request budget (0003) and catalogue preparation.
  --ids 1,2,3           Explicit IGDB ids. Non-main games are rejected and nothing is written.
  --top [N]             Top main games by rating_count, then rating, then id. N defaults to 2000 and must be 1–5000.
  --resume              Skip IGDB ids already stored. The top-N list is computed again first.
                        Writes are upserts either way. A short list is still a failure.
  --clear-budget        Delete IGDB rate-limit leases, reset the spacing clock, and terminate
                        this database user's own sessions that have been idle in a
                        transaction for more than 15 seconds while holding a seed
                        advisory lock or an igdb_private lock. It re-checks the backend
                        before terminating it. Run this only while no other seed is
                        running. It may be combined with --top or --ids. It does not
                        change the catalogue.
  --confirm-local-copy  Local copy only. Required when that database has Supabase dump markers.
  --target-hosted       Hosted database. Requires --confirm-host and --confirm-database.
                        Refuses a local host. Do not combine with --confirm-local-copy.
  --confirm-host HOST   Type the URL hostname. Must match exactly.
  --confirm-database NAME
                        Type the URL database name. Must match exactly.

The script only upserts games, in batches of 50. Each batch is a handful of multi-row
statements, not one query per genre, platform, company, or Steam id. It does not clear
library entries, reviews, lists, or accounts.
Steam app ids are written only for the games in this run. Shared ids among those games are dropped.
A failed batch leaves earlier batches committed and prints the remaining ids. Re-run with --resume.
Progress is printed to stderr, including fetch and commit timings. The final JSON summary is printed to stdout.
The seed pool uses a 5s lock timeout and a 30s statement timeout, then closes the pool and exits.
If IGDB returns fewer rated main games than --top asked for, the command writes those games and exits non-zero.
Twitch credentials (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET) are read from the environment or apps/web/.env.local.
Existing environment variables win. KEY = value spacing is accepted.
See docs/igdb-cutover-checklist.md.`

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(name)
    return index === -1 ? undefined : process.argv[index + 1]
}

let pool: { end: (options?: { timeout?: number }) => Promise<void> } | undefined
let finishing: Promise<void> | undefined

function finish(code: number): Promise<void> {
    finishing ??= closeDatabasePool(pool, { code })
    return finishing
}

function shutdown(signal: string): void {
    console.error(`seed:igdb received ${signal}. Closing the database connection. Re-run the same command with --resume.`)
    void finish(1)
}

async function main(): Promise<number> {
    const envName = argument('--database-env')
    if (!envName || process.argv.includes('--help')) {
        console.log(help)
        process.exit(process.argv.includes('--help') ? 0 : 1)
    }
    loadEnvFile(resolve(__dirname, '../.env.local'))
    applySeedPoolTimeouts(process.env)
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

    const sql = postgres(url, { max: 1, onnotice: () => {}, connection: poolConnectionTimeouts() })
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
        await endDatabaseClient(sql)
        if (pool === sql) pool = undefined
    }
    if (!idsArg && !top) return 0
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
        if (outcome.ids.length) {
            console.error('igdb seed: each batch is one games request; genres, platforms, companies, covers, and external ids are expanded in that response')
        }
        for (let offset = 0; offset < outcome.ids.length; offset += 50) {
            const slice = outcome.ids.slice(offset, offset + 50)
            const from = offset + 1
            const to = offset + slice.length
            const started = performance.now()
            console.error(`igdb seed: fetching games ${from}-${to} of ${outcome.ids.length}`)
            try {
                const page = await igdbProvider.getGamesByIds(slice, { mainOnly: true })
                games.push(...page)
                console.error(formatSeedProgress({
                    phase: 'fetched', from, to, total: outcome.ids.length, count: page.length,
                    ms: Math.round(performance.now() - started),
                }))
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                throw new Error(`Stopped while fetching IGDB games (${games.length} fetched, none of this run written yet). Re-run with --resume. ${message}`)
            }
        }
        const result = await seedCatalogGames(db, games, {
            onPhase: event => console.error(formatSeedProgress(event)),
        })
        console.log(JSON.stringify({
            target: outcome.target,
            ranked: outcome.ranked,
            skippedExisting: outcome.skippedExisting.length,
            shortfall: outcome.shortfall,
            ...result,
        }, null, 2))
        return outcome.shortfall ? 1 : 0
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        return 1
    }
}

main().then(code => finish(code ?? 1)).catch(error => {
    console.error(error instanceof Error ? error.message : error)
    return finish(1)
})
