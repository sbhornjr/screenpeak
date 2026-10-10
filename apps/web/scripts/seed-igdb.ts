import postgres from 'postgres'
import { assertDisposableDatabase, assertLocalCopy } from '../lib/catalog/database-url'
import type { MigrationSql } from '../lib/catalog/migrations'

const help = `Seed IGDB main games through the shared rate limiter and catalogue writer.

  --database-env NAME   Required. Localhost URL whose database name ends in _test or _copy.
                        The database must already have the IGDB request budget (0003) and catalogue preparation.
  --ids 1,2,3           Explicit IGDB ids. Non-main games are rejected and nothing is written.
  --top [N]             Top main games by rating_count, then rating, then id. N defaults to 2000 and must be 1–5000.
  --resume              Skip IGDB ids already stored. Writes are upserts either way.
  --confirm-local-copy  Required when the database has Supabase dump markers.

The script only upserts games, in batches of 50. It does not clear library entries, reviews, lists, or accounts.
A failed batch leaves earlier batches committed and prints the remaining ids. Re-run with --resume.
Twitch credentials (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET) are read from the environment.
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
    const idsArg = argument('--ids')
    const top = process.argv.includes('--top')
    if (idsArg && top) throw new Error('Pass either --ids or --top.')
    if (!idsArg && !top) throw new Error('Pass --ids or --top.')
    let limit = 2000
    if (top) {
        const next = process.argv[process.argv.indexOf('--top') + 1]
        if (next && !next.startsWith('--')) limit = Number(next)
        if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('--top must be an integer from 1 to 5000.')
    }
    const explicit = idsArg?.split(',').map(part => Number(part.trim())) ?? []
    if (idsArg && explicit.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('--ids must be positive integers.')

    const sql = postgres(url, { max: 1, onnotice: () => {} })
    try {
        await assertLocalCopy(sql as unknown as MigrationSql, process.argv.includes('--confirm-local-copy'))
    } finally {
        await sql.end()
    }
    process.env.DATABASE_POOL_URL = url
    const { db } = await import('../lib/db')
    const { igdbProvider } = await import('../lib/igdb/provider')
    const { seedCatalogGames, storedIgdbIds } = await import('../lib/catalog/seed')
    let ids = explicit.length ? explicit : await igdbProvider.listTopMainGameIds(limit)
    const requested = ids.length
    let skippedExisting: number[] = []
    if (process.argv.includes('--resume')) {
        skippedExisting = await storedIgdbIds(db, ids)
        const have = new Set(skippedExisting)
        ids = ids.filter(id => !have.has(id))
    }
    const games: Awaited<ReturnType<typeof igdbProvider.getGamesByIds>> = []
    for (let offset = 0; offset < ids.length; offset += 50) {
        games.push(...await igdbProvider.getGamesByIds(ids.slice(offset, offset + 50), { mainOnly: true }))
    }
    const result = await seedCatalogGames(db, games)
    console.log(JSON.stringify({ requested, skippedExisting: skippedExisting.length, ...result }, null, 2))
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
